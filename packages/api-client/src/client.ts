import type {
  ApiOrder,
  ApiService,
  BookingReceipt,
  BookingStatus,
  CatalogueItem,
  DeliveryCheck,
  DeliveryCheckRequest,
  PublicBranch,
  PublicEvent,
  PublicMerchant,
  PublicZone,
  ServiceBooking,
} from '@nexg/contracts/api';
import type { z } from 'zod';

import { NexgApiError, NexgConnectionError } from './errors';

/**
 * A client for the NexG API (https://api.nexgapp.com).
 *
 * Every method returns the `data` of the answer, typed as the reference
 * documents it (https://api.nexgapp.com/docs/reference), and throws
 * NexgApiError when NexG answers with an error.
 *
 * It takes care of the plumbing every integration needs:
 *
 * - the key, sent as X-Api-Key, and refused in a browser, where it would leak;
 * - the rate limit: a 429 is retried after Retry-After;
 * - server errors and dropped connections are retried with backoff, but only
 *   where trying again is safe: reads, the delivery check, catalogue changes
 *   (they set values rather than add to them) and bookings, which always carry
 *   an Idempotency-Key, kept the same across retries;
 * - pagination: `listAll` walks next_cursor for you.
 */

export const DEFAULT_BASE_URL = 'https://api.nexgapp.com';

export interface NexgClientOptions {
  /**
   * A key from the developer console: `nexg_test_…` for the sandbox, or a live
   * key. Public reads work without one. Keep it on your server.
   */
  apiKey?: string;
  /** Defaults to https://api.nexgapp.com. */
  baseUrl?: string;
  /** Retries after a 429, a server error or a dropped connection. Default 2. */
  maxRetries?: number;
  /** How long one attempt may take, in milliseconds. Default 30,000. */
  timeoutMs?: number;
  /** A fetch to use instead of the global one, for tests or a proxy. */
  fetch?: typeof fetch;
}

/** One page of a list, as the API sends it. */
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface PageParams {
  /** The next_cursor from the previous page. Leave it out for the first page. */
  cursor?: string;
  /** Results per page, 1 to 100. The API defaults to 25. */
  limit?: number;
}

export interface MerchantListParams extends PageParams {
  /** A city slug, such as `nairobi`. */
  city?: string;
  /** A merchant category, such as `restaurant`. */
  category?: string;
  /** Free text matched against trading names, branch names and categories. */
  q?: string;
}

export interface ExperienceListParams extends PageParams {
  city?: string;
  q?: string;
}

/** A booking as you send it: quantity and payment_method have defaults. */
export type BookingRequest = z.input<typeof ServiceBooking>;

/** A change to one item: a price, availability, or both. */
export interface CatalogueChange {
  /** Whole shillings, from 1 to 1,000,000. */
  price_kes?: number;
  /** false while sold out, true when back on sale. */
  available?: boolean;
}

export interface CatalogueItemChange extends CatalogueChange {
  /** The item's id, from catalogue.list(). */
  id: string;
}

export type TestStatus = 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type TestStage =
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'arriving'
  | 'delivered'
  | 'cancelled';

type Retry = 'safe' | 'rate_limit_only';

interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  retry: Retry;
}

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
/** A Retry-After longer than this is not waited out: the error goes to the caller. */
const MAX_WAIT_SECONDS = 60;

