'use server';

import { sendStayConfirmed } from '@/lib/email';
import { createClient } from '@/lib/supabase/server';

export interface HoldInput {
  unitId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  firstName: string;
}

export interface HoldResult {
  ok: boolean;
  message: string;
  stayId?: string;
  expiresAt?: string;
  totalKes?: number;
  nights?: number;
}

export interface CheckoutStatus {
  status: 'held' | 'booked' | 'cancelled' | 'expired' | string;
  holdExpiresAt: string | null;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalKes: number | null;
  paidKes: number | null;
  refundDue: boolean;
  unit: string;
  property: string;
  paymentState: string | null;
  paymentFailure: string | null;
  paymentReference: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Postgres raises with a sentence meant for the guest; keep only that. */
function guestMessage(message: string | undefined, fallback: string) {
  const text = (message ?? '').replace(/^.*?:\s*(?=[A-Z])/, '').trim();
  return text && text.length < 200 ? text : fallback;
}

/** Hold the dates for 15 minutes while the guest pays. */
export async function holdStay(input: HoldInput): Promise<HoldResult> {
  if (!DAY.test(input.checkIn) || !DAY.test(input.checkOut)) {
    return { ok: false, message: 'Choose a check-in and a check-out date.' };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous || !user.email) {
    return { ok: false, message: 'Sign in with your email to book.' };
  }

  const { data, error } = await supabase.rpc('rpc_stay_hold', {
    p_unit_id: input.unitId,
    p_check_in: input.checkIn,
    p_check_out: input.checkOut,
    p_guest: {
      first_name: input.firstName.trim().slice(0, 80) || undefined,
      adults: Math.max(1, Math.floor(input.adults)),
      children: Math.max(0, Math.floor(input.children)),
    },
  });
  if (error) {
    return {
      ok: false,
      message: guestMessage(error.message, 'Those dates could not be held. Try again.'),
    };
  }
  const hold = data as {
    stay_id: string;
    expires_at: string;
    total_kes: number;
    nights: number;
  };
  return {
    ok: true,
    message: 'Held for 15 minutes.',
    stayId: hold.stay_id,
    expiresAt: hold.expires_at,
    totalKes: hold.total_kes,
    nights: hold.nights,
  };
}

/** Let the dates go before the hold runs out. */
export async function releaseStayHold(stayId: string): Promise<{ ok: boolean }> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_stay_hold_release', { p_stay_id: stayId });
  return { ok: !error };
}

/**
 * Where the checkout stands. The first time it reads as booked, this also
 * sends the confirmation email: the database hands that job to exactly one
 * caller, so a refresh or a second tab never sends it twice.
 */
export async function stayCheckoutStatus(stayId: string): Promise<CheckoutStatus | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_stay_checkout_status', { p_stay_id: stayId });
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const status: CheckoutStatus = {
    status: String(row.status),
    holdExpiresAt: (row.hold_expires_at as string | null) ?? null,
    checkIn: String(row.check_in),
    checkOut: String(row.check_out),
    nights: Number(row.nights),
    totalKes: (row.total_kes as number | null) ?? null,
    paidKes: (row.paid_kes as number | null) ?? null,
    refundDue: Boolean(row.refund_due),
    unit: String(row.unit ?? ''),
    property: String(row.property ?? ''),
    paymentState: (row.payment_state as string | null) ?? null,
    paymentFailure: (row.payment_failure as string | null) ?? null,
    paymentReference: (row.payment_reference as string | null) ?? null,
  };

  if (status.status === 'booked') {
    const first = await supabase.rpc('rpc_stay_confirmation_sent', { p_stay_id: stayId });
    if (first.data === true) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        const outcome = await sendStayConfirmed(user.email, {
          name: (user.user_metadata?.first_name as string | undefined) ?? null,
          property: status.property,
          unit: status.unit,
          checkIn: status.checkIn,
          checkOut: status.checkOut,
          nights: status.nights,
          paidKes: status.paidKes ?? status.totalKes ?? 0,
          reference: status.paymentReference ?? '',
        });
        if (outcome.status !== 'sent') {
          console.warn('[stays] confirmation email not sent', outcome.status, outcome.error ?? '');
        }
      }
    }
  }
  return status;
}
