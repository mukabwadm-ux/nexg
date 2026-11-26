import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  Clock,
  FileCheck2,
  Home,
  Mail,
  Phone,
  ShieldCheck,
  Users,
  XCircle,
  Download,
  Flag,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';

import { DashCard, DashKpi, DashKpiGrid, GoldTabs, Pagination } from '@/components/portal/dash';
import { DashClear, DashSearch, DashSelect } from '@/components/portal/dash-filters';
import { HostDecision } from '@/components/stays/client';
import { PanelTabs, QuickTiles } from '@/components/stays/extras';
import {
  Chip,
  DataTable,
  Fact,
  FilterRow,
  Footnote,
  PanelHint,
  PersonCell,
  SidePanel,
  WithPanel,
} from '@/components/stays/module';
import type { Period } from '@/lib/portal';
import {
  asNumber,
  asObject,
  HOST_KIND_LABEL,
  label,
  n,
  pct,
  shareOf,
  shortDate,
  staysHref,
} from '@/lib/stays-module';

export interface HostRow {
  host_id: string;
  name: string;
  contact_name: string | null;
  kind: string;
  status: string;
  status_reason: string | null;
  tier: string;
  phone: string | null;
  email: string | null;
  created_at: string;
  submitted_at: string | null;
  verified_at: string | null;
  went_live_at: string | null;
  rejected_at: string | null;
  verification_method: string | null;
  city_name: string | null;
  units: number;
  properties: number;
  first_property: string | null;
  docs_uploaded: number;
  docs_approved: number;
  docs_rejected: number;
  id_ok: boolean;
  authority_ok: boolean;
  kra_ok: boolean;
  payout_ok: boolean;
  open_cases: number;
  bucket: string;
  /** Document expiry (20270331000300); absent until that migration is applied. */
  earliest_expiry?: string | null;
  docs_expiring?: number;
  docs_expired?: number;
  documents?: HostDocumentRow[];
}

export interface HostDocumentRow {
  id: string;
  kind: string;
  status: string;
  file_name: string;
  uploaded_at: string;
  reviewed_at: string | null;
  expires_on: string | null;
  expiry_state: 'expired' | 'expiring' | 'valid' | null;
}

const DOCUMENT_LABEL: Record<string, string> = {
  id_document: 'ID or passport',
  authority: 'Proof of authority',
  kra_pin: 'KRA PIN certificate',
  business_registration: 'Business registration',
};

/** "Expired" / "Expires soon" chip for a host or a document; nothing when fine. */
function ExpiryChip({ expired, expiring }: { expired: boolean; expiring: boolean }) {
  if (expired) return <Chip status="flagged" text="Expired" />;
  if (expiring) return <Chip status="pending" text="Expires soon" />;
  return null;
}

const HOSTS_TABS = [
  { key: 'all', label: 'All Hosts' },
  { key: 'pending', label: 'Pending Approval' },
  { key: 'verified', label: 'Verified' },
  { key: 'sent_back', label: 'Sent Back' },
  { key: 'flagged', label: 'Paused' },
  { key: 'rejected', label: 'Declined' },
] as const;

const VERIFY_TABS = [
  { key: 'all', label: 'All' },
  { key: 'verified', label: 'Verified' },
  { key: 'pending', label: 'Pending' },
  { key: 'non_compliant', label: 'Non-Compliant' },
  { key: 'expiring', label: 'Expiring' },
  { key: 'sent_back', label: 'Sent Back' },
  { key: 'flagged', label: 'Risk / Flagged' },
] as const;

const PANEL_TABS = [
  { key: 'verification', label: 'Verification' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'documents', label: 'Documents' },
  { key: 'history', label: 'History' },
  { key: 'notes', label: 'Notes' },
];

export const HOST_PANEL_TABS = PANEL_TABS.map((t) => t.key);

export const HOST_TAB_KEYS = [...new Set([...HOSTS_TABS, ...VERIFY_TABS].map((t) => t.key))];

function Check({ ok, label: text }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-[0.875rem]">
      <span className="flex items-center gap-2 font-semibold">
        {ok ? (
          <BadgeCheck aria-hidden="true" className="h-4 w-4 text-[#1E9E45]" />
        ) : (
          <Clock aria-hidden="true" className="h-4 w-4 text-[#B57A00]" />
        )}
        {text}
      </span>
      <span className={ok ? 'font-bold text-[#1E7B34]' : 'text-muted font-semibold'}>
        {ok ? 'Verified' : 'Not yet'}
      </span>
    </li>
  );
}

