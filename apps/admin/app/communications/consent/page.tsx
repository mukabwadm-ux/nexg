import {
  Ban,
  CheckCircle2,
  CircleCheck,
  CircleDashed,
  Download,
  FileSearch,
  FileText,
  Layers,
  Megaphone,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ShareDonut } from '@/components/charts';
import { StackedBars } from '@/components/comms/charts';
import { ConsentForm, RemoveSuppression, SuppressionForm } from '@/components/comms/client';
import {
  ChannelIcon,
  Chip,
  CommsHeader,
  CommsTabs,
  DataTable,
  Empty,
  ErrorNote,
  FilterRow,
  Footnote,
  LegendRow,
  MeterRows,
  Panel,
  WaitingForDatabase,
} from '@/components/comms/module';
import { ConsoleShell } from '@/components/console-shell';
import { DashCanvas, DashKpi, DashKpiGrid, Pagination } from '@/components/portal/dash';
import { DashSearch, DashSelect } from '@/components/portal/dash-filters';
import {
  asNumber,
  asObject,
  AUDIENCE_LABEL,
  CHANNEL_LABEL,
  commsHref,
  CONSENT_SOURCE_LABEL,
  countsOf,
  label,
  n,
  oneOfOr,
  pageNumber,
  rate,
  rowsOf,
  SUPPRESSION_REASON_LABEL,
  when,
} from '@/lib/comms';
import { commsContext } from '@/lib/comms-server';

export const metadata: Metadata = { title: 'Communications · Preferences & Consent' };
export const dynamic = 'force-dynamic';

const PER = 8;

const SOURCE_COLOR = ['#F5A623', '#1F9D55', '#2F6FDB', '#A855F7', '#C9C4B8', '#E8730C', '#141414'];

interface ConsentRow {
  id: number;
  at: string;
  who: string;
  audience: string | null;
  kind: string;
  channel: string;
  granted: boolean;
  source: string;
  evidence: string | null;
  action: string;
  staff: string | null;
}

interface Supp {
  id: string;
  channel: string;
  address: string;
  reason: string;
  note: string | null;
  created_at: string;
  by: string | null;
}

