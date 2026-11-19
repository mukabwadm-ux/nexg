import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { forgetEngineCustomer } from '@/lib/booking/platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
 * Daily (vercel.json): finish erasing deleted accounts from the booking
 * engine. The database queues each business and customer reference when an
 * account is deleted and the app had not already had the engine forget them
 * (engine_booking_erasure, 20270109001000). This asks the engine to forget
 * each one and marks it done; failures are retried on later runs, up to 20
 * times.
 *
 * It runs only once the owner sets CRON_SECRET (Vercel sends it as a bearer
 * token) and SUPABASE_SERVICE_ROLE_KEY on the website. Until then it answers
 * 503 and the queue waits.
 */
function authorised(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  if (!secret || secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.CRON_SECRET || !url || !key)
    return Response.json({ error: 'not_configured' }, { status: 503 });
  if (!authorised(request)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await db.rpc('fn_engine_booking_erasure_next', { p_limit: 50 });
  if (error) return Response.json({ error: 'queue_unavailable' }, { status: 503 });

  let done = 0;
  let failed = 0;
  for (const row of (data ?? []) as { id: string; merchant_id: string; customer_ref: string }[]) {
    const result = await forgetEngineCustomer(row.merchant_id, row.customer_ref);
    // A business that no longer exists in the engine has nothing left to forget.
    const finished = result.ok || (!result.ok && result.status === 404);
    await db.rpc('fn_engine_booking_erasure_done', {
      p_id: row.id,
      p_error: finished
        ? null
        : `${result.ok ? '' : result.status} ${result.ok ? '' : result.code}`,
    });
    if (finished) done++;
    else failed++;
  }
  return Response.json({ done, failed }, { headers: { 'cache-control': 'no-store' } });
}
