/**
 * Promotional prices for guests, from rpc_promoted_prices: the same database
 * function checkout uses (fn_item_promo_price), so the price shown is the
 * price charged. Only items a running promotion makes cheaper are returned.
 */

export interface PromoPrice {
  /** The item's own price, whole KES. */
  price: number;
  /** What a guest pays while the promotion runs, whole KES. */
  promo: number;
  name: string;
  endsAt: string | null;
}

export type PromoPrices = Record<string, PromoPrice>;

interface Row {
  catalogue_item_id: string;
  price_kes: number;
  promo_price_kes: number;
  promotion_name: string | null;
  ends_at: string | null;
}

export async function loadPromotedPrices(
  client: unknown,
  merchantId: string,
): Promise<PromoPrices> {
  /* Not in the generated types until they are regenerated with this RPC. */
  const { data, error } = await (
    client as {
      rpc: (fn: string, args: unknown) => PromiseLike<{ data: unknown; error: unknown }>;
    }
  ).rpc('rpc_promoted_prices', { p_merchant_id: merchantId });
  if (error || !Array.isArray(data)) return {};
  return Object.fromEntries(
    (data as Row[]).map((row) => [
      row.catalogue_item_id,
      {
        price: Number(row.price_kes),
        promo: Number(row.promo_price_kes),
        name: row.promotion_name ?? 'Offer',
        endsAt: row.ends_at,
      },
    ]),
  );
}

/** "15% off", rounded, for a badge. */
export function promoBadge(p: PromoPrice): string {
  const pct = Math.round(((p.price - p.promo) / p.price) * 100);
  return pct >= 1 ? `${pct}% off` : 'Offer';
}
