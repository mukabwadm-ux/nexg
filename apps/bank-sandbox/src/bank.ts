import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

import { maskAccount, TEST_ACCOUNTS } from './accounts.ts';
import { SIGNATURE_HEADER, sign } from './signing.ts';

export type CollectionStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'cancelled';

const FINAL: CollectionStatus[] = ['succeeded', 'failed', 'expired', 'cancelled'];

export interface Collection {
  id: string;
  object: 'collection';
  status: CollectionStatus;
  merchant_reference: string;
  amount: number;
  currency: string;
  description: string | null;
  customer: { name?: string; email?: string; phone?: string } | null;
  payer: { name: string; bank: string; account: string } | null;
  bank_reference: string | null;
  failure_code: string | null;
  failure_reason: string | null;
  checkout_url: string;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  livemode: false;
}

export interface BankEvent {
  id: string;
  type: string;
  created_at: string;
  livemode: false;
  data: Collection;
}

export interface Delivery {
  id: string;
  event_id: string;
  collection_id: string;
  url: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  last_status_code: number | null;
  last_error: string | null;
  next_attempt_at: string | null;
}

interface CollectionRecord {
  collection: Collection;
  callbackUrl: string;
  returnUrl: string;
  idempotencyKey: string;
  requestHash: string;
  events: string[];
}

export interface CreateInput {
  merchant_reference?: unknown;
  amount?: unknown;
  currency?: unknown;
  description?: unknown;
  customer?: unknown;
  callback_url?: unknown;
  return_url?: unknown;
}

export interface BankOptions {
  publicUrl: string;
  webhookSecret: string;
  collectionTtlMs?: number;
  slowApprovalMs?: number;
  retryDelaysMs?: number[];
  dataFile?: string;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

export class BankError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const BANK_NAME = 'NexG Sandbox Bank';
const id = (prefix: string) => `${prefix}_${randomBytes(12).toString('base64url')}`;
const iso = (ms = Date.now()) => new Date(ms).toISOString();

function httpUrl(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new BankError(422, 'invalid_request', `${field} must be an http(s) URL.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BankError(422, 'invalid_request', `${field} must be an http(s) URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BankError(422, 'invalid_request', `${field} must be an http(s) URL.`);
  }
  return url.toString();
}

function text(value: unknown, max: number) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

/**
 * The sandbox bank. State lives in memory and, when a data file is given,
 * is saved to it after every change so a restart keeps collections and
 * pending webhook deliveries.
 */
export class SandboxBank {
  private records = new Map<string, CollectionRecord>();
  private byIdempotencyKey = new Map<string, string>();
  private events = new Map<string, BankEvent>();
  private deliveryLog = new Map<string, Delivery>();
  private balances = new Map<string, number | null>();
  private timers = new Set<NodeJS.Timeout>();
  private readonly ttl: number;
  private readonly slow: number;
  private readonly retries: number[];
  private readonly fetchImpl: typeof fetch;
  private readonly log: (line: string) => void;

  constructor(private readonly options: BankOptions) {
    this.ttl = options.collectionTtlMs ?? 30 * 60_000;
    this.slow = options.slowApprovalMs ?? 20_000;
    this.retries = options.retryDelaysMs ?? [2_000, 10_000, 60_000, 300_000, 1_800_000];
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.log = options.log ?? (() => {});
    for (const a of TEST_ACCOUNTS) this.balances.set(a.id, a.balance);
    this.load();
    const sweep = setInterval(() => this.expireDue(), 15_000);
    sweep.unref();
    this.timers.add(sweep);
  }

  close() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  // ──────────────────────────────────────────────── collections

  create(input: CreateInput, idempotencyKey: string | null) {
    if (!idempotencyKey || idempotencyKey.length > 128) {
      throw new BankError(
        400,
        'idempotency_key_required',
        'Send an Idempotency-Key header (up to 128 characters).',
      );
    }
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existingId = this.byIdempotencyKey.get(idempotencyKey);
    if (existingId) {
      const existing = this.records.get(existingId)!;
      if (existing.requestHash !== requestHash) {
        throw new BankError(
          409,
          'idempotency_key_reused',
          'That Idempotency-Key was used with a different request.',
        );
      }
      return { created: false, collection: this.read(existingId) };
    }

    const reference = input.merchant_reference;
    if (typeof reference !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(reference)) {
      throw new BankError(
        422,
        'invalid_request',
        'merchant_reference must be 1-64 letters, digits, dots, dashes or underscores.',
      );
    }
    if (
      typeof input.amount !== 'number' ||
      !Number.isInteger(input.amount) ||
      input.amount < 100 ||
      input.amount > 1e12
    ) {
      throw new BankError(
        422,
        'invalid_request',
        'amount must be a whole number of cents, at least 100 (KES 1).',
      );
    }
    if (input.currency !== 'KES') {
      throw new BankError(422, 'unsupported_currency', 'Only KES is supported.');
    }
    const callbackUrl = httpUrl(input.callback_url, 'callback_url');
    const returnUrl = httpUrl(input.return_url, 'return_url');
    const c =
      typeof input.customer === 'object' && input.customer
        ? (input.customer as Record<string, unknown>)
        : {};
    const customer = {
      name: text(c.name, 120),
      email: text(c.email, 200),
      phone: text(c.phone, 30),
    };

    const collectionId = id('col');
    const now = Date.now();
    const collection: Collection = {
      id: collectionId,
      object: 'collection',
      status: 'pending',
      merchant_reference: reference,
      amount: input.amount,
      currency: 'KES',
      description: text(input.description, 140) ?? null,
      customer: customer.name || customer.email || customer.phone ? customer : null,
      payer: null,
      bank_reference: null,
      failure_code: null,
      failure_reason: null,
      checkout_url: `${this.options.publicUrl.replace(/\/+$/, '')}/checkout/${collectionId}`,
      created_at: iso(now),
      expires_at: iso(now + this.ttl),
      completed_at: null,
      livemode: false,
    };
    this.records.set(collectionId, {
      collection,
      callbackUrl,
      returnUrl,
      idempotencyKey,
      requestHash,
      events: [],
    });
    this.byIdempotencyKey.set(idempotencyKey, collectionId);
    this.save();
    this.log(`collection ${collectionId} opened for ${reference} (${input.amount} KES cents)`);
    return { created: true, collection: { ...collection } };
  }

