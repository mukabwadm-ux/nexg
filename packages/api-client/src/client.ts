import { NexgApiError, NexgConnectionError } from './errors.js';
import type {
  ApiOffering,
  ApiOrder,
  ApiReservation,
  ApiResource,
  ApiService,
  ClosureRequest,
  DepartureRequest,
  OfferingCreate,
  OfferingUpdate,
  ReservationCreate,
  ResourceCreate,
  TestReservationRequest,
  BookingReceipt,
  BookingRequest,
  BookingStatus,
  CatalogueItem,
  DeliveryCheck,
  DeliveryCheckRequest,
  PublicBranch,
  PublicEvent,
  PublicMerchant,
  PublicZone,
} from './types.js';

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

export interface ChangeOptions {
  /**
   * 16 to 128 characters, kept with the change before you send it, so a retry
   * after a crash cannot change anything twice. Defaults to a random UUID for
   * this call, reused for its retries.
   */
  idempotencyKey?: string;
}

export interface ReservationListParams extends PageParams {
  /**
   * Only reservations changed after this time (ISO 8601). Pass the updated_at
   * of the last reservation you stored.
   */
  updated_after?: string;
}

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
    /**
     * POST /v1/orders/{id}/cancel: cancel one of your API bookings, free of
     * charge, until a rider is assigned. After that NexG answers 409
     * (NexgApiError with code `conflict`) and support handles it. Cancelling
     * twice answers the same (cancelled: false), so it is retried like a read.
     */
    cancel: (id: string, options: { reason?: string } = {}) =>
      this.call<{ order: ApiOrder; cancelled: boolean; previous_status: BookingStatus }>(
        'POST',
        `/v1/orders/${encodeURIComponent(id)}/cancel`,
        {
          ...(options.reason === undefined ? {} : { body: { reason: options.reason } }),
          retry: 'safe',
        },
      ),
  };

  /**
   * Your merchant's reservations: tour seats, transfers, rentals, appointments
   * and requests, from NexG's booking engine. Needs merchant_read. Oldest
   * change first; a test key reads none yet.
   */
  readonly reservations = {
    /** GET /v1/reservations: one page, oldest change first. */
    list: (params: ReservationListParams = {}) =>
      this.call<Page<ApiReservation>>('GET', '/v1/reservations', {
        query: { ...params },
        retry: 'safe',
      }),
    /** Every reservation (changed after updated_after, if given), page after page. */
    listAll: (params: Omit<ReservationListParams, 'cursor'> = {}) =>
      this.walk((cursor) => this.reservations.list({ ...params, cursor })),
    /** GET /v1/reservations/{id}: one reservation, with the guest's name and the trip. */
    get: (id: string) =>
      this.call<{ reservation: ApiReservation }>(
        'GET',
        `/v1/reservations/${encodeURIComponent(id)}`,
        { retry: 'safe' },
      ),
    /**
     * POST /v1/reservations/{id}/accept: confirm one that is waiting for you.
     * expectedVersion is the version you read; a newer one answers 409.
     */
    accept: (id: string, expectedVersion: number, options: ChangeOptions = {}) =>
      this.change<{ reservation: ApiReservation }>(
        'POST',
        `/v1/reservations/${encodeURIComponent(id)}/accept`,
        { expected_version: expectedVersion },
        options,
      ),
    /** POST /v1/reservations/{id}/decline: decline one that is still waiting and unpaid. */
    decline: (
      id: string,
      expectedVersion: number,
      options: ChangeOptions & { reason?: string } = {},
    ) =>
      this.change<{ reservation: ApiReservation }>(
        'POST',
        `/v1/reservations/${encodeURIComponent(id)}/decline`,
        {
          expected_version: expectedVersion,
          ...(options.reason === undefined ? {} : { reason: options.reason }),
        },
        options,
      ),
    /** POST /v1/reservations: a booking your team took elsewhere, so NexG's calendar holds the time. */
    create: (booking: ReservationCreate, options: ChangeOptions = {}) =>
      this.change<{ reservation: ApiReservation }>('POST', '/v1/reservations', booking, options),
    /** POST /v1/reservations/check-in: the code a customer shows, with the name they give. */
    checkIn: (code: string, options: ChangeOptions & { name?: string } = {}) =>
      this.change<{ reservation: ApiReservation }>(
        'POST',
        '/v1/reservations/check-in',
        { code, ...(options.name === undefined ? {} : { name: options.name }) },
        options,
      ),
    /** POST /v1/reservations/{id}/reschedule: another time, before it starts. */
    reschedule: (
      id: string,
      expectedVersion: number,
      startsAt: string,
      options: ChangeOptions & { endsAt?: string; expectedTotalCents?: number } = {},
    ) =>
      this.change<{ reservation: ApiReservation }>(
        'POST',
        `/v1/reservations/${encodeURIComponent(id)}/reschedule`,
        {
          expected_version: expectedVersion,
          starts_at: startsAt,
          ...(options.endsAt === undefined ? {} : { ends_at: options.endsAt }),
          ...(options.expectedTotalCents === undefined
            ? {}
            : { expected_total_cents: options.expectedTotalCents }),
        },
        options,
      ),
    /** POST /v1/reservations/{id}/start: the trip or work has begun. */
    start: (id: string, expectedVersion: number, options: ChangeOptions = {}) =>
      this.change<{ reservation: ApiReservation }>(
        'POST',
        `/v1/reservations/${encodeURIComponent(id)}/start`,
        { expected_version: expectedVersion },
        options,
      ),
    /** POST /v1/reservations/{id}/complete: done, with a short note. */
    complete: (id: string, expectedVersion: number, note: string, options: ChangeOptions = {}) =>
      this.change<{ reservation: ApiReservation }>(
        'POST',
        `/v1/reservations/${encodeURIComponent(id)}/complete`,
        { expected_version: expectedVersion, note },
        options,
      ),
    /**
     * POST /v1/reservations/{id}/cancel: before it starts, paid or not, with a
     * reason the customer sees. A payment is refunded in full by NexG.
     */
    cancel: (id: string, expectedVersion: number, reason: string, options: ChangeOptions = {}) =>
      this.change<{ reservation: ApiReservation }>(
        'POST',
        `/v1/reservations/${encodeURIComponent(id)}/cancel`,
        { expected_version: expectedVersion, reason },
        options,
      ),
    /**
     * PUT /v1/reservations/{id}/driver: who is coming, shown to the customer.
     * Pass null to clear it. Never a phone number.
     */
    setDriver: (
      id: string,
      expectedVersion: number,
      driver: { first_name: string; vehicle: string; plate?: string | null } | null,
      options: ChangeOptions = {},
    ) =>
      this.change<{ reservation: ApiReservation }>(
        'PUT',
        `/v1/reservations/${encodeURIComponent(id)}/driver`,
        { expected_version: expectedVersion, driver },
        options,
      ),
  };

  /**
   * Your booking setup: what you sell as bookings and the resources they hold.
   * Reads need merchant_read; changes need a live key with catalogue_write.
   */
  readonly offerings = {
    /** GET /v1/offerings: every offering, with its departures. */
    list: () => this.call<{ items: ApiOffering[] }>('GET', '/v1/offerings', { retry: 'safe' }),
    /** POST /v1/offerings: a new offering, on NexG's standard terms. */
    create: (offering: OfferingCreate, options: ChangeOptions = {}) =>
      this.change<{ offering: ApiOffering }>('POST', '/v1/offerings', offering, options),
    /** PATCH /v1/offerings/{id}: a price, switching it off, or stopping new bookings. */
    update: (id: string, change: OfferingUpdate, options: ChangeOptions = {}) =>
      this.change<{ offering: ApiOffering }>(
        'PATCH',
        `/v1/offerings/${encodeURIComponent(id)}`,
        change,
        options,
      ),
    /** POST /v1/offerings/{id}/departures: add a departure, or change or close one. */
    saveDeparture: (id: string, departure: DepartureRequest, options: ChangeOptions = {}) =>
      this.change<{ offering: ApiOffering }>(
        'POST',
        `/v1/offerings/${encodeURIComponent(id)}/departures`,
        departure,
        options,
      ),
  };

  readonly resources = {
    /** GET /v1/resources: every resource, with its hours and closures. */
    list: () => this.call<{ items: ApiResource[] }>('GET', '/v1/resources', { retry: 'safe' }),
    /** POST /v1/resources: a new vehicle, room, guide or pool of places. */
    create: (resource: ResourceCreate, options: ChangeOptions = {}) =>
      this.change<{ resource: ApiResource }>('POST', '/v1/resources', resource, options),
    /** POST /v1/resources/{id}/closures: busy or closed for a time. */
    close: (id: string, closure: ClosureRequest, options: ChangeOptions = {}) =>
      this.change<{ resource: ApiResource }>(
        'POST',
        `/v1/resources/${encodeURIComponent(id)}/closures`,
        closure,
        options,
      ),
    /** DELETE /v1/resources/{id}/closures/{closureId}: open the time again. */
    reopen: (id: string, closureId: string, expectedVersion: number, options: ChangeOptions = {}) =>
      this.change<{ resource: ApiResource }>(
        'DELETE',
        `/v1/resources/${encodeURIComponent(id)}/closures/${encodeURIComponent(closureId)}?expected_version=${expectedVersion}`,
        undefined,
        options,
      ),
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
    /** POST /v1/test/reservations: a test reservation, a transfer for tomorrow by default. */
    createReservation: (reservation: TestReservationRequest = {}) =>
      this.call<{ reservation: ApiReservation }>('POST', '/v1/test/reservations', {
        body: reservation,
        retry: 'rate_limit_only',
      }),
    /** POST /v1/test/reservations/{id}/status: move a test reservation forward. */
    moveReservation: (
      id: string,
      status: 'confirmed' | 'in_progress' | 'completed' | 'cancelled',
    ) =>
      this.call<{ reservation: ApiReservation; previous_status: BookingStatus }>(
        'POST',
        `/v1/test/reservations/${encodeURIComponent(id)}/status`,
        { body: { status }, retry: 'rate_limit_only' },
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

  /** A change to a reservation or the booking setup: always with an Idempotency-Key, so retried like a read. */
  private change<T>(
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body: unknown,
    options: ChangeOptions,
  ): Promise<T> {
    return this.call<T>(method, path, {
      ...(body === undefined ? {} : { body }),
      headers: { 'Idempotency-Key': options.idempotencyKey ?? crypto.randomUUID() },
      retry: 'safe',
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
