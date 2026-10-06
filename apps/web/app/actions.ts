'use server';

import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

export interface ActionResult {
  ok: boolean;
  message: string;
  /** The ticket the desk will work. Shown back so they can quote it. */
  reference?: string;
}

/**
 * The homepage "Start your order" card.
 *
 * It raises a **ticket**. It used to write a row to
 * `waitlist_signup` with source = 'homepage_request', which is
 * a table nobody works through — so somebody asking for dinner
 * at eight landed in a list beside people who wanted to be told
 * when we launch in Kisumu, with no queue, no clock and no
 * status.
 *
 * It also took no contact detail at all. A concierge request
 * with no way to reply is not a request; it is a note to
 * ourselves. The phone number is now required, because every
 * other field only matters if somebody can answer.
 */
const leadSchema = z.object({
  staying_at: z.string().trim().min(3, 'Tell us where you are staying.').max(300),
  need: z.string().trim().min(1, 'Choose what you need.').max(100),
  when: z.enum(['asap', 'later']),
  when_detail: z.string().trim().max(200).optional(),

  /* The two that make it answerable. */
  phone: z
    .string()
    .trim()
    .min(7, 'We need a number to reach you on.')
    .max(20)
    .regex(/^[+0-9][0-9 ()-]{6,}$/, 'That does not look like a phone number.'),
  full_name: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(600).optional(),

  /*
   * The pin, present only when the guest picked a place rather
   * than typing one. Coerced and bounded here rather than
   * trusted: these arrive as hidden form fields, which anybody
   * can edit, and a lead carrying a coordinate off the planet
   * would be a map pin nobody can place.
   */
  staying_lat: z.coerce.number().min(-90).max(90).optional(),
  staying_lng: z.coerce.number().min(-180).max(180).optional(),
  staying_zone: z.string().trim().max(120).optional(),
  staying_source: z.string().trim().max(32).optional(),
});

export async function submitLead(_prev: ActionResult | null, formData: FormData) {
  const parsed = leadSchema.safeParse({
    staying_at: formData.get('staying_at'),
    need: formData.get('need'),
    when: formData.get('when'),
    when_detail: formData.get('when_detail') ?? undefined,
    phone: formData.get('phone'),
    full_name: formData.get('full_name') ?? undefined,
    notes: formData.get('notes') ?? undefined,
    staying_lat: formData.get('staying_lat') ?? undefined,
    staying_lng: formData.get('staying_lng') ?? undefined,
    staying_zone: formData.get('staying_zone') ?? undefined,
    staying_source: formData.get('staying_source') ?? undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Check the form and try again.',
    };
  }

  const d = parsed.data;
  const supabase = createClient();

  /*
   * The body is what a desk agent reads first, so it is written
   * as a sentence rather than as a dump of field names. The
   * structured copy goes in `details`, where the console can
   * show each answer under its own label.
   */
  const body = [
    `${d.need} — ${d.when === 'asap' ? 'as soon as possible' : (d.when_detail || 'at a time to arrange')}.`,
    `Staying at: ${d.staying_at}.`,
    d.notes ? `They added: ${d.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const { data, error } = await supabase.rpc('rpc_support_ticket_create', {
    p_body: body,
    p_from_role: 'guest',
    /* The hero form is always somebody asking for something to
       be arranged, whatever they picked from the chips. */
    p_topic: 'concierge_request' as never,
    p_phone: d.phone,
    ...(d.full_name ? { p_full_name: d.full_name } : {}),
    p_source_form: 'homepage_order',
    p_details: {
      need: d.need,
      when: d.when,
      when_detail: d.when_detail ?? null,
      staying_at: d.staying_at,
      /* The pin, when they picked a place rather than typing
         one. A concierge reading an address still has to work
         out which gate; coordinates settle it before anyone
         replies. */
      lat: d.staying_lat ?? null,
      lng: d.staying_lng ?? null,
      zone: d.staying_zone ?? null,
      location_source: d.staying_source ?? null,
      notes: d.notes ?? null,
    } as never,
  });

  if (error) {
    /* The rate limit is a real answer, not a failure — it is
       worded for the person and should reach them as written. */
    return { ok: false, message: error.message };
  }

  const created = data as unknown as { reference: string };

  return {
    ok: true,
    reference: created.reference,
    message: 'Got it. A concierge is reading this now.',
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
