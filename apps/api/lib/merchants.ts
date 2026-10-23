import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@nexg/db';

/**
 * The merchants a signed-in developer can act for.
 *
 * The console used to ask for a merchant id in a text box. That is a
 * UUID, and a person has no way to know their own, so the only people
 * who could use it were the ones who had gone looking for it in a
 * database. The list below is the same answer in a form a person can
 * read: the trading name, the city, and what state the merchant is in.
 *
 * RLS does the filtering. `merchant_user_read_own` lets a person read
 * their own memberships, and `merchant_read_own` lets them read a
 * merchant they belong to. Anything they may not see is not returned
 * in the first place, so this function does not need a second rule
 * about who may see what.
 */

export interface DeveloperMerchant {
  id: string;
  tradingName: string;
  cityName: string | null;
  status: string;
  /** True when the merchant can be booked through the API today. */
  bookable: boolean;
  /** 'owner' or 'manager' -- what the person may do with this merchant. */
  role: string | null;
}

/**
 * A key can be issued against a merchant that is not live -- somebody
 * integrating during onboarding needs a key before they are listed --
 * but the booking path needs a merchant that is live and accepting
 * orders. Those two are separated here rather than in the picker, so
 * the picker can offer everything and the form can explain the rest.
 */
const BOOKABLE_STATUSES = new Set(['live']);

export async function listDeveloperMerchants(
  supabase: SupabaseClient<Database>,
): Promise<DeveloperMerchant[]> {
  /*
   * Two queries rather than one joined query: `merchant_user` and
   * `merchant` are related by a key that PostgREST cannot follow
   * through the generated relationship, because the foreign key points
   * at a view rather than at the table.
   */
  const { data: memberships, error: membershipError } = await supabase
    .from('merchant_user')
    .select('merchant_id, role')
    .order('created_at', { ascending: true });

  if (membershipError || !memberships || memberships.length === 0) {
    return [];
  }

  const merchantIds = memberships.map((m) => m.merchant_id);
  const roleByMerchant = new Map(
    memberships.map((m) => [m.merchant_id, m.role] as const),
  );

  const { data: merchants, error: merchantError } = await supabase
    .from('merchant')
    .select('id, trading_name, status, city_id, accepting_orders')
    .in('id', merchantIds);

  if (merchantError || !merchants) {
    return [];
  }

  const cityIds = [
    ...new Set(merchants.map((m) => m.city_id).filter((c): c is string => Boolean(c))),
  ];

  const cityNameById = new Map<string, string>();

  if (cityIds.length > 0) {
    const { data: cities } = await supabase
      .from('city')
      .select('id, name')
      .in('id', cityIds);

    for (const city of cities ?? []) {
      cityNameById.set(city.id, city.name);
    }
  }

  return merchants
    .map((m) => ({
      id: m.id,
      tradingName: m.trading_name,
      cityName: m.city_id ? (cityNameById.get(m.city_id) ?? null) : null,
      status: m.status,
      bookable: BOOKABLE_STATUSES.has(m.status) && m.accepting_orders,
      role: roleByMerchant.get(m.id) ?? null,
    }))
    .sort((a, b) => a.tradingName.localeCompare(b.tradingName));
}