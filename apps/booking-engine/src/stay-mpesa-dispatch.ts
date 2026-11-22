import { createHash, randomUUID } from 'node:crypto';
import type { BookingEngine } from './engine.js';
import { requireManager } from './auth.js';
import { BookingError, type Identity } from './types.js';
import { assertStayHoldReady } from './stays.js';
import { createStaySettlementReceiver } from './stay-settlement.js';

type Row = Record<string, any>;
export interface StayMpesaCheckout {
  merchantId: string;
  actorId: string;
  bookingId: string;
  attemptId: string;
  phone: string;
}
export interface StayMpesaSend {
  merchantId: string;
  bookingId: string;
  attemptId: string;
  providerAccountId: string;
  phone: string;
  amountMinor: number;
  amountKes: number;
  currency: 'KES';
}
export interface StayMpesaAccepted {
  providerAccountId: string;
  attemptId: string;
  checkoutRequestId: string;
  merchantRequestId: string;
}
export interface StayMpesaVerifiedEvent {
  providerAccountId: string;
  checkoutRequestId: string;
  merchantRequestId: string;
  eventId: string;
  status: 'settled' | 'failed' | 'pending' | 'unknown';
  amountMinor: number;
  currency: string;
  occurredAt: string;
}
/** No real adapter is provided. A future adapter must authenticate server checkout consent,
 * authenticate provider/account evidence, and preserve exact request correlation. A boolean
 * supplied in an HTTP payload is never verification. Tests use an explicit fixture adapter.
 */
export interface StayMpesaFixtureAdapter {
  mode: 'fixture';
  authorizeCheckout(raw: unknown): Promise<StayMpesaCheckout>;
  send(request: StayMpesaSend): Promise<unknown>;
  verifyAccepted(raw: unknown, request: StayMpesaSend): Promise<StayMpesaAccepted>;
  verifyEvent(raw: unknown): Promise<StayMpesaVerifiedEvent>;
}
export interface StayMpesaPilotOptions {
  enabled?: boolean;
  environment: 'fixture';
  fixtureMarker: 'synthetic-stay-mpesa-v1';
  identity: Identity;
  providerAccountId: string;
  adapter: StayMpesaFixtureAdapter;
}
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 200 && v.trim() === v;
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail = (code: string, status = 409): never => {
  throw new BookingError(status, 'Native Stay M-Pesa pilot unavailable.', code);
};
const bindingMatches = (d: Row, a: string) => d.nexg?.stayPaymentPreparation?.attemptId === a;
const view = (
  bookingId: string,
  attemptId: string,
  status: 'accepted' | 'reconciliation',
  reason: string,
) => ({ bookingId, attemptId, status, reason });

/** Explicitly fixture-only, default off. No HTTP client, provider credentials, worker, payout,
 * callback route or legacy Supabase code. Persistent claim before send provides at-most-one
 * send attempt, not exactly-once money movement. A crash before send intentionally sacrifices
 * liveness: operator reconciliation is required rather than risking a duplicate STK prompt.
 */
