import {
  ArrowDown,
  Bell,
  CalendarClock,
  Filter,
  Mail,
  MessageCircle,
  MessageSquareText,
  Power,
  RotateCcw,
  Workflow,
  Zap,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { WorkflowEditor, WorkflowSwitch, type WorkflowRow } from '@/components/comms/client';
import {
  AudienceChip,
  ChannelIcons,
  Chip,
  CommsHeader,
  CommsTabs,
  DataTable,
  Empty,
  ErrorNote,
  Footnote,
  Panel,
  WaitingForDatabase,
} from '@/components/comms/module';
import { ConsoleShell } from '@/components/console-shell';
import { DashCanvas, DashKpi, DashKpiGrid } from '@/components/portal/dash';
import { cn } from '@nexg/ui';
import { asObject, CHANNEL_LABEL, commsHref, label, n, rowsOf, UUID, when } from '@/lib/comms';
import { commsContext } from '@/lib/comms-server';

export const metadata: Metadata = { title: 'Communications · Automated Workflows' };
export const dynamic = 'force-dynamic';

interface Custom extends WorkflowRow {
  template_name: string;
  follow_up_template_name: string | null;
  fired_count: number;
  last_fired_at: string | null;
  audience: string;
}

const STEP_ICON = {
  email: Mail,
  sms: MessageSquareText,
  whatsapp: MessageCircle,
  in_app: Bell,
} as const;

function minutesText(m: number | null | undefined): string {
  if (!m) return 'straight away';
  if (m < 60) return `after ${m} min`;
  if (m < 1440) return `after ${Math.round(m / 60)} h`;
  return `after ${Math.round(m / 1440)} day(s)`;
}

/**
 * Automated Workflows: the custom "when this happens, send that" rules
 * staff build here, with the builder drawn as in the System overview design
 * (trigger → condition → send → follow-up), and the automations NexG already
 * runs: the bell emails and the app email groups, each with its switch.
 */
export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; selected?: string };
}) {
  const ctx = await commsContext(searchParams);
  const { period } = ctx;
  const q = await ctx.read('rpc_comms_workflows', {});
  const o = asObject(q.data);
  const custom = rowsOf<Custom>(o.custom);
  const system = rowsOf<{ kind: string; note: string | null; enabled: boolean; sent_30d: number }>(
    o.system,
  );
  const groups = rowsOf<{
    key: string;
    label: string;
    description: string | null;
    enabled: boolean;
  }>(o.groups);
  const kinds = rowsOf<string>(o.kinds);
  const templates = rowsOf<{ id: string; name: string; channels: string[]; purpose: string }>(
    o.templates,
  );
  const canEdit = o.level === 'full' || o.level === 'limited';
  const sel =
    searchParams?.selected && UUID.test(searchParams.selected) ? searchParams.selected : null;
  const chosen = custom.find((w) => w.id === sel) ?? custom[0] ?? null;
  const href = (extra: Record<string, string | null> = {}) =>
    commsHref('/communications/workflows', period, extra);

  return (
    <ConsoleShell staff={ctx.staff}>
      <CommsHeader
        screen="Automated Workflows"
        subtitle="Event-based messages: when something happens in NexG, send the right message to the right person."
        period={period}
        noPeriod
        action={
          canEdit ? (
            <WorkflowEditor
              workflow={null}
              kinds={kinds}
              templates={templates}
              canEdit={canEdit}
              trigger="create"
            />
          ) : undefined
        }
      />
      <DashCanvas>
        <CommsTabs active="workflows" period={period} />
        {q.waiting ? (
          <WaitingForDatabase />
        ) : q.error ? (
          <ErrorNote message={q.error} />
        ) : (
          <>
            <DashKpiGrid>
              <DashKpi
                featured
                icon={Workflow}
                label="Custom Workflows"
                value={n(custom.length)}
                explain="Workflows built here."
              />
              <DashKpi
                icon={Power}
                iconTone="green"
                label="Switched On"
                value={n(custom.filter((w) => w.enabled).length)}
                explain="Custom workflows that fire when their event happens."
              />
              <DashKpi
                icon={Zap}
                label="Times Fired"
                value={n(custom.reduce((s, w) => s + (w.fired_count ?? 0), 0))}
                explain="How many events the custom workflows have answered, all time."
              />
              <DashKpi
                icon={Mail}
                label="NexG Emails On"
                value={`${n(system.filter((s) => s.enabled).length)} / ${n(system.length)}`}
                explain="Built-in emails that follow a bell (order confirmed, rider approved…)."
              />
              <DashKpi
                icon={CalendarClock}
                label="App Email Groups On"
                value={`${n(groups.filter((g) => g.enabled).length)} / ${n(groups.length)}`}
                explain="The NexG and NexG Stays app emails, switched on by group."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Panel
                title="Automated Workflows"
                note="Set up and manage message automations across the platform."
                icon={Workflow}
              >
                <DataTable
                  caption="Custom workflows"
                  isEmpty={custom.length === 0}
                  empty={
                    templates.length === 0
                      ? 'No workflows yet. Add an active template first, then Create Workflow.'
                      : 'No workflows yet. Create Workflow adds one.'
                  }
                  head={['Workflow', 'Audience', 'Trigger', 'Channels', 'Fired', 'Status', '']}
                >
                  {custom.map((w) => (
                    <tr key={w.id} className={cn(chosen?.id === w.id && 'bg-[#FFFBF0]')}>
                      <td className="font-semibold">
                        <Link
                          href={href({ selected: w.id })}
                          scroll={false}
                          className="hover:underline"
                        >
                          {w.name}
                        </Link>
                      </td>
                      <td>
                        <AudienceChip audience={w.audience} plural />
                      </td>
                      <td className="max-w-[12rem] truncate">{w.trigger_kind}</td>
                      <td>
                        <ChannelIcons channels={w.channels} />
                      </td>
                      <td className="tabular-nums">{n(w.fired_count)}</td>
                      <td>
                        <span className="flex items-center gap-2">
                          <Chip
                            status={w.enabled ? 'active' : 'paused'}
                            text={w.enabled ? 'Active' : 'Off'}
                          />
                          <WorkflowSwitch
                            id={`wf:${w.id}`}
                            enabled={w.enabled}
                            name={w.name}
                            canEdit={canEdit}
                          />
                        </span>
                      </td>
                      <td>
                        <WorkflowEditor
                          workflow={w}
                          kinds={kinds}
                          templates={templates}
                          canEdit={canEdit}
                          trigger="edit"
                        />
                      </td>
                    </tr>
                  ))}
                </DataTable>
                <Footnote>
                  A workflow answers a NexG event (the same events that ring a person’s bell) and
                  sends to that person. Marketing templates only reach people who said yes;
                  suppressed addresses are skipped.
                </Footnote>
              </Panel>

              <Panel
                title="Automated Workflow Builder"
                icon={Workflow}
                aside={
                  chosen ? (
                    <Chip
                      status={chosen.enabled ? 'active' : 'paused'}
                      text={chosen.enabled ? 'Active' : 'Off'}
                    />
                  ) : undefined
                }
              >
                {chosen ? (
                  <div className="space-y-2">
                    <p className="text-[1rem] font-extrabold">{chosen.name}</p>
                    <Step
                      icon={Zap}
                      title="Trigger"
                      text={`When “${chosen.trigger_kind}” happens`}
                    />
                    <Arrow />
                    <Step
                      icon={Filter}
                      title="Condition"
                      text={
                        chosen.condition === 'marketing_consent'
                          ? 'Only if they said yes to marketing'
                          : 'Always (a service message), unless they turned the channel off'
                      }
                    />
                    <Arrow />
                    <div
                      className={cn('grid gap-2', chosen.channels.length > 1 && 'sm:grid-cols-2')}
                    >
                      {chosen.channels.map((c) => {
                        const Icon = STEP_ICON[c as keyof typeof STEP_ICON] ?? Mail;
                        return (
                          <Step
                            key={c}
                            icon={Icon}
                            title={`Send ${label(CHANNEL_LABEL, c)}`}
                            text={`${chosen.template_name}, ${minutesText(chosen.delay_minutes)}`}
                          />
                        );
                      })}
                    </div>
                    <Arrow />
                    <Step
                      icon={RotateCcw}
                      title="Follow-up Rule"
                      text={
                        chosen.follow_up_template_name
                          ? `Then send “${chosen.follow_up_template_name}” ${minutesText((chosen.delay_minutes ?? 0) + (chosen.follow_up_after_minutes ?? 0))}`
                          : 'No follow-up'
                      }
                    />
                    <p className="text-muted pt-2 text-[0.8125rem] font-semibold">
                      Last fired {when(chosen.last_fired_at)} · {n(chosen.fired_count)} times in all
                    </p>
                  </div>
                ) : (
                  <Empty>Create a workflow to see its steps here.</Empty>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel
                title="NexG Emails (built in)"
                note="An email that follows a bell. Switching one off stops that email only; the bell still rings."
                icon={Mail}
              >
                <DataTable
                  caption="Built-in emails"
                  isEmpty={system.length === 0}
                  empty="None."
                  head={['Email', 'Event', 'Sent (30 days)', 'On']}
                >
                  {system.map((s) => (
                    <tr key={s.kind}>
                      <td className="font-semibold">{s.note ?? s.kind}</td>
                      <td className="text-muted">{s.kind}</td>
                      <td className="tabular-nums">{n(s.sent_30d)}</td>
                      <td>
                        <WorkflowSwitch
                          id={`kind:${s.kind}`}
                          enabled={s.enabled}
                          name={s.note ?? s.kind}
                          canEdit={canEdit}
                        />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </Panel>
              <Panel
                title="App Email Groups"
                note="The NexG and NexG Stays app emails. On, a group replaces the plain emails it covers."
                icon={Bell}
              >
                {groups.length === 0 ? (
                  <Empty>The app emails are not on this database.</Empty>
                ) : (
                  <ul className="divide-border divide-y">
                    {groups.map((g) => (
                      <li key={g.key} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block font-bold">{g.label}</span>
                          <span className="text-muted block text-[0.8125rem] font-semibold">
                            {g.description}
                          </span>
                        </span>
                        <WorkflowSwitch
                          id={`group:${g.key}`}
                          enabled={g.enabled}
                          name={g.label}
                          canEdit={canEdit}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}

function Step({ icon: Icon, title, text }: { icon: typeof Zap; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] p-3">
      <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#B57A00]" />
      <span className="min-w-0">
        <span className="block font-extrabold">{title}</span>
        <span className="text-muted block text-[0.8125rem] font-semibold">{text}</span>
      </span>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center">
      <ArrowDown aria-hidden="true" className="h-4 w-4 text-[#B57A00]" />
    </div>
  );
}
