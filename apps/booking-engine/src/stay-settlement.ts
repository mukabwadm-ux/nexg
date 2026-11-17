import { createHash } from 'node:crypto';
import { requireManager } from './auth.js';
import { BookingError, type Identity } from './types.js';
import type { BookingEngine } from './engine.js';

type Row = Record<string, any>;
export interface StayPaymentBinding {
  attemptId: string;
  provider: string;
  providerAccountId: string;
  providerReference: string;
}
export interface StaySettlementProof extends StayPaymentBinding {
  merchantId: string;
  bookingId: string;
  eventId: string;
  amountMinor: number;
  currency: string;
  status: 'settled' | 'failed' | 'pending' | 'unknown';
  occurredAt: string;
}
export type StaySettlementResult = {
  bookingId: string;
  outcome: 'confirmed' | 'reconciliation';
  reason: string;
};
const text = (v: unknown) =>
  typeof v === 'string' && v.trim() === v && v.length > 0 && v.length <= 200;
const sameBinding = (a: any, b: StayPaymentBinding) =>
  a &&
  ['attemptId', 'provider', 'providerAccountId', 'providerReference'].every(
    (k) => a[k] === b[k as keyof StayPaymentBinding],
  );
const validBinding = (b: any) =>
  b && ['attemptId', 'provider', 'providerAccountId', 'providerReference'].every((k) => text(b[k]));
const result = (p: StaySettlementProof, reason: string): StaySettlementResult => ({
  bookingId: p.bookingId,
  outcome: 'reconciliation',
  reason,
});

/** Pure decision only. No proof field is authentication; only a trusted verifier may call the receiver. */
export function decideStaySettlement(
  doc: Row | undefined,
  proof: StaySettlementProof,
  now: number,
): StaySettlementResult {
  if (
    !doc ||
    doc.businessId !== proof.merchantId ||
    doc.publicId !== proof.bookingId ||
    doc.nexg?.stayHold?.contractVersion !== 1
  )
    return result(proof, 'unknown_booking');
  const n = doc.nexg,
    hold = n.stayHold,
    payment = n.stayPayment;
  if (!sameBinding(payment, proof)) return result(proof, 'unmatched_attempt');
  if (n.stayPaymentReconciliation?.state === 'required')
    return result(proof, 'unresolved_reconciliation');
  if (proof.status !== 'settled') return result(proof, 'settlement_not_verified');
  if (
    !Number.isSafeInteger(proof.amountMinor) ||
    proof.amountMinor <= 0 ||
    proof.amountMinor !== hold.totalMinor ||
    proof.currency !== 'KES' ||
    hold.currency !== 'KES' ||
    payment.amountMinor !== proof.amountMinor ||
    payment.currency !== proof.currency
  )
    return result(proof, 'amount_or_currency_mismatch');
  const occurred = Date.parse(proof.occurredAt),
    created = Date.parse(payment.createdAt);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(occurred) ||
    !Number.isFinite(created) ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(proof.occurredAt) ||
    occurred > now + 5000 ||
    occurred < created
  )
    return result(proof, 'invalid_settlement_time');
  if (
    payment.state === 'settled' &&
    doc.status === 'confirmed' &&
    n.paymentState === 'provider_verified' &&
    n.paidMinor === proof.amountMinor
  )
    return { bookingId: proof.bookingId, outcome: 'confirmed', reason: 'already_settled' };
  if (payment.state !== 'pending') return result(proof, 'attempt_not_pending');
  const expiry = Date.parse(n.expiresAt);
  if (doc.status !== 'held' || !Number.isFinite(expiry) || expiry <= now || occurred >= expiry)
    return result(proof, 'hold_no_longer_valid');
  if ((n.paidMinor ?? 0) !== 0 || (n.refundedMinor ?? 0) !== 0)
    return result(proof, 'existing_financial_state');
  return { bookingId: proof.bookingId, outcome: 'confirmed', reason: 'settlement_accepted' };
}

/** Internal provider-initiation seam only. No charge is performed and no HTTP route is registered.
 * Binding must come from a trusted initiation adapter, never a customer request body.
 * Production initiation and credential verification are deliberately not implemented here.
 */
