import { NextResponse } from 'next/server';

import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

/**
 * Branches for a merchant, for the manual-order form.
 *
 * A route rather than a server action because the form asks for it
 * as the operator types, and a server action would revalidate the
 * page under them mid-call.
 */
export async function GET(request: Request) {
  await requireStaff();

  const merchant = new URL(request.url).searchParams.get('merchant');
  if (!merchant) return NextResponse.json({ branches: [] });

  const { data, error } = await createClient()
    .from('merchant_branch')
    .select('id, name, is_primary')
    .eq('merchant_id', merchant)
    .order('is_primary', { ascending: false })
    .order('name');

  if (error) return NextResponse.json({ branches: [], error: error.message }, { status: 500 });
  return NextResponse.json({ branches: data ?? [] });
}
