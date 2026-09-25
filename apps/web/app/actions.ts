'use server';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * The homepage "Start your order" card.
 *
 * Section 4.1: in this slice the form captures a concierge lead rather than
 * placing an order. It is stored on waitlist_signup with
 * source = 'homepage_request' and a concierge follows up on WhatsApp.
 */
const leadSchema = z.object({
  staying_at: z.string().trim().min(3, 'Tell us where you are staying.').max(300),
  need: z.string().trim().min(1, 'Choose what you need.').max(100),
  when: z.enum(['asap', 'later']),
  when_detail: z.string().trim().max(200).optional(),
});

export async function submitLead(_prev: ActionResult | null, formData: FormData) {
  const parsed = leadSchema.safeParse({
    staying_at: formData.get('staying_at'),
    need: formData.get('need'),
    when: formData.get('when'),
    when_detail: formData.get('when_detail') ?? undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Check the form and try again.',
    };
  }

  const supabase = createClient();
  const { error } = await supabase.from('waitlist_signup').insert({
    source: 'homepage_request',
    payload: parsed.data,
  });

  if (error) {
    return { ok: false, message: 'We could not send that. Check your connection and try again.' };
  }

  return {
    ok: true,
    message: 'Got it. A concierge will reply on WhatsApp shortly to confirm the price and timing.',
  };
}

/** The "Coming soon" app notify form at the foot of the homepage. */
const notifySchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
});

export async function joinAppWaitlist(_prev: ActionResult | null, formData: FormData) {
  const parsed = notifySchema.safeParse({ email: formData.get('email') });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Enter a valid email.' };
  }

  const supabase = createClient();
  const { error } = await supabase.from('waitlist_signup').insert({
    source: 'homepage_app',
    email: parsed.data.email,
    consent_marketing: true,
  });

  if (error) {
    return { ok: false, message: 'We could not save that. Try again in a moment.' };
  }

  return { ok: true, message: "You're on the list. We'll email you the moment it lands." };
}
