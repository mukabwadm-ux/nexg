import { NextResponse } from 'next/server';

import { startBankPayment } from '@/lib/bank/payments';
import { createClient } from '@/lib/supabase/server';

/**
 * Pay for an order from a bank account.
 *
 * The database makes (or reuses) the payment row and says what is owed; the
 * bank opens a collection for that reference and returns a page where the
 * customer approves it; the database records which collection belongs to the
 * payment. The order is marked paid later, by the bank's signed event only.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: 'Sign in first.' }, { status: 401 });
  }

  let input: { orderId?: unknown };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 });
  }
  if (typeof input.orderId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.orderId)) {
    return NextResponse.json(
      { ok: false, message: 'Say which order is being paid for.' },
      { status: 400 },
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? new URL(request.url).origin;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const result = await startBankPayment(supabase, {
    orderId: input.orderId,
    origin,
    email: user.email ?? null,
    name: typeof meta.full_name === 'string' ? meta.full_name : null,
  });

  if (!result.ok) {
    const { status, ...body } = result;
    return NextResponse.json(body, { status });
  }
  return NextResponse.json(result);
}
