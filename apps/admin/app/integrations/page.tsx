import {
  AlertTriangle,
  BarChart3,
  BellRing,
  CalendarSync,
  CheckCircle2,
  Clock,
  Code2,
  CreditCard,
  FileText,
  KeyRound,
  Landmark,
  Link2,
  Mail,
  MapPin,
  MessageSquare,
  PlugZap,
  RefreshCw,
  Smartphone,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ShareDonut } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import {
  CardLink,
  DashCanvas,
  DashCard,
  DashHeader,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
} from '@/components/portal/dash';
import { Chip, Empty, ErrorNote, Footnote } from '@/components/stays/module';
import { asNumber, asObject, isMissingFunction, n, oneOf, when } from '@/lib/stays-module';
import { requireModule, requireStaff } from '@/lib/staff';
import { GA_ENV_NAME, webAnalyticsStatus } from '@/lib/web-analytics';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

type State = 'connected' | 'setup' | 'not_connected';
type Category = 'payments' | 'communication' | 'operations' | 'maps' | 'developers' | 'analytics';

interface Integration {
  key: string;
  name: string;
  blurb: string;
  icon: LucideIcon;
  category: Category;
  state: State;
  detail: string;
  manage: string;
}

const TABS: { key: 'all' | Category; label: string }[] = [
  { key: 'all', label: 'All Integrations' },
  { key: 'payments', label: 'Payments' },
  { key: 'communication', label: 'Communication' },
  { key: 'operations', label: 'Operations' },
  { key: 'maps', label: 'Maps & Location' },
  { key: 'developers', label: 'Webhooks & API' },
  { key: 'analytics', label: 'Analytics' },
];

const CATEGORY_TITLE: Record<Category, string> = {
  payments: 'Payments & Payouts',
  communication: 'Customer & Marketing',
  operations: 'Operations & Business Tools',
  maps: 'Maps & Location',
  developers: 'Webhooks & API',
  analytics: 'Analytics',
};

const STATE_CHIP: Record<State, { status: string; text: string }> = {
  connected: { status: 'resolved', text: 'Connected' },
  setup: { status: 'pending', text: 'Setup' },
  not_connected: { status: 'closed', text: 'Not connected' },
};

/** Working when it did its job this week; set up when it exists but is quiet or failing. */
function stateOf(lastAt: unknown, recent: number, failing = 0): State {
  if (recent > 0 && failing === 0) return 'connected';
  if (lastAt || recent > 0 || failing > 0) return 'setup';
  return 'not_connected';
}

