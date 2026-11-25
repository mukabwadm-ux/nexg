import {
  BadgeCheck,
  CheckCircle2,
  CircleX,
  Clock,
  FileText,
  PlayCircle,
  ShieldCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleShell } from '@/components/console-shell';
import {
  CardLink,
  DashCanvas,
  DashCard,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  Pagination,
} from '@/components/portal/dash';
import { DashClear, DashSearch, DashSelect } from '@/components/portal/dash-filters';
import {
  AddRiderButton,
  DataTable,
  ErrorNote,
  FilterRow,
  Footnote,
  Funnel,
  KycMark,
  MeterRows,
  RiderCell,
  ScreenHeader,
  StageChip,
  WaitingForDatabase,
  ZoneChip,
} from '@/components/riders/module';
import { RiderRowMenu } from '@/components/riders/module-client';
import { periodFrom } from '@/lib/portal';
import {
  ago,
  asNumber,
  asObject,
  delta,
  isMissingFunction,
  KYC_LABEL,
  n,
  oneOf,
  PAGE_SIZE,
  pageOf,
  paged,
  pct,
  riderRef,
  screenHref,
  shareOf,
  VEHICLE_LABEL,
  when,
  type RiderFact,
} from '@/lib/riders-module';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Onboarding & KYC' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'All Applications', icon: Users },
  { key: 'pending', label: 'Pending Review', icon: Clock },
  { key: 'approved', label: 'Approved', icon: CheckCircle2 },
  { key: 'rejected', label: 'Rejected', icon: XCircle },
] as const;
type Tab = (typeof TABS)[number]['key'];

const option = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

const FLOW = [
  { icon: UserPlus, title: 'Register', text: 'The rider applies on the website' },
  { icon: FileText, title: 'Upload Documents', text: 'ID, licence and vehicle papers' },
  { icon: ShieldCheck, title: 'KYC Verification', text: 'Staff verify identity and documents' },
  { icon: BadgeCheck, title: 'Approve & Activate', text: 'Background check, then activation' },
];

interface DocRow {
  kind: string;
  label: string;
  needed: number;
  verified: number;
}
interface RecentRow {
  rider_id: string;
  name: string;
  what: 'verified' | 'rejected' | 'activated';
  document: string | null;
  at: string;
}

/**
 * Riders → Onboarding & KYC: applications in the period, their documents
 * and where each stands (rpc_console_riders_onboarding). Reviewing a
 * document, the background check and activation stay on the rider's own
 * record, where they are audited.
 */
