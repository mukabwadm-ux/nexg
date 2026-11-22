import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

/**
 * A customer asks a business for a quote (vehicle servicing and other "quoted after review"
 * offerings in Discovery). Until 20 Nov 2026 Discovery only kept these on the device ("Sending
 * them isn't on the website yet"), so nobody ever saw them.
 *
 * The request becomes a support ticket on the customer's own account (or guest session), with
 * the business and offering attached, through rpc_my_support_ticket_create: the same rate limit,
 * reference, notification and audit as any other ticket. NexG's team confirms the price with
 * the business and replies; the ticket then shows in the customer's account.
 */
const body = z.object({
  merchantId: z.string().trim().min(1).max(100),
  merchantName: z.string().trim().max(200).optional(),
  itemId: z.string().trim().max(100),
  itemName: z.string().trim().max(200),
  answers: z.record(z.unknown()).default({}),
});

const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 1000) : '');

export async function POST(request: NextRequest) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, message: 'Check the request and try again.' },
      { status: 400 },
    );

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      {
        ok: false,
        signIn: true,
        message: 'Sign in, or continue as a guest, to send your request.',
      },
      { status: 401 },
    );

  const { merchantId, merchantName, itemId, itemName, answers } = parsed.data;
  const lines = [
    `Quote request: ${itemName}${merchantName ? ` from ${merchantName}` : ''}.`,
    text(answers.brief) && `What they need: ${text(answers.brief)}`,
    text(answers.date) &&
      `When: ${text(answers.date)}${text(answers.time) ? ` ${text(answers.time)}` : ''}`,
    text(answers.place) && `Where: ${text(answers.place)}`,
    text(answers.budget) && `Budget: ${text(answers.budget)}`,
    text(answers.contact) && `Contact: ${text(answers.contact)}`,
    text(answers.notes) && `Notes: ${text(answers.notes)}`,
  ].filter(Boolean);

  const { data, error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>
  )('rpc_my_support_ticket_create', {
    p_body: lines.join('\n'),
    p_details: { kind: 'quote_request', merchant_id: merchantId, item_id: itemId, answers },
  });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 422 });

  const reference = (data as { reference?: string } | null)?.reference ?? null;
  return NextResponse.json({
    ok: true,
    reference,
    message: `Sent${reference ? ` (${reference})` : ''}. NexG confirms the price with the business and replies to you.`,
  });
}