/**
 * Integrations: the third-party services NexG actually runs on, and whether
 * each has done its job in the last seven days, from the payments,
 * notification, calendar and webhook records (rpc_console_integrations_health).
 * Services in the designs that NexG does not use (Zoho, Twilio, Airtable,
 * Meta Ads…) are not listed as connected; they are not wired.
 */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'settings');
  const tab = oneOf(
    TABS.map((t) => t.key),
    searchParams?.tab,
    'all',
  );
  const db = createClient() as unknown as {
    rpc: (
      fn: string,
    ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
  };
  const { data, error } = await db.rpc('rpc_console_integrations_health');
  const waiting = isMissingFunction(error);
  const o = asObject(data);
  const g = (k: string) => asObject(o[k]);
  const mapsKey = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const analytics = await webAnalyticsStatus();

  const list: Integration[] = [
    {
      key: 'paystack',
      name: 'Paystack',
      blurb: 'Card and online payments, split payouts and settlements.',
      icon: CreditCard,
      category: 'payments',
      state: stateOf(g('paystack').last_at, asNumber(g('paystack').paid_7d), 0),
      detail: `${n(asNumber(g('paystack').paid_7d))} paid this week · ${n(asNumber(g('paystack').subaccounts))} sub-accounts`,
      manage: '/finance/payout-rules',
    },
    {
      key: 'mpesa',
      name: 'M-PESA Daraja',
      blurb: 'Mobile money payments (STK) and B2C payouts.',
      icon: Smartphone,
      category: 'payments',
      state: stateOf(
        g('mpesa').last_at,
        asNumber(g('mpesa').paid_7d) + asNumber(g('mpesa').payouts_7d),
        0,
      ),
      detail: `${n(asNumber(g('mpesa').paid_7d))} paid · ${n(asNumber(g('mpesa').payouts_7d))} payouts this week`,
      manage: '/settings?tab=payments',
    },
    {
      key: 'bank',
      name: 'Bank Transfer',
      blurb: 'Transfers to hosts and merchants through Paystack.',
      icon: Landmark,
      category: 'payments',
      state: stateOf(g('bank').last_at, asNumber(g('bank').sent_7d), asNumber(g('bank').failed_7d)),
      detail: `${n(asNumber(g('bank').sent_7d))} sent · ${n(asNumber(g('bank').failed_7d))} failed this week`,
      manage: '/finance/settlements',
    },
    {
      key: 'email',
      name: 'Email (Resend)',
      blurb: 'Receipts, notices and campaigns in the house design.',
      icon: Mail,
      category: 'communication',
      state: stateOf(
        g('email').last_at,
        asNumber(g('email').sent_7d),
        asNumber(g('email').failed_7d),
      ),
      detail: `${n(asNumber(g('email').sent_7d))} sent · ${n(asNumber(g('email').queued))} waiting to send`,
      manage: '/settings?tab=notifications',
    },
    {
      key: 'sms',
      name: 'SMS',
      blurb: 'Text messages to guests, riders and hosts.',
      icon: MessageSquare,
      category: 'communication',
      state: stateOf(g('sms').last_at, asNumber(g('sms').sent_7d)),
      detail: `${n(asNumber(g('sms').sent_7d))} sent this week`,
      manage: '/settings?tab=notifications',
    },
    {
      key: 'push',
      name: 'Push notifications',
      blurb: 'Browser and app push to signed-in people.',
      icon: BellRing,
      category: 'communication',
      state: stateOf(g('push').last_at, asNumber(g('push').sent_7d)),
      detail: `${n(asNumber(g('push').sent_7d))} sent this week`,
      manage: '/settings?tab=notifications',
    },
    {
      key: 'calendar',
      name: 'Calendar sync (Airbnb, Booking.com, iCal)',
      blurb: "Hosts' outside calendars kept in step with NexG.",
      icon: CalendarSync,
      category: 'operations',
      state: stateOf(
        g('calendar').last_at,
        asNumber(g('calendar').ok),
        asNumber(g('calendar').failing),
      ),
      detail: `${n(asNumber(g('calendar').ok))} working · ${n(asNumber(g('calendar').failing))} failing`,
      manage: '/stays/configuration',
    },
    {
      key: 'connectors',
      name: 'Merchant system connectors',
      blurb: "Products, prices and stock from merchants' own systems.",
      icon: PlugZap,
      category: 'operations',
      state: stateOf(g('connectors').last_at, asNumber(g('connectors').delivered_7d)),
      detail: `${n(asNumber(g('connectors').delivered_7d))} delivered this week`,
      manage: '/settings?tab=api',
    },
    {
      key: 'maps',
      name: 'Google Maps & Places',
      blurb: 'Search, maps, locations, routes and place details.',
      icon: MapPin,
      category: 'maps',
      state: mapsKey ? 'connected' : 'not_connected',
      detail: mapsKey ? 'A key is set for the console' : 'No key set for the console',
      manage: '/settings?tab=api',
    },
    {
      key: 'webhooks',
      name: 'Webhooks',
      blurb: 'Real-time events to partners’ own systems.',
      icon: Link2,
      category: 'developers',
      state: stateOf(
        g('webhooks').last_at,
        asNumber(g('webhooks').delivered_7d),
        asNumber(g('webhooks').failing),
      ),
      detail: `${n(asNumber(g('webhooks').endpoints))} endpoints · ${n(asNumber(g('webhooks').failing))} failing`,
      manage: '/settings?tab=api',
    },
    {
      key: 'api',
      name: 'NexG API',
      blurb: 'Partner API keys for orders and catalogues.',
      icon: KeyRound,
      category: 'developers',
      state: stateOf(g('api').last_at, asNumber(g('api').keys) > 0 && g('api').last_at ? 1 : 0),
      detail: `${n(asNumber(g('api').keys))} active keys · last used ${when(g('api').last_at as string | null)}`,
      manage: '/settings?tab=api',
    },
    {
      key: 'analytics',
      name: 'Google Analytics 4',
      blurb: 'Visits, stay views, checkouts and paid stays on nexgapp.com, with visitor consent.',
      icon: BarChart3,
      category: 'analytics',
      state:
        analytics.kind === 'configured'
          ? 'connected'
          : analytics.kind === 'missing'
            ? 'not_connected'
            : 'setup',
      detail:
        analytics.kind === 'configured'
          ? `Measurement ID ${analytics.measurementId} is set on the web project; it loads only for visitors who allow analytics`
          : analytics.kind === 'missing'
            ? `Set ${GA_ENV_NAME} on the nexg web project in Vercel`
            : analytics.kind === 'invalid'
              ? `${GA_ENV_NAME} on the web project is not a G-… measurement ID, so the site ignores it`
              : analytics.reason === 'not_deployed'
                ? `The live site does not answer this check yet; set ${GA_ENV_NAME} on the nexg web project in Vercel and redeploy`
                : `Could not ask the live site (${analytics.reason}); check ${GA_ENV_NAME} on the nexg web project in Vercel`,
      manage: 'https://analytics.google.com/',
    },
  ];

  const shown = tab === 'all' ? list : list.filter((i) => i.category === tab);
  const connected = list.filter((i) => i.state === 'connected').length;
  const setup = list.filter((i) => i.state === 'setup').length;
  const none = list.filter((i) => i.state === 'not_connected').length;
  const activity = (Array.isArray(o.activity) ? o.activity : []) as {
    service: string;
    outcome: string;
    what: string;
    at: string;
  }[];
  const categories = [...new Set(shown.map((i) => i.category))];

  return (
    <ConsoleShell staff={staff}>
      <DashHeader
        title="Integrations"
        subtitle="The third-party services NexG runs on, and whether each is working."
      />
      <DashCanvas>
        {waiting ? (
          <DashCard>
            <Empty>Waiting for a database update; this page fills in once it is applied.</Empty>
          </DashCard>
        ) : error ? (
          <ErrorNote message={error.message} />
        ) : (
          <>
            <DashCard>
              <GoldTabs
                label="Integration category"
                active={tab}
                tabs={TABS.map((t) => ({
                  key: t.key,
                  label: t.label,
                  href: t.key === 'all' ? '/integrations' : `/integrations?tab=${t.key}`,
                }))}
              />
            </DashCard>
            <DashKpiGrid className="xl:grid-cols-4">
              <DashKpi
                featured
                icon={Link2}
                label="Total Integrations"
                value={n(list.length)}
                explain="Services NexG is built on."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Connected"
                value={n(connected)}
                explain="Did their job in the last seven days."
              />
              <DashKpi
                icon={Clock}
                label="Setup in Progress"
                value={n(setup)}
                explain="Set up but quiet this week, or failing."
              />
              <DashKpi
                icon={XCircle}
                iconTone="red"
                label="Not Connected"
                value={n(none)}
                explain="Never used."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <div className="grid min-w-0 content-start gap-4">
                {categories.map((c) => (
                  <DashCard key={c} title={CATEGORY_TITLE[c]}>
                    <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      {shown
                        .filter((i) => i.category === c)
                        .map((i) => (
                          <li
                            key={i.key}
                            className="border-border flex flex-col rounded-xl border p-3"
                          >
                            <span className="flex items-start gap-3">
                              <i.icon
                                aria-hidden="true"
                                className="h-8 w-8 shrink-0 text-[#E5A800]"
                                strokeWidth={1.6}
                              />
                              <span className="min-w-0">
                                <span className="block font-extrabold">{i.name}</span>
                                <span className="text-muted block text-[0.8125rem] font-semibold">
                                  {i.blurb}
                                </span>
                              </span>
                            </span>
                            <span className="text-muted mt-2 text-[0.8125rem] font-semibold">
                              {i.detail}
                            </span>
                            <span className="mt-3 flex items-center justify-between gap-2">
                              <Chip
                                status={STATE_CHIP[i.state].status}
                                text={STATE_CHIP[i.state].text}
                              />
                              <Link
                                href={i.manage}
                                className="border-border rounded-lg border px-3 py-1.5 text-[0.8125rem] font-bold"
                              >
                                Manage
                              </Link>
                            </span>
                          </li>
                        ))}
                    </ul>
                  </DashCard>
                ))}
              </div>
              <div className="grid content-start gap-4">
                <DashCard title="Integration Health">
                  <ShareDonut
                    centre={`${Math.round((100 * connected) / Math.max(1, list.length))}%`}
                    caption="Connected"
                    data={[
                      {
                        key: 'c',
                        label: `Connected (${connected})`,
                        value: connected,
                        color: '#1E9E45',
                      },
                      {
                        key: 's',
                        label: `Setup in Progress (${setup})`,
                        value: setup,
                        color: '#F5B400',
                      },
                      { key: 'n', label: `Not Connected (${none})`, value: none, color: '#C9C4B8' },
                    ]}
                  />
                </DashCard>
                <DashCard
                  title="Recent Integration Activity"
                  aside={<CardLink href="/audit">View All</CardLink>}
                >
                  {activity.length === 0 ? (
                    <Empty>No activity recorded yet.</Empty>
                  ) : (
                    <ul className="space-y-2.5">
                      {activity.map((a, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-3 text-[0.875rem]"
                        >
                          <span className="flex items-center gap-2 font-semibold">
                            {a.outcome === 'ok' ? (
                              <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-[#1E9E45]" />
                            ) : a.outcome === 'failed' ? (
                              <AlertTriangle
                                aria-hidden="true"
                                className="h-4 w-4 text-[#D63A2F]"
                              />
                            ) : (
                              <RefreshCw aria-hidden="true" className="h-4 w-4 text-[#B57A00]" />
                            )}
                            {a.what}
                          </span>
                          <span className="text-muted whitespace-nowrap text-[0.8125rem]">
                            {when(a.at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </DashCard>
                <DashCard title="Quick Actions">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['View Logs', '/audit', FileText],
                      ['API Keys', '/settings?tab=api', KeyRound],
                      ['Webhooks', '/settings?tab=api', Link2],
                      [
                        'Developer Docs',
                        `${(process.env.NEXT_PUBLIC_API_ORIGIN ?? 'https://api.nexgapp.com').replace(/\/$/, '')}/docs`,
                        Code2,
                      ],
                    ].map(([t, h, Icon]) => {
                      const I = Icon as LucideIcon;
                      return (
                        <a
                          key={String(t)}
                          href={String(h)}
                          className="flex flex-col items-center gap-1 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] p-3 text-[0.8125rem] font-bold text-[#8A5C00]"
                        >
                          <I aria-hidden="true" className="h-6 w-6" />
                          {String(t)}
                        </a>
                      );
                    })}
                  </div>
                  <Footnote>Keys and secrets are never shown here.</Footnote>
                </DashCard>
              </div>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
