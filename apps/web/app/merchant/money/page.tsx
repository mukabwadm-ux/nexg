import { z } from 'zod';

import { LiveMoneyWorkspace } from '@/components/merchant/money/live-workspace';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Money' };
export const dynamic = 'force-dynamic';

const transactionRows = z.array(
  z.object({
    id: z.string().uuid(),
    reference: z.string(),
    placed_at: z.string(),
    payment_method: z.string().nullable(),
    payment_status: z.string().nullable(),
    settlement: z.string().nullable(),
    subtotal_cents: z.number().int().nullable(),
    commission_cents: z.number().int().nullable(),
    merchant_net_cents: z.number().int().nullable(),
  }),
);

export default async function MerchantMoney() {
  const merchant = await requireMerchant();
  const client = createClient();
  const [home, statements, transactions] = await Promise.all([
    client
      .from('merchant_home_v')
      .select('payout_rail, earned_today_cents')
      .eq('merchant_id', merchant.id)
      .maybeSingle(),
    client
      .from('merchant_statement')
      .select(
        'id, period_start, period_end, gross_kes, commission_kes, adjustments_kes, penalties_kes, tax_withheld_kes, net_kes, status, paid_at, provider_ref',
      )
      .eq('merchant_id', merchant.id)
      .order('period_end', { ascending: false })
      .limit(26),
    client.rpc('rpc_transactions_list', {
      p_merchant_id: merchant.id,
      p_limit: 30,
      p_offset: 0,
    }),
  ]);
  const rows = transactionRows.safeParse(transactions.data);

  return (
    <LiveMoneyWorkspace
      home={home.error ? null : home.data}
      statements={statements.error ? null : statements.data}
      transactions={!transactions.error && rows.success ? rows.data : null}
    />
  );
}