export class NexgClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NexgClientOptions = {}) {
    if (options.apiKey && typeof window !== 'undefined' && typeof document !== 'undefined') {
      throw new Error(
        'NexG API keys belong on your server. Call the API from your backend, not from a browser, where anyone could read the key.',
      );
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('This runtime has no fetch. Use Node 20 or later, or pass options.fetch.');
    }
    this.fetchImpl = fetchImpl;
  }

  /** Merchants and their public catalogues. */
  readonly merchants = {
    /** GET /v1/catalog/merchants: one page of live merchants. */
    list: (params: MerchantListParams = {}) =>
      this.call<Page<PublicMerchant>>('GET', '/v1/catalog/merchants', {
        query: { ...params },
        retry: 'safe',
      }),
    /** Every live merchant matching the filters, page after page. */
    listAll: (params: Omit<MerchantListParams, 'cursor'> = {}) =>
      this.walk((cursor) => this.merchants.list({ ...params, cursor })),
    /** GET /v1/catalog/merchants/{id}: one merchant, its branches and its catalogue. */
    get: (id: string) =>
      this.call<{ merchant: PublicMerchant; branches: PublicBranch[]; catalogue: CatalogueItem[] }>(
        'GET',
        `/v1/catalog/merchants/${encodeURIComponent(id)}`,
        { retry: 'safe' },
      ),
  };

  /** Your own merchant's catalogue. Needs a key with catalogue_write (or merchant_read to list). */
  readonly catalogue = {
    /** GET /v1/catalog/items: every item, sold-out ones included. */
    list: () =>
      this.call<{ items: CatalogueItem[] }>('GET', '/v1/catalog/items', { retry: 'safe' }),
    /** PATCH /v1/catalog/items/{id}: one item's price, availability, or both. */
    update: (id: string, change: CatalogueChange) =>
      this.call<{ item: CatalogueItem; applied: boolean }>(
        'PATCH',
        `/v1/catalog/items/${encodeURIComponent(id)}`,
        { body: change, retry: 'safe' },
      ),
    /** PATCH /v1/catalog/items: up to 100 items in one call, all or nothing. */
    updateMany: (items: CatalogueItemChange[]) =>
      this.call<{ items: CatalogueItem[]; applied: boolean }>('PATCH', '/v1/catalog/items', {
        body: { items },
        retry: 'safe',
      }),
  };

  readonly zones = {
    /** GET /v1/zones: every active delivery zone. */
    list: () => this.call<Page<PublicZone>>('GET', '/v1/zones', { retry: 'safe' }),
  };

  readonly delivery = {
    /** POST /v1/delivery/check: can NexG deliver this trip, how soon, and for how much. */
    check: (trip: DeliveryCheckRequest) =>
      this.call<DeliveryCheck>('POST', '/v1/delivery/check', { body: trip, retry: 'safe' }),
  };

  readonly experiences = {
    /** GET /v1/experiences: one page of upcoming published events. */
    list: (params: ExperienceListParams = {}) =>
      this.call<Page<PublicEvent>>('GET', '/v1/experiences', {
        query: { ...params },
        retry: 'safe',
      }),
    listAll: (params: Omit<ExperienceListParams, 'cursor'> = {}) =>
      this.walk((cursor) => this.experiences.list({ ...params, cursor })),
  };

  readonly services = {
    /** GET /v1/services: the services you can book. */
    list: () => this.call<Page<ApiService>>('GET', '/v1/services', { retry: 'safe' }),
  };

  /** Your merchant's orders. Reads need merchant_read; booking needs merchant_write. */
  readonly orders = {
    /** GET /v1/orders: one page, newest first. */
    list: (params: PageParams = {}) =>
      this.call<Page<ApiOrder>>('GET', '/v1/orders', { query: { ...params }, retry: 'safe' }),
    listAll: (params: Omit<PageParams, 'cursor'> = {}) =>
      this.walk((cursor) => this.orders.list({ ...params, cursor })),
    /** GET /v1/orders/{id}. */
    get: (id: string) =>
      this.call<{ order: ApiOrder }>('GET', `/v1/orders/${encodeURIComponent(id)}`, {
        retry: 'safe',
      }),
    /**
     * POST /v1/orders: book a service. With a test key it books in the sandbox.
     *
     * Pass your own idempotencyKey (16 to 128 characters, kept with your
     * booking before you send it) so that a retry after a crash cannot book
     * twice; otherwise a random UUID is made for this call and reused for its
     * retries.
     */
    create: (booking: BookingRequest, options: { idempotencyKey?: string } = {}) =>
      this.call<{ booking: BookingReceipt }>('POST', '/v1/orders', {
        body: booking,
        headers: { 'Idempotency-Key': options.idempotencyKey ?? crypto.randomUUID() },
        retry: 'safe',
      }),
  };

  /** Moving test bookings, with a test key. Nothing is dispatched or charged. */
  readonly sandbox = {
    /** POST /v1/test/orders/{id}/status: move a test booking to a status or a stage. */
    moveOrder: (id: string, move: { status: TestStatus } | { stage: TestStage }) =>
      this.call<{ order: ApiOrder; previous_status: BookingStatus; previous_stage?: string }>(
        'POST',
        `/v1/test/orders/${encodeURIComponent(id)}/status`,
        { body: move, retry: 'rate_limit_only' },
      ),
    /** POST /v1/test/orders/{id}/rider: give a test ride or courier a test rider. */
    assignRider: (id: string) =>
      this.call<{ order: ApiOrder; assigned_at: string }>(
        'POST',
        `/v1/test/orders/${encodeURIComponent(id)}/rider`,
        { retry: 'rate_limit_only' },
      ),
  };

  /**
   * Any endpoint, for one this client does not name yet. Returns the answer's
   * `data`. GETs are retried like the named reads; other methods only after a
   * 429.
   */
  request<T = unknown>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    options: Omit<RequestOptions, 'retry'> = {},
  ): Promise<T> {
    return this.call<T>(method, path, {
      ...options,
      retry: method === 'GET' ? 'safe' : 'rate_limit_only',
    });
  }

  private async *walk<T>(page: (cursor: string | undefined) => Promise<Page<T>>) {
    let cursor: string | undefined;
    do {
      const current = await page(cursor);
      yield* current.items;
      cursor = current.next_cursor ?? undefined;
    } while (cursor);
  }

  private async call<T>(method: string, path: string, options: RequestOptions): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [name, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);

    for (let attempt = 0; ; attempt += 1) {
      const canRetry = attempt < this.maxRetries;
      let response: Response;
      try {
        response = await this.send(url, method, headers, body);
      } catch (error) {
        if (canRetry && options.retry === 'safe') {
          await sleep(backoff(attempt));
          continue;
        }
        throw new NexgConnectionError(
          `No answer from NexG for ${method} ${path}${attempt > 0 ? ` after ${attempt + 1} attempts` : ''}.`,
          { cause: error },
        );
      }

      if (response.ok) {
        const parsed = (await response.json()) as { data: T };
        return parsed.data;
      }

      const error = await toApiError(response);
      if (canRetry && error.status === 429) {
        const wait = error.retryAfter ?? 1;
        if (wait <= MAX_WAIT_SECONDS) {
          await sleep(wait * 1000);
          continue;
        }
      }
      if (canRetry && options.retry === 'safe' && RETRYABLE_STATUS.has(error.status)) {
        await sleep(backoff(attempt));
        continue;
      }
      throw error;
    }
  }

  private async send(url: URL, method: string, headers: Record<string, string>, body?: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

async function toApiError(response: Response): Promise<NexgApiError> {
  const requestId = response.headers.get('X-Request-Id');
  const retryAfterHeader = Number(response.headers.get('Retry-After'));
  const retryAfter =
    Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : null;
  let error: { code?: unknown; message?: unknown; fields?: unknown } | undefined;
  try {
    error = ((await response.json()) as { error?: typeof error }).error;
  } catch {
    error = undefined;
  }
  return new NexgApiError(
    typeof error?.message === 'string'
      ? error.message
      : `NexG answered ${response.status} without the usual error body.`,
    response.status,
    typeof error?.code === 'string' ? error.code : 'internal_error',
    error?.fields && typeof error.fields === 'object'
      ? (error.fields as Record<string, string>)
      : undefined,
    requestId,
    retryAfter,
  );
}

/** 0.5 s, 1 s, 2 s… with up to a quarter more at random, so retries spread out. */
function backoff(attempt: number): number {
  const base = 500 * 2 ** attempt;
  return base + Math.random() * base * 0.25;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