  read(collectionId: string) {
    const record = this.record(collectionId);
    this.expireIfDue(record);
    return { ...record.collection };
  }

  returnUrl(collectionId: string) {
    return this.record(collectionId).returnUrl;
  }

  /** The latest state as an event, for a receiver that missed the webhook. */
  latestEvent(collectionId: string): BankEvent {
    const record = this.record(collectionId);
    this.expireIfDue(record);
    const c = record.collection;
    return {
      id: `snap_${c.id}_${c.status}`,
      type: `collection.${c.status}`,
      created_at: iso(),
      livemode: false,
      data: { ...c },
    };
  }

  approve(collectionId: string, accountId: string) {
    const record = this.record(collectionId);
    this.expireIfDue(record);
    this.requireStatus(record, ['pending']);
    const account = TEST_ACCOUNTS.find((a) => a.id === accountId);
    if (!account) throw new BankError(422, 'unknown_account', 'Pick one of the test accounts.');
    const payer = { name: account.holder, bank: BANK_NAME, account: maskAccount(account.number) };
    record.collection.payer = payer;

    if (account.behaviour === 'blocked') {
      return this.finish(record, 'failed', {
        failure_code: 'account_blocked',
        failure_reason: 'The bank declined the payment: the account is blocked.',
      });
    }
    if (account.behaviour === 'slow') {
      record.collection.status = 'processing';
      this.emit(record, 'collection.processing');
      this.later(this.slow, () => {
        if (record.collection.status === 'processing') this.settle(record, account.id);
      });
      return { ...record.collection };
    }
    return this.settle(record, account.id);
  }

  cancel(collectionId: string) {
    const record = this.record(collectionId);
    this.expireIfDue(record);
    this.requireStatus(record, ['pending']);
    return this.finish(record, 'cancelled', {
      failure_code: 'cancelled_by_customer',
      failure_reason: 'The customer cancelled at the bank.',
    });
  }

  /** For automated tests: drive an outcome without the approval page. */
  simulate(collectionId: string, outcome: string) {
    const record = this.record(collectionId);
    this.expireIfDue(record);
    switch (outcome) {
      case 'succeed':
        return this.approve(collectionId, 'acc_good_funds');
      case 'insufficient_funds':
        this.requireStatus(record, ['pending']);
        record.collection.payer = { name: 'Otieno Achieng', bank: BANK_NAME, account: '****1177' };
        return this.finish(record, 'failed', {
          failure_code: 'insufficient_funds',
          failure_reason: 'The bank declined the payment: insufficient funds.',
        });
      case 'decline':
        return this.approve(collectionId, 'acc_blocked');
      case 'cancel':
        return this.cancel(collectionId);
      case 'expire':
        this.requireStatus(record, ['pending']);
        return this.finish(record, 'expired', {
          failure_code: 'expired',
          failure_reason: 'The payment was not approved in time.',
        });
      default:
        throw new BankError(
          422,
          'unknown_outcome',
          'outcome must be succeed, insufficient_funds, decline, cancel or expire.',
        );
    }
  }

  expireDue() {
    for (const record of this.records.values()) this.expireIfDue(record);
  }

  // ──────────────────────────────────────────────── webhooks

  deliveries(collectionId?: string) {
    return [...this.deliveryLog.values()]
      .filter((d) => !collectionId || d.collection_id === collectionId)
      .map((d) => ({ ...d }));
  }

  retryDelivery(deliveryId: string) {
    const d = this.deliveryLog.get(deliveryId);
    if (!d) throw new BankError(404, 'not_found', 'No such delivery.');
    d.status = 'pending';
    d.next_attempt_at = iso();
    this.save();
    void this.attempt(d.id);
    return { ...d };
  }

  // ──────────────────────────────────────────────── internals

  private record(collectionId: string) {
    const record = this.records.get(collectionId);
    if (!record) throw new BankError(404, 'not_found', 'No such collection.');
    return record;
  }

