import { NextResponse } from 'next/server';

import {
  parseProviderBody,
  PROVIDER_URL,
  resolveRates,
  type StoredRates,
} from '@/lib/currency/rates';
import { createPublicClient } from '@/lib/supabase/public';

/**
 * GET /api/fx — the display exchange rates, per one Kenyan shilling.
 *
 * Read by the site's currency picker and by Discovery. The same for
 * everyone, so the CDN keeps it for half an hour and serves the old copy
 * for up to a day while it fetches a new one.
 *
 * Never Next's Data Cache: in Next 14 it keeps a supabase-js answer
 * forever, even on a dynamic route (lib/supabase/public.ts), which would
 * freeze the rates at the first ones ever read.
 */
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/* One provider answer per warm function for six hours, so a database that
   is missing its copy does not send every request to the provider. */
let memo: { at: number; value: StoredRates } | null = null;
const MEMO_MS = 6 * 60 * 60 * 1000;

async function readStored(): Promise<StoredRates | null> {
  const supabase = createPublicClient();
  /* Before the migration is applied this errors, and the provider answers. */
  const { data, error } = await supabase.rpc('fn_fx_rates');
  if (error || !data || typeof data !== 'object') return null;
  const row = data as { rates?: Record<string, number>; updated_at?: string | null };
  if (!row.rates || !row.updated_at) return null;
  return { rates: row.rates, updatedAt: row.updated_at };
}

async function fetchProvider(): Promise<StoredRates | null> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.value;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(PROVIDER_URL, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return null;
    const parsed = parseProviderBody(await response.json());
    if (parsed) memo = { at: Date.now(), value: parsed };
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const rates = await resolveRates({ readStored, fetchProvider });
  return NextResponse.json(rates, {
    headers: {
      /* The built-in snapshot is a stopgap: cache it briefly so the real
         rates take over as soon as either source answers. */
      'Cache-Control':
        rates.source === 'snapshot'
          ? 'public, max-age=60, s-maxage=60'
          : 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=86400',
    },
  });
}
