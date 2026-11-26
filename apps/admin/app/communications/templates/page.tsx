import {
  CheckCircle2,
  FilePen,
  FileText,
  Layers,
  PauseCircle,
  Plus,
  Send,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { TemplateEditor, type TemplateRow } from '@/components/comms/client';
import {
  AudienceChip,
  ChannelIcons,
  Chip,
  CommsHeader,
  CommsTabs,
  DataTable,
  ErrorNote,
  FilterRow,
  Footnote,
  Panel,
  WaitingForDatabase,
} from '@/components/comms/module';
import { ConsoleShell } from '@/components/console-shell';
import { DashCanvas, DashKpi, DashKpiGrid, Pagination } from '@/components/portal/dash';
import { DashSearch, DashSelect } from '@/components/portal/dash-filters';
import { cn } from '@nexg/ui';
import {
  asNumber,
  asObject,
  AUDIENCE_LABEL,
  AUDIENCES,
  CATEGORY_LABEL,
  CHANNEL_LABEL,
  commsHref,
  countsOf,
  dayOnly,
  label,
  n,
  oneOfOr,
  pageNumber,
  rowsOf,
  TEMPLATE_STATUS_LABEL,
  UUID,
} from '@/lib/comms';
import { commsContext } from '@/lib/comms-server';

export const metadata: Metadata = { title: 'Communications · Message Templates' };
export const dynamic = 'force-dynamic';

const PER = 10;

interface Row extends TemplateRow {
  updated_at: string;
}

/**
 * Message Templates: every template staff wrote, by category and audience,
 * searchable, with the editor on the right (words per channel, variables,
 * preview, a test send). The app emails and uploaded designs stay in
 * Settings and are counted here.
 */
export default async function TemplatesPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    category?: string;
    audience?: string;
    channel?: string;
    status?: string;
    q?: string;
    page?: string;
    selected?: string;
  };
}) {
  const ctx = await commsContext(searchParams);
  const { period } = ctx;
  const sp = searchParams ?? {};
  const category = oneOfOr(sp.category, Object.keys(CATEGORY_LABEL));
  const audience = oneOfOr(sp.audience, [...AUDIENCES, 'all']);
  const channel = oneOfOr(sp.channel, ['email', 'sms', 'whatsapp', 'in_app']);
  const status = oneOfOr(sp.status, ['active', 'draft', 'inactive']);
  const page = pageNumber(sp.page);
  const q = await ctx.read('rpc_comms_templates', {
    p_category: category,
    p_audience: audience,
    p_channel: channel,
    p_status: status,
    p_search: sp.q ?? null,
    p_page: page,
    p_per: PER,
  });
  const o = asObject(q.data);
  const k = asObject(o.kpis);
  const cats = countsOf(o.categories);
  const rows = rowsOf<Row>(o.rows);
  const canEdit = o.level === 'full' || o.level === 'limited';
  const params = { category, audience, channel, status, q: sp.q ?? null };
  const href = (extra: Record<string, string | null> = {}) =>
    commsHref('/communications/templates', period, { ...params, ...extra });

  let selected: TemplateRow | null = null;
  if (sp.selected && UUID.test(sp.selected)) {
    selected = rows.find((r) => r.id === sp.selected) ?? null;
    if (!selected) {
      const all = await ctx.read('rpc_comms_templates', { p_per: 100 });
      selected = rowsOf<Row>(asObject(all.data).rows).find((r) => r.id === sp.selected) ?? null;
    }
  } else if (sp.selected !== 'new') {
    selected = rows[0] ?? null;
  }

  return (
    <ConsoleShell staff={ctx.staff}>
      <CommsHeader
        screen="Message Templates"
        subtitle="Create, manage and reuse message templates for email, SMS, WhatsApp, push and in-app notifications."
        period={period}
        noPeriod
      />
      <DashCanvas>
        <CommsTabs active="templates" period={period} />
        {q.waiting ? (
          <WaitingForDatabase />
        ) : q.error ? (
          <ErrorNote message={q.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-6">
              <DashKpi
                featured
                icon={Send}
                label="Total Templates"
                value={n(asNumber(k.total))}
                explain="Templates written in this module."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Active"
                value={n(asNumber(k.active))}
                explain="Templates that workflows, schedules and bulk sends can use."
                href={href({ status: 'active' })}
              />
              <DashKpi
                icon={FilePen}
                label="Drafts"
                value={n(asNumber(k.draft))}
                explain="Not used anywhere until made active."
                href={href({ status: 'draft' })}
              />
              <DashKpi
                icon={PauseCircle}
                label="Inactive"
                value={n(asNumber(k.inactive))}
                explain="Switched off; a workflow using one stops sending it."
                href={href({ status: 'inactive' })}
              />
              <DashKpi
                icon={Layers}
                label="Categories"
                value={n(asNumber(k.categories))}
                explain="Categories with at least one template."
              />
              <DashKpi
                icon={Users}
                label="Audiences"
                value={n(asNumber(k.audiences))}
                explain="Audiences with at least one template."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_minmax(0,24rem)]">
              <Panel title="Template Categories" icon={Layers}>
                <ul className="space-y-1">
                  {[
                    ['', 'All Templates', asNumber(k.total)] as const,
                    ...Object.entries(CATEGORY_LABEL).map(
                      ([key, text]) => [key, text, cats[key] ?? 0] as const,
                    ),
                  ].map(([key, text, count]) => {
                    const on = (category ?? '') === key;
                    return (
                      <li key={key || 'all'}>
                        <Link
                          href={href({ category: key || null, page: null, selected: null })}
                          scroll={false}
                          aria-current={on ? 'page' : undefined}
                          className={cn(
                            'flex min-h-10 items-center justify-between gap-2 rounded-lg px-2.5 text-[0.875rem] font-semibold',
                            on ? 'bg-[#FFF4D6] text-[#8A5C00]' : 'hover:bg-bg',
                          )}
                        >
                          <span className="truncate">{text}</span>
                          <span className="text-muted tabular-nums">{n(count)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                <div className="border-border mt-4 border-t pt-3 text-[0.8125rem]">
                  <p className="font-bold">Also in Settings</p>
                  <p className="text-muted mt-1">
                    {n(asNumber(k.app_emails))} app emails and {n(asNumber(k.designs))} uploaded
                    email designs.
                  </p>
                  <Link
                    href="/settings?tab=notifications"
                    className="mt-1 inline-block font-bold text-[#8A5C00] underline"
                  >
                    Notifications & templates
                  </Link>
                </div>
              </Panel>

              <Panel title="Templates">
                <nav aria-label="Audience" className="mb-3 flex flex-wrap gap-1.5">
                  {[null, ...AUDIENCES].map((a) => (
                    <Link
                      key={a ?? 'all'}
                      href={href({ audience: a, page: null })}
                      scroll={false}
                      aria-current={audience === a ? 'page' : undefined}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[0.8125rem] font-bold',
                        audience === a
                          ? 'border-[#F5A623] bg-[#FFF4D6] text-[#8A5C00]'
                          : 'border-border',
                      )}
                    >
                      {a ? label(AUDIENCE_LABEL, a) : 'All Audiences'}
                    </Link>
                  ))}
                </nav>
                <FilterRow>
                  <DashSearch
                    label="Search templates"
                    placeholder="Search templates (e.g. booking, check-in, payment)…"
                    value={sp.q ?? ''}
                  />
                  <DashSelect
                    label="Channel"
                    param="channel"
                    value={channel ?? 'all'}
                    options={Object.entries(CHANNEL_LABEL)
                      .filter(([c]) => c !== 'console')
                      .map(([value, text]) => ({ value, label: text }))}
                  />
                  <DashSelect
                    label="Status"
                    param="status"
                    value={status ?? 'all'}
                    options={Object.entries(TEMPLATE_STATUS_LABEL).map(([value, text]) => ({
                      value,
                      label: text,
                    }))}
                  />
                </FilterRow>
                <DataTable
                  caption="Templates"
                  isEmpty={rows.length === 0}
                  empty="No templates match. Add one with New Template."
                  head={[
                    'Template Name',
                    'Audience',
                    'Channel(s)',
                    'Trigger / Event',
                    'Status',
                    'Last Updated',
                  ]}
                >
                  {rows.map((t) => (
                    <tr key={t.id} className={cn(selected?.id === t.id && 'bg-[#FFFBF0]')}>
                      <td className="font-semibold">
                        <Link
                          href={href({ selected: t.id, page: String(page) })}
                          scroll={false}
                          className="flex items-center gap-2 hover:underline"
                        >
                          <FileText
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-[#E5A800]"
                          />
                          {t.name}
                        </Link>
                      </td>
                      <td>
                        <AudienceChip audience={t.audience} />
                      </td>
                      <td>
                        <ChannelIcons channels={t.channels} />
                      </td>
                      <td>{t.trigger_label ?? '—'}</td>
                      <td>
                        <Chip status={t.status} text={label(TEMPLATE_STATUS_LABEL, t.status)} />
                      </td>
                      <td className="whitespace-nowrap">{dayOnly(t.updated_at)}</td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PER}
                  total={asNumber(o.total)}
                  noun="templates"
                  href={(p) => href({ page: String(p) })}
                />
              </Panel>

              <Panel
                title={selected ? 'Edit Template' : 'New Template'}
                icon={FilePen}
                aside={
                  <Link
                    href={href({ selected: 'new' })}
                    scroll={false}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#FFD24D] to-[#F5B400] px-3 py-2 text-[0.8125rem] font-bold text-[#1A1A1A]"
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" /> New Template
                  </Link>
                }
              >
                <TemplateEditor
                  key={selected?.id ?? 'new'}
                  template={selected}
                  canEdit={canEdit}
                  newHref={href({ selected: null })}
                />
                <Footnote>
                  Test Send goes to the address you type, marked [Test]; nobody else gets it.
                </Footnote>
              </Panel>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
