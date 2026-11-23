import { ArrowRight, Banknote, Bike, Smartphone } from 'lucide-react';
import Link from 'next/link';

import { CashoutCard } from '@/components/rider/cashout';
import { Nothing, PageHead, PanelTitle, RiderPage, kes, panel, ring } from '@/components/rider/ui';
import { requireRider } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Cashout' };
export const dynamic = 'force-dynamic';

const LABEL: Record<string, string> = {
  pending: 'Waiting for finance',
  approved: 'Approved, being paid',
  paid: 'Paid',
  rejected: 'Not approved',
  cancelled: 'Cancelled',
};

interface PayoutOverview {
  availableKes?: number;
  minimumKes?: number;
  /** Off when Finance has closed early cash-out (Payout rules). */
  earlyCashout?: boolean;
  payoutPhone?: string | null;
  requests?: {
    id: string;
    amountKes: number;
    status: string;
    requestedAt: string;
    note?: string | null;
    providerRef?: string | null;
  }[];
}

/**
 * Cashout: the balance a rider can take before the weekly run, quick
 * amounts, and the money in and out lately (job earnings in, withdrawals
 * out). The M-Pesa card says where the money goes and links to the
 * account page to change it.
 */
export default async function RiderCashout() {
  const me = await requireRider();
  const supabase = createClient();

  const [{ data: overview }, { data: earnings }] = await Promise.all([
    supabase.rpc('rpc_rider_payout_overview', {}),
    supabase
      .from('rider_earning')
      .select('id, order_reference, total_kes, earned_at')
      .eq('rider_id', me.id)
      .eq('is_test', false)
      .order('earned_at', { ascending: false })
      .limit(10),
  ]);

  const payout = (overview ?? {}) as PayoutOverview;
  const requests = payout.requests ?? [];
  const open = requests.find((q) => q.status === 'pending' || q.status === 'approved') ?? null;

  const moves = [
    ...requests
      .filter((q) => q.status !== 'cancelled')
      .map((q) => ({
        id: `p-${q.id}`,
        kind: 'out' as const,
        title: 'Cashout to M-Pesa',
        note: [LABEL[q.status] ?? q.status, q.providerRef, q.status === 'rejected' ? q.note : null]
          .filter(Boolean)
          .join(' · '),
        amount: q.amountKes,
        at: q.requestedAt,
        muted: q.status === 'rejected',
      })),
    ...(
      (earnings as
        | { id: string; order_reference: string | null; total_kes: number; earned_at: string }[]
        | null) ?? []
    ).map((e) => ({
      id: `e-${e.id}`,
      kind: 'in' as const,
      title: 'Job earnings',
      note: e.order_reference ?? '',
      amount: Number(e.total_kes) || 0,
      at: e.earned_at,
      muted: false,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  const when = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Nairobi',
    });

  return (
    <RiderPage>
      <PageHead title="Cashout" lead="Withdraw your earnings before the weekly payout" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {payout.earlyCashout === false ? (
          <section className={panel}>
            <PanelTitle title="Cashout is closed" />
            <p className="text-[13px] font-semibold text-slate-600">
              Early cashout is not open right now. You are paid in the next weekly payout.
            </p>
          </section>
        ) : (
          <CashoutCard
            availableKes={payout.availableKes ?? 0}
            minimumKes={payout.minimumKes ?? 100}
            payoutPhone={payout.payoutPhone ?? null}
            open={open}
          />
        )}

        <div className="space-y-4">
          <section className={panel}>
            <PanelTitle title="Recent Transactions">
              <Link
                href="/rider/earnings"
                prefetch={false}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-bold text-slate-700 hover:bg-[#f3f5fa] ${ring}`}
              >
                View all <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </PanelTitle>
            {moves.length === 0 ? (
              <Nothing
                title="No money in or out yet."
                body="Job earnings and withdrawals show here as they happen."
              />
            ) : (
              <ul className="divide-y divide-[#eef0f6]">
                {moves.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-3">
                    <span
                      aria-hidden="true"
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        m.kind === 'out' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      {m.kind === 'out' ? (
                        <Banknote className="h-5 w-5" />
                      ) : (
                        <Bike className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-extrabold">{m.title}</p>
                      <p className="truncate text-[12.5px] font-semibold text-slate-500">
                        {when(m.at)}
                        {m.note ? ` · ${m.note}` : ''}
                      </p>
                    </div>
                    <p
                      className={`shrink-0 text-[15px] font-extrabold tabular-nums ${
                        m.muted
                          ? 'text-slate-400 line-through'
                          : m.kind === 'out'
                            ? 'text-red-700'
                            : 'text-green-700'
                      }`}
                    >
                      {m.kind === 'out' ? '−' : '+'}
                      {kes(m.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-wrap items-center gap-4 rounded-[20px] bg-gradient-to-r from-[#0f7a3a] to-[#0b5c2c] p-5 text-white">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15"
            >
              <Smartphone className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-extrabold">Cashout goes to M-Pesa</p>
              <p className="text-[13px] text-white/80">
                {payout.payoutPhone
                  ? `Paid to ${payout.payoutPhone}. Change it in your account.`
                  : 'Add your M-Pesa number to cash out.'}
              </p>
            </div>
            <Link
              href="/rider/profile"
              prefetch={false}
              className={`rounded-xl bg-white px-4 py-2 text-[13.5px] font-extrabold text-green-800 ${ring}`}
            >
              {payout.payoutPhone ? 'Change number' : 'Add number'}
            </Link>
          </section>
        </div>
      </div>
    </RiderPage>
  );
}
