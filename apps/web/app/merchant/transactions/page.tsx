import Link from 'next/link';

import { PageHead } from '@/components/merchant/frame';
import { dateTime, kes, type TxnRow } from '@/components/merchant-money/breakdown';
import { Empty, Panel } from '@/components/partner/bits';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Transactions' };
export const dynamic = 'force-dynamic';

const PAGE = 30;

export default async function MerchantTransactions({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const me = await requireMerchant();
  const supabase = createClient();
  const page = Math.max(0, Number(searchParams?.page ?? 0) || 0);

  const { data, error } = (await supabase.rpc(
    'rpc_transactions_list' as never,
    { p_merchant_id: me.id, p_limit: PAGE, p_offset: page * PAGE } as never,
  )) as unknown as { data: TxnRow[] | null; error: { message: string } | null };
  const rows = data ?? [];

  return (
    <div className="space-y-5 px-4 py-7 sm:px-6 lg:px-8">
      <PageHead
        title="Transactions"
        lead="Every order, what the guest paid for your items, our commission and what you receive."
      />
      {error && (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          {error.message}
        </p>
      )}
      <Panel title="Your orders">
        {rows.length === 0 ? (
          <Empty title="No transactions yet." body="Orders appear here as soon as they are placed." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-[0.8125rem]">
              <thead className="text-muted-light border-border border-b text-[0.6875rem] uppercase">
                <tr>
                  {['Order', 'Placed', 'Basket', 'Commission', 'You receive', 'Payment', 'Settlement'].map(
                    (h) => (
                      <th key={h} className="px-2 py-2 font-extrabold">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-2.5 font-extrabold">
                      <Link
                        href={`/merchant/transactions/${r.id}`}
                        className="text-gold-text hover:underline"
                      >
                        {r.reference}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 font-semibold">{dateTime(r.placed_at)}</td>
                    <td className="px-2 py-2.5 font-bold tabular-nums">{kes(r.subtotal_cents)}</td>
                    <td className="px-2 py-2.5 font-bold tabular-nums">− {kes(r.commission_cents)}</td>
                    <td className="px-2 py-2.5 font-extrabold tabular-nums">
                      {kes(r.merchant_net_cents)}
                    </td>
                    <td className="px-2 py-2.5 font-semibold">
                      {r.payment_status.replace(/_/g, ' ')}
                    </td>
                    <td className="px-2 py-2.5 font-semibold">{r.settlement}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <div className="flex gap-3 text-sm font-extrabold">
        {page > 0 && <Link href={`/merchant/transactions?page=${page - 1}`}>← Newer</Link>}
        {rows.length === PAGE && (
          <Link href={`/merchant/transactions?page=${page + 1}`}>Older →</Link>
        )}
      </div>
    </div>
  );
}
