import {
  Bell,
  BellRing,
  CheckCircle2,
  Eye,
  Layers,
  Rocket,
  Send,
  Settings2,
  Smartphone,
  TriangleAlert,
  Users,
  Workflow,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut } from '@/components/charts';
import { TestSendForm, WorkflowSwitch } from '@/components/comms/client';
import {
  AudienceChip,
  Chip,
  CommsHeader,
  CommsTabs,
  DataTable,
  Empty,
  ErrorNote,
  Footnote,
  KeyValues,
  LegendRow,
  Panel,
  ProviderRow,
  WaitingForDatabase,
} from '@/components/comms/module';
import { ConsoleShell } from '@/components/console-shell';
import { CardLink, DashCanvas, DashKpi, DashKpiGrid } from '@/components/portal/dash';
import {
  asNumber,
  asObject,
  asStatus,
  commsHref,
  countsOf,
  n,
  rate,
  rowsOf,
  when,
} from '@/lib/comms';
import { commsContext } from '@/lib/comms-server';

export const metadata: Metadata = { title: 'Communications · Push Notifications' };
export const dynamic = 'force-dynamic';

/* What the phone apps push on their own (20270120000100_native_push), fixed per stage in the sender. */
const NATIVE_FLOWS: { name: string; audience: string; trigger: string }[] = [
  { name: 'Booking Confirmation', audience: 'guests', trigger: 'Booking or stay confirmed' },
  { name: 'Check-in Reminder', audience: 'guests', trigger: '24 hrs before check-in' },
  { name: 'Order Progress (live)', audience: 'guests', trigger: 'Order stage changes' },
  { name: 'New Order Offer', audience: 'riders', trigger: 'Delivery offered to a rider' },
  { name: 'Payout Processed', audience: 'riders', trigger: 'Payout approved or paid' },
  { name: 'Support Reply', audience: 'guests', trigger: 'Staff answer a ticket' },
];

/**
 * Push Notifications: the NexG bell (in-app), browser push (VAPID) and the
 * phone apps (native push, when that migration is on the database), what
 * was rung and read in the period, the automations that push, and a test
 * to your own bell.
 */
