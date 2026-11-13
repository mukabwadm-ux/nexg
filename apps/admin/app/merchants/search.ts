'use server';

import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export interface MerchantHit {
  id: string;
  name: string;
  legalName: string | null;
  status: string;
  city: string | null;
  contact: string | null;
}

/**
 * Merchants matching what staff typed: trading or legal name, contact
 * name, phone or email. Deleted merchants are left out; they have their
 * own tab. Row security still decides which merchants this staff member
 * can see, so a city-scoped reviewer only finds their own cities.
 */
export async function searchMerchants(query: string): Promise<MerchantHit[]> {
  const staff = await requireStaff();
  requireModule(staff, 'merchants');

  /* Characters PostgREST reads as filter syntax are dropped, not escaped:
     nobody searches for a merchant by its commas. */
  const needle = query
    .trim()
    .replace(/[,()*%\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 60);
  if (needle.length < 2) return [];

  const pattern = `%${needle}%`;
  const { data, error } = await createClient()
    .from('merchant')
    .select(
      'id, trading_name, legal_name, status, contact_name, contact_phone, contact_email, city(name)',
    )
    .is('deleted_at', null)
    .or(
      ['trading_name', 'legal_name', 'contact_name', 'contact_phone', 'contact_email']
        .map((column) => `${column}.ilike.${pattern}`)
        .join(','),
    )
    .order('trading_name', { ascending: true })
    .limit(8);
  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.trading_name || row.legal_name || 'Unnamed merchant',
    legalName: row.legal_name,
    status: row.status,
    city: (row.city as { name: string } | null)?.name ?? null,
    contact: row.contact_email ?? row.contact_phone ?? row.contact_name ?? null,
  }));
}
