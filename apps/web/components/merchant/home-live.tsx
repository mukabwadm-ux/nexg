import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  FileText,
  MapPin,
  Megaphone,
  ShoppingBag,
  ShoppingCart,
  Store,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import type { MerchantHome } from '@/app/merchant/layout';
import { DASH, kes } from './bits';
import { HomePerformance } from './home-performance';
import { HomeSamplePanel, type SamplePanelKind } from './home-sample-panel';
import type {
  DemoPanelContent,
  MerchantOnboardingDemoDashboard,
} from '@/lib/merchant-onboarding-demo-dashboard';
import type { AttentionRow, BranchCard, OrderRow, WeekBar, WeekMoney } from './types';
import { merchantWorkspaceNavigation, type MerchantWorkspaceSection } from './workspace/navigation';

type Unavailable = {
  branches: boolean;
  attention: boolean;
  orders: boolean;
  money: boolean;
  bars: boolean;
};
type PreviewDemo = MerchantOnboardingDemoDashboard;

const panel = 'border-border bg-surface min-w-0 rounded-xl border';
const subtle = 'text-muted text-[12px] leading-snug';
const action =
  'text-gold-text inline-flex items-center gap-1 text-[12px] font-extrabold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

/** Actual account data stays separate from explicitly labelled preview-only examples. */
export function HomeLive({
  m,
  branches,
  attention,
  orders,
  money,
  bars,
  personName,
  unavailable,
  preview = false,
  previewDemo,
  previewState = 'live',
}: {
  m: MerchantHome;
  branches: BranchCard[];
  attention: AttentionRow[];
  orders: OrderRow[];
  money: WeekMoney | null;
  bars: WeekBar[];
  personName: string;
  unavailable: Unavailable;
  preview?: boolean;
  previewDemo?: PreviewDemo;
  previewState?: 'live' | 'paused' | 'mixed' | 'unavailable';
}) {
  const demo = preview ? previewDemo : undefined;
  const destination = (section: string) => {
    if (!preview) return `/merchant/${section}`;
    const sections: Record<string, MerchantWorkspaceSection> = {
      orders: 'Work',
      menu: 'Offerings',
      stores: 'Business',
      money: 'Money',
      analytics: 'Insights',
      featured: 'Promotions',
      settings: 'Settings',
    };
    const href = merchantWorkspaceNavigation.find((item) => item.label === sections[section])?.href;
    const base = href
      ? `${href}${section === 'stores' ? '?tab=locations' : ''}`
      : '/merchant-live-preview';
    return demo?.demoQuery
      ? `${base}${base.includes('?') ? '&' : '?'}${demo.demoQuery.slice(1)}`
      : base;
  };
  const actionable = orders.filter(
    (order) =>
      order.needs_your_ack || order.what_now === 'to_cook' || order.what_now === 'you_are_late',
  );
  const attentionCount = demo
    ? demo.attentionItems.length + attention.length
    : actionable.length + attention.length;
  const stateLabels: Record<string, string> = {
    open: 'Open',
    busy: 'Busy',
    paused: 'Paused',
    closed: 'Closed',
    setting_up: 'Setting up',
  };

  return (
    <main className="mx-auto w-full max-w-[100rem] space-y-2 px-4 py-2.5 sm:px-6 lg:px-7">
      <header>
        <h1 className="text-[22px] font-extrabold leading-tight tracking-tight sm:text-[24px]">
          Good {partOfDay()}, {preview ? m.name : personName}
        </h1>
        <p className="text-muted mt-0.5 text-[12px]">
          Here’s what’s happening across your business today.
        </p>
      </header>

      <section
        aria-label="Business status"
        className={`${panel} grid gap-2 px-4 py-2 sm:grid-cols-3 sm:gap-0`}
      >
        {demo && previewState !== 'unavailable' ? (
          <HomeSamplePanel
            kind="business"
            trigger={
              <button
                type="button"
                className="text-left focus-visible:outline focus-visible:outline-2"
              >
                <Status
                  icon={<FileText />}
                  label="Business"
                  value="Approved"
                  note="Your business is all set up."
                />
              </button>
            }
          />
        ) : (
          <Status
            icon={<FileText />}
            label="Business"
            value={
              demo && previewState === 'unavailable' ? 'Unavailable' : demo ? 'Approved' : 'Live'
            }
            note={
              demo && previewState === 'unavailable'
                ? 'Current status could not be loaded.'
                : demo
                  ? 'Your business is all set up.'
                  : 'Your business is live on NexG.'
            }
          />
        )}
        <Status
          icon={<MapPin />}
          label="Locations"
          value={unavailable.branches ? 'Unavailable' : `${branches.length}${demo ? ' live' : ''}`}
          note={
            unavailable.branches
              ? 'Refresh to try again.'
              : demo
                ? previewState === 'paused'
                  ? 'Both sample locations are paused.'
                  : previewState === 'mixed'
                    ? 'Locations have different statuses.'
                    : `${branches.length} sample locations are open.`
                : 'See each location below.'
          }
          divider
        />
        <Status
          icon={<Store />}
          label={demo ? 'Accepting work' : 'Accepting orders'}
          value={
            demo && previewState === 'unavailable'
              ? 'Unavailable'
              : demo && previewState === 'mixed'
                ? 'Mixed'
                : m.accepting_orders == null
                  ? 'Unavailable'
                  : m.accepting_orders
                    ? demo
                      ? 'Open'
                      : 'On'
                    : demo
                      ? 'Paused'
                      : 'Off'
          }
          note={
            demo
              ? previewState === 'unavailable'
                ? 'Current status could not be loaded.'
                : previewState === 'paused'
                  ? `Not accepting new ${demo.activityLabel.toLowerCase()}.`
                  : previewState === 'mixed'
                    ? 'Check each location below.'
                    : `You’re accepting new ${demo.activityLabel.toLowerCase()}.`
              : 'Location hours and availability may differ.'
          }
          divider
        />
      </section>

      <div className="grid items-start gap-2.5 lg:grid-cols-2">
        <div className="space-y-2.5">
          <section className={`${panel} p-3`}>
            <SectionHead
              icon={<AlertCircle className="text-orange-600" />}
              title="Needs attention"
              subtitle="Keep things running smoothly across your locations."
              href={destination('orders')}
              action={
                demo && previewState !== 'unavailable'
                  ? `View all (${attentionCount})`
                  : 'View orders'
              }
              samplePanel={demo && previewState !== 'unavailable' ? 'attention' : undefined}
              sampleContent={
                demo && previewState !== 'unavailable' ? demo.attentionPanel : undefined
              }
            />
            <div className="border-border divide-border mt-2 divide-y border-t">
              {unavailable.orders ? (
                <UnavailableMessage what={demo?.activityLabel ?? 'Orders'} />
              ) : actionable.length === 0 && !demo ? (
                <p className={`${subtle} py-5`}>
                  No orders in the displayed queue need your attention right now.
                </p>
              ) : demo ? (
                demo.attentionItems.map((item, index) => (
                  <ActionRow
                    key={`${item.title}-${index}`}
                    icon={
                      index === 0 ? (
                        <ShoppingBag />
                      ) : index === 1 ? (
                        <AlertCircle />
                      ) : (
                        <CalendarDays />
                      )
                    }
                    tone={index === 1 ? 'orange' : index === 2 ? 'blue' : 'green'}
                    title={
                      previewState === 'paused' && index === 0
                        ? `Existing ${demo.activitySingular}`
                        : item.title
                    }
                    detail={item.detail}
                    meta={item.meta}
                    href={destination('orders')}
                    button={item.button}
                    samplePanel="order"
                    sampleContent={item.panel}
                  />
                ))
              ) : (
                actionable
                  .slice(0, 4)
                  .map((order) => (
                    <ActionRow
                      key={order.id}
                      icon={<ShoppingBag />}
                      tone="orange"
                      title={
                        order.what_now === 'you_are_late'
                          ? 'Order running late'
                          : 'Order needs attention'
                      }
                      detail={`${order.reference}${order.item_count ? ` · ${order.item_count} items` : ''}${order.store ? ` · ${order.store}` : ''}`}
                      href={destination('orders')}
                      button="View orders"
                    />
                  ))
              )}
              {unavailable.attention ? (
                <UnavailableMessage what="Other alerts" />
              ) : (
                attention.map((item) => (
                  <ActionRow
                    key={item.kind}
                    icon={<AlertCircle />}
                    tone="orange"
                    title={item.title}
                    detail={item.body}
                    href={item.href}
                    button={item.action}
                  />
                ))
              )}
            </div>
          </section>

          <section className={`${panel} p-3`}>
            <SectionHead
              icon={<MapPin />}
              title="Your locations"
              subtitle={
                unavailable.branches
                  ? 'Locations unavailable.'
                  : `${branches.length} ${branches.length === 1 ? 'location' : 'locations'}${demo ? (previewState === 'paused' ? ' · All paused.' : previewState === 'mixed' ? ' · Different statuses.' : ' · All open and accepting work.') : ''}`
              }
              href={destination('stores')}
              action="View locations"
            />
            {unavailable.branches ? (
              <UnavailableMessage what="Locations" />
            ) : branches.length === 0 ? (
              <p className={`${subtle} py-4`}>No locations are available to show.</p>
            ) : (
              <ul className="border-border divide-border mt-2 divide-y border-t">
                {branches.map((branch) => (
                  <li key={branch.branch_id}>
                    {demo ? (
                      <HomeSamplePanel
                        kind="location"
                        location={branch.name}
                        trigger={
                          <button
                            type="button"
                            className="flex min-h-[43px] w-full items-center gap-2 py-1 text-left focus-visible:outline focus-visible:outline-2"
                          >
                            <IconBubble tone="orange">
                              <Store />
                            </IconBubble>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-extrabold">
                                {branch.name || 'Unnamed location'}
                              </span>
                              <span
                                className={`${subtle} block truncate`}
                                title={demo.activitySummary}
                              >
                                {demo.activitySummary}
                              </span>
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${branch.state === 'open' ? 'bg-green-100 text-green-800' : 'bg-bg text-muted'}`}
                            >
                              {stateLabels[branch.state] ?? 'Unavailable'}
                            </span>
                            <span className={`hidden md:inline ${subtle}`}>
                              {branch.state === 'paused'
                                ? 'Not accepting new work'
                                : `Accepting ${demo.activityLabel.toLowerCase()}`}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                          </button>
                        }
                      />
                    ) : (
                      <Link
                        href={destination('stores')}
                        className="flex min-h-[43px] items-center gap-2 py-1 focus-visible:outline focus-visible:outline-2"
                      >
                        <IconBubble tone="orange">
                          <Store />
                        </IconBubble>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-extrabold">
                            {branch.name || 'Unnamed location'}
                          </span>
                          <span className={subtle}>{branch.address_text || 'Address not set'}</span>
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${branch.state === 'open' ? 'bg-green-100 text-green-800' : 'bg-bg text-muted'}`}
                        >
                          {stateLabels[branch.state] ?? 'Unavailable'}
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-2.5">
          <section className={`${panel} p-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[16px] font-extrabold">
                <BarChart3 className="h-5 w-5" aria-hidden="true" /> Today at a glance
              </h2>
              <span className="text-muted text-[11px]">
                {demo ? 'Sample data · Wed, 12 Jun 2024' : 'Business-wide summary'}
              </span>
            </div>
            <div className={`mt-2 grid gap-2 ${demo ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              <Metric
                href={destination('orders')}
                icon={<ShoppingCart />}
                tone="orange"
                label={demo?.activityLabel ?? 'Orders'}
                value={
                  unavailable.orders
                    ? DASH
                    : demo
                      ? String(demo.activityCount)
                      : m.orders_today == null
                        ? DASH
                        : String(m.orders_today)
                }
                samplePanel={demo && !unavailable.orders ? 'orders' : undefined}
                sampleContent={demo && !unavailable.orders ? demo.activityPanel : undefined}
              />
              {demo ? (
                <Metric
                  icon={<CalendarDays />}
                  tone="blue"
                  label={demo.secondaryLabel}
                  value={previewState === 'unavailable' ? DASH : String(demo.secondaryCount)}
                  samplePanel={previewState !== 'unavailable' ? 'bookings' : undefined}
                  sampleContent={previewState !== 'unavailable' ? demo.secondaryPanel : undefined}
                />
              ) : null}
              <Metric
                href={destination('money')}
                icon={<CircleDollarSign />}
                tone="green"
                label={demo?.revenueLabel ?? 'Delivered sales after fees'}
                value={
                  unavailable.money
                    ? DASH
                    : demo
                      ? kes(demo.revenueCents)
                      : kes(m.earned_today_cents)
                }
                samplePanel={demo && !unavailable.money ? 'sales' : undefined}
                sampleContent={demo && !unavailable.money ? demo.revenuePanel : undefined}
              />
            </div>
            <HomePerformance
              bars={bars}
              unavailable={unavailable.bars}
              insightsHref={destination('analytics')}
              workHref={demo ? destination('orders') : undefined}
              demo={demo}
            />
          </section>

          <section className={`${panel} p-3`}>
            <SectionHead
              icon={<ShoppingBag />}
              title="Promotions"
              subtitle={
                demo
                  ? 'Reach more customers with targeted promotions.'
                  : 'Explore featured placements and their terms.'
              }
              href={destination('featured')}
              action={demo ? 'Explore promotions' : 'View featured'}
              samplePanel={demo ? 'promotions' : undefined}
            />
            <div className="bg-gold-soft mt-2 flex flex-wrap items-center gap-2 rounded-lg p-2">
              <IconBubble tone="orange">
                <Megaphone />
              </IconBubble>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-extrabold">
                  {demo ? 'Create a promotion' : 'Featured placements'}
                </p>
                <p className={subtle}>
                  {demo
                    ? 'Get more visibility for your menu, services or special offers.'
                    : 'See available options and their terms.'}
                </p>
              </div>
              {demo ? (
                <HomeSamplePanel
                  kind="promotions"
                  trigger={
                    <button
                      type="button"
                      className="bg-gold text-ink rounded-lg px-3 py-2 text-[12px] font-extrabold focus-visible:outline focus-visible:outline-2"
                    >
                      Explore promotions
                    </button>
                  }
                />
              ) : (
                <Link
                  href={destination('featured')}
                  className="bg-gold text-ink rounded-lg px-3 py-2 text-[12px] font-extrabold focus-visible:outline focus-visible:outline-2"
                >
                  {demo ? 'Explore promotions' : 'View featured'}
                </Link>
              )}
            </div>
          </section>
          {!demo && money && !unavailable.money ? (
            <Link href={destination('money')} className={`${action} px-1`}>
              This week’s money: {kes(money.net_cents)}{' '}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Status({
  icon,
  label,
  value,
  note,
  divider = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  divider?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 ${divider ? 'sm:border-border sm:border-l sm:pl-4' : ''}`}
    >
      <span className="[&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-extrabold">{label}</span>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${['Approved', 'Live', 'Open', 'On'].includes(value) ? 'bg-green-100 text-green-800' : 'bg-bg text-muted'}`}
          >
            {value}
          </span>
        </div>
        <p className={`${subtle} mt-0.5`}>{note}</p>
      </div>
    </div>
  );
}

function IconBubble({
  tone,
  children,
}: {
  tone: 'orange' | 'green' | 'blue';
  children: React.ReactNode;
}) {
  const colours = {
    orange: 'bg-orange-100 text-amber-900',
    green: 'bg-green-100 text-green-800',
    blue: 'bg-sky-100 text-sky-900',
  };
  return (
    <span
      className={`${colours[tone]} flex h-8 w-8 shrink-0 items-center justify-center rounded-full [&>svg]:h-4 [&>svg]:w-4`}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

function ActionRow({
  icon,
  tone,
  title,
  detail,
  meta,
  href,
  button,
  secondary,
  disabled,
  samplePanel,
  sampleContent,
}: {
  icon: React.ReactNode;
  tone: 'orange' | 'green' | 'blue';
  title: string;
  detail: string;
  meta?: string;
  href?: string;
  button: string;
  secondary?: boolean;
  disabled?: boolean;
  samplePanel?: SamplePanelKind;
  sampleContent?: DemoPanelContent;
}) {
  const style = `${secondary ? 'bg-gold-soft text-amber-900' : 'bg-gold text-ink'} inline-flex h-9 w-[112px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-2 text-center text-[11px] font-extrabold focus-visible:outline focus-visible:outline-2`;
  return (
    <div className="flex min-h-[52px] items-center gap-2 py-1">
      <IconBubble tone={tone}>{icon}</IconBubble>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-extrabold">{title}</p>
        <p className={`${subtle} mt-0.5`}>{detail}</p>
        {meta ? <p className={`${subtle} mt-0.5`}>{meta}</p> : null}
      </div>
      {samplePanel ? (
        <HomeSamplePanel
          kind={samplePanel}
          content={sampleContent}
          trigger={
            <button type="button" className={style}>
              {button}
            </button>
          }
        />
      ) : disabled ? (
        <details className="relative">
          <summary className={`${style} cursor-pointer list-none`}>{button}</summary>
          <div className="border-border bg-surface absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border p-3 shadow-lg">
            <p className="text-[13px] font-extrabold">Sample booking request</p>
            <p className={`${subtle} mt-1`}>{detail}</p>
            <p className={`${subtle} mt-2`}>
              Preview only. Booking management is not available here yet.
            </p>
          </div>
        </details>
      ) : href ? (
        <Link href={href} className={style}>
          {button}
        </Link>
      ) : null}
    </div>
  );
}

function Metric({
  href,
  icon,
  tone,
  label,
  value,
  disabled,
  samplePanel,
  sampleContent,
}: {
  href?: string;
  icon: React.ReactNode;
  tone: 'orange' | 'green' | 'blue';
  label: string;
  value: string;
  disabled?: boolean;
  samplePanel?: SamplePanelKind;
  sampleContent?: DemoPanelContent;
}) {
  const content = (
    <>
      <IconBubble tone={tone}>{icon}</IconBubble>
      <span className="min-w-0 flex-1">
        <span className={`${subtle} block`}>{label}</span>
        <span className="block whitespace-nowrap text-[13px] font-extrabold tabular-nums tracking-tight">
          {value}
        </span>
      </span>
      <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
    </>
  );
  const style =
    'border-border flex min-h-[52px] min-w-0 items-center gap-1.5 rounded-lg border p-1.5 focus-visible:outline focus-visible:outline-2';
  return samplePanel ? (
    <HomeSamplePanel
      kind={samplePanel}
      content={sampleContent}
      trigger={
        <button type="button" className={`${style} w-full text-left`}>
          {content}
        </button>
      }
    />
  ) : disabled ? (
    <details className="relative">
      <summary className={`${style} cursor-pointer list-none`}>{content}</summary>
      <div className="border-border bg-surface absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border p-3 text-[12px] shadow-lg">
        {value} sample bookings. Booking management is not available here yet.
      </div>
    </details>
  ) : href ? (
    <Link href={href} className={style}>
      {content}
    </Link>
  ) : (
    <div className={style}>{content}</div>
  );
}

function SectionHead({
  title,
  subtitle,
  icon,
  href,
  action: label,
  samplePanel,
  sampleContent,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  href: string;
  action: string;
  samplePanel?: SamplePanelKind;
  sampleContent?: DemoPanelContent;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[16px] font-extrabold">
          <span className="[&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">
            {icon}
          </span>
          {title}
        </h2>
        <p className={`${subtle} mt-0.5 pl-7`}>{subtitle}</p>
      </div>
      {samplePanel ? (
        <HomeSamplePanel
          kind={samplePanel}
          content={sampleContent}
          trigger={
            <button type="button" className={`${action} shrink-0 pt-1`}>
              {label} <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          }
        />
      ) : (
        <Link href={href} className={`${action} shrink-0 pt-1`}>
          {label} <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function UnavailableMessage({ what }: { what: string }) {
  return (
    <p className={`${subtle} py-3`} role="status">
      {what} could not be loaded. Refresh the page to try again.
    </p>
  );
}

function partOfDay(): string {
  const hour = Number(
    new Date().toLocaleString('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Africa/Nairobi',
    }),
  );
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}