/**
 * Preferences & Consent (Kenya Data Protection Act 2019): who said yes to
 * marketing and where, the app's notification choices, the consent history,
 * opt-outs and suppression lists, and the checks that hold it together.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    q?: string;
    kind?: string;
    page?: string;
    channel?: string;
  };
}) {
  const ctx = await commsContext(searchParams);
  const { period } = ctx;
  const sp = searchParams ?? {};
  const kind = oneOfOr(sp.kind, ['marketing', 'operational']);
  const suppChannel = oneOfOr(sp.channel, ['all', 'email', 'sms', 'whatsapp', 'in_app']);
  const page = pageNumber(sp.page);
  const [q, sq] = await Promise.all([
    ctx.read('rpc_comms_consent', {
      p_from: period.from,
      p_to: period.to,
      p_search: sp.q ?? null,
      p_kind: kind,
      p_page: page,
      p_per: PER,
    }),
    ctx.read('rpc_comms_suppressions', { p_channel: suppChannel, p_per: 8 }),
  ]);
  const o = asObject(q.data);
  const people = asObject(o.people);
  const byAudience = asObject(people.by_audience) as Record<string, { total: number; yes: number }>;
  const sources = countsOf(people.sources);
  const srcTotal = Object.values(sources).reduce((s, v) => s + v, 0);
  const categories = rowsOf<{ category: string; on: number; off: number }>(o.categories);
  const supp = countsOf(o.suppression);
  const rows = rowsOf<ConsentRow>(o.rows);
  const trend = rowsOf<{ day: string; granted: number; withdrawn: number }>(o.trend);
  const suppRows = rowsOf<Supp>(asObject(sq.data).rows);
  const canEdit = o.level === 'full' || o.level === 'limited';
  const total = asNumber(people.total);
  const yes = asNumber(people.marketing_yes);
  const no = asNumber(people.marketing_no);
  const never = asNumber(people.marketing_never);
  const opOff = asNumber(people.operational_off);
  const prefUsers = asNumber(o.pref_users);
  const href = (extra: Record<string, string | null> = {}) =>
    commsHref('/communications/consent', period, {
      q: sp.q ?? null,
      kind,
      channel: suppChannel,
      ...extra,
    });

  const checks: { ok: boolean; text: string }[] = [
    { ok: true, text: 'Marketing only to people who said yes (opt-in, enforced on every send)' },
    { ok: true, text: 'Explicit consent records, append-only, with source and evidence' },
    { ok: true, text: 'Easy opt-out: a link in every marketing message' },
    { ok: true, text: 'Purpose captured: marketing kept apart from service messages' },
    { ok: true, text: 'Audit trail: every change and send in the audit log' },
    { ok: false, text: 'Data retention rules: set in Settings › Retention' },
  ];

  return (
    <ConsoleShell staff={ctx.staff}>
      <CommsHeader
        screen="Preferences & Consent"
        subtitle="Manage communication preferences, marketing consent and regulatory compliance (Kenya Data Protection Act, 2019)."
        period={period}
      />
      <DashCanvas>
        <CommsTabs active="consent" period={period} />
        {q.waiting ? (
          <WaitingForDatabase />
        ) : q.error ? (
          <ErrorNote message={q.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-6">
              <DashKpi
                featured
                icon={Users}
                label="Total Users"
                value={n(total)}
                explain="Guests, hosts, riders, merchants and property managers NexG could message."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Consented"
                value={n(yes)}
                explain="Latest marketing choice is yes, on at least one channel or all."
              >
                <span className="text-success text-[0.9375rem] font-extrabold">
                  {rate(yes, total)}
                </span>
              </DashKpi>
              <DashKpi
                icon={XCircle}
                iconTone="red"
                label="Not Consented"
                value={n(no + never)}
                explain="Said no, or were never asked. Neither gets marketing."
              >
                <span className="text-muted text-[0.875rem] font-semibold">
                  {n(no)} said no · {n(never)} never asked
                </span>
              </DashKpi>
              <DashKpi
                icon={Megaphone}
                label="Marketing Consent"
                value={rate(yes, total)}
                explain="Share of people who can get marketing."
              />
              <DashKpi
                icon={Zap}
                label="Operational Messages"
                value={n(total - opOff)}
                explain="People who have not switched any service notifications off in the app."
              >
                <span className="text-muted text-[0.875rem] font-semibold">
                  {rate(total - opOff, total)}
                </span>
              </DashKpi>
              <DashKpi
                icon={ShieldCheck}
                iconTone="green"
                label="Compliance Checks"
                value={`${checks.filter((c) => c.ok).length} / ${checks.length}`}
                explain="The Kenya DPA checks below that this module enforces."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-3">
              <Panel
                title="Communication Preferences"
                note="What customers chose in the app, per kind of message."
                icon={SlidersHorizontal}
              >
                <DataTable
                  caption="Communication preferences"
                  isEmpty={categories.length === 0}
                  empty="No customer has changed a notification choice yet; everyone is on the defaults."
                  head={['Type', 'On', 'Off', 'Default']}
                >
                  {categories.map((c) => (
                    <tr key={c.category}>
                      <td className="font-semibold">{c.category.replace(/_/g, ' ')}</td>
                      <td className="tabular-nums">{n(c.on)}</td>
                      <td className="tabular-nums">{n(c.off)}</td>
                      <td>
                        {/promo|market/.test(c.category) ? (
                          <Chip status="paused" text="Off until yes" />
                        ) : (
                          <Chip status="active" text="On" />
                        )}
                      </td>
                    </tr>
                  ))}
                </DataTable>
                <Footnote>
                  {n(prefUsers)} customers have set choices. Marketing is off until a person says
                  yes; service messages are on unless they turn them off.
                </Footnote>
              </Panel>

              <Panel title="Consent Sources" note="Where people gave their yes." icon={Layers}>
                {srcTotal > 0 ? (
                  <>
                    <ShareDonut
                      centre={n(srcTotal)}
                      caption="Consented"
                      data={Object.entries(sources).map(([s, v], i) => ({
                        key: s,
                        label: label(CONSENT_SOURCE_LABEL, s),
                        value: v,
                        color: SOURCE_COLOR[i % SOURCE_COLOR.length],
                      }))}
                    />
                    <ul className="mt-3 space-y-1.5">
                      {Object.entries(sources).map(([s, v], i) => (
                        <LegendRow
                          key={s}
                          color={SOURCE_COLOR[i % SOURCE_COLOR.length]!}
                          name={label(CONSENT_SOURCE_LABEL, s)}
                          value={rate(v, srcTotal)}
                        />
                      ))}
                    </ul>
                  </>
                ) : (
                  <Empty>Nobody has said yes to marketing yet.</Empty>
                )}
              </Panel>

              <Panel
                title="Compliance Status"
                note="Consent and data communication compliance."
                icon={ShieldCheck}
              >
                <ul className="space-y-2.5">
                  {checks.map((c) => (
                    <li
                      key={c.text}
                      className="flex items-start gap-2 text-[0.875rem] font-semibold"
                    >
                      {c.ok ? (
                        <CircleCheck
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#1E9E45]"
                        />
                      ) : (
                        <CircleDashed
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#B57A00]"
                        />
                      )}
                      <span>
                        {c.text}
                        {!c.ok && (
                          <Link
                            href="/settings?tab=retention"
                            className="ml-1 text-[#8A5C00] underline"
                          >
                            Open
                          </Link>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <Panel
                title="Consent Records"
                note="A log of consent given and withdrawn."
                icon={FileText}
                aside={
                  <a
                    href={commsHref('/communications/export', period, { kind: 'consent' })}
                    download
                    className="border-border-strong inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[0.8125rem] font-bold"
                  >
                    <Download aria-hidden="true" className="h-4 w-4" /> Export CSV
                  </a>
                }
              >
                <FilterRow>
                  <DashSearch
                    label="Search consent"
                    placeholder="Search by the full email or phone…"
                    value={sp.q ?? ''}
                  />
                  <DashSelect
                    label="Kind"
                    param="kind"
                    value={kind ?? 'all'}
                    options={[
                      { value: 'marketing', label: 'Marketing' },
                      { value: 'operational', label: 'Service messages' },
                    ]}
                  />
                </FilterRow>
                <DataTable
                  caption="Consent records"
                  isEmpty={rows.length === 0}
                  empty="No consent recorded here yet. Checkout and app choices are counted above; staff record the rest."
                  head={[
                    'Date & Time',
                    'Person',
                    'Consent Type',
                    'Channel',
                    'Action',
                    'Source',
                    'Recorded by',
                  ]}
                >
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{when(r.at)}</td>
                      <td>
                        <span className="block font-semibold">{r.who}</span>
                        {r.audience && (
                          <span className="text-muted block text-[0.75rem]">
                            {label(AUDIENCE_LABEL, r.audience)}
                          </span>
                        )}
                      </td>
                      <td>{r.kind === 'marketing' ? 'Marketing' : 'Service messages'}</td>
                      <td>
                        <span className="flex items-center gap-1.5">
                          {r.channel !== 'all' && <ChannelIcon channel={r.channel} />}
                          {r.channel === 'all' ? 'All' : label(CHANNEL_LABEL, r.channel)}
                        </span>
                      </td>
                      <td>
                        <Chip status={r.action} text={r.granted ? 'Granted' : 'Withdrawn'} />
                      </td>
                      <td title={r.evidence ?? undefined}>
                        {label(CONSENT_SOURCE_LABEL, r.source)}
                      </td>
                      <td>{r.staff ?? 'The person'}</td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PER}
                  total={asNumber(o.total)}
                  noun="records"
                  href={(p) => href({ page: String(p) })}
                />
              </Panel>

              <Panel
                title="Opt-outs & Suppression"
                note="People who opted out or must not be contacted."
                icon={Ban}
              >
                <ul className="divide-border divide-y text-[0.875rem]">
                  <li className="flex justify-between py-2 font-semibold">
                    <span>Opted out (all marketing)</span>
                    <span className="font-extrabold tabular-nums">{n(asNumber(o.opted_out))}</span>
                  </li>
                  {(['all', 'email', 'sms', 'whatsapp', 'in_app'] as const).map((c) => (
                    <li key={c} className="flex justify-between py-2 font-semibold">
                      <span>
                        {c === 'all'
                          ? 'Every channel'
                          : `${label(CHANNEL_LABEL, c)} suppression list`}
                      </span>
                      <Link
                        href={href({ channel: c })}
                        scroll={false}
                        className="font-extrabold tabular-nums underline-offset-2 hover:underline"
                      >
                        {n(supp[c] ?? 0)}
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <SuppressionForm canEdit={canEdit} />
                </div>
                <ul className="mt-3 space-y-1.5">
                  {suppRows.map((s) => (
                    <li
                      key={s.id}
                      className="border-border flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[0.8125rem]"
                    >
                      <span className="min-w-0">
                        <span className="block font-bold">
                          {s.address} ·{' '}
                          {s.channel === 'all' ? 'All' : label(CHANNEL_LABEL, s.channel)}
                        </span>
                        <span className="text-muted block truncate">
                          {label(SUPPRESSION_REASON_LABEL, s.reason)} · {when(s.created_at)}
                          {s.by ? ` · ${s.by}` : ''}
                        </span>
                      </span>
                      <RemoveSuppression id={s.id} canEdit={canEdit} />
                    </li>
                  ))}
                </ul>
                {suppChannel && (
                  <Footnote>
                    Showing the{' '}
                    {suppChannel === 'all' ? 'every-channel' : label(CHANNEL_LABEL, suppChannel)}{' '}
                    list.
                  </Footnote>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Panel
                title="Consent Trend"
                note="Marketing consent given and withdrawn, by day."
                icon={TrendingUp}
              >
                {trend.some((t) => t.granted + t.withdrawn > 0) ? (
                  <StackedBars
                    data={trend.map((t) => ({
                      at: String(t.day).slice(0, 10),
                      granted: t.granted,
                      withdrawn: t.withdrawn,
                    }))}
                    series={[
                      { key: 'granted', label: 'Granted', color: '#1F9D55' },
                      { key: 'withdrawn', label: 'Withdrawn', color: '#F5A623' },
                    ]}
                  />
                ) : (
                  <Empty>No consent given or withdrawn in this period.</Empty>
                )}
              </Panel>
              <Panel
                title="Consent by Audience"
                note="Share of each group that said yes to marketing."
                icon={Users}
              >
                <MeterRows
                  empty="Nobody to count yet."
                  rows={Object.entries(byAudience).map(([a, v]) => ({
                    label: label(AUDIENCE_LABEL, a),
                    value: v.total ? (100 * v.yes) / v.total : 0,
                    text: rate(v.yes, v.total),
                  }))}
                />
              </Panel>
              <Panel title="Key Actions" icon={Zap}>
                <div className="space-y-2">
                  <ConsentForm canEdit={canEdit} />
                  <a
                    href={commsHref('/communications/export', period, { kind: 'consent' })}
                    download
                    className="focus-visible:ring-gold inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] px-3 text-[0.875rem] font-bold text-[#8A5C00] hover:bg-[#FFF4D6]"
                  >
                    <Download aria-hidden="true" className="h-4 w-4" /> Export Consent Report
                  </a>
                  <Link
                    href="/audit?module=communications"
                    className="focus-visible:ring-gold inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] px-3 text-[0.875rem] font-bold text-[#8A5C00] hover:bg-[#FFF4D6]"
                  >
                    <FileSearch aria-hidden="true" className="h-4 w-4" /> View Audit Trail
                  </Link>
                  <Link
                    href={commsHref('/communications/bulk', period)}
                    className="focus-visible:ring-gold inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] px-3 text-[0.875rem] font-bold text-[#8A5C00] hover:bg-[#FFF4D6]"
                  >
                    <Megaphone aria-hidden="true" className="h-4 w-4" /> Send to people who said yes
                  </Link>
                </div>
                <Footnote>
                  A “consent reminder campaign” is not offered: asking people who never said yes
                  would itself be marketing without consent. Ask at checkout, sign-up or in the app
                  instead.
                </Footnote>
              </Panel>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