export function createStayMpesaPilot(
  engine: BookingEngine,
  options: StayMpesaPilotOptions,
  readiness = assertStayHoldReady,
) {
  const c = engine.managementContext(),
    identity = options.identity,
    adapter = options.adapter;
  function gate() {
    if (
      process.env.NODE_ENV !== 'test' ||
      options.fixtureMarker !== 'synthetic-stay-mpesa-v1' ||
      options.enabled !== true ||
      options.environment !== 'fixture' ||
      adapter?.mode !== 'fixture'
    )
      fail('stay_mpesa_disabled', 503);
    requireManager(identity);
    if (!text(options.providerAccountId)) fail('stay_mpesa_account_required');
  }
  async function dispatch(raw: unknown) {
    gate();
    const auth = await adapter.authorizeCheckout(raw);
    if (
      !auth ||
      auth.merchantId !== identity.businessId ||
      ![auth.actorId, auth.bookingId, auth.attemptId].every(text) ||
      !/^254[17]\d{8}$/.test(auth.phone)
    )
      fail('stay_mpesa_checkout_unverified', 403);
    const token = randomUUID(),
      fingerprint = hash([auth, options.providerAccountId]);
    const claim = await c.command(
      identity,
      auth.attemptId,
      'stays.mpesa.claim',
      { fingerprint },
      async (req) => {
        const doc = await c.own('reservations', auth.bookingId, identity, req),
          n = doc.nexg,
          p = n?.stayPaymentPreparation;
        if (
          doc.businessId !== identity.businessId ||
          n?.createdBy !== auth.actorId ||
          !bindingMatches(doc, auth.attemptId) ||
          p.actorId !== auth.actorId
        )
          fail('stay_mpesa_checkout_unverified', 403);
        if (identity.branches && !identity.branches.includes(n.locationId)) fail('forbidden', 403);
        if (n.stayMpesaDispatch) {
          if (n.stayMpesaDispatch.fingerprint !== fingerprint) fail('stay_mpesa_attempt_conflict');
          return {
            claimToken: n.stayMpesaDispatch.claimToken,
            expiresAt: p.expiresAt,
            amountMinor: p.amountMinor,
          };
        }
        if (
          p.contractVersion !== 1 ||
          p.state !== 'prepared' ||
          p.currency !== 'KES' ||
          !Number.isSafeInteger(p.amountMinor) ||
          p.amountMinor <= 0 ||
          p.amountMinor % 100 !== 0 ||
          p.amountMinor !== n.stayHold?.totalMinor ||
          n.stayHold?.currency !== 'KES' ||
          n.stayHold?.contractVersion !== 1 ||
          n.stayPayment ||
          n.stayPaymentReconciliation?.state === 'required' ||
          (n.paidMinor ?? 0) !== 0 ||
          (n.refundedMinor ?? 0) !== 0 ||
          doc.status !== 'held' ||
          !Number.isFinite(Date.parse(p.expiresAt)) ||
          !Number.isFinite(Date.parse(n.expiresAt)) ||
          Date.parse(p.expiresAt) <= c.now() ||
          Date.parse(n.expiresAt) <= c.now()
        )
          fail('stay_mpesa_attempt_unavailable');
        await readiness(engine, identity, doc, req);
        if (Date.parse(n.expiresAt) <= c.now()) fail('stay_mpesa_attempt_unavailable');
        await c.update(
          'reservations',
          doc.id,
          {
            nexg: {
              ...n,
              version: n.version + 1,
              stayMpesaDispatch: {
                contractVersion: 1,
                attemptId: auth.attemptId,
                providerAccountId: options.providerAccountId,
                environment: 'fixture',
                fingerprint,
                claimToken: token,
                state: 'dispatching',
                claimedAt: new Date(c.now()).toISOString(),
              },
            },
          },
          identity,
          req,
        );
        await c.audit(identity, req, 'stay.mpesa.dispatch.claimed', auth.bookingId, {
          attemptId: auth.attemptId,
        });
        return { claimToken: token, expiresAt: p.expiresAt, amountMinor: p.amountMinor };
      },
    );
    // A replayed command returns the OLD token: it must never grant another send.
    if (claim.claimToken !== token) {
      const doc = await c.own('reservations', auth.bookingId, identity),
        state = doc.nexg?.stayMpesaDispatch?.state;
      return view(
        auth.bookingId,
        auth.attemptId,
        state === 'accepted' ? 'accepted' : 'reconciliation',
        'already_claimed_no_resend',
      );
    }
    const request: StayMpesaSend = {
      merchantId: identity.businessId,
      bookingId: auth.bookingId,
      attemptId: auth.attemptId,
      providerAccountId: options.providerAccountId,
      phone: auth.phone,
      amountMinor: claim.amountMinor,
      amountKes: claim.amountMinor / 100,
      currency: 'KES',
    };
    let accepted: StayMpesaAccepted;
    try {
      if (Date.parse(claim.expiresAt) <= c.now()) throw Error('expired before send');
      const response = await adapter.send(request);
      accepted = await adapter.verifyAccepted(response, request);
      if (
        !accepted ||
        accepted.providerAccountId !== options.providerAccountId ||
        accepted.attemptId !== auth.attemptId ||
        !text(accepted.checkoutRequestId) ||
        !text(accepted.merchantRequestId)
      )
        throw Error('unmatched response');
    } catch {
      // Never expose provider error bodies, secrets, phone numbers or raw response data.
      await c.command(
        identity,
        auth.attemptId,
        'stays.mpesa.uncertain',
        { fingerprint },
        async (req) => {
          const doc = await c.own('reservations', auth.bookingId, identity, req),
            n = doc.nexg,
            d = n.stayMpesaDispatch;
          if (d?.claimToken !== token) fail('stay_mpesa_attempt_conflict');
          await c.update(
            'reservations',
            doc.id,
            {
              nexg: {
                ...n,
                version: n.version + 1,
                stayMpesaDispatch: { ...d, state: 'uncertain', reason: 'provider_outcome_unknown' },
              },
            },
            identity,
            req,
          );
          await c.audit(identity, req, 'stay.mpesa.dispatch.reconciliation', auth.bookingId, {
            attemptId: auth.attemptId,
            reason: 'provider_outcome_unknown',
          });
          return { recorded: true };
        },
      );
      return view(auth.bookingId, auth.attemptId, 'reconciliation', 'provider_outcome_unknown');
    }
    // Atomic provider response + original attempt binding. Even a late accepted response is
    // recorded so a later verified payment can reconcile; this NEVER confirms an expired hold.
    return c.command(
      identity,
      auth.attemptId,
      'stays.mpesa.accepted',
      { fingerprint, accepted },
      async (req) => {
        const doc = await c.own('reservations', auth.bookingId, identity, req),
          n = doc.nexg,
          p = n.stayPaymentPreparation,
          d = n.stayMpesaDispatch;
        if (
          d?.claimToken !== token ||
          !bindingMatches(doc, auth.attemptId) ||
          p.amountMinor !== claim.amountMinor ||
          n.stayPayment
        )
          fail('stay_mpesa_attempt_conflict');
        const duplicate = (await c.all('reservations', identity, req)).some(
          (r) =>
            r.publicId !== doc.publicId &&
            ((r.nexg?.stayMpesaDispatch?.providerAccountId === options.providerAccountId &&
              r.nexg.stayMpesaDispatch.checkoutRequestId === accepted.checkoutRequestId) ||
              (r.nexg?.stayPayment?.provider === 'mpesa' &&
                r.nexg.stayPayment.providerAccountId === options.providerAccountId &&
                r.nexg.stayPayment.providerReference === accepted.checkoutRequestId)),
        );
        if (duplicate) fail('duplicate_stay_payment');
        await c.update(
          'reservations',
          doc.id,
          {
            nexg: {
              ...n,
              version: n.version + 1,
              stayPaymentPreparation: { ...p, state: 'bound' },
              stayMpesaDispatch: {
                ...d,
                state: 'accepted',
                checkoutRequestId: accepted.checkoutRequestId,
                merchantRequestId: accepted.merchantRequestId,
              },
              stayPayment: {
                attemptId: auth.attemptId,
                provider: 'mpesa',
                providerAccountId: options.providerAccountId,
                providerReference: accepted.checkoutRequestId,
                amountMinor: claim.amountMinor,
                currency: 'KES',
                state: 'pending',
                createdAt: p.preparedAt,
              },
            },
          },
          identity,
          req,
        );
        await c.audit(identity, req, 'stay.mpesa.dispatch.accepted', auth.bookingId, {
          attemptId: auth.attemptId,
        });
        const expired = doc.status !== 'held' || Date.parse(n.expiresAt) <= c.now();
        return view(
          auth.bookingId,
          auth.attemptId,
          expired ? 'reconciliation' : 'accepted',
          expired ? 'hold_no_longer_valid' : 'prompt_accepted_not_paid',
        );
      },
    );
  }
  async function reconcile(raw: unknown) {
    gate();
    const event = await adapter.verifyEvent(raw);
    if (
      !event ||
      event.providerAccountId !== options.providerAccountId ||
      ![event.checkoutRequestId, event.merchantRequestId, event.eventId].every(text) ||
      !['settled', 'failed', 'pending', 'unknown'].includes(event.status)
    )
      fail('stay_mpesa_event_unverified', 403);
    const rows = await c.all('reservations', identity),
      matches = rows.filter(
        (r) =>
          r.nexg?.stayMpesaDispatch?.providerAccountId === options.providerAccountId &&
          r.nexg.stayMpesaDispatch.checkoutRequestId === event.checkoutRequestId &&
          r.nexg.stayMpesaDispatch.merchantRequestId === event.merchantRequestId,
      );
    if (matches.length !== 1) {
      await c.command(
        identity,
        hash([event.providerAccountId, event.eventId]),
        'stays.mpesa.unmatched',
        event,
        async (req) => {
          await c.audit(identity, req, 'stay.mpesa.event.reconciliation', event.eventId, {
            reason: 'unmatched_provider_event',
          });
          return { recorded: true };
        },
      );
      return { outcome: 'reconciliation' as const, reason: 'unmatched_provider_event' };
    }
    const doc = matches[0]!,
      attemptId = doc.nexg.stayMpesaDispatch.attemptId;
    const receive = createStaySettlementReceiver(engine, {
      verify: async () => ({
        identity,
        proof: {
          merchantId: identity.businessId,
          bookingId: doc.publicId,
          attemptId,
          provider: 'mpesa',
          providerAccountId: event.providerAccountId,
          providerReference: event.checkoutRequestId,
          eventId: event.eventId,
          status: event.status,
          amountMinor: event.amountMinor,
          currency: event.currency,
          occurredAt: event.occurredAt,
        },
      }),
      canConfirm: async (i, d, req) => {
        await readiness(engine, i, d, req);
        return true;
      },
    });
    // No amount is inferred from an STK-query success: absent/mismatched evidence reconciles.
    return receive(undefined);
  }
  return { dispatch, reconcile };
}
