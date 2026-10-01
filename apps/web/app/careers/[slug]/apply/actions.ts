'use server';

import { createPublicClient } from '@/lib/supabase/public';

export interface ApplyResult {
  ok: boolean;
  message: string;
  token?: string;
  firstName?: string;
  reopened?: boolean;
}

export interface ApplyInput {
  job_slug: string;
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  linkedin_url: string | null;
  why_nexg: string | null;
  answers: Record<string, string>;
  talent_pool: boolean;
  src: string | null;
}

/**
 * The apply form.
 *
 * Goes through `hr.rpc_apply`, which scores the answers, records the
 * consent version, issues the status token and queues the
 * acknowledgement in one transaction.
 *
 * A failed must-have is deliberately not surfaced here. The candidate
 * is not told at submit that they have been screened out, because
 * they have not been — a person still reads it.
 */
export async function applyToJob(input: ApplyInput): Promise<ApplyResult> {
  if (!input.email?.trim()) {
    return { ok: false, message: 'We need an email — it is how we come back to you.' };
  }

  const supabase = createPublicClient();

  const { data, error } = await supabase.rpc('rpc_careers_apply', {
    p_payload: {
      job_slug: input.job_slug,
      full_name: input.full_name,
      email: input.email,
      phone: input.phone,
      city: input.city,
      linkedin_url: input.linkedin_url,
      why_nexg: input.why_nexg,
      answers: input.answers,
      talent_pool: input.talent_pool,
      src: input.src,
    },
  });

  if (error) return { ok: false, message: error.message };

  const result = data as
    | { ok: boolean; token?: string; first_name?: string; reopened?: boolean; message?: string }
    | null;

  if (!result?.ok) {
    return { ok: false, message: result?.message ?? 'That role is no longer open.' };
  }

  return {
    ok: true,
    message: 'Got it.',
    token: result.token,
    firstName: result.first_name,
    reopened: result.reopened,
  };
}