export default async function RiderOnboardingPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    tab?: string;
    q?: string;
    zone?: string;
    vehicle?: string;
    kyc?: string;
    page?: string;
  };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'riders');
  const supabase = createClient();

  const period = periodFrom(searchParams);
  const tab: Tab = oneOf(
    TABS.map((t) => t.key),
    searchParams?.tab,
    'all',
  );
  const q = (searchParams?.q ?? '').slice(0, 120);
  const pick = (v: string | undefined) => (v && v !== 'all' ? v : null);
  const zone = pick(searchParams?.zone);
  const vehicle = pick(searchParams?.vehicle);
  const kyc = pick(searchParams?.kyc);
  const page = pageOf(searchParams?.page);

  const { data, error } = await supabase.rpc('rpc_console_riders_onboarding', {
    p_from: period.from,
    p_to: period.to,
    p_tab: tab,
    p_q: q || undefined,
    p_zone: zone ?? undefined,
    p_vehicle: vehicle ?? undefined,
    p_kyc: kyc ?? undefined,
    p_page: page,
    p_size: PAGE_SIZE,
  });
  const waiting = isMissingFunction(error);
  const o = asObject(data);
  const k = asObject(o.kpis);
  const docs = asObject(o.documents);
  const byDoc = (Array.isArray(o.kyc_by_document) ? o.kyc_by_document : []) as DocRow[];
  const recent = (Array.isArray(o.recent) ? o.recent : []) as RecentRow[];
  const list = paged<RiderFact>(data);

  const apps = asNumber(k.applications);
  const share = (v: unknown) => pct(shareOf(asNumber(v), apps));
  const keep = { q: q || null, zone, vehicle, kyc };
  const href = (params: Record<string, string | null | undefined>) =>
    screenHref('/riders/onboarding', period, {
      tab: tab === 'all' ? null : tab,
      ...keep,
      ...params,
    });

  return (
    <ConsoleShell staff={staff}>
      <ScreenHeader
        title="Riders – Onboarding & KYC"
        subtitle="Manage rider registration, document verification, KYC, approval and activation."
        period={period}
        exportHref={screenHref('/riders/export', period, { view: 'onboarding', tab, ...keep })}
        action={<AddRiderButton />}
      />
      <DashCanvas>
        {waiting ? (
          <WaitingForDatabase />
        ) : error ? (
          <ErrorNote message={error.message} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-6">
              <DashKpi
                featured
                icon={Users}
                label="Applications"
                value={n(apps)}
                delta={delta(apps, asNumber(k.applications_prev))}
                explain="Riders who applied in the period, against the period of the same length before."
              />
              <DashKpi
                icon={FileText}
                label="KYC Verified"
                value={n(asNumber(k.kyc_verified))}
                explain="Applicants with every required document verified."
              >
                <SubShare text={share(k.kyc_verified)} />
              </DashKpi>
              <DashKpi
                icon={CheckCircle2}
                label="Approved"
                value={n(asNumber(k.approved))}
                explain="Background check cleared, or already activated."
              >
                <SubShare text={share(k.approved)} />
              </DashKpi>
              <DashKpi
                icon={PlayCircle}
                label="Activated"
                value={n(asNumber(k.activated))}
                explain="Applicants now active (or since suspended)."
              >
                <SubShare text={share(k.activated)} />
              </DashKpi>
              <DashKpi
                icon={Clock}
                label="Pending Review"
                value={n(asNumber(k.pending))}
                explain="Still waiting on documents, review or the background check."
              >
                <SubShare text={share(k.pending)} />
              </DashKpi>
              <DashKpi
                icon={CircleX}
                iconTone="red"
                label="Rejected"
                value={n(asNumber(k.rejected))}
                explain="Offboarded before they were ever activated."
              >
                <SubShare text={share(k.rejected)} />
              </DashKpi>
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <DashCard title="Onboarding Flow">
                <ol className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {FLOW.map((s, i) => (
                    <li key={s.title} className="relative flex flex-col items-center text-center">
                      <span
                        className={
                          i === FLOW.length - 1
                            ? 'flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-[#FFD24D] to-[#F5B400] text-[#1A1A1A]'
                            : 'flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#F2D27A] bg-[#FFF8E6] text-[#B57A00]'
                        }
                      >
                        <s.icon aria-hidden="true" className="h-6 w-6" strokeWidth={1.8} />
                      </span>
                      <span className="mt-2 text-[0.9375rem] font-extrabold">{s.title}</span>
                      <span className="text-muted mt-0.5 text-[0.8125rem] font-semibold">
                        {s.text}
                      </span>
                    </li>
                  ))}
                </ol>
              </DashCard>

              <DashCard title="KYC Document Verification">
                <ul className="grid grid-cols-3 gap-3 text-center">
                  <DocCount
                    label="Waiting for review"
                    value={asNumber(docs.uploaded)}
                    tone="amber"
                  />
                  <DocCount
                    label="Verified in period"
                    value={asNumber(docs.verified)}
                    tone="green"
                  />
                  <DocCount label="Rejected in period" value={asNumber(docs.rejected)} tone="red" />
                </ul>
                <Footnote>
                  Documents are reviewed one by one on each applicant&apos;s record (Application
                  tab); photos are not shown here.
                </Footnote>
              </DashCard>

              <DashCard title="Onboarding Funnel">
                <Funnel
                  steps={[
                    { label: 'Applications', value: apps },
                    { label: 'KYC Verified', value: asNumber(k.kyc_verified) },
                    { label: 'Approved', value: asNumber(k.approved) },
                    { label: 'Activated', value: asNumber(k.activated) },
                  ]}
                />
              </DashCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <DashCard className="min-w-0">
                <GoldTabs
                  label="Applications"
                  active={tab}
                  className="mb-4"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    icon: t.icon,
                    count: list.counts[t.key] ?? 0,
                    href: screenHref('/riders/onboarding', period, {
                      tab: t.key === 'all' ? null : t.key,
                      ...keep,
                    }),
                  }))}
                />
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search applications"
                    placeholder="Search by name, phone, rider ID…"
                  />
                  <DashSelect
                    label="KYC"
                    param="kyc"
                    value={kyc ?? 'all'}
                    options={option(KYC_LABEL)}
                  />
                  <DashSelect
                    label="Zone"
                    param="zone"
                    value={zone ?? 'all'}
                    options={(list.zones ?? []).map((z) => ({ value: z.id, label: z.name }))}
                  />
                  <DashSelect
                    label="Vehicle"
                    param="vehicle"
                    value={vehicle ?? 'all'}
                    options={option(VEHICLE_LABEL)}
                  />
                  <DashClear params={['q', 'kyc', 'zone', 'vehicle', 'tab']} />
                </FilterRow>
                <DataTable
                  caption="Applications"
                  isEmpty={list.rows.length === 0}
                  empty="No applications in this period match."
                  head={[
                    '#',
                    'Rider',
                    'Rider ID',
                    'Phone',
                    'Vehicle',
                    'Zone',
                    'KYC Status',
                    'Documents',
                    'Onboarding Status',
                    'Submitted',
                    <span key="a" className="sr-only">
                      Actions
                    </span>,
                  ]}
                >
                  {list.rows.map((r) => (
                    <tr key={r.rider_id}>
                      <td className="text-muted font-semibold tabular-nums">{r.rn}</td>
                      <td>
                        <RiderCell id={r.rider_id} name={r.name} />
                      </td>
                      <td className="whitespace-nowrap font-semibold">{riderRef(r.rider_id)}</td>
                      <td className="whitespace-nowrap">{r.phone}</td>
                      <td>{VEHICLE_LABEL[r.vehicle] ?? r.vehicle}</td>
                      <td>
                        <ZoneChip name={r.zone_name} />
                      </td>
                      <td>
                        <KycMark kyc={r.kyc} />
                      </td>
                      <td className="whitespace-nowrap tabular-nums">
                        {r.docs_verified} of {r.docs_required}
                      </td>
                      <td>
                        <StageChip stage={r.stage ?? 'pending_review'} />
                      </td>
                      <td className="whitespace-nowrap">{when(r.submitted_at ?? r.created_at)}</td>
                      <td>
                        <RiderRowMenu riderId={r.rider_id} name={r.name} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PAGE_SIZE}
                  total={list.total}
                  noun="applications"
                  href={(p) => href({ page: p > 1 ? String(p) : null })}
                />
              </DashCard>

              <div className="grid content-start gap-4">
                <DashCard
                  title="KYC by Stage"
                  aside={<CardLink href="/riders/console?tab=documents">View Details</CardLink>}
                >
                  <MeterRows
                    empty="No applications in this period."
                    rows={byDoc.map((d) => {
                      const v =
                        d.needed > 0 ? Math.round((1000 * d.verified) / d.needed) / 10 : null;
                      return { label: d.label, value: v, text: pct(v) };
                    })}
                  />
                  <Footnote>
                    Share of the period&apos;s applicants who need each document and have it
                    verified.
                  </Footnote>
                </DashCard>
                <DashCard title="Recent Verifications">
                  {recent.length === 0 ? (
                    <p className="text-muted py-6 text-center text-sm font-semibold">
                      Nothing reviewed yet.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {recent.map((r, i) => (
                        <li key={`${r.rider_id}-${i}`} className="flex items-center gap-3">
                          <span className="min-w-0 flex-1">
                            <RiderCell
                              id={r.rider_id}
                              name={r.name}
                              sub={`${
                                r.what === 'activated'
                                  ? 'Activated'
                                  : r.what === 'verified'
                                    ? `${r.document ?? 'Document'} verified`
                                    : `${r.document ?? 'Document'} rejected`
                              } · ${ago(r.at)}`}
                            />
                          </span>
                          {r.what === 'rejected' ? (
                            <XCircle
                              aria-label="Rejected"
                              className="h-5 w-5 shrink-0 text-[#D63A2F]"
                            />
                          ) : (
                            <CheckCircle2
                              aria-label="Done"
                              className="h-5 w-5 shrink-0 text-[#1E9E45]"
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    href="/riders/console?tab=pipeline"
                    className="mt-3 inline-block text-[0.875rem] font-bold text-[#826D18] underline underline-offset-4"
                  >
                    Open the review board
                  </Link>
                </DashCard>
              </div>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}

function SubShare({ text }: { text: string }) {
  return (
    <span className="text-ink mt-2 block text-[0.9375rem] font-extrabold tabular-nums">
      ({text})
    </span>
  );
}

function DocCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'green' | 'red';
}) {
  const cls =
    tone === 'green'
      ? 'bg-[#E3F5E6] text-[#1E7B34]'
      : tone === 'red'
        ? 'bg-[#FDE7E5] text-[#C62D22]'
        : 'bg-[#FFF1C7] text-[#9A6700]';
  return (
    <li className={`rounded-xl px-2 py-4 ${cls}`}>
      <span className="block text-[1.5rem] font-extrabold tabular-nums">
        {value.toLocaleString('en-KE')}
      </span>
      <span className="mt-1 block text-[0.8125rem] font-bold">{label}</span>
    </li>
  );
}
