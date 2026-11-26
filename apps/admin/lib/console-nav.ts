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
  | 'system'
  | 'integrations';

export interface NavItem {
  label: string;
  href: string;
  module: string;
  /** A second module that also reaches this entry. */
  orModule?: string;
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
      { label: 'Operations Dashboard', href: '/operations', module: 'orders', home: true },
      { label: 'Orders', href: '/orders', module: 'orders', home: true },
      { label: 'Bookings & Reservations', href: '/operations?tab=stays', module: 'hotels' },
      { label: 'Deliveries', href: '/live', module: 'live_ops', home: true },
      { label: 'Service Requests', href: '/operations?tab=services', module: 'orders' },
      { label: 'Incidents & Disputes', href: '/operations?tab=incidents', module: 'orders' },
      /* Not in the Operations design, kept so the concierge desk stays one click away. */
      { label: 'Experience Days', href: '/experiences', module: 'experiences', home: true },
    ],
  },
  {
    key: 'merchants',
    label: 'Merchants',
    icon: 'merchants',
    items: [
      { label: 'All Merchants', href: '/merchants?tab=directory', module: 'merchants', home: true },
      { label: 'Onboarding', href: '/merchants/applications', module: 'merchants' },
      { label: 'Verification', href: '/merchants/verification', module: 'merchants', home: true },
      { label: 'Catalogues', href: '/merchants/catalogues', module: 'merchants', home: true },
      { label: 'Performance', href: '/merchants/performance', module: 'merchants', home: true },
      {
        label: 'Payouts & Settlements',
        href: '/merchants/payouts',
        module: 'merchants',
        home: true,
      },
      { label: 'Hours & Capacity', href: '/merchants?tab=hours', module: 'merchants' },
      { label: 'Categories', href: '/categories', module: 'categories', home: true },
    ],
  },
  {
    key: 'stays',
    label: 'Stays',
    icon: 'stays',
    items: [
      { label: 'Overview', href: '/stays', module: 'hotels', home: true },
      { label: 'Hosts', href: '/stays/hosts', module: 'hotels', home: true },
      { label: 'Guests', href: '/hotels?tab=guests', module: 'hotels' },
      { label: 'Buildings & Properties', href: '/stays/buildings', module: 'hotels', home: true },
      { label: 'Accommodation Units', href: '/stays/units', module: 'hotels', home: true },
      {
        label: 'Property Managers & Partners',
        href: '/stays/partners',
        module: 'hotels',
        home: true,
      },
      { label: 'Reservations', href: '/stays/reservations', module: 'hotels', home: true },
      { label: 'Check-ins & Check-outs', href: '/stays/check-ins', module: 'hotels', home: true },
      { label: 'Availability & Rates', href: '/stays/availability', module: 'hotels', home: true },
      {
        label: 'Guest Spending & Concierge',
        href: '/stays/spending',
        module: 'hotels',
        home: true,
      },
      { label: 'Reviews & Ratings', href: '/stays/reviews', module: 'hotels', home: true },
      {
        label: 'Verification & Compliance',
        href: '/stays/verification',
        module: 'hotels',
        home: true,
      },
      {
        label: 'Acquisition & Referrals',
        href: '/stays/acquisition',
        module: 'hotels',
        home: true,
      },
      { label: 'QR Codes & Marketing', href: '/stays/marketing', module: 'hotels', home: true },
      { label: 'Finance & Commissions', href: '/stays/finance', module: 'hotels', home: true },
      { label: 'Payouts & Settlements', href: '/stays/payouts', module: 'hotels', home: true },
      { label: 'Incidents & Disputes', href: '/stays/incidents', module: 'hotels', home: true },
      {
        label: 'Performance & Analytics',
        href: '/stays/performance',
        module: 'hotels',
        home: true,
      },
      { label: 'Reports', href: '/stays/reports', module: 'hotels', home: true },
      { label: 'Stays Configuration', href: '/stays/configuration', module: 'hotels', home: true },
      /* The earlier tabbed console: hotels, refunds, charge to room, KDPA requests. */
      { label: 'Hotels & refunds console', href: '/hotels?tab=hotels', module: 'hotels' },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    icon: 'customers',
    items: [
      { label: 'All customers', href: '/customers', module: 'customers', home: true },
      { label: 'With an account', href: '/customers?tab=accounts', module: 'customers' },
      { label: 'Guests (no account)', href: '/customers?tab=guests', module: 'customers' },
      { label: 'VIP', href: '/customers?tab=vip', module: 'customers' },
      { label: 'Suspended', href: '/customers?tab=suspended', module: 'customers' },
    ],
  },
  {
    key: 'riders',
    label: 'Riders',
    icon: 'riders',
    items: [
      { label: 'Overview', href: '/riders', module: 'riders', home: true },
      { label: 'All Riders', href: '/riders/all', module: 'riders' },
      { label: 'Onboarding & KYC', href: '/riders/onboarding', module: 'riders' },
      { label: 'Availability & Zones', href: '/riders/availability', module: 'riders' },
      { label: 'Orders & Deliveries', href: '/riders/deliveries', module: 'riders' },
      { label: 'Earnings & Payouts', href: '/riders/earnings', module: 'riders' },
      { label: 'Performance', href: '/riders/performance', module: 'riders' },
      { label: 'Incidents & Disputes', href: '/riders/incidents', module: 'riders', home: true },
      /* Cash ledger, documents, rate card and comms: the tabbed rider console. */
      { label: 'Rider console', href: '/riders/console', module: 'riders' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: 'finance',
    items: [
      {
        label: 'Office Finance',
        href: '/finance/office',
        module: 'office_finance',
        orModule: 'finance',
        home: true,
      },
      { label: 'Transactions', href: '/finance/transactions', module: 'finance', home: true },
      {
        label: 'Settlements & Payouts',
        href: '/finance/settlements',
        module: 'finance',
        home: true,
      },
      { label: 'Payout rules', href: '/finance/payout-rules', module: 'finance' },
      { label: 'Reconciliations', href: '/finance/reconciliation', module: 'finance', home: true },
      { label: 'Invoices', href: '/finance/invoices', module: 'finance', home: true },
      { label: 'Reports', href: '/finance/reports', module: 'finance', home: true },
      { label: 'Fraud Checks', href: '/finance/fraud', module: 'finance', home: true },
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
      { label: 'Company Files', href: '/company/files', module: 'company', home: true },
      { label: 'Company Inventory', href: '/company/inventory', module: 'company', home: true },
      { label: 'Assets & Equipment', href: '/company/assets', module: 'company', home: true },
      { label: 'Procurement', href: '/company/procurement', module: 'company', home: true },
      { label: 'Vendors & Suppliers', href: '/company/vendors', module: 'company', home: true },
      { label: 'Warehouses & Stores', href: '/company/warehouses', module: 'company', home: true },
    ],
  },
  {
    key: 'integrations',
    label: 'Integrations',
    icon: 'integrations',
    href: '/integrations',
    module: 'settings',
    items: [],
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
    const items = group.items.filter(
      (item) => modules.has(item.module) || (!!item.orModule && modules.has(item.orModule)),
    );
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
