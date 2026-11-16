'use client';

import { cn } from '@nexg/ui';
import {
  BarChart3,
  BedDouble,
  Bike,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  Headphones,
  Home,
  Landmark,
  LogOut,
  Megaphone,
  Menu,
  Search,
  Settings,
  ShoppingBag,
  Store,
  TrendingUp,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { Logo } from '@/components/logo';
import { StaffBell } from '@/components/staff-bell';
import { activeHref, type NavGroup, type NavIcon } from '@/lib/console-nav';

/**
 * The console frame from the admin portal designs: a black sidebar with the
 * business grouped into sections that open to show their views, a top bar
 * with page search, notifications and the signed-in person, and the page
 * itself on the right.
 *
 * The sidebar folds down to icons (the « button) and remembers that in a
 * cookie, so a folded rail is folded on the server render too rather than
 * snapping shut after the page loads. On a phone it is a drawer opened from
 * the top bar.
 */

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  overview: Home,
  operations: ShoppingBag,
  merchants: Store,
  stays: BedDouble,
  customers: Users,
  riders: Bike,
  finance: Landmark,
  support: Headphones,
  marketing: Megaphone,
  growth: TrendingUp,
  analytics: BarChart3,
  reports: FolderOpen,
  system: Settings,
};

export interface FrameStaff {
  name: string;
  email: string;
  role: string;
  initials: string;
  avatarUrl: string | null;
}

type Group = NavGroup & { built: boolean };

