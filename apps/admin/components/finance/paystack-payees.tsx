import Link from 'next/link';

import {
  cell,
  Empty,
  figure,
  hostHref,
  merchantHref,
  ModePill,
  PartyLink,
  riderHref,
  sub,
  Table,
} from '@/components/finance/paystack-parts';
import { PanelHead, Pill, Sheet } from '@/components/portal/kit';
import {
  MODE_LABELS,
  money,
  PAYOUT_MODES,
  SCHEDULES,
  type Opens,
  type Payees,
  type PayoutMode,
  type SubaccountRow,
} from '@/lib/finance-paystack';
import { dateTime, day, type Tone } from '@/lib/portal';

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Waiting', tone: 'amber' },
  active: { label: 'On', tone: 'green' },
  paused: { label: 'Paused', tone: 'grey' },
  replaced: { label: 'Replaced', tone: 'grey' },
  rejected: { label: 'Turned down', tone: 'red' },
};

const TRANSFER: Record<string, { label: string; tone: Tone }> = {
  opened: { label: 'Started', tone: 'amber' },
  pending: { label: 'With Paystack', tone: 'amber' },
  otp: { label: 'Waiting for OTP', tone: 'red' },
  success: { label: 'Paid', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  reversed: { label: 'Reversed', tone: 'red' },
};

const count = (n: number | null) => (n === null ? '—' : n.toLocaleString('en-KE'));
const modeLabel = (mode: string | null) =>
  mode === null ? '—' : (MODE_LABELS[mode as PayoutMode] ?? mode);

/** Everyone NexG pays through Paystack: merchants, hosts and riders. */
export function PaystackPayees({
  payees,
  canAct,
  opens,
  waitingHref,
}: {
  payees: Payees;
  canAct: boolean;
  opens: Opens;
  waitingHref: string;
}) {
  const decide = (s: SubaccountRow) => (canAct && s.can_decide ? waitingHref : null);
  return (
    <>
      <Sheet>
        <PanelHead title="Merchants" aside="Paystack sub-accounts" />
        <Subaccounts
          caption="Merchant Paystack sub-accounts"
          who="Merchant"
          rows={payees.merchants}
          href={(id) => (opens.merchant ? merchantHref(id) : null)}
          decide={decide}
          empty="No merchant has a Paystack sub-account."
        />
      </Sheet>

      <Sheet>
        <PanelHead title="Hosts" aside="Paystack sub-accounts" />
        <Subaccounts
          caption="Host Paystack sub-accounts"
          who="Host"
          rows={payees.hosts}
          href={(id) => (opens.host ? hostHref(id) : null)}
          decide={decide}
          empty="No host has a Paystack sub-account."
        />
      </Sheet>

      <Sheet>
        <PanelHead title="Riders by City" aside="how active riders are paid" />
        <p className="mt-2 text-sm font-semibold">
          Automatic payouts send real money: {payees.rider_automatic_live ? 'Yes' : 'No'}. Live
          payout worker last seen:{' '}
          {payees.live_worker_seen_at ? dateTime(payees.live_worker_seen_at) : 'never'}.
        </p>
        {payees.rider_cities.length === 0 ? (
          <Empty>No active riders.</Empty>
        ) : (
          <Table
            caption="Rider payout choices by city"
            heads={[
              'City',
              'City Rule',
              { label: 'Riders', right: true },
              { label: 'Test Riders', right: true },
              ...PAYOUT_MODES.map((m) => ({ label: MODE_LABELS[m], right: true as const })),
            ]}
          >
            {payees.rider_cities.map((c) => (
              <tr key={c.city_id ?? 'none'}>
                <td className={`${cell} font-semibold`}>{c.city ?? 'No city'}</td>
                <td className={cell}>
                  {modeLabel(c.rule_mode)}
                  {c.automatic_from && (
                    <span className={sub}>automatic from {day(c.automatic_from)}</span>
                  )}
                </td>
                <td className={figure}>{count(c.riders)}</td>
                <td className={figure}>{count(c.test_riders)}</td>
                {PAYOUT_MODES.map((m) => (
                  <td key={m} className={figure}>
                    {count(c.modes[m])}
                  </td>
                ))}
              </tr>
            ))}
          </Table>
        )}
      </Sheet>

      <Sheet>
        <PanelHead title="Rider Transfers" aside="the latest 100" />
        {payees.rider_transfers.length === 0 ? (
          <Empty>No rider has been paid through Paystack yet.</Empty>
        ) : (
          <Table
            caption="Rider transfers through Paystack"
            heads={[
              'Rider',
              'Sent',
              { label: 'Amount', right: true },
              { label: 'Fee', right: true },
              'State',
            ]}
          >
            {payees.rider_transfers.map((t) => (
              <tr key={t.id}>
                <td className={cell}>
                  <PartyLink href={opens.rider && t.rider_id ? riderHref(t.rider_id) : null}>
                    {t.rider_name ?? 'Rider'}
                  </PartyLink>
                  <span className={sub}>
                    {t.kind === 'rider_early' ? 'Early payout' : 'Payout'} · {t.reference}
                  </span>
                </td>
                <td className={cell}>
                  {dateTime(t.created_at)}
                  {t.completed_at && (
                    <span className={sub}>finished {dateTime(t.completed_at)}</span>
                  )}
                </td>
                <td className={figure}>{money(t.amount_cents)}</td>
                <td className={figure}>
                  {money(t.fee_cents)}
                  {t.fee_paid_by && (
                    <span className={sub}>
                      paid by {t.fee_paid_by === 'rider' ? 'the rider' : 'NexG'}
                    </span>
                  )}
                </td>
                <td className={cell}>
                  <span className="flex flex-wrap gap-1.5">
                    <Pill tone={TRANSFER[t.state]?.tone ?? 'grey'}>
                      {TRANSFER[t.state]?.label ?? t.state}
                    </Pill>
                    <ModePill test={t.test} />
                  </span>
                  {t.failure_reason && <span className={sub}>{t.failure_reason}</span>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Sheet>
    </>
  );
}

function Subaccounts({
  caption,
  who,
  rows,
  href,
  decide,
  empty,
}: {
  caption: string;
  who: string;
  rows: SubaccountRow[];
  /** The party's page, or null when this person cannot open it. */
  href: (partyId: string) => string | null;
  /** Where to decide it, when this person may. */
  decide: (row: SubaccountRow) => string | null;
  empty: string;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <Table caption={caption} heads={[who, 'Sub-account', 'Status', 'Asked By', 'Decided By']}>
      {rows.map((s) => {
        const to = decide(s);
        return (
          <tr key={s.id}>
            <td className={cell}>
              <PartyLink href={href(s.party_id)}>{s.name ?? who}</PartyLink>
            </td>
            <td className={cell}>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{s.code}</span>
                <ModePill test={s.test} />
              </span>
              <span className={sub}>{SCHEDULES[s.schedule] ?? s.schedule}</span>
            </td>
            <td className={cell}>
              <Pill tone={STATUS[s.status]?.tone ?? 'grey'}>
                {STATUS[s.status]?.label ?? s.status}
              </Pill>
              {to && (
                <Link href={to} className="mt-1 block text-xs font-bold underline">
                  Decide
                </Link>
              )}
            </td>
            <td className={cell}>
              {s.requested_by ?? '—'}
              <span className={sub}>{dateTime(s.requested_at)}</span>
            </td>
            <td className={cell}>
              {s.decided_by ?? '—'}
              {s.decided_at && <span className={sub}>{dateTime(s.decided_at)}</span>}
            </td>
          </tr>
        );
      })}
    </Table>
  );
}
