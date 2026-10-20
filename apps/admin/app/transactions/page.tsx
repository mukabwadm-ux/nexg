import { Card } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { dateTime, kes, type TxnRow } from '@/components/transactions/breakdown';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Transactions' };
export const dynamic = 'force-dynamic';

const PAGE = 50;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: { q?: string; page?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'orders');
  const supabase = createClient();

  const q = (searchParams?.q ?? '').trim();
  const page = Math.max(0, Number(searchParams?.page ?? 0) || 0);

  const { data, error } = (await supabase.rpc(
    'rpc_transactions_list' as never,
    { p_search: q || null, p_limit: PAGE, p_offset: page * PAGE } as never,
  )) as unknown as { data: TxnRow[] | null; error: { message: string } | null };

  const rows = data ?? [];

  return (
    <ConsoleShell staff={staff} current="/orders">
      <ConsoleHeader
        title="Transactions"
        breadcrumb="Money · every order, split between merchant, rider and NexG"
        action={
          <Link href="/orders" className="text-gold-text text-sm font-extrabold hover:underline">
            Back to live orders
          </Link>
        }
      />
      <main className="space-y-4 px-4 py-6 sm:px-8">
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search by order reference or merchant"
            className="border-border bg-surface focus:border-gold w-full max-w-md rounded-xl border px-3.5 py-2 text-sm font-semibold outline-none"
          />
          <button className="bg-ink rounded-xl px-4 py-2 text-sm font-extrabold text-white">
            Search
          </button>
        </form>

        {error && (
          <Card className="border-danger border p-4">
            <p className="text-danger text-[0.8125rem] font-extrabold">{error.message}</p>
          </Card>
        )}

        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[56rem] text-left text-[0.8125rem]">
            <thead className="text-muted-light border-border border-b text-[0.6875rem] uppercase tracking-wide">
              <tr>
                {['Order', 'Placed', 'Merchant', 'Payment', 'Guest paid', 'Merchant gets', 'Rider', 'NexG keeps', 'Settlement'].map(
                  (h) => (
                    <th key={h} className="px-3 py-2.5 font-extrabold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-bg">
                  <td className="px-3 py-2.5 font-extrabold">
                    <Link href={`/transactions/${r.id}`} className="text-gold-text hover:underline">
                      {r.reference}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 font-semibold">{dateTime(r.placed_at)}</td>
                  <td className="px-3 py-2.5 font-semibold">{r.merchant_name}</td>
                  <td className="px-3 py-2.5 font-semibold">
                    {r.payment_method.replace(/_/g, ' ')} · {r.payment_status.replace(/_/g, ' ')}
                  </td>
                  <td className="px-3 py-2.5 font-extrabold tabular-nums">{kes(r.total_cents)}</td>
                  <td className="px-3 py-2.5 font-bold tabular-nums">{kes(r.merchant_net_cents)}</td>
                  <td className="px-3 py-2.5 font-bold tabular-nums">{kes(r.rider_total_cents)}</td>
                  <td className="px-3 py-2.5 font-bold tabular-nums">{kes(r.platform_net_cents)}</td>
                  <td className="px-3 py-2.5 font-semibold">{r.settlement}</td>
                </tr>
              ))}
              {rows.length === 0 && !error && (
                <tr>
                  <td colSpan={9} className="text-muted px-3 py-8 text-center font-semibold">
                    No transactions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <div className="flex gap-3 text-sm font-extrabold">
          {page > 0 && (
            <Link href={`/transactions?q=${encodeURIComponent(q)}&page=${page - 1}`}>← Newer</Link>
          )}
          {rows.length === PAGE && (
            <Link href={`/transactions?q=${encodeURIComponent(q)}&page=${page + 1}`}>Older →</Link>
          )}
        </div>
      </main>
    </ConsoleShell>
  );
}
