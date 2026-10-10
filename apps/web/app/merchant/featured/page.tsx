import { Panel } from '@/components/partner/bits';
import { Featured, type Booking, type Placement } from '@/components/partner/merchant-featured';
import { PageHead } from '@/components/merchant/frame';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

import type { MerchantHome } from '../layout';

export const metadata = { title: 'Featured' };
export const dynamic = 'force-dynamic';

/** Monday of the week a date falls in. */
function mondayOf(d: Date): string {
  const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  c.setUTCDate(c.getUTCDate() - ((c.getUTCDay() + 6) % 7));
  return c.toISOString().slice(0, 10);
}

/**
 * Featured slots, from the merchant's side.
 *
 * This asks; it does not sell. No payment rail is connected, so a
 * "Buy" button would promise something NexG cannot deliver. What it
 * can do honestly is show the price, check eligibility against the
 * same function the staff console uses, and put the merchant in the
 * queue with a person to call them.
 */
export default async function MerchantFeatured() {
  const me = await requireMerchant();
  const supabase = createClient();

  const { data: home } = await supabase
    .from('merchant_home_v')
    .select('*')
    .eq('merchant_id', me.id)
    .maybeSingle();
  const m = home as MerchantHome | null;

  const [{ data: placements }, { data: bookings }, { data: elig }] = await Promise.all([
    supabase
      .from('featured_placement')
      .select('id, kind, category, position, label, description, city_id')
      .eq('city_id', (m as unknown as { city_id: string } | null)?.city_id ?? '')
      .eq('enabled', true)
      .order('kind')
      .order('position'),
    supabase
      .from('featured_booking')
      .select(
        'id, placement_kind, status, wanted_start, weeks, quoted_price, requested_at, start_date, end_date',
      )
      .eq('merchant_id', me.id)
      .order('requested_at', { ascending: false })
      .limit(10),
    supabase.rpc('fn_featured_eligibility', {
      p_merchant_id: me.id,
      p_placement_kind: 'homepage',
    }),
  ]);

  const rows = (placements as Placement[] | null) ?? [];

  /* One price lookup per placement, from the same function the
     staff console quotes from. */
  const priced = await Promise.all(
    rows.map(async (p) => {
      const { data } = await supabase.rpc('fn_featured_price', {
        p_city_id: p.city_id,
        p_kind: p.kind as 'homepage' | 'category_top' | 'popular_request',
        ...(p.category ? { p_category: p.category as never } : {}),
      });
      return { ...p, price_kes: (data as number | null) ?? null };
    }),
  );

  const nextMonday = mondayOf(new Date(Date.now() + 7 * 86_400_000));

  return (
    <div className="space-y-5 px-4 py-7 sm:px-6 lg:px-8">
      <PageHead
        title="Featured"
        lead="Paid placement at the top of Explore in your zone for a week. Eligibility follows your health band; cancel by Friday 23:59 before the week starts."
      />
      <Panel title="What a featured slot is">
        <p className="text-muted text-[0.8125rem] font-semibold">
          A week at the top of the homepage, the top of your category, or in Popular Requests.
          Guests always see it labelled <strong className="text-ink">Sponsored</strong> — a paid
          card never pretends to be an earned one, which is why they are worth having.
        </p>
      </Panel>

      <Featured
        merchantId={me.id}
        status={m?.status ?? 'applied'}
        eligibility={(elig as Record<string, unknown> | null) ?? null}
        placements={priced}
        bookings={(bookings as Booking[] | null) ?? []}
        nextMonday={nextMonday}
      />
    </div>
  );
}