/**
 * Hosts and Verification & Compliance: one list of hosts (from
 * rpc_console_stays_hosts), two framings. New hosts who registered on the
 * website land as Pending; staff approve them (the existing verification,
 * which needs their ID and proof of authority approved) or reject them with a
 * reason, and the host is emailed either way.
 */
export function HostsScreen({
  variant,
  data,
  period,
  city,
  tab,
  q,
  page,
  size,
  selected,
  canDecide,
  filters,
  ptab,
}: {
  variant: 'hosts' | 'verification';
  /** Every host the reader returned for the tab (up to 500); filtered and paged here. */
  data: unknown;
  period: Period;
  city: string | null;
  tab: string;
  q: string;
  page: number;
  size: number;
  selected: string | null;
  canDecide: boolean;
  filters: { type: string | null; kyc: string | null; compliance: string | null };
  ptab: string;
}) {
  const o = asObject(data);
  const counts = asObject(o.counts);
  const k = asObject(o.kpis);
  const allRows = (Array.isArray(o.rows) ? o.rows : []) as HostRow[];
  const compliant = (r: HostRow) => r.id_ok && r.authority_ok;
  const filtered = allRows.filter(
    (r) =>
      (!filters.type || r.kind === filters.type) &&
      (!filters.kyc ||
        (filters.kyc === 'verified'
          ? r.id_ok
          : filters.kyc === 'rejected'
            ? r.docs_rejected > 0
            : !r.id_ok)) &&
      (!filters.compliance || (filters.compliance === 'compliant' ? compliant(r) : !compliant(r))),
  );
  const rows = filtered.slice((page - 1) * size, page * size);
  const total = filtered.length;
  const host = allRows.find((r) => r.host_id === selected) ?? null;
  const path = variant === 'hosts' ? '/stays/hosts' : '/stays/verification';
  const tabs = variant === 'hosts' ? HOSTS_TABS : VERIFY_TABS;
  const all = asNumber(counts.all);
  const keep = {
    tab: tab === 'all' ? null : tab,
    q: q || null,
    type: filters.type,
    kyc: filters.kyc,
    compliance: filters.compliance,
  };
  const href = (params: Record<string, string | null>) =>
    staysHref(path, period, city, { ...keep, ...params });

  return (
    <>
      {variant === 'hosts' ? (
        <DashKpiGrid className="xl:grid-cols-5">
          <DashKpi
            featured
            icon={Users}
            label="Total Hosts"
            value={n(all)}
            explain="Every host account."
          />
          <DashKpi
            icon={Clock}
            label="Pending Approval"
            value={n(asNumber(counts.pending))}
            explain="Registered on the website and waiting for NexG to check them. Their listings are hidden."
            href={href({ tab: 'pending' })}
          />
          <DashKpi
            icon={BadgeCheck}
            iconTone="green"
            label="Verified (Live)"
            value={n(asNumber(counts.verified))}
            explain="Approved hosts; their ready listings show to guests."
          />
          <DashKpi
            icon={AlertTriangle}
            label="Sent Back"
            value={n(asNumber(counts.sent_back))}
            explain="Asked to fix something before approval."
          />
          <DashKpi
            icon={XCircle}
            iconTone="red"
            label="Declined"
            value={n(asNumber(counts.rejected))}
            explain="Declined or offboarded."
          />
        </DashKpiGrid>
      ) : (
        <DashKpiGrid className="xl:grid-cols-6">
          <DashKpi
            featured
            icon={ShieldCheck}
            label="Verified Hosts"
            value={n(asNumber(counts.verified))}
            explain="Hosts NexG approved."
          >
            <span className="text-muted text-[0.8125rem] font-semibold">
              ({pct(shareOf(asNumber(counts.verified), all), 0)} of total)
            </span>
          </DashKpi>
          <DashKpi
            icon={Clock}
            label="Pending Review"
            value={n(asNumber(counts.pending))}
            explain="Waiting for a decision."
          >
            <span className="text-muted text-[0.8125rem] font-semibold">
              ({pct(shareOf(asNumber(counts.pending), all), 0)} of total)
            </span>
          </DashKpi>
          <DashKpi
            icon={AlertTriangle}
            iconTone="red"
            label="Non-Compliant"
            value={n(asNumber(counts.non_compliant))}
            explain="Live hosts whose ID or proof of authority is not approved (for example replaced or expired)."
          />
          <DashKpi
            icon={Building2}
            label="Verified Properties"
            value={n(asNumber(k.verified_properties))}
            explain="Properties NexG approved on property review."
          >
            <span className="text-muted text-[0.8125rem] font-semibold">
              ({pct(shareOf(asNumber(k.verified_properties), asNumber(k.properties)), 0)} of total)
            </span>
          </DashKpi>
          <DashKpi
            icon={Home}
            label="Verified Units"
            value={n(asNumber(k.verified_units))}
            explain="Live units of verified hosts."
          >
            <span className="text-muted text-[0.8125rem] font-semibold">
              ({pct(shareOf(asNumber(k.verified_units), asNumber(k.units)), 0)} of total)
            </span>
          </DashKpi>
          <DashKpi
            icon={FileCheck2}
            label="KYC Completion"
            value={pct(shareOf(asNumber(k.kyc_complete), all), 0)}
            explain="Hosts with an approved ID and proof of authority."
          />
        </DashKpiGrid>
      )}

      <WithPanel
        panel={
          host ? (
            <SidePanel
              title={variant === 'hosts' ? host.name : 'Host Verification Details'}
              closeHref={href({ selected: null, page: String(page) })}
              badge={<Chip status={host.bucket} />}
            >
              <PersonCell
                name={host.contact_name ?? host.name}
                sub={label(HOST_KIND_LABEL, host.kind)}
              />
              <div className="mt-3">
                <PanelTabs
                  tabs={PANEL_TABS}
                  active={ptab}
                  href={(key) =>
                    href({
                      selected: host.host_id,
                      page: String(page),
                      ptab: key === 'verification' ? null : key,
                    })
                  }
                />
              </div>
              {ptab === 'documents' ? (
                <>
                  <Fact icon={FileCheck2} label="Documents approved">
                    {host.docs_approved} of {Math.max(host.docs_uploaded, 2)}
                  </Fact>
                  <Fact icon={XCircle} label="Documents rejected">
                    {host.docs_rejected}
                  </Fact>
                  {host.documents && host.documents.length > 0 ? (
                    <ul className="mt-2 divide-y divide-[#EEE7D8]">
                      {host.documents.map((d) => (
                        <li key={d.id} className="py-2 text-[0.8125rem]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold">{label(DOCUMENT_LABEL, d.kind)}</span>
                            <span className="flex gap-1">
                              <ExpiryChip
                                expired={d.expiry_state === 'expired'}
                                expiring={d.expiry_state === 'expiring'}
                              />
                              <Chip
                                status={d.status === 'uploaded' ? 'under_review' : d.status}
                                text={
                                  d.status === 'uploaded'
                                    ? 'In review'
                                    : d.status === 'approved'
                                      ? 'Approved'
                                      : 'Rejected'
                                }
                              />
                            </span>
                          </div>
                          <p className="text-muted mt-0.5 font-semibold">
                            {d.expires_on
                              ? `Expires ${shortDate(`${d.expires_on}T12:00:00Z`)}`
                              : 'No expiry date'}{' '}
                            · uploaded {shortDate(d.uploaded_at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
                      No documents uploaded yet.
                    </p>
                  )}
                  <Link
                    className="mt-2 inline-block font-bold underline"
                    href={`/hotels/hosts/${host.host_id}/verify`}
                  >
                    Open the documents to review them
                  </Link>
                </>
              ) : ptab === 'compliance' ? (
                <>
                  <Fact label="Compliance">
                    <Chip
                      status={
                        compliant(host)
                          ? 'verified'
                          : host.status === 'live'
                            ? 'flagged'
                            : 'under_review'
                      }
                      text={
                        compliant(host)
                          ? 'Compliant'
                          : host.status === 'live'
                            ? 'Non-compliant'
                            : 'Under Review'
                      }
                    />
                  </Fact>
                  <Fact label="Open incidents / disputes">{n(host.open_cases)}</Fact>
                  <Fact label="Payout details">
                    {host.payout_ok ? 'Verified by Finance' : 'Not verified'}
                  </Fact>
                  <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
                    {compliant(host)
                      ? 'All required checks completed.'
                      : 'ID and proof of authority must both be approved and not expired.'}
                  </p>
                </>
              ) : ptab === 'history' ? (
                <>
                  <Fact icon={Clock} label="Registered">
                    {shortDate(host.created_at)}
                  </Fact>
                  <Fact icon={Clock} label="Submitted">
                    {shortDate(host.submitted_at)}
                  </Fact>
                  <Fact icon={BadgeCheck} label="Verified">
                    {shortDate(host.verified_at)}
                  </Fact>
                  <Fact icon={BadgeCheck} label="Went live">
                    {shortDate(host.went_live_at)}
                  </Fact>
                  <Fact icon={XCircle} label="Last sent back / declined">
                    {shortDate(host.rejected_at)}
                  </Fact>
                </>
              ) : ptab === 'notes' ? (
                <p className="text-muted text-[0.875rem] font-semibold">
                  {host.status_reason
                    ? `Reason given to the host: ${host.status_reason}`
                    : 'No reason or note recorded.'}{' '}
                  Every decision is in the{' '}
                  <Link className="underline" href="/audit">
                    audit log
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <div className="mt-1">
                    {host.phone && (
                      <Fact icon={Phone} label="Phone">
                        {host.phone}
                      </Fact>
                    )}
                    {host.email && (
                      <Fact icon={Mail} label="Email">
                        {host.email}
                      </Fact>
                    )}
                    <Fact icon={Building2} label="Properties / Units">
                      {n(host.properties)} / {n(host.units)}
                    </Fact>
                    <Fact icon={Clock} label="Registered">
                      {shortDate(host.created_at)}
                    </Fact>
                    <Fact icon={Clock} label="Submitted">
                      {shortDate(host.submitted_at)}
                    </Fact>
                    {host.verified_at && (
                      <Fact icon={BadgeCheck} label="Verified">
                        {shortDate(host.verified_at)}
                      </Fact>
                    )}
                  </div>
                  <h3 className="mt-3 text-[0.9375rem] font-extrabold">Verification Checklist</h3>
                  <ul className="mt-1">
                    <Check ok={host.id_ok} label="Identity (ID / passport)" />
                    <Check ok={host.authority_ok} label="Property ownership / authority" />
                    <Check ok={host.kra_ok} label="Tax (KRA PIN)" />
                    <Check ok={host.payout_ok} label="Payout details verified" />
                  </ul>
                  {host.status_reason && (
                    <p className="mt-3 rounded-lg bg-[#FFF4D6] p-3 text-[0.8125rem] font-semibold text-[#8A5C00]">
                      Reason given: {host.status_reason}
                    </p>
                  )}
                  {host.open_cases > 0 && (
                    <p className="mt-2 text-[0.8125rem] font-semibold text-[#C62D22]">
                      {n(host.open_cases)} open incident{host.open_cases === 1 ? '' : 's'} or
                      dispute
                      {host.open_cases === 1 ? '' : 's'}.
                    </p>
                  )}
                </>
              )}
              <div className="mt-4">
                {canDecide && (host.status === 'applied' || host.status === 'verifying') ? (
                  <HostDecision
                    hostId={host.host_id}
                    name={host.name}
                    docsReady={host.id_ok && host.authority_ok}
                  />
                ) : (
                  <p className="text-muted text-[0.8125rem] font-semibold">
                    {host.status === 'live'
                      ? 'This host is approved.'
                      : canDecide
                        ? 'Nothing to decide for this host right now.'
                        : 'Approving hosts is for ops managers, partnerships and city leads.'}
                  </p>
                )}
              </div>
              <div className="mt-3">
                <QuickTiles
                  cols={3}
                  tiles={[
                    {
                      label: 'Re-verify',
                      icon: RefreshCw,
                      href: `/hotels/hosts/${host.host_id}/verify`,
                    },
                    {
                      label: 'Download Pack',
                      icon: Download,
                      unavailable:
                        'A single download of all the host’s documents is not built yet; open them on the verification page.',
                    },
                    host.status === 'applied' || host.status === 'verifying'
                      ? {
                          label: 'Report / Flag',
                          icon: Flag,
                          href: href({ selected: host.host_id, ptab: 'notes' }),
                        }
                      : {
                          label: 'Report / Flag',
                          icon: Flag,
                          href: staysHref('/stays/incidents', period, city, {}),
                        },
                  ]}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-[0.875rem] font-bold">
                <Link className="underline" href={`/hotels?tab=hosts&selected=${host.host_id}`}>
                  Payouts & commission
                </Link>
              </div>
            </SidePanel>
          ) : (
            <PanelHint>Choose a host to see their checks and approve or reject them.</PanelHint>
          )
        }
      >
        <DashCard className="min-w-0">
          <GoldTabs
            label="Host state"
            active={tab}
            className="mb-4"
            tabs={tabs.map((t) => ({
              key: t.key,
              label: t.label,
              count: asNumber(counts[t.key]),
              href: staysHref(path, period, city, {
                tab: t.key === 'all' ? null : t.key,
                q: q || null,
              }),
            }))}
          />
          <FilterRow>
            <DashSearch
              value={q}
              label="Search hosts"
              placeholder="Search by host, property, phone or email…"
            />
            <DashSelect
              label="Type"
              param="type"
              value={filters.type ?? 'all'}
              options={Object.entries(HOST_KIND_LABEL).map(([value, text]) => ({
                value,
                label: text,
              }))}
            />
            <DashSelect
              label="Verification"
              param="kyc"
              value={filters.kyc ?? 'all'}
              options={[
                { value: 'verified', label: 'Verified' },
                { value: 'pending', label: 'Pending' },
                { value: 'rejected', label: 'Rejected' },
              ]}
            />
            <DashSelect
              label="Compliance"
              param="compliance"
              value={filters.compliance ?? 'all'}
              options={[
                { value: 'compliant', label: 'Compliant' },
                { value: 'not', label: 'Not compliant' },
              ]}
            />
            <DashClear params={['q', 'tab', 'type', 'kyc', 'compliance', 'selected']} />
          </FilterRow>
          <DataTable
            caption="Hosts"
            isEmpty={rows.length === 0}
            empty={
              tab === 'expiring'
                ? 'No approved host document expires in the next 60 days, and none has expired.'
                : tab === 'pending'
                  ? 'No host is waiting for approval.'
                  : 'No hosts match.'
            }
            head={
              variant === 'hosts'
                ? [
                    'Host / Business',
                    'Type',
                    'Property',
                    'Units',
                    'Documents',
                    'Registered',
                    'Status',
                  ]
                : [
                    'Host / Business',
                    'Type',
                    'Property / Building',
                    'Units',
                    'KYC Status',
                    'Compliance',
                    'Documents',
                    'Expiry',
                    'Verified On',
                  ]
            }
          >
            {rows.map((r) => (
              <tr key={r.host_id} className={r.host_id === selected ? 'bg-[#FFFBF0]' : undefined}>
                <td>
                  <PersonCell
                    name={r.name}
                    sub={r.phone ?? r.email ?? undefined}
                    href={href({ selected: r.host_id, page: String(page) })}
                  />
                </td>
                <td>
                  <Chip
                    status={r.kind === 'property_manager' ? 'mediation' : 'draft'}
                    text={label(HOST_KIND_LABEL, r.kind)}
                  />
                </td>
                <td>{r.first_property ?? '—'}</td>
                <td className="text-center tabular-nums">{n(r.units)}</td>
                {variant === 'hosts' ? (
                  <>
                    <td className="whitespace-nowrap tabular-nums">
                      {r.docs_approved}/{Math.max(r.docs_uploaded, 2)} approved
                    </td>
                    <td className="whitespace-nowrap">{shortDate(r.created_at)}</td>
                    <td>
                      <Chip status={r.bucket} />
                    </td>
                  </>
                ) : (
                  <>
                    <td>
                      <Chip
                        status={r.id_ok ? 'verified' : 'pending'}
                        text={r.id_ok ? 'Verified' : r.docs_rejected > 0 ? 'Rejected' : 'Pending'}
                      />
                    </td>
                    <td>
                      <Chip
                        status={
                          r.id_ok && r.authority_ok
                            ? 'verified'
                            : r.status === 'live'
                              ? 'flagged'
                              : 'under_review'
                        }
                        text={
                          r.id_ok && r.authority_ok
                            ? 'Compliant'
                            : r.status === 'live'
                              ? 'Non-compliant'
                              : 'Under Review'
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap tabular-nums">
                      {r.docs_approved}/{Math.max(r.docs_uploaded, 2)}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="flex flex-col items-start gap-1">
                        {r.earliest_expiry ? shortDate(`${r.earliest_expiry}T12:00:00Z`) : '—'}
                        <ExpiryChip
                          expired={(r.docs_expired ?? 0) > 0}
                          expiring={(r.docs_expiring ?? 0) > 0}
                        />
                      </span>
                    </td>
                    <td className="whitespace-nowrap">{shortDate(r.verified_at)}</td>
                  </>
                )}
              </tr>
            ))}
          </DataTable>
          <Pagination
            page={page}
            size={size}
            total={total}
            noun={variant === 'hosts' ? 'hosts' : 'records'}
            href={(p) => href({ page: p > 1 ? String(p) : null })}
          />
          <Footnote>
            Hosts who register on the website start as Pending and their listings stay hidden until
            approved. Approve needs their ID and proof of authority approved first (Documents).
          </Footnote>
        </DashCard>
      </WithPanel>
    </>
  );
}