export function ConsoleFrame({
  nav,
  staff,
  collapsed: initiallyCollapsed,
  signOut,
  children,
}: {
  nav: Group[];
  staff: FrameStaff;
  collapsed: boolean;
  signOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(initiallyCollapsed);
  const [drawer, setDrawer] = React.useState(false);
  const currentPath = usePathname();
  const search = useSearchParams();
  const here = `${currentPath}?${search.toString()}`;

  /*
   * Where a click is taking the person, until the page arrives. The next
   * page is rendered on the server, and until it lands the old one would
   * sit there with no sign the click registered. So the sidebar moves to
   * the new entry and the page area shows its outline straight away.
   */
  const [leaving, setLeaving] = React.useState<URL | null>(null);
  React.useEffect(() => setLeaving(null), [here]);
  React.useEffect(() => {
    if (!leaving) return;
    const giveUp = window.setTimeout(() => setLeaving(null), 10_000);
    return () => window.clearTimeout(giveUp);
  }, [leaving]);

  const onClickCapture = (event: React.MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const link = (event.target as HTMLElement).closest('a');
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    // The same page, or a jump within it (#approvals): nothing to wait for.
    if (url.pathname === window.location.pathname && url.search === window.location.search) return;
    setLeaving(url);
  };

  const pathname = leaving?.pathname ?? currentPath;
  const tab = leaving ? leaving.searchParams.get('tab') : search.get('tab');

  React.useEffect(() => setDrawer(false), [pathname, tab]);

  React.useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const fold = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `console_rail=${next ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <div className="console-frame bg-shell min-h-dvh text-white" onClickCapture={onClickCapture}>
      {/* Phone and tablet: the drawer's backdrop. */}
      {drawer && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setDrawer(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      <aside
        id="console-sidebar"
        aria-label="Console"
        className={cn(
          'bg-shell fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col border-r border-white/[0.06] pt-[env(safe-area-inset-top)] duration-300 ease-out max-lg:transition-transform lg:transition-[width]',
          drawer ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
          collapsed ? 'lg:w-[4.75rem]' : 'lg:w-[16.5rem]',
        )}
      >
        <div
          className={cn(
            'flex items-start justify-between gap-2 px-5 pb-4 pt-5',
            collapsed && 'lg:flex-col lg:items-center lg:px-3',
          )}
        >
          <Link href="/" aria-label="NexG Admin, overview" className="min-w-0">
            <Logo onDark priority className={cn('h-14 w-auto', collapsed && 'lg:h-10')} />
            <span
              className={cn(
                'mt-1 block text-[0.9375rem] font-semibold text-white/85',
                collapsed && 'lg:hidden',
              )}
            >
              Admin Portal
            </span>
          </Link>
          <button
            type="button"
            onClick={fold}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white lg:flex"
          >
            {collapsed ? (
              <ChevronsRight className="h-5 w-5" />
            ) : (
              <ChevronsLeft className="h-5 w-5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setDrawer(false)}
            aria-label="Close menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={cn('mx-5 h-px bg-white/10', collapsed && 'lg:mx-3')} />

        <nav className="console-scroll flex-1 overflow-y-auto overscroll-contain px-3 py-4">
          <ul className="space-y-1">
            {nav.map((group) => (
              <NavGroupRow
                key={group.key}
                group={group}
                collapsed={collapsed}
                pathname={pathname}
                tab={tab}
              />
            ))}
          </ul>
        </nav>
      </aside>

      <div
        className={cn(
          'flex min-h-dvh min-w-0 flex-col transition-[padding] duration-300 ease-out',
          collapsed ? 'lg:pl-[4.75rem]' : 'lg:pl-[16.5rem]',
        )}
      >
        <TopBar nav={nav} staff={staff} signOut={signOut} onMenu={() => setDrawer(true)} />
        <div className="console-canvas flex min-w-0 flex-1 flex-col px-3 pb-3 sm:px-5 sm:pb-5">
          {leaving ? <PageOutline /> : children}
        </div>
      </div>
    </div>
  );
}

/** The shape of a console page while the real one is on its way. */
function PageOutline() {
  return (
    <>
      <header
        className="console-header px-1 pb-5 pt-2 sm:px-2"
        role="status"
        aria-live="polite"
        aria-label="Opening page"
      >
        <div className="h-8 w-56 max-w-full animate-pulse rounded-lg bg-white/15 sm:h-9" />
        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-white/10" />
      </header>
      <main className="px-4 py-5 sm:px-8" aria-hidden="true">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className={cn(
                'h-[7.5rem] animate-pulse rounded-2xl',
                i === 0 ? 'bg-gold/30' : 'bg-surface border-border border',
              )}
            />
          ))}
        </div>
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="bg-surface border-border h-80 animate-pulse rounded-2xl border" />
          <div className="bg-surface border-border h-80 animate-pulse rounded-2xl border" />
        </div>
      </main>
    </>
  );
}

/* ═══════════════════════════════════════════════════════ sidebar */

function NavGroupRow({
  group,
  collapsed,
  pathname,
  tab,
}: {
  group: Group;
  collapsed: boolean;
  pathname: string;
  tab: string | null;
}) {
  const Icon = ICONS[group.icon];
  const current = group.href ? null : activeHref(group.items, pathname, tab);
  const here = group.href ? pathname === group.href : current !== null;
  const [open, setOpen] = React.useState(here);
  React.useEffect(() => {
    if (here) setOpen(true);
  }, [here]);

  const row = cn(
    'group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-semibold transition-colors',
    collapsed && 'lg:justify-center lg:px-0',
  );
  const label = cn('min-w-0 flex-1 truncate text-left', collapsed && 'lg:sr-only');

  if (!group.built) {
    return (
      <li>
        <span title="Designed, not built yet" className={cn(row, 'cursor-default text-white/30')}>
          <Icon className="h-5 w-5 shrink-0" />
          <span className={label}>{group.label}</span>
          <span
            className={cn(
              'rounded-full border border-white/10 px-1.5 py-px text-[0.625rem] font-bold uppercase tracking-wide text-white/35',
              collapsed && 'lg:hidden',
            )}
          >
            Soon
          </span>
        </span>
      </li>
    );
  }

  if (group.href) {
    return (
      <li>
        <Link
          href={group.href}
          aria-current={here ? 'page' : undefined}
          title={collapsed ? group.label : undefined}
          className={cn(
            row,
            here
              ? 'bg-gold text-ink shadow-[0_6px_18px_-8px_rgba(253,209,40,0.7)]'
              : 'text-white/80 hover:bg-white/[0.06] hover:text-white',
          )}
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className={label}>{group.label}</span>
        </Link>
      </li>
    );
  }

  /* Folded rail: the group's icon goes straight to its first view. */
  if (collapsed) {
    const first = group.items[0]!;
    return (
      <li>
        <Link
          href={first.href}
          title={group.label}
          className={cn(
            row,
            'max-lg:hidden',
            here ? 'bg-gold text-ink' : 'text-white/80 hover:bg-white/[0.06] hover:text-white',
          )}
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="sr-only">{group.label}</span>
        </Link>
        <GroupBody
          group={group}
          open={open}
          setOpen={setOpen}
          here={here}
          current={current}
          pathname={pathname}
          tab={tab}
          className="lg:hidden"
        />
      </li>
    );
  }

  return (
    <li>
      <GroupBody
        group={group}
        open={open}
        setOpen={setOpen}
        here={here}
        current={current}
        pathname={pathname}
        tab={tab}
      />
    </li>
  );
}

function GroupBody({
  group,
  open,
  setOpen,
  here,
  current,
  className,
}: {
  group: Group;
  open: boolean;
  setOpen: (open: boolean) => void;
  here: boolean;
  current: string | null;
  pathname?: string;
  tab?: string | null;
  className?: string;
}) {
  const Icon = ICONS[group.icon];
  const id = `nav-${group.key}`;
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-semibold transition-colors',
          here
            ? 'bg-gold text-ink shadow-[0_6px_18px_-8px_rgba(253,209,40,0.7)]'
            : 'text-white/80 hover:bg-white/[0.06] hover:text-white',
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{group.label}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      {open && (
        <ul
          id={id}
          className="relative mb-2 ml-[1.375rem] mt-1 space-y-0.5 border-l border-white/10 pl-2.5"
        >
          {group.items.map((item) => {
            const active = item.href === current;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] font-medium transition-colors',
                    active
                      ? 'bg-gold/[0.16] text-white'
                      : 'text-white/65 hover:bg-white/[0.05] hover:text-white',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      active ? 'bg-gold' : 'bg-white/40',
                    )}
                  />
                  <span className="min-w-0 truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ top bar */

function TopBar({
  nav,
  staff,
  signOut,
  onMenu,
}: {
  nav: Group[];
  staff: FrameStaff;
  signOut: () => Promise<void>;
  onMenu: () => void;
}) {
  return (
    <header className="bg-shell/95 sticky top-0 z-30 flex items-center gap-2 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur sm:gap-3 sm:px-5">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open menu"
        aria-controls="console-sidebar"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/80 hover:bg-white/10 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <PageSearch nav={nav} />

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        <StaffBell />
        <span aria-hidden="true" className="hidden h-8 w-px bg-white/15 sm:block" />
        <ProfileMenu staff={staff} signOut={signOut} />
      </div>
    </header>
  );
}

/**
 * Search the console's pages. There is no cross-module record search yet,
 * so this finds pages and views, which is what the sidebar holds, and says
 * so in its placeholder rather than promising orders or merchants.
 */
function PageSearch({ nav }: { nav: Group[] }) {
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);
  const wrap = React.useRef<HTMLDivElement>(null);

  const entries = React.useMemo(
    () =>
      nav.flatMap((group) =>
        !group.built
          ? []
          : group.href
            ? [{ label: group.label, group: '', href: group.href }]
            : group.items.map((item) => ({
                label: item.label,
                group: group.label,
                href: item.href,
              })),
      ),
    [nav],
  );

  const term = q.trim().toLowerCase();
  const matches = term
    ? entries.filter((e) => `${e.group} ${e.label}`.toLowerCase().includes(term)).slice(0, 8)
    : entries.slice(0, 8);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    const onDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ('');
    input.current?.blur();
    router.push(href);
  };

  return (
    <div ref={wrap} className="relative min-w-0 flex-1 sm:max-w-[38rem]">
      <label className="focus-within:border-gold/70 flex h-11 items-center gap-2.5 rounded-xl border border-white/20 bg-white/[0.03] px-3.5 transition-colors">
        <Search className="h-4 w-4 shrink-0 text-white/60" aria-hidden="true" />
        <input
          ref={input}
          type="search"
          value={q}
          role="combobox"
          aria-expanded={open}
          aria-controls="console-search-results"
          aria-label="Search pages"
          placeholder="Search pages and views…"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, matches.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === 'Enter' && matches[cursor]) {
              e.preventDefault();
              go(matches[cursor]!.href);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd className="hidden shrink-0 rounded-md border border-white/20 px-1.5 py-0.5 font-sans text-[0.6875rem] font-semibold text-white/60 sm:block">
          Ctrl K
        </kbd>
      </label>

      {open && (
        <ul
          id="console-search-results"
          role="listbox"
          className="text-ink absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-black/10 bg-white py-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)]"
        >
          {matches.length === 0 ? (
            <li className="text-muted px-4 py-3 text-sm">No page called “{q.trim()}”.</li>
          ) : (
            matches.map((m, i) => (
              <li key={m.href} role="option" aria-selected={i === cursor}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(m.href)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm',
                    i === cursor && 'bg-gold-soft',
                  )}
                >
                  <span className="font-semibold">{m.label}</span>
                  {m.group && <span className="text-muted-light text-xs">{m.group}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function ProfileMenu({ staff, signOut }: { staff: FrameStaff; signOut: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-white/[0.06] sm:pr-2"
      >
        {staff.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img src={staff.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <span className="bg-gold text-ink flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold">
            {staff.initials || '—'}
          </span>
        )}
        <span className="hidden max-w-[11rem] text-left leading-tight md:block">
          <span className="block truncate text-sm font-bold">{staff.name}</span>
          <span className="block truncate text-xs text-white/60">{staff.role}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-white/60 sm:block" />
      </button>

      {open && (
        <div
          role="menu"
          className="text-ink absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)]"
        >
          <div className="border-border border-b px-4 py-3">
            <p className="truncate text-sm font-bold">{staff.name}</p>
            <p className="text-muted-light truncate text-xs">{staff.email}</p>
          </div>
          <Link
            role="menuitem"
            href="/account"
            onClick={() => setOpen(false)}
            className="hover:bg-gold-soft flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold"
          >
            <UserRound className="h-4 w-4" /> Your profile
          </Link>
          <form action={signOut}>
            <button
              role="menuitem"
              type="submit"
              className="hover:bg-gold-soft flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
