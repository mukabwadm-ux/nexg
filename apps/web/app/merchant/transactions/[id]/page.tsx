import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageHead } from '@/components/merchant/frame';
import { BreakdownView, type Breakdown } from '@/components/merchant-money/breakdown';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Transaction' };
export const dynamic = 'force-dynamic';

export default async function MerchantTransaction({ params }: { params: { id: string } }) {
  const me = await requireMerchant();
  const supabase = createClient();

  const { data, error } = (await supabase.rpc(
    'rpc_order_breakdown' as never,
    { p_order_id: params.id } as never,
  )) as unknown as { data: Breakdown | null; error: { message: string } | null };

  if (!data || data.order.merchant_id !== me.id) {
    if (error) {
      return (
        <p className="text-danger px-4 py-7 text-sm font-bold sm:px-6 lg:px-8">{error.message}</p>
      );
    }
    notFound();
  }

  return (
    <div className="space-y-5 px-4 py-7 sm:px-6 lg:px-8">
      <PageHead
        title={`Order ${data.order.reference}`}
        lead="How this order's money works out for you."
      />
      <Link
        href="/merchant/transactions"
        className="text-gold-text text-sm font-extrabold hover:underline"
      >
        ← All transactions
      </Link>
      <BreakdownView b={data} />
    </div>
  );
}