export async function bindStayPaymentAttempt(
  engine: BookingEngine,
  identity: Identity,
  bookingId: string,
  binding: StayPaymentBinding,
  key: string,
  requirePrepared = false,
) {
  requireManager(identity);
  if (!text(bookingId) || !validBinding(binding))
    throw new BookingError(422, 'Invalid payment binding.', 'invalid_stay_payment');
  const c = engine.managementContext();
  return c.command(
    identity,
    key,
    requirePrepared ? 'stays.payment.prepared.bind' : 'stays.payment.bind',
    { bookingId, ...binding },
    async (req) => {
      const doc = await c.own('reservations', bookingId, identity, req),
        n = doc.nexg,
        hold = n?.stayHold;
      if (
        hold?.contractVersion !== 1 ||
        hold.currency !== 'KES' ||
        !Number.isSafeInteger(hold.totalMinor) ||
        hold.totalMinor <= 0 ||
        doc.status !== 'held' ||
        !Number.isFinite(Date.parse(n.expiresAt)) ||
        Date.parse(n.expiresAt) <= c.now()
      )
        throw new BookingError(
          409,
          'An active native Stay hold is required.',
          'stay_payment_hold_required',
        );
      if (identity.branches && !identity.branches.includes(n.locationId))
        throw new BookingError(403, 'Branch unavailable.', 'forbidden');
      if (n.stayPaymentReconciliation?.state === 'required')
        throw new BookingError(409, 'Payment reconciliation is required.', 'stay_payment_blocked');
      const enforcePrepared = requirePrepared || Boolean(n.stayPaymentPreparation);
      if (enforcePrepared) {
        const p = n.stayPaymentPreparation;
        if (
          p?.contractVersion !== 1 ||
          p.attemptId !== binding.attemptId ||
          p.actorId !== n.createdBy ||
          p.amountMinor !== hold.totalMinor ||
          p.currency !== 'KES' ||
          !['prepared', 'bound'].includes(p.state) ||
          !Number.isFinite(Date.parse(p.expiresAt)) ||
          Date.parse(p.expiresAt) <= c.now() ||
          (p.state === 'bound' && !sameBinding(n.stayPayment, binding))
        )
          throw new BookingError(
            409,
            'The original prepared payment attempt is required.',
            'stay_payment_preparation_required',
          );
      }
      if (n.stayPayment) {
        if (sameBinding(n.stayPayment, binding))
          return { bookingId, attemptId: binding.attemptId, status: n.stayPayment.state };
        throw new BookingError(
          409,
          'A payment attempt is already bound.',
          'stay_payment_attempt_exists',
        );
      }
      const rows = await c.all('reservations', identity, req);
      if (
        rows.some(
          (r) =>
            r.nexg?.stayPayment &&
            (r.nexg.stayPayment.attemptId === binding.attemptId ||
              (r.nexg.stayPayment.provider === binding.provider &&
                r.nexg.stayPayment.providerAccountId === binding.providerAccountId &&
                r.nexg.stayPayment.providerReference === binding.providerReference)),
        )
      )
        throw new BookingError(
          409,
          'Payment reference is already bound.',
          'duplicate_stay_payment',
        );
      await c.update(
        'reservations',
        doc.id,
        {
          nexg: {
            ...n,
            version: n.version + 1,
            ...(enforcePrepared
              ? { stayPaymentPreparation: { ...n.stayPaymentPreparation, state: 'bound' } }
              : {}),
            stayPayment: {
              ...binding,
              state: 'pending',
              amountMinor: hold.totalMinor,
              currency: 'KES',
              createdAt: new Date(c.now()).toISOString(),
            },
          },
        },
        identity,
        req,
      );
      await c.audit(identity, req, 'stay.payment.bound', bookingId, {
        attemptId: binding.attemptId,
      });
      return { bookingId, attemptId: binding.attemptId, status: 'pending' };
    },
  );
}

/** Bind a trusted provider response only to the durable pre-dispatch attempt. No send occurs. */
export function bindPreparedStayPaymentAttempt(
  engine: BookingEngine,
  identity: Identity,
  bookingId: string,
  binding: StayPaymentBinding,
  key: string,
) {
  return bindStayPaymentAttempt(engine, identity, bookingId, binding, key, true);
}

/** Must authenticate provider signatures/account and derive a trusted server actor. A signed
 * customer claim or caller-supplied `verified:true` is NOT a verifier. Only fixture verifiers
 * exist in this slice; there is no production provider callback, charge, refund or payout.
 */
