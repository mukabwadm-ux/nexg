import 'server-only';

import type { createClient } from '@/lib/supabase/server';

export interface MerchantCatalogueRow {
  id: string;
  name: string;
  available: boolean;
  /** The catalogue section (category) it sits in. */
  section: string;
}

const PAGE = 1000;

/**
 * Every catalogue item of one merchant with its section name. Paged, because
 * the API returns at most 1,000 rows at a time and an imported catalogue can
 * be larger than that.
 */
export async function merchantCatalogueRows(
  client: ReturnType<typeof createClient>,
  merchantId: string,
): Promise<MerchantCatalogueRow[]> {
  const rows: MerchantCatalogueRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('catalogue_item')
      .select('id, name, available, catalogue_section(name)')
      .eq('merchant_id', merchantId)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? [])
      rows.push({
        id: row.id,
        name: row.name,
        available: row.available,
        section: row.catalogue_section?.name ?? '',
      });
    if ((data ?? []).length < PAGE) return rows;
  }
}
