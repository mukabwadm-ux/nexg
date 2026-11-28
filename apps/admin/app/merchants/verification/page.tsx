import {
  BadgeCheck,
  Building2,
  CircleCheck,
  CircleX,
  Clock,
  FileText,
  ListChecks,
  LocateFixed,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { fileDocumentFor, remindToUpload } from '@/app/documents/actions';
import { rejectDocument, verifyDocument } from '@/app/merchants/actions';
import { ConsoleShell } from '@/components/console-shell';
import type { ReviewDocument } from '@/components/document-review';
import {
  categoryIcon,
  CategoryChip,
  DashCanvas,
  DashCard,
  DashHeader,
  DashKpi,
  DashKpiGrid,
  MerchantCell,
  Pagination,
  SegmentTabs,
  StatusChip,
} from '@/components/portal/dash';
import { CheckRow, PillTabs, Stepper } from '@/components/portal/dash-detail';
import { DashClear, DashSearch, DashSelect } from '@/components/portal/dash-filters';
import { VerificationDecision, type DecisionMode } from '@/components/verification/decision';
import { VerificationDocuments } from '@/components/verification/documents';
import { VerificationGuide, type GuideRequirement } from '@/components/verification/guide';
import { VerificationRowMenu } from '@/components/verification/row-menu';
import {
  AllCheck,
  BulkActions,
  RowCheck,
  SelectionProvider,
  type ExportRow,
} from '@/components/verification/selection';
import { merchantPhotoUrl, shortCategory } from '@/lib/merchant-categories';
import { loadMerchantDocuments } from '@/lib/merchant-documents';
import { hrefWith } from '@/lib/portal';
import { MerchantOnboardingAnswers } from '@/components/merchants/onboarding-answers';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';
import {
  documentStanding,
  hoursLabel,
  isDetailPane,
  isVerificationTab,
  parseVerificationDetail,
  parseVerificationList,
  parseVerificationOverview,
  stateChip,
  VERIFICATION_TABS,
  verificationChecks,
  verificationProgress,
  type DetailPane,
  type VerificationDetail,
  type VerificationTab,
} from '@/lib/verification';

export const metadata: Metadata = { title: 'Merchant Verification' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const short = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Africa/Nairobi',
});
const long = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Africa/Nairobi',
});
const day = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'Africa/Nairobi',
});
const clock = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Africa/Nairobi',
});
const when = (iso: string | null, f = short) => (iso ? f.format(new Date(iso)) : '—');
const count = (n: number | null) => (n == null ? null : n.toLocaleString('en-KE'));

const PANES: { key: DetailPane; label: string; icon: typeof FileText }[] = [
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'details', label: 'Business Details', icon: Building2 },
  { key: 'compliance', label: 'Compliance Checks', icon: ShieldCheck },
  { key: 'activity', label: 'Activity & Notes', icon: MessageSquareText },
];

const CHECK_TEXT: Record<string, string> = {
  green: 'text-[#1E7B34]',
  amber: 'text-[#9A6700]',
  red: 'text-[#C62D22]',
  grey: 'text-muted',
};

/**
 * Merchants → Verification: the merchants waiting to go live, and one of
 * them open beside the queue with their documents, checks and the
 * decision. Figures and rows come from rpc_merchant_verification_*; the
 * documents and their actions are the merchant page's own.
 */