export interface StaySettlementVerifier {
  verify(raw: unknown): Promise<{ identity: Identity; proof: StaySettlementProof }>;
  /** Validate current native owner/inventory readiness in the SAME transaction, or return false. */
  canConfirm(identity: Identity, doc: Row, request: any): Promise<boolean>;
}
export function createStaySettlementReceiver(
  engine: BookingEngine,
  verifier: StaySettlementVerifier,
) {
  return async (raw: unknown): Promise<StaySettlementResult> => {
    const { identity, proof } = await verifier.verify(raw);
    requireManager(identity);
    if (
      !proof ||
      identity.businessId !== proof.merchantId ||
      !validBinding(proof) ||
      !text(proof.bookingId) ||
      !text(proof.eventId) ||
      !['settled', 'failed', 'pending', 'unknown'].includes(proof.status)
    )
      throw new BookingError(403, 'Unverified settlement.', 'invalid_stay_settlement');
    const c = engine.managementContext();
    const key = createHash('sha256')
      .update(JSON.stringify([proof.provider, proof.providerAccountId, proof.eventId]))
      .digest('hex');
    return c.command(identity, key, 'stays.payment.settlement', proof, async (req) => {
      const rows = await c.all('reservations', identity, req),
        doc = rows.find((r) => r.publicId === proof.bookingId);
      let outcome = decideStaySettlement(doc, proof, c.now());
      if (doc && identity.branches && !identity.branches.includes(doc.nexg?.locationId))
        throw new BookingError(403, 'Branch unavailable.', 'forbidden');
      if (outcome.reason === 'settlement_accepted') {
        try {
          if (!(await verifier.canConfirm(identity, doc!, req)))
            outcome = result(proof, 'native_confirmation_unavailable');
        } catch (error) {
          // Known business/readiness rejection is reconciliation. Infrastructure errors
          // roll back the command so the authenticated event can be retried safely.
          if (error instanceof BookingError && error.status >= 400 && error.status < 500)
            outcome = result(proof, 'native_confirmation_unavailable');
          else throw error;
        }
      }
      // Recheck expiry after any asynchronous readiness verification. Never resurrect a hold.
      if (outcome.reason === 'settlement_accepted')
        outcome = decideStaySettlement(doc, proof, c.now());
      if (outcome.reason === 'settlement_accepted') {
        const n = doc!.nexg;
        await c.update(
          'reservations',
          doc!.id,
          {
            status: 'confirmed',
            nexg: {
              ...n,
              status: 'confirmed',
              version: n.version + 1,
              expiresAt: null,
              paidMinor: proof.amountMinor,
              paymentState: 'provider_verified',
              stayPayment: {
                ...n.stayPayment,
                state: 'settled',
                eventId: proof.eventId,
                settledAt: proof.occurredAt,
              },
            },
          },
          identity,
          req,
        );
      }
      if (
        outcome.outcome === 'reconciliation' &&
        proof.status === 'settled' &&
        doc?.businessId === identity.businessId &&
        doc.publicId === proof.bookingId &&
        doc.nexg?.stayHold?.contractVersion === 1 &&
        sameBinding(doc.nexg.stayPayment, proof) &&
        doc.nexg.stayPaymentReconciliation?.state !== 'required'
      ) {
        // Verified funds that cannot safely confirm must remain visible on the original
        // booking. This is NOT a refund promise or permission to retry/reallocate inventory.
        const n = doc.nexg;
        await c.update(
          'reservations',
          doc.id,
          {
            nexg: {
              ...n,
              version: n.version + 1,
              stayPaymentReconciliation: {
                state: 'required',
                fundsObserved: true,
                reason: outcome.reason,
                attemptId: proof.attemptId,
                eventId: proof.eventId,
                ...(Number.isSafeInteger(proof.amountMinor) && proof.amountMinor > 0
                  ? { amountMinor: proof.amountMinor }
                  : {}),
                ...(text(proof.currency) ? { currency: proof.currency } : {}),
                ...(Number.isFinite(Date.parse(proof.occurredAt))
                  ? { occurredAt: proof.occurredAt }
                  : {}),
                recordedAt: new Date(c.now()).toISOString(),
              },
            },
          },
          identity,
          req,
        );
      }
      // Command + audit preserve reconciliation even for unknown bookings; no reallocation or refund is guessed.
      if (outcome.reason !== 'already_settled')
        await c.audit(identity, req, 'stay.payment.' + outcome.outcome, proof.bookingId, {
          attemptId: proof.attemptId,
          reason: outcome.reason,
        });
      return outcome;
    });
  };
}
