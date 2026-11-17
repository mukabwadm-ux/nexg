/**
 * The console's navigation, grouped the way the admin portal designs group
 * it: Overview, then one group per part of the business, each with the
 * views inside it.
 *
 * Every entry names the console_module that guards it. The sidebar keeps an
 * entry only when the signed-in person can reach that module, so this file
 * decides where things sit and role_module_access still decides who sees
 * them. An entry with no href is designed but not built: the sidebar shows
 * its group greyed instead of linking to a page that does not exist.
 *
 * Sub-items link to the page's own tab (?tab=), so the page a person lands
 * on is the one the sidebar says. `home` marks the entry that is active when
 * the page is opened with no tab.
 */
export type NavIcon =
  | 'overview'
  | 'operations'
  | 'merchants'
  | 'stays'
  | 'customers'
  | 'riders'
  | 'finance'
  | 'support'
  | 'marketing'
  | 'growth'
  | 'analytics'
  | 'reports'
  | 'company'
  | 'system';

export interface NavItem {
  label: string;
  href: string;
  module: string;
  home?: boolean;
}

export interface NavGroup {
  key: string;
  label: string;
  icon: NavIcon;
  /** A single page rather than a group (Overview). */
  href?: string;
  module?: string;
  items: NavItem[];
}

export const CONSOLE_NAV: NavGroup[] = [
  {
    key: 'overview',
    label: 'Overview',
    icon: 'overview',
    href: '/',
    module: 'overview',
    items: [],
  },
  {
    key: 'operations',
    label: 'Operations',
    icon: 'operations',
    items: [
      { label: 'Live operations', href: '/live', module: 'live_ops', home: true },
      { label: 'Orders', href: '/orders', module: 'orders', home: true },
      { label: 'Order transactions', href: '/transactions', module: 'orders', home: true },
      { label: 'Experience days', href: '/experiences', module: 'experiences', home: true },
    ],
  },
  {
    key: 'merchants',
    label: 'Merchants',
    icon: 'merchants',
    items: [
      { label: 'All merchants', href: '/merchants?tab=directory', module: 'merchants', home: true },
      { label: 'Onboarding', href: '/merchants/applications', module: 'merchants' },
      { label: 'Verification', href: '/merchants?tab=documents', module: 'merchants' },
      { label: 'Catalogues', href: '/merchants?tab=catalogue', module: 'merchants' },
      { label: 'Performance', href: '/merchants?tab=health', module: 'merchants' },
      { label: 'Payouts & settlements', href: '/merchants?tab=finance', module: 'merchants' },
      { label: 'Hours & capacity', href: '/merchants?tab=hours', module: 'merchants' },
      { label: 'Categories', href: '/categories', module: 'categories', home: true },
    ],
  },
  {
    key: 'stays',
    label: 'NEXG Stays',
    icon: 'stays',
    items: [
      {
        label: 'Hosts & property managers',
        href: '/hotels?tab=hosts',
        module: 'hotels',
        home: true,
      },
      { label: 'Listings & properties', href: '/hotels?tab=listings', module: 'hotels' },
      { label: 'Hotels', href: '/hotels?tab=hotels', module: 'hotels' },
      { label: 'Stay refunds', href: '/hotels?tab=refunds', module: 'hotels' },
      { label: 'Guests', href: '/hotels?tab=guests', module: 'hotels' },
      { label: 'Charge to room', href: '/hotels?tab=charge', module: 'hotels' },
      { label: 'QR & attribution', href: '/hotels?tab=qr', module: 'hotels' },
    ],
  },
  { key: 'customers', label: 'Customers', icon: 'customers', items: [] },
  {
    key: 'riders',
    label: 'Riders',
    icon: 'riders',
    items: [
      { label: 'All riders', href: '/riders?tab=directory', module: 'riders', home: true },
      { label: 'Onboarding & KYC', href: '/riders?tab=pipeline', module: 'riders' },
      { label: 'Supply & shifts', href: '/riders?tab=supply', module: 'riders' },
      { label: 'Earnings & payouts', href: '/riders?tab=settlement', module: 'riders' },
      { label: 'Cash ledger', href: '/riders?tab=cash', module: 'riders' },
      { label: 'Health & safety', href: '/riders?tab=health', module: 'riders' },
      { label: 'Documents', href: '/riders?tab=documents', module: 'riders' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: 'finance',
    items: [
      { label: 'Office finance', href: '/finance/office', module: 'finance', home: true },
      { label: 'Transactions', href: '/finance/transactions', module: 'finance', home: true },
      {
        label: 'Settlements & payouts',
        href: '/finance/settlements',
        module: 'finance',
        home: true,
      },
      { label: 'Reconciliations', href: '/finance/reconciliation', module: 'finance', home: true },
      { label: 'Invoices', href: '/finance/invoices', module: 'finance', home: true },
      { label: 'Reports', href: '/finance/reports', module: 'finance', home: true },
      { label: 'Fraud checks', href: '/finance/fraud', module: 'finance', home: true },
    ],
  },
  {
    key: 'support',
    label: 'Support',
    icon: 'support',
    items: [
      { label: 'Tickets & cases', href: '/support', module: 'support', home: true },
      { label: 'Live chat', href: '/messaging?tab=inbox', module: 'messaging', home: true },
      { label: 'Channels', href: '/messaging?tab=channels', module: 'messaging' },
      { label: 'Canned replies', href: '/messaging?tab=canned', module: 'messaging' },
      { label: 'Chat insights', href: '/messaging?tab=insights', module: 'messaging' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    icon: 'marketing',
    items: [{ label: 'Featured slots', href: '/featured', module: 'featured', home: true }],
  },
  {
    key: 'growth',
    label: 'Growth & CRM',
    icon: 'growth',
    items: [
      { label: 'Careers & hiring', href: '/careers', module: 'careers', home: true },
      { label: 'Job board', href: '/jobs', module: 'job_board', home: true },
    ],
  },
  { key: 'analytics', label: 'Analytics', icon: 'analytics', items: [] },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'reports',
    items: [
      { label: 'Exports & downloads', href: '/finance/reports?tab=exports', module: 'finance' },
    ],
  },
  {
    key: 'company',
    label: 'Company',
    icon: 'company',
    items: [
      { label: 'Company files', href: '/company/files', module: 'company', home: true },
      { label: 'Company inventory', href: '/company/inventory', module: 'company', home: true },
      { label: 'Assets & equipment', href: '/company/assets', module: 'company', home: true },
      { label: 'Procurement', href: '/company/procurement', module: 'company', home: true },
      { label: 'Vendors & suppliers', href: '/company/vendors', module: 'company', home: true },
      { label: 'Warehouses & stores', href: '/company/warehouses', module: 'company', home: true },
    ],
  },
  {
    key: 'system',
    label: 'System',
    icon: 'system',
    items: [
      { label: 'Users & access', href: '/staff?tab=staff', module: 'staff', home: true },
      { label: 'Roles & permissions', href: '/staff?tab=roles', module: 'staff' },
      { label: 'Approvals', href: '/staff?tab=approvals', module: 'staff' },
      { label: 'Sessions & security', href: '/staff?tab=security', module: 'staff' },
      { label: 'Configuration', href: '/settings', module: 'settings', home: true },
      { label: 'Integrations', href: '/settings?tab=api', module: 'settings' },
      { label: 'Agreement signing', href: '/settings?tab=signing', module: 'settings' },
      { label: 'Audit logs', href: '/audit', module: 'audit', home: true },
    ],
  },
];

/** The groups and entries this person can reach; unbuilt groups stay, greyed. */
export function navFor(modules: Set<string>): (NavGroup & { built: boolean })[] {
  return CONSOLE_NAV.flatMap((group): (NavGroup & { built: boolean })[] => {
    if (group.href) {
      return group.module && modules.has(group.module) ? [{ ...group, built: true }] : [];
    }
    if (group.items.length === 0) return [{ ...group, built: false }];
    const items = group.items.filter((item) => modules.has(item.module));
    return items.length > 0 ? [{ ...group, items, built: true }] : [];
  });
}

/**
 * Which entry is the page being shown. The most specific match wins: the
 * exact path with the open tab, then the exact path's home entry, then the
 * home entry of a parent path (a merchant's own page sits under All
 * merchants).
 */
export function activeHref(
  items: { href: string; home?: boolean }[],
  pathname: string,
  tab: string | null,
): string | null {
  const parts = items.map((item) => {
    const [path, query] = item.href.split('?');
    return { item, path: path!, tab: new URLSearchParams(query ?? '').get('tab') };
  });
  const exact = parts.filter((p) => p.path === pathname);
  const byTab = exact.find((p) => tab !== null && p.tab === tab);
  if (byTab) return byTab.item.href;
  const plain =
    exact.find((p) => p.tab === null) ??
    (tab === null ? exact.find((p) => p.item.home) : undefined);
  if (plain) return plain.item.href;
  if (exact.length > 0) return exact.find((p) => p.item.home)?.item.href ?? null;
  const parent = parts
    .filter((p) => p.path !== '/' && pathname.startsWith(`${p.path}/`) && p.item.home)
    .sort((a, b) => b.path.length - a.path.length)[0];
  return parent?.item.href ?? null;
}
