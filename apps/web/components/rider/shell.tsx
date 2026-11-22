import {
  Banknote,
  Bike,
  Calendar,
  FileText,
  Heart,
  Package,
  HelpCircle,
  LayoutDashboard,
  MessageSquare,
  ReceiptText,
  Settings,
  TriangleAlert,
  UserPlus,
  Wallet,
} from 'lucide-react';
import * as React from 'react';

import { RiderAccountMenu } from './account-menu';
import { RiderWorkspaceShell } from './workspace-shell';

/**
 * The rider dashboard frame.
 *
 * Dark sidebar, as drawn. This is the web and tablet surface —
 * a rider at home checking Friday's statement, or a hub tablet.
 * The phone app shares these views and not this layout: a
 * one-handed screen in sunlight on a boda is a different
 * problem, and pretending one layout serves both is how you get
 * a dashboard nobody can use while moving.
 *
 * One thing is non-negotiable in every state, including an
 * applicant who cannot take a job yet: SOS is on screen. A
 * rider in trouble does not first become activated.
 */

export interface RiderNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number | null;
  tone?: 'danger' | 'plain';
  /** Nothing real can be in here until they are active. */
  locked?: boolean;
}

export function riderNav({
  active,
  openJobs,
  unreadMessages,
  documentsToDo,
  cashDue,
}: {
  active: boolean;
  openJobs: number;
  unreadMessages: number;
  documentsToDo: number;
  cashDue: boolean;
}): RiderNavItem[] {
  const i = (n: React.ReactNode) => n;
  return [
    { href: '/rider', label: 'Dashboard', icon: i(<LayoutDashboard className="h-4 w-4" />) },
    {
      href: '/rider/jobs',
      label: 'Jobs',
      icon: i(<Bike className="h-4 w-4" />),
      locked: !active,
      badge: active && openJobs > 0 ? openJobs : null,
    },
    { href: '/rider/earnings', label: 'Earnings', icon: i(<Wallet className="h-4 w-4" />) },
    {
      href: '/rider/cash',
      label: 'Cash',
      icon: i(<Banknote className="h-4 w-4" />),
      locked: !active,
      badge: active && cashDue ? 1 : null,
      tone: 'danger',
    },
    { href: '/rider/receipts', label: 'Receipts', icon: i(<ReceiptText className="h-4 w-4" />) },
    {
      href: '/rider/shifts',
      label: 'Shifts',
      icon: i(<Calendar className="h-4 w-4" />),
      locked: !active,
    },
    {
      href: '/rider/messages',
      label: 'Messages',
      icon: i(<MessageSquare className="h-4 w-4" />),
      badge: unreadMessages > 0 ? unreadMessages : null,
    },
    { href: '/rider/health', label: 'Health', icon: i(<Heart className="h-4 w-4" />) },
    {
      href: '/rider/documents',
      label: 'Documents',
      icon: i(<FileText className="h-4 w-4" />),
      badge: documentsToDo > 0 ? documentsToDo : null,
      tone: 'danger',
    },
    { href: '/rider/kit', label: 'Rider kit', icon: i(<Package className="h-4 w-4" />) },
    {
      href: '/rider/incidents',
      label: 'Incidents',
      icon: i(<TriangleAlert className="h-4 w-4" />),
    },
    { href: '/rider/refer', label: 'Refer a rider', icon: i(<UserPlus className="h-4 w-4" />) },
    { href: '/rider/profile', label: 'Account', icon: i(<Settings className="h-4 w-4" />) },
    { href: '/rider/support', label: 'Support', icon: i(<HelpCircle className="h-4 w-4" />) },
  ];
}

export function RiderShell({
  personName,
  riderCode,
  vehicle,
  active,
  zoneLine,
  presenceControl,
  unreadCount,
  nav,
  children,
}: {
  personName: string;
  riderCode: string;
  vehicle: string | null;
  active: boolean;
  zoneLine: string;
  presenceControl: React.ReactNode;
  unreadCount: number;
  nav: RiderNavItem[];
  children: React.ReactNode;
}) {
  /* The merchant dashboard's frame, with the rider's content (workspace-shell.tsx). */
  return (
    <RiderWorkspaceShell
      personName={personName}
      riderCode={riderCode}
      statusLabel={active ? zoneLine : 'Application · not active yet'}
      nav={nav}
      unreadCount={unreadCount}
      presenceControl={presenceControl}
      accountMenu={
        <RiderAccountMenu
          personName={personName}
          riderCode={riderCode}
          vehicle={vehicle}
          active={active}
        />
      }
    >
      {children}
    </RiderWorkspaceShell>
  );
}

/**
 * Online / Offline.
 *
 * Read-only here. Going online needs an active status, a bound
 * device with location permission, no cooldown and unexpired
 * documents — four conditions the dashboard can display but
 * should not be the thing that checks, because the one that
 * matters is the server's answer at the moment an offer is
 * routed.
 */
export function PresenceControl({
  active,
  online,
  reason,
}: {
  active: boolean;
  online: boolean;
  reason: string | null;
}) {
  if (!active) {
    return (
      <span className="border-gold/40 bg-gold-soft text-gold-text flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[0.8125rem] font-extrabold">
        <span className="bg-gold h-1.5 w-1.5 rounded-full" aria-hidden="true" />
        Not active yet
      </span>
    );
  }

  return (
    <span
      className="border-border-strong bg-bg flex items-center rounded-lg border p-0.5"
      title={reason ?? undefined}
    >
      {(['online', 'offline'] as const).map((s) => {
        const on = (s === 'online') === online;
        return (
          <span
            key={s}
            aria-current={on ? 'true' : undefined}
            className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-extrabold capitalize ${
              on ? (s === 'online' ? 'bg-success text-white' : 'bg-muted text-white') : 'text-muted'
            }`}
          >
            {on && s === 'online' ? (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-white align-middle" />
            ) : null}
            {s}
          </span>
        );
      })}
    </span>
  );
}