export default async function VerificationPage({
  searchParams,
}: {
  searchParams?: {
    tab?: string;
    q?: string;
    category?: string;
    page?: string;
    selected?: string;
    pane?: string;
  };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'merchants');

  const tab: VerificationTab = isVerificationTab(searchParams?.tab) ? searchParams!.tab : 'all';
  const q = (searchParams?.q ?? '').trim().slice(0, 80);
  const category = (searchParams?.category ?? 'all').slice(0, 60);
  const page = Math.max(1, Math.min(10_000, Number(searchParams?.page) || 1));
  const pane: DetailPane = isDetailPane(searchParams?.pane) ? searchParams!.pane : 'documents';

  const supabase = createClient();
  const [overviewRes, listRes, requirementsRes] = await Promise.all([
    supabase.rpc('rpc_merchant_verification_overview'),
    supabase.rpc('rpc_merchant_verification_list', {
      p_tab: tab,
      p_q: q || undefined,
      p_category: category === 'all' ? undefined : category,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase
      .from('document_requirement')
      .select('label, required, essential, has_expiry, applies_when, sort')
      .eq('owner_type', 'merchant')
      .order('sort'),
  ]);

  const overview = parseVerificationOverview(overviewRes.data);
  const { total, rows } = parseVerificationList(listRes.data);
  const failed = overviewRes.error ?? listRes.error;
  const k = overview.kpis;

  const selectedId =
    searchParams?.selected && UUID.test(searchParams.selected)
      ? searchParams.selected
      : (rows[0]?.merchant_id ?? null);

  const keep = {
    tab: tab === 'all' ? null : tab,
    q: q || null,
    category: category === 'all' ? null : category,
  };
  const listHref = (extra: Record<string, string | null>) =>
    hrefWith('/merchants/verification', {
      ...keep,
      page: page === 1 ? null : String(page),
      ...extra,
    });
  const selectHref = (id: string) =>
    listHref({ selected: id, pane: pane === 'documents' ? null : pane });

  const requirements: GuideRequirement[] = (
    (requirementsRes.data ?? []) as {
      label: string;
      required: boolean;
      essential: boolean;
      has_expiry: boolean;
      applies_when: Record<string, unknown> | null;
    }[]
  ).map((r) => {
    const cats = Array.isArray(r.applies_when?.category)
      ? (r.applies_when!.category as string[])
      : [];
    return {
      label: r.label,
      required: r.required,
      essential: r.essential,
      expires: r.has_expiry,
      categories: [...new Set(cats.map((c) => shortCategory(c)))],
      conditional: Boolean(r.applies_when && 'answer' in r.applies_when),
    };
  });

  const exportRows: ExportRow[] = rows.map((r) => ({
    id: r.merchant_id,
    reference: r.reference,
    name: r.name,
    category: r.category_label,
    area: r.area ?? '',
    submitted: r.submitted_at ? long.format(new Date(r.submitted_at)) : '',
    status: stateChip(r.state).label,
    phone: r.phone ?? '',
    email: r.email ?? '',
  }));

  return (
    <ConsoleShell staff={staff}>
      <SelectionProvider pageKey={`${tab}|${q}|${category}|${page}`}>
        <DashHeader
          title="Merchant Verification"
          subtitle="Review submitted documents, validate details and approve merchants for activation."
          actions={
            <>
              <VerificationGuide requirements={requirements} />
              <BulkActions rows={exportRows} />
            </>
          }
        />

        <DashCanvas>
          {failed && (
            <p
              role="alert"
              className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
            >
              Verification could not be loaded in full: {failed.message}
            </p>
          )}

          <DashKpiGrid>
            <DashKpi
              featured
              icon={ShieldCheck}
              label="Pending Verification"
              value={count(k.queue)}
              explain="Merchants still onboarding: applied, waiting for documents, or under review. Rejected applications are not counted."
            />
            <DashKpi
              icon={LocateFixed}
              label="Under Review"
              value={count(k.under_review)}
              explain="Every required document is in, so the next step is a person's decision."
            />
            <DashKpi
              icon={CircleCheck}
              iconTone="green"
              label="Verified (This Month)"
              value={count(k.verified_month)}
              explain="Merchants that went live since the first of this month."
            />
            <DashKpi
              icon={CircleX}
              iconTone="red"
              label="Rejected"
              value={count(k.rejected)}
              explain="Applications whose current decision is rejected."
            />
            <DashKpi
              icon={Clock}
              label="Avg. Verification Time"
              value={hoursLabel(k.avg_hours)}
              explain="From submitting the application to going live, averaged over this month's verified merchants. A dash when none went live this month."
            />
          </DashKpiGrid>

          <div className="grid gap-4 xl:grid-cols-2 xl:items-start min-[1600px]:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
            <DashCard title={`Verification Queue (${count(overview.tabs.all) ?? 0})`}>
              <SegmentTabs
                label="Queue"
                active={tab}
                tabs={VERIFICATION_TABS.map((t) => ({
                  key: t.key,
                  label: t.label,
                  count: overview.tabs[t.key],
                  href: hrefWith('/merchants/verification', {
                    tab: t.key === 'all' ? null : t.key,
                    q: q || null,
                    category: category === 'all' ? null : category,
                  }),
                }))}
              />

              <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(9rem,1fr)_auto]">
                <DashSearch
                  value={q}
                  label="Search the queue"
                  placeholder="Search by business name, phone, or ID…"
                  className="col-span-2 sm:col-span-1"
                />
                <DashSelect
                  label="Category"
                  param="category"
                  value={category}
                  options={overview.categories.map((c) => ({
                    value: c.key,
                    label: shortCategory(c.key, c.label),
                  }))}
                  className="min-w-0"
                />
                <DashClear params={['q', 'category']} />
              </div>

              <div className="relative mt-4 overflow-x-auto">
                <table className="w-full min-w-[30rem] border-separate border-spacing-0 text-left text-[0.875rem]">
                  <caption className="sr-only">Merchants waiting for verification</caption>
                  <thead>
                    <tr className="text-ink text-[0.8125rem] font-bold">
                      <th scope="col" className="bg-bg w-10 rounded-l-lg py-3 pl-3 pr-1">
                        <AllCheck ids={rows.map((r) => r.merchant_id)} />
                      </th>
                      <th scope="col" className="bg-bg px-2 py-3">
                        Business / Merchant
                      </th>
                      <th scope="col" className="bg-bg px-2 py-3">
                        Category
                      </th>
                      <th scope="col" className="bg-bg px-2 py-3">
                        Submitted
                      </th>
                      <th scope="col" className="bg-bg px-2 py-3">
                        Status
                      </th>
                      <th scope="col" className="bg-bg w-10 rounded-r-lg px-2 py-3">
                        <span className="sr-only">More</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-muted px-3 py-10 text-center font-semibold">
                          {q || category !== 'all'
                            ? 'Nothing matches these filters.'
                            : 'No merchants are waiting here.'}
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => {
                        const on = r.merchant_id === selectedId;
                        const chip = stateChip(r.state);
                        const cell = `border-border border-b px-2 py-2.5 ${on ? 'bg-[#FFF8E6]' : ''}`;
                        return (
                          <tr key={r.merchant_id} aria-current={on ? 'true' : undefined}>
                            <td className={`${cell} pl-3 pr-1`}>
                              <RowCheck id={r.merchant_id} label={`Choose ${r.name}`} />
                            </td>
                            <td className={`${cell} w-full max-w-0`}>
                              <MerchantCell
                                name={r.name}
                                place={r.area}
                                photoUrl={merchantPhotoUrl(r.photo_path)}
                                href={selectHref(r.merchant_id)}
                              />
                            </td>
                            <td className={cell}>
                              <CategoryChip
                                label={shortCategory(r.category_key, r.category_label)}
                                icon={categoryIcon(r.category_key)}
                              />
                            </td>
                            <td className={`${cell} whitespace-nowrap tabular-nums`}>
                              {r.submitted_at ? (
                                <time dateTime={r.submitted_at} title={when(r.submitted_at, long)}>
                                  {day.format(new Date(r.submitted_at))}
                                  <span className="hidden min-[1600px]:inline">
                                    , {clock.format(new Date(r.submitted_at))}
                                  </span>
                                </time>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className={cell}>
                              <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                            </td>
                            <td className={cell}>
                              <VerificationRowMenu
                                merchantId={r.merchant_id}
                                name={r.name}
                                reviewHref={selectHref(r.merchant_id)}
                                managed={r.managed}
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={page}
                size={PAGE_SIZE}
                total={total}
                noun="merchants"
                href={(p) => listHref({ page: p === 1 ? null : String(p), selected: selectedId })}
              />
              <p className="text-muted mt-3 text-[0.8125rem] font-semibold">
                Documents expiring for live merchants:{' '}
                <Link
                  href="/merchants?tab=documents"
                  className="text-[#B57A00] underline underline-offset-4"
                >
                  merchant documents
                </Link>
                .
              </p>
            </DashCard>

            {selectedId ? (
              <ReviewPane
                merchantId={selectedId}
                pane={pane}
                paneHref={(p) =>
                  listHref({ selected: selectedId, pane: p === 'documents' ? null : p })
                }
              />
            ) : (
              <DashCard>
                <p className="text-muted py-16 text-center font-semibold">
                  Nobody is waiting for verification. New applications appear here.
                </p>
              </DashCard>
            )}
          </div>
        </DashCanvas>
      </SelectionProvider>
    </ConsoleShell>
  );
}

/** The right-hand pane: one merchant's file and the decision. */
async function ReviewPane({
  merchantId,
  pane,
  paneHref,
}: {
  merchantId: string;
  pane: DetailPane;
  paneHref: (pane: DetailPane) => string;
}) {
  const supabase = createClient();
  const [detailRes, documents] = await Promise.all([
    supabase.rpc('rpc_merchant_verification_detail', { p_merchant_id: merchantId }),
    loadMerchantDocuments(supabase, merchantId).catch(() => null),
  ]);
  const detail = parseVerificationDetail(detailRes.data);
  if (!detail) {
    return (
      <DashCard>
        <p role="alert" className="text-muted py-16 text-center font-semibold">
          {detailRes.error?.message ?? 'This merchant could not be opened.'}
        </p>
      </DashCard>
    );
  }

  const docs: ReviewDocument[] = documents?.review ?? [];
  const standing = documentStanding(docs);
  const checks = verificationChecks(docs, detail);
  const progress = verificationProgress(docs, detail, checks);
  const chip = stateChip(detail.state);
  const photo = merchantPhotoUrl(detail.photo_path);
  const CategoryIcon = categoryIcon(detail.category_key);

  /* Who may decide, and how; see VerificationDecision. */
  const app = detail.application;
  let mode: DecisionMode = 'legacy';
  let note: string | null = null;
  if (detail.status === 'live') {
    mode = 'closed';
    note = `Live since ${when(detail.went_live_at, long)}.`;
  } else if (app?.review_state === 'rejected') {
    mode = 'closed';
    note = 'This application was rejected.';
  } else if (app) {
    if (app.review_state === 'approved') mode = 'activate';
    else if (app.review_state === 'pending' && app.can_review) mode = 'review';
    else {
      mode = 'waiting';
      note =
        app.review_state === 'draft'
          ? 'The merchant has not submitted the application yet.'
          : app.review_state === 'changes_requested'
            ? 'Changes were requested. Waiting for the merchant to resubmit.'
            : 'The merchant changed the application after submitting it. Waiting for them to submit again.';
    }
  }
  const left = standing.required - standing.verified;
  /*
   * Going live needs everything rpc_merchant_go_live checks
   * (fn_merchant_go_live_missing): onboarding details, agreement and DPA,
   * hours and a map pin as well as the documents. Use the same list as the
   * merchant page, so the button is not offered when the database will refuse.
   * Older merchants without the list keep the documents-and-branch rule.
   */
  let open: { label: string; who: string; count?: number }[] | null = null;
  if (mode === 'activate') {
    const { data: todo } = await supabase.rpc('rpc_merchant_setup_todo', {
      p_merchant_id: merchantId,
    });
    open =
      (todo as { items?: { label: string; who: string; count?: number }[] } | null)?.items ?? null;
  }
  const ready = open ? open.length === 0 : standing.allVerified && detail.branches > 0;
  const blocker = open
    ? open.length
      ? `Still open: ${open
          .map(
            (item) =>
              `${item.label}${item.count ? ` (${item.count})` : ''}${item.who === 'merchant' ? ' (merchant)' : ''}`,
          )
          .join('; ')}.`
      : null
    : !standing.allVerified
      ? `Verify every required document first (${left} of ${standing.required} still to verify).`
      : detail.branches === 0
        ? 'Add a primary branch before going live.'
        : null;
  let actorId: string | null = null;
  if (mode === 'review') {
    const { data } = await supabase.auth.getUser();
    actorId = data.user?.id ?? null;
  }

  return (
    <DashCard>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="flex min-w-0 items-start gap-4">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- the merchant's own image address
            <img
              src={photo}
              alt=""
              referrerPolicy="no-referrer"
              className="h-[5.5rem] w-[6.75rem] shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-[5.5rem] w-[6.75rem] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFE9A8] to-[#F5C842] text-[1.5rem] font-extrabold text-[#5E4300]"
            >
              {detail.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join('')}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-ink flex items-center gap-2 text-[1.375rem] font-extrabold leading-tight tracking-[-0.01em]">
              <span className="truncate">{detail.name}</span>
              {standing.required > 0 && standing.allVerified && (
                <BadgeCheck
                  aria-label="Every required document verified"
                  className="h-6 w-6 shrink-0 fill-[#1E9E45] text-white"
                />
              )}
            </h2>
            <ul className="text-muted mt-1.5 grid gap-y-1 text-[0.8125rem] font-semibold">
              <li className="flex items-center gap-1.5">
                <CategoryIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#B57A00]" />
                {detail.category_label}
              </li>
              <li className="flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
                {detail.area ?? 'No branch yet'}
              </li>
              <li className="flex items-center gap-1.5">
                <Phone aria-hidden="true" className="h-4 w-4 shrink-0" />
                {detail.phone ?? '—'}
              </li>
              <li className="flex min-w-0 items-center gap-1.5">
                <Mail aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="truncate">{detail.email ?? '—'}</span>
              </li>
            </ul>
          </div>
        </div>
        <div className="text-muted text-[0.8125rem] font-semibold sm:text-right">
          <StatusChip tone={chip.tone} className="px-3 py-1.5 text-[0.875rem]">
            {chip.label}
          </StatusChip>
          <p className="mt-2">Application ID: {detail.reference}</p>
          <p>Submitted: {when(detail.submitted_at, long)}</p>
        </div>
      </div>

      <div className="mt-6">
        <Stepper steps={progress} />
      </div>

      <div className="mt-6">
        <PillTabs
          label="Merchant file"
          active={pane}
          tabs={PANES.map((p) => ({
            key: p.key,
            label: p.label,
            icon: p.icon,
            href: paneHref(p.key),
          }))}
        />
      </div>

      <div className="mt-4">
        {pane === 'documents' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="border-border rounded-xl border p-4" aria-labelledby="docs-title">
              <h3 id="docs-title" className="text-ink text-[0.9375rem] font-extrabold">
                Submitted Documents ({standing.onFile}/{docs.length})
              </h3>
              <div className="mt-2">
                {documents ? (
                  <VerificationDocuments
                    documents={docs}
                    storagePrefix={`merchant/${merchantId}`}
                    actions={{
                      onVerify: async (documentId: string) => {
                        'use server';
                        return verifyDocument(documentId, merchantId);
                      },
                      onReject: async (documentId: string, reason: string) => {
                        'use server';
                        return rejectDocument(documentId, merchantId, reason);
                      },
                      onRemind: async (kind: string) => {
                        'use server';
                        return remindToUpload('merchant', merchantId, kind);
                      },
                      onFiled: async (input) => {
                        'use server';
                        return fileDocumentFor('merchant', merchantId, input);
                      },
                    }}
                  />
                ) : (
                  <p role="alert" className="text-muted py-3 text-[0.875rem] font-semibold">
                    The documents could not be loaded. Open the merchant record to review them.
                  </p>
                )}
              </div>
            </section>
            <section className="border-border rounded-xl border p-4" aria-labelledby="checks-title">
              <h3 id="checks-title" className="text-ink text-[0.9375rem] font-extrabold">
                Verification Checks
              </h3>
              <ul className="mt-2">
                {checks.map((c) => (
                  <CheckRow
                    key={c.key}
                    ok={c.ok}
                    label={c.label}
                    right={
                      <span className={`shrink-0 text-[0.8125rem] font-bold ${CHECK_TEXT[c.tone]}`}>
                        {c.ok ? `✓ ${c.text}` : c.text}
                      </span>
                    }
                  />
                ))}
              </ul>
            </section>
          </div>
        )}

        {pane === 'details' && <BusinessDetails detail={detail} />}

        {pane === 'compliance' && (
          <>
            <ComplianceDetails detail={detail} checks={checks} standing={standing} />
            <MerchantOnboardingAnswers merchantId={merchantId} />
          </>
        )}

        {pane === 'activity' && <ActivityAndNotes detail={detail} documents={docs} />}
      </div>

      <VerificationDecision
        merchantId={merchantId}
        name={detail.name}
        mode={mode}
        actorId={actorId}
        revision={app?.revision ?? null}
        ready={ready}
        blocker={blocker}
        note={note}
        sendable={docs
          .filter((d) => d.id && (d.status === 'uploaded' || d.status === 'verified'))
          .map((d) => ({ id: d.id!, label: d.label }))}
      />
    </DashCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border border-b py-2.5">
      <dt className="text-muted text-[0.75rem] font-bold uppercase tracking-wide">{label}</dt>
      <dd className="text-ink mt-0.5 break-words text-[0.9375rem] font-semibold">
        {children ?? '—'}
      </dd>
    </div>
  );
}

function BusinessDetails({ detail }: { detail: VerificationDetail }) {
  const app = detail.application;
  return (
    <dl className="grid gap-x-6 sm:grid-cols-2">
      <Field label="Trading name">{detail.trading_name}</Field>
      <Field label="Legal name">{detail.legal_name}</Field>
      <Field label="Category">
        {detail.category_label}
        {detail.subcategory ? ` · ${detail.subcategory.replace(/_/g, ' ')}` : ''}
      </Field>
      <Field label="KRA PIN">{detail.kra_pin ?? 'Not given'}</Field>
      <Field label="Contact person">{detail.contact_name}</Field>
      <Field label="Phone">
        {detail.phone
          ? `${detail.phone} · ${detail.phone_verified ? 'verified by code' : 'not verified'}`
          : null}
      </Field>
      <Field label="Email">{detail.email}</Field>
      <Field label="City">{detail.city}</Field>
      <Field label="Primary branch">
        {detail.branch
          ? [detail.branch.name, detail.branch.address].filter(Boolean).join(' · ') || '—'
          : 'None yet'}
      </Field>
      <Field label="Open branches">{detail.branches.toLocaleString('en-KE')}</Field>
      <Field label="Applied">{when(detail.created_at, long)}</Field>
      <Field label="Application">
        {app
          ? `${app.review_state.replace(/_/g, ' ')} · revision ${app.revision}${app.submitted_revision ? ` (submitted ${app.submitted_revision})` : ''}`
          : 'Applied before the application form'}
      </Field>
      <Field label="Payout account">
        {detail.banking.provided
          ? `Provided${detail.banking.rail ? ` · ${detail.banking.rail.replace(/_/g, ' ')}` : ''}`
          : 'Not provided'}
      </Field>
      <Field label="Came from">{detail.onboarding_source?.replace(/_/g, ' ') ?? null}</Field>
      <div className="pt-3 sm:col-span-2">
        <Link
          href={`/merchants/${detail.id}`}
          className="text-[0.875rem] font-bold text-[#B57A00] underline underline-offset-4"
        >
          Open the full merchant record →
        </Link>
      </div>
    </dl>
  );
}

function ComplianceDetails({
  detail,
  checks,
  standing,
}: {
  detail: VerificationDetail;
  checks: ReturnType<typeof verificationChecks>;
  standing: ReturnType<typeof documentStanding>;
}) {
  const explain: Record<string, string> = {
    kra: 'From the KRA PIN certificate, when the merchant uploaded one. It is optional, and nothing checks the PIN with KRA.',
    owner: "From the owner or director's ID, when uploaded. Optional.",
    permits: 'Every licence this merchant is required to hold, for its category and answers.',
    banking:
      'The payout account the merchant declared. Nothing checks the account name yet, so it can only be provided.',
    duplicates: 'Other merchants with the same KRA PIN, phone number or email.',
  };
  return (
    <div className="space-y-4">
      <ul>
        {checks.map((c) => (
          <li key={c.key} className="border-border border-b py-3 last:border-b-0">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5">
                {c.ok ? (
                  <CircleCheck aria-hidden="true" className="h-5 w-5 fill-[#1E9E45] text-white" />
                ) : (
                  <ListChecks aria-hidden="true" className="text-muted h-5 w-5" />
                )}
                <span className="text-ink text-[0.9375rem] font-bold">{c.label}</span>
              </span>
              <span className={`text-[0.8125rem] font-bold ${CHECK_TEXT[c.tone]}`}>{c.text}</span>
            </div>
            <p className="text-muted mt-1 pl-[1.875rem] text-[0.8125rem]">{explain[c.key]}</p>
            {c.key === 'duplicates' && detail.duplicates.length > 0 && (
              <ul className="mt-1.5 space-y-1 pl-[1.875rem]">
                {detail.duplicates.map((d) => (
                  <li key={d.id} className="text-[0.8125rem] font-semibold">
                    <Link
                      href={`/merchants/${d.id}`}
                      className="text-[#B57A00] underline underline-offset-2"
                    >
                      {d.name}
                    </Link>{' '}
                    <span className="text-muted">
                      · same {d.match} · {d.status.replace(/_/g, ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="text-muted text-[0.8125rem] font-semibold">
        Required documents: {standing.verified} of {standing.required} verified
        {standing.missing > 0 ? `, ${standing.missing} missing` : ''}
        {standing.returned > 0 ? `, ${standing.returned} sent back or expired` : ''}. Primary
        branch: {detail.branches > 0 ? 'yes' : 'not yet'}.
      </p>
    </div>
  );
}

async function ActivityAndNotes({
  detail,
  documents,
}: {
  detail: VerificationDetail;
  documents: ReviewDocument[];
}) {
  const supabase = createClient();
  const docIds = documents
    .map((d) => d.id)
    .filter((id): id is string => Boolean(id && UUID.test(id)));
  const filter = [
    `and(target_type.eq.merchant,target_id.eq.${detail.id})`,
    ...(docIds.length > 0
      ? [`and(target_type.eq.document,target_id.in.(${docIds.join(',')}))`]
      : []),
  ].join(',');
  const { data, error } = await supabase
    .from('audit_activity_v')
    .select('id, at, actor_label, sentence, action_label, reason')
    .or(filter)
    .order('at', { ascending: false })
    .limit(20);
  const events =
    (data as
      | {
          id: number;
          at: string;
          actor_label: string | null;
          sentence: string | null;
          action_label: string | null;
          reason: string | null;
        }[]
      | null) ?? [];

  const notes = [
    detail.application?.review_reason
      ? {
          key: 'review',
          title: `Decision note${detail.application.reviewer ? ` · ${detail.application.reviewer}` : ''}`,
          at: detail.application.reviewed_at,
          text: detail.application.review_reason,
        }
      : null,
    detail.status_reason
      ? { key: 'status', title: 'Status reason', at: null, text: detail.status_reason }
      : null,
    ...detail.notes.map((n, i) => ({
      key: `note-${i}`,
      title: `Review notes${n.by ? ` · ${n.by}` : ''}${n.outcome ? ` · ${n.outcome}` : ''}`,
      at: n.at,
      text: n.notes,
    })),
  ].filter((n): n is { key: string; title: string; at: string | null; text: string } => n !== null);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="border-border rounded-xl border p-4" aria-labelledby="notes-title">
        <h3 id="notes-title" className="text-ink text-[0.9375rem] font-extrabold">
          Notes
        </h3>
        {notes.length === 0 ? (
          <p className="text-muted mt-2 text-[0.875rem] font-semibold">
            No notes on this merchant yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {notes.map((n) => (
              <li key={n.key}>
                <p className="text-muted text-[0.75rem] font-bold">
                  {n.title}
                  {n.at ? ` · ${when(n.at, long)}` : ''}
                </p>
                <p className="text-ink mt-0.5 whitespace-pre-line text-[0.875rem]">{n.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="border-border rounded-xl border p-4" aria-labelledby="activity-title">
        <h3 id="activity-title" className="text-ink text-[0.9375rem] font-extrabold">
          Activity
        </h3>
        {error ? (
          <p className="text-muted mt-2 text-[0.875rem] font-semibold">
            Activity is not available to you.
          </p>
        ) : events.length === 0 ? (
          <p className="text-muted mt-2 text-[0.875rem] font-semibold">Nothing recorded yet.</p>
        ) : (
          <ol className="mt-2 space-y-2.5">
            {events.map((e) => (
              <li key={e.id} className="text-[0.875rem]">
                <p className="text-ink font-semibold">
                  {e.sentence ?? e.action_label ?? 'Change recorded'}
                </p>
                <p className="text-muted text-[0.75rem] font-semibold">
                  {e.actor_label ?? 'System'} · {when(e.at, long)}
                  {e.reason ? ` · ${e.reason}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