  private requireStatus(record: CollectionRecord, allowed: CollectionStatus[]) {
    if (!allowed.includes(record.collection.status)) {
      throw new BankError(409, 'invalid_state', `The collection is ${record.collection.status}.`);
    }
  }

  private expireIfDue(record: CollectionRecord) {
    const c = record.collection;
    if (c.status === 'pending' && Date.parse(c.expires_at) <= Date.now()) {
      this.finish(record, 'expired', {
        failure_code: 'expired',
        failure_reason: 'The payment was not approved in time.',
      });
    }
  }

  private settle(record: CollectionRecord, accountId: string) {
    const balance = this.balances.get(accountId) ?? null;
    if (balance !== null && balance < record.collection.amount) {
      return this.finish(record, 'failed', {
        failure_code: 'insufficient_funds',
        failure_reason: 'The bank declined the payment: insufficient funds.',
      });
    }
    if (balance !== null) this.balances.set(accountId, balance - record.collection.amount);
    return this.finish(record, 'succeeded', {
      bank_reference: `SBX${randomBytes(5).toString('hex').toUpperCase()}`,
    });
  }

  private finish(record: CollectionRecord, status: CollectionStatus, extra: Partial<Collection>) {
    if (FINAL.includes(record.collection.status)) return { ...record.collection };
    Object.assign(record.collection, extra, { status, completed_at: iso() });
    this.emit(record, `collection.${status}`);
    this.log(`collection ${record.collection.id} ${status}`);
    return { ...record.collection };
  }

  private emit(record: CollectionRecord, type: string) {
    const event: BankEvent = {
      id: id('evt'),
      type,
      created_at: iso(),
      livemode: false,
      data: { ...record.collection },
    };
    this.events.set(event.id, event);
    record.events.push(event.id);
    const delivery: Delivery = {
      id: id('dlv'),
      event_id: event.id,
      collection_id: record.collection.id,
      url: record.callbackUrl,
      status: 'pending',
      attempts: 0,
      last_status_code: null,
      last_error: null,
      next_attempt_at: iso(),
    };
    this.deliveryLog.set(delivery.id, delivery);
    this.save();
    void this.attempt(delivery.id);
  }

  private async attempt(deliveryId: string) {
    const d = this.deliveryLog.get(deliveryId);
    const event = d && this.events.get(d.event_id);
    if (!d || !event || d.status !== 'pending') return;
    const body = JSON.stringify(event);
    d.attempts += 1;
    try {
      const res = await this.fetchImpl(d.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SIGNATURE_HEADER]: sign(body, this.options.webhookSecret),
          'x-bank-event-id': event.id,
          'user-agent': 'NexG-Sandbox-Bank/1.0',
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      d.last_status_code = res.status;
      d.last_error = res.ok ? null : `HTTP ${res.status}`;
      if (res.ok) {
        d.status = 'delivered';
        d.next_attempt_at = null;
      }
    } catch (error) {
      d.last_status_code = null;
      d.last_error = error instanceof Error ? error.message : String(error);
    }
    if (d.status === 'pending') {
      const delay = this.retries[d.attempts - 1];
      if (delay === undefined) {
        d.status = 'failed';
        d.next_attempt_at = null;
      } else {
        d.next_attempt_at = iso(Date.now() + delay);
        this.later(delay, () => void this.attempt(d.id));
      }
    }
    this.log(
      `webhook ${event.type} → ${d.url}: ${d.status} (attempt ${d.attempts}${d.last_error ? `, ${d.last_error}` : ''})`,
    );
    this.save();
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    t.unref();
    this.timers.add(t);
  }

  private save() {
    const file = this.options.dataFile;
    if (!file) return;
    const state = {
      records: [...this.records.values()],
      events: [...this.events.values()],
      deliveries: [...this.deliveryLog.values()],
      balances: [...this.balances.entries()],
    };
    writeFileSync(`${file}.tmp`, JSON.stringify(state));
    renameSync(`${file}.tmp`, file);
  }

  private load() {
    const file = this.options.dataFile;
    if (!file) return;
    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      return;
    }
    const state = JSON.parse(raw) as {
      records: CollectionRecord[];
      events: BankEvent[];
      deliveries: Delivery[];
      balances: [string, number | null][];
    };
    for (const r of state.records) {
      this.records.set(r.collection.id, r);
      this.byIdempotencyKey.set(r.idempotencyKey, r.collection.id);
    }
    for (const e of state.events) this.events.set(e.id, e);
    for (const d of state.deliveries) this.deliveryLog.set(d.id, d);
    for (const [k, v] of state.balances) this.balances.set(k, v);
    for (const d of this.deliveryLog.values()) {
      if (d.status === 'pending') this.later(1_000, () => void this.attempt(d.id));
    }
    for (const r of this.records.values()) {
      // A slow approval interrupted by a restart pays on the next start.
      if (r.collection.status === 'processing') {
        this.later(this.slow, () => {
          if (r.collection.status === 'processing') this.settle(r, 'acc_slow');
        });
      }
    }
  }
}