export default async function PushPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string };
}) {
  const ctx = await commsContext(searchParams);
  const { period } = ctx;
  const q = await ctx.read('rpc_comms_channel', {
    p_channel: 'push',
    p_from: period.from,
    p_to: period.to,
  });
  const o = asObject(q.data);
  const push = asObject(o.push);
  const ch = asObject(o.channels);
  const web = asStatus(ch.web_push);
  const native = asObject(ch.native_push);
  const nativeState = asStatus(native);
  const canEdit = o.level === 'full' || o.level === 'limited';
  const bells = asNumber(push.bells_period);
  const read = asNumber(push.read_period);
  const pushed = asNumber(push.pushed_period);
  const reached = asNumber(push.reached_period);
  const subs = countsOf(push.subscriptions);
  const subTotal = Object.values(subs).reduce((s, v) => s + v, 0);
  const apps = countsOf(native.by_app);
  const kinds = rowsOf<{ kind: string; n: number }>(push.kinds);
  const workflows = rowsOf<{
    id: string;
    name: string;
    trigger: string;
    enabled: boolean;
    fired: number;
  }>(o.workflows);
  const nativeFailed = asNumber(native.failed_30d);

  return (
    <ConsoleShell staff={ctx.staff}>
      <CommsHeader
        screen="Push Notifications"
        subtitle="Configure, automate and monitor push notifications for customers, hosts, riders and merchants."
        period={period}
      />
      <DashCanvas>
        <CommsTabs active="push" period={period} />
        {q.waiting ? (
          <WaitingForDatabase />
        ) : q.error ? (
          <ErrorNote message={q.error} />
        ) : (
          <>
            <DashKpiGrid>
              <DashKpi
                featured
                icon={Send}
                label="Notifications Sent"
                value={n(bells)}
                explain="Bells rung in the period: every in-app notification, which is also pushed to browsers that allowed it."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Pushed"
                value={n(pushed)}
                explain="Handed to the browser push service (people who allowed notifications)."
              >
                <span className="text-success text-[0.9375rem] font-extrabold">
                  {rate(pushed, bells)}
                </span>
              </DashKpi>
              <DashKpi
                icon={Eye}
                label="Opened"
                value={n(read)}
                explain="Bells the person opened or marked read."
              >
                <span className="text-muted text-[0.875rem] font-semibold">
                  {rate(read, bells)}
                </span>
              </DashKpi>
              <DashKpi
                icon={Users}
                label="Unique Users Reached"
                value={n(reached)}
                explain="Different accounts with at least one bell in the period."
              />
              <DashKpi
                icon={TriangleAlert}
                iconTone="red"
                label="Phone Push Failed (30 days)"
                value={native.installed ? n(nativeFailed) : '—'}
                upIsBad
                explain="Phone pushes that failed or whose device was gone, in the last 30 days. A dash until native push is on the database."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.85fr)]">
              <Panel
                title="Push Provider & Apps"
                note="Push services for the NexG apps."
                icon={Rocket}
              >
                <ul className="space-y-2">
                  <ProviderRow
                    provider="vapid"
                    name="Web Push (VAPID)"
                    note={`Browsers on nexgapp.com and the portals · ${n(subTotal)} subscribed`}
                    state={web.status}
                  />
                  <ProviderRow
                    provider="fcm"
                    needs="native"
                    name="Firebase Cloud Messaging (FCM) & APNs"
                    note={
                      native.installed
                        ? `Phone apps · ${n(asNumber(native.installations))} installs (${
                            Object.entries(apps)
                              .map(([a, v]) => `${a} ${v}`)
                              .join(', ') || 'none yet'
                          })`
                        : 'Phone apps (NexG, NexG Stays, Rider)'
                    }
                    state={nativeState.status}
                    extra={
                      !native.installed ? (
                        <p className="text-muted mt-2 text-[0.8125rem]">
                          The native push migration (20270120000100) is not on this database yet.
                        </p>
                      ) : null
                    }
                  />
                </ul>
              </Panel>

              <Panel title="Audience Targeting" note="Who can receive a push." icon={Users}>
                <KeyValues
                  rows={[
                    ['Browsers subscribed', n(subTotal)],
                    ...Object.entries(subs).map(([s, v]) => [`· ${s}`, n(v)] as [string, string]),
                    [
                      'Phone app installs',
                      native.installed ? n(asNumber(native.installations)) : '—',
                    ],
                  ]}
                />
                <div className="mt-3">
                  <CardLink href={commsHref('/communications/bulk', period)}>
                    Send a push to an audience
                  </CardLink>
                </div>
              </Panel>

              <Panel
                title="Notification Preview"
                note="Send one to your own bell."
                icon={Smartphone}
              >
                <div className="mx-auto max-w-[16rem] rounded-[2rem] bg-gradient-to-b from-[#3B2A10] to-[#E5A800] p-3 shadow-lg">
                  <p className="pt-4 text-center text-[2.25rem] font-extrabold text-white">
                    {new Date().toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Africa/Nairobi',
                    })}
                  </p>
                  <div className="mt-6 rounded-2xl bg-white/90 p-3 text-[0.8125rem]">
                    <p className="font-extrabold">NEXG · now</p>
                    <p className="font-bold">Your stay is confirmed!</p>
                    <p className="text-muted">View details in the NexG app.</p>
                  </div>
                </div>
                <div className="mt-3">
                  <TestSendForm channel="in_app" canEdit={canEdit} cta="Send a test to my bell" />
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel
                title="Push Notification Setup"
                note="How push behaves today."
                icon={Settings2}
              >
                <KeyValues
                  rows={[
                    ['In-app notification centre (the bell)', 'On, every app and portal'],
                    [
                      'Browser push',
                      web.status === 'connected'
                        ? `On · last ${when(web.last_sent_at)}`
                        : 'Waiting for VAPID keys',
                    ],
                    [
                      'Phone push',
                      native.installed
                        ? nativeState.status === 'connected'
                          ? `On · last ${when(native.last_sent_at as string)}`
                          : 'Installed, not sending yet'
                        : 'Not installed',
                    ],
                    ['What a push never carries', 'Codes, addresses, prices or names'],
                  ]}
                />
                <Footnote>
                  Customers choose which kinds of alerts they get in their app settings;
                  transactional alerts always go.
                </Footnote>
              </Panel>
              <Panel
                title="Default Notification Types"
                note="What rang the bell in the period, most first."
                icon={Layers}
              >
                {kinds.length === 0 ? (
                  <Empty>No bells in this period.</Empty>
                ) : (
                  <ul className="divide-border divide-y">
                    {kinds.map((k) => (
                      <li key={k.kind} className="flex items-center justify-between gap-3 py-2">
                        <span className="flex items-center gap-2 font-semibold">
                          <Bell aria-hidden="true" className="h-4 w-4 text-[#E5A800]" />
                          {k.kind}
                        </span>
                        <span className="font-extrabold tabular-nums">{n(k.n)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Panel
                title="Automated Push Workflows"
                note="Event-based pushes across NexG."
                icon={Workflow}
                aside={
                  <CardLink href={commsHref('/communications/workflows', period)}>
                    View All
                  </CardLink>
                }
              >
                <DataTable
                  caption="Automated push workflows"
                  isEmpty={false}
                  empty=""
                  head={['Workflow', 'Audience', 'Trigger / Event', 'Status']}
                >
                  {workflows.map((w) => (
                    <tr key={w.id}>
                      <td className="font-semibold">{w.name}</td>
                      <td>Custom</td>
                      <td>{w.trigger}</td>
                      <td>
                        <WorkflowSwitch
                          id={`wf:${w.id}`}
                          enabled={w.enabled}
                          name={w.name}
                          canEdit={canEdit}
                        />
                      </td>
                    </tr>
                  ))}
                  {NATIVE_FLOWS.map((f) => (
                    <tr key={f.name}>
                      <td className="font-semibold">{f.name}</td>
                      <td>
                        <AudienceChip audience={f.audience} plural />
                      </td>
                      <td>{f.trigger}</td>
                      <td>
                        <Chip
                          status={native.installed ? 'active' : 'unknown'}
                          text={
                            native.installed ? 'Active (phone apps)' : 'Waiting for native push'
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </Panel>
              <Panel title="Delivery & Engagement" note="Bells in the period." icon={BellRing}>
                {bells > 0 ? (
                  <>
                    <ShareDonut
                      centre={rate(pushed, bells)}
                      caption="Pushed"
                      data={[
                        { key: 'read', label: 'Opened', value: read, color: '#F5A623' },
                        {
                          key: 'unread',
                          label: 'Not opened',
                          value: Math.max(0, bells - read),
                          color: '#D9D4CA',
                        },
                      ]}
                    />
                    <ul className="mt-3 space-y-1.5">
                      <LegendRow
                        color="#1F9D55"
                        name="Pushed to a browser"
                        value={n(pushed)}
                        share={rate(pushed, bells)}
                      />
                      <LegendRow
                        color="#F5A623"
                        name="Opened"
                        value={n(read)}
                        share={rate(read, bells)}
                      />
                    </ul>
                  </>
                ) : (
                  <Empty>No bells in this period.</Empty>
                )}
              </Panel>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
