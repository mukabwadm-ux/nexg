'use server';

import { revalidatePath } from 'next/cache';

import { createPublicClient } from '@/lib/supabase/public';

export interface Result {
  ok: boolean;
  message: string;
}

/*
 * Everything a candidate can do without an account.
 *
 * Each of these hands the token back to an RPC that looks it up
 * again. The page having rendered proves nothing — a token pasted
 * into a form is re-checked server-side every time, and an expired
 * one fails here rather than halfway through.
 */

/* The public wrappers, not the hr originals: anon has no usage on
   that schema, which is the point of it being a schema. */
type CandidateRpc =
  | 'rpc_careers_confirm_slot'
  | 'rpc_careers_withdraw'
  | 'rpc_careers_talent_pool'
  | 'rpc_careers_respond_offer'
  | 'rpc_careers_request_deletion';

async function call(
  fn: CandidateRpc,
  args: Record<string, unknown>,
  token: string,
  onOk: string,
): Promise<Result> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc(fn, args as never);

  if (error) return { ok: false, message: error.message };

  const result = data as { ok: boolean; reason?: string } | null;
  if (!result?.ok) {
    return {
      ok: false,
      message:
        result?.reason === 'not_found'
          ? 'That link has expired. Reply to any of our emails and we will send a new one.'
          : (result?.reason ?? 'That did not work.'),
    };
  }

  revalidatePath(`/careers/status/${token}`);
  return { ok: true, message: onOk };
}

export async function confirmSlot(
  token: string,
  interviewId: string,
  slot: string,
): Promise<Result> {
  return call(
    'rpc_careers_confirm_slot',
    { p_token: token, p_interview_id: interviewId, p_slot: slot },
    token,
    'Booked. We have sent you the details.',
  );
}

export async function withdrawApplication(token: string, reason: string | null): Promise<Result> {
  return call(
    'rpc_careers_withdraw',
    { p_token: token, p_reason: reason },
    token,
    'Withdrawn. The door is open if you change your mind.',
  );
}

export async function setTalentPool(token: string, optIn: boolean): Promise<Result> {
  return call(
    'rpc_careers_talent_pool',
    { p_token: token, p_opt_in: optIn },
    token,
    optIn ? 'We will keep your details for twelve months.' : 'Removed from the talent pool.',
  );
}

export async function respondToOffer(
  token: string,
  accept: boolean,
  reason: string | null,
): Promise<Result> {
  return call(
    'rpc_careers_respond_offer',
    { p_token: token, p_accept: accept, p_reason: reason },
    token,
    accept ? 'Accepted. We will be in touch today.' : 'Noted, and thank you for telling us.',
  );
}

export async function requestDeletion(token: string): Promise<Result> {
  return call(
    'rpc_careers_request_deletion',
    { p_token: token },
    token,
    'Logged. Our data protection officer will come back to you within 30 days.',
  );
}
