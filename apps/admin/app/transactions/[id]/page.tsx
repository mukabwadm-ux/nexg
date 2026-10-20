import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { BreakdownView, kes, type Breakdown } from '@/components/transactions/breakdown';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Transaction' };
export const dynamic = 'force-dynamic';

export default async function TransactionPage({ params }: { params: { id: string } }) {
  const staff = await requireStaff();
  requireModule(staff, 'orders');
  const supabase = createClient();

  const { data, error } = (await supabase.rpc(
    'rpc_order_breakdown' as never,
    { p_order_id: params.id } as never,
  )) as unknown as { data: Breakdown | null; error: { message: string } | null };

  if (!data) {
    if (error) {
      return (
        <ConsoleShell staff={staff} current="/orders">
          <ConsoleHeader title="Transaction" breadcrumb="Money" />
          <p className="text-danger px-4 py-6 text-sm font-bold sm:px-8">{error.message}</p>
        </ConsoleShell>
      );
    }
    notFound();
  }

  const o = data.order;
  return (
    <ConsoleShell staff={staff} current="/orders">
      <ConsoleHeader
        title={`Order ${o.reference}`}
        breadcrumb={`${o.merchant_name ?? 'Merchant'} · ${o.guest_name ?? 'Guest'}${
          o.guest_phone ? ` · ${o.guest_phone}` : ''
        } · ${kes(data.charges.total_cents)}`}
        action={
          <Link
            href="/transactions"
            className="text-gold-text text-sm font-extrabold hover:underline"
          >
            All transactions
          </Link>
        }
      />
      <main className="px-4 py-6 sm:px-8">
        {o.dropoff_label && (
          <p className="text-muted mb-4 text-[0.8125rem] font-semibold">
            Delivered to {o.dropoff_label}
          </p>
        )}
        <BreakdownView b={data} />
      </main>
    </ConsoleShell>
  );
}
