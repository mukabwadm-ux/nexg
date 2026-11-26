'use server';

import { revalidatePath } from 'next/cache';

import { refundThroughPaystack } from '@/app/orders/paystack-refunds';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;

export interface CancelRefundOutcome {
  ok: boolean;
  message: string;
}

/**
 * "Cancel and refund in full" for a paid NexG stay. The database decides who may
 * cancel, what is owed, and audits it; a repeat changes nothing. A Paystack
 * payment is then sent back through Paystack, and shows as refunded only once
 * Paystack says it processed it. Anything else is sent by hand and recorded.
 */
export async function cancelAndRefundStay(input: {
  stayId: string;
  reason: string;
}): Promise<CancelRefundOutcome> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  if (!UUID.test(input.stayId)) return { ok: false, message: 'The stay ID is invalid.' };
  const reason = input.reason.trim();
  if (!reason) return { ok: false, message: 'Give the reason for cancelling.' };

  /* rpc_stay_cancel_refund_full is newer than the generated types. */
  const client = createClient() as unknown as { rpc: Rpc };
  const { data, error } = await client.rpc('rpc_stay_cancel_refund_full', {
    p_stay_id: input.stayId,
    p_reason: reason.slice(0, 500),
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === '22023' || error.code === '42501'
          ? error.message
          : 'The stay could not be cancelled. Try again.',
    };
  revalidatePath('/hotels');

  const result =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  if (!result || result.ok !== true || typeof result.changed !== 'boolean')
    return {
      ok: false,
      message: 'The answer could not be read. Check the refunds below before doing anything else.',
    };

  /* "Nothing was changed" is said only where nothing more is done from here. */
  const done = result.changed ? 'Cancelled.' : 'This stay was already cancelled.';
  const untouched = result.changed ? done : 'This stay was already cancelled; nothing was changed.';
  if (typeof result.refunded_at === 'string')
    return { ok: true, message: `${untouched} The refund is already recorded.` };

  /* An earlier cancellation under the stay's policy owes less than was paid.
     The staff member confirmed the full amount, so nothing is sent from here. */
  const { changed, refund_kes: owed, paid_kes: paid } = result;
  if (!changed && typeof owed === 'number' && typeof paid === 'number' && owed < paid)
    return {
      ok: false,
      message: `${untouched} The refund due is KES ${owed.toLocaleString('en-KE')} of KES ${paid.toLocaleString('en-KE')} paid, not the full amount. Send it from the refunds below.`,
    };

  if (result.provider !== 'paystack')
    return {
      ok: true,
      message: `${untouched} Send the refund by M-Pesa or bank and record it below.`,
    };

  /* A repeat never starts another try after a failed one: its row is where
     someone checks Paystack first and then sends it again. */
  if (!changed && result.paystack_refund_state === 'failed')
    return {
      ok: false,
      message: `${untouched} The last Paystack refund failed. Check it in Paystack, then send it again from the refunds below.`,
    };

  try {
    const refund = await refundThroughPaystack('stay', input.stayId);
    return { ok: refund.ok, message: `${done} ${refund.message}` };
  } catch {
    return {
      ok: false,
      message: `${done} We could not confirm the refund with Paystack. Check it in the refunds below.`,
    };
  }
}

/**
 * "I checked the Paystack dashboard": what it shows for a stay's refund whose
 * row did not update. The database decides who may say so, records it and
 * audits it; a repeat changes nothing. No money is sent from here.
 */
export async function recordPaystackRefundCheck(input: {
  stayId: string;
  outcome: 'processed' | 'failed';
  reference: string;
  note: string;
  /** NexG's reference of the refund the row showed; null when it showed none. */
  shownReference: string | null;
}): Promise<CancelRefundOutcome> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  if (!UUID.test(input.stayId)) return { ok: false, message: 'The stay ID is invalid.' };
  if (input.outcome !== 'processed' && input.outcome !== 'failed')
    return { ok: false, message: 'Say whether Paystack shows the refund as processed or failed.' };
  const reference = input.reference.trim();
  if (input.outcome === 'processed' && !reference)
    return { ok: false, message: 'Enter the refund reference shown in the Paystack dashboard.' };

  /* rpc_stay_paystack_refund_checked is newer than the generated types. */
  const client = createClient() as unknown as { rpc: Rpc };
  const { data, error } = await client.rpc('rpc_stay_paystack_refund_checked', {
    p_stay_id: input.stayId,
    p_outcome: input.outcome,
    p_reference: reference.slice(0, 64),
    p_note: input.note.trim().slice(0, 500),
    p_shown_reference: input.shownReference,
  });
  if (error)
    return {
      ok: false,
      message:
        error.code === '22023' || error.code === '42501'
          ? error.message
          : 'That could not be recorded. Try again.',
    };
  revalidatePath('/hotels');

  const result =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  if (!result || result.ok !== true || typeof result.message !== 'string')
    return {
      ok: false,
      message: 'The answer could not be read. Check the refunds below before doing anything else.',
    };
  return { ok: true, message: result.message };
}
