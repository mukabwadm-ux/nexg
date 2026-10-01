'use server';

import { createPublicClient } from '@/lib/supabase/public';

export interface StayRequestResult {
  ok: boolean;
  message: string;
  reference?: string;
}

export interface StayRequestInput {
  name: string;
  phone: string | null;
  email: string | null;
  city: string;
  areas: string[];
  check_in: string | null;
  check_out: string | null;
  guests: number | null;
  bedrooms: number | null;
  budget: number | null;
  purpose: string | null;
  must_haves: string[];
  notes: string | null;
  consent_marketing: boolean;
  source?: string;
}

/**
 * The hero form.
 *
 * Goes through `rpc_stay_request_create`, which allocates the
 * reference, queues the acknowledgement and writes the audit event in
 * one transaction. It also enforces the thing that matters: a request
 * with no phone and no email is refused, because a request we cannot
 * answer is not a request.
 */
export async function requestStay(input: StayRequestInput): Promise<StayRequestResult> {
  if (!input.phone?.trim() && !input.email?.trim()) {
    return {
      ok: false,
      message: 'Leave a phone number or an email, or we have no way to come back to you.',
    };
  }

  const supabase = createPublicClient();

  const { data, error } = await supabase.rpc('rpc_stay_request_create', {
    p_payload: {
      name: input.name,
      phone: input.phone,
      email: input.email,
      city: input.city,
      areas: input.areas,
      check_in: input.check_in,
      check_out: input.check_out,
      guests: input.guests,
      bedrooms: input.bedrooms,
      budget: input.budget,
      purpose: input.purpose,
      must_haves: input.must_haves,
      notes: input.notes,
      consent_marketing: input.consent_marketing,
      source: input.source ?? 'stays_hero',
    },
  });

  if (error) return { ok: false, message: error.message };

  const result = data as { ok: boolean; reference: string } | null;
  return {
    ok: true,
    message: 'We will come back with a shortlist.',
    reference: result?.reference,
  };
}
