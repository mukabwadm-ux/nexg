import { NextResponse, type NextRequest } from 'next/server';

import { loadMerchantInsights, MerchantInsightsError } from '@/lib/merchant-insights';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  try {
    const result = await loadMerchantInsights({
      from: request.nextUrl.searchParams.get('from') || undefined,
      to: request.nextUrl.searchParams.get('to') || undefined,
    });
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof MerchantInsightsError)
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    return NextResponse.json(
      { error: 'Reporting could not be loaded. Retry without changing your filters.' },
      { status: 503, headers },
    );
  }
}
