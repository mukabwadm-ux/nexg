import {
  BarChart3,
  Box,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Home,
  Settings,
  Tag,
} from 'lucide-react';

/** Preview navigation and its search index share the same permitted destinations. */
export const merchantWorkspaceNavigation = [
  {
    label: 'Home',
    href: '/merchant-live-preview',
    icon: Home,
    description: 'Your business at a glance',
    keywords: 'dashboard today overview',
  },
  {
    label: 'Work',
    href: '/merchant-live-preview/work',
    icon: ClipboardList,
    description: 'Orders, bookings and service work',
    keywords: 'orders appointments rentals jobs requests',
  },
  {
    label: 'Offerings',
    href: '/merchant-live-preview/offerings',
    icon: Box,
    description: 'Your products, services and catalogue',
    keywords: 'menu products services prices stock catalogue',
  },
  {
    label: 'Availability',
    href: '/merchant-live-preview/availability',
    icon: CalendarDays,
    description: 'Schedules, resources and capacity',
    keywords: 'calendar hours staff vehicles sessions',
  },
  {
    label: 'Business',
    href: '/merchant-live-preview/business',
    icon: Building2,
    description: 'Profile, locations and business setup',
    keywords: 'profile team documents locations coverage',
  },
  {
    label: 'Money',
    href: '/merchant-live-preview/money',
    icon: CreditCard,
    description: 'Transactions and financial records',
    keywords: 'payments refunds payouts statements fees',
  },
  {
    label: 'Promotions',
    href: '/merchant-live-preview/promotions',
    icon: Tag,
    description: 'Campaigns and campaign history',
    keywords: 'campaigns discounts featured history',
  },
  {
    label: 'Insights',
    href: '/merchant-live-preview/insights',
    icon: BarChart3,
    description: 'Performance, evidence and reports',
    keywords: 'analytics reports customers trends exports',
  },
  {
    label: 'Settings',
    href: '/merchant-live-preview/settings',
    icon: Settings,
    description: 'Account and workspace preferences',
    keywords: 'account preferences settings',
  },
] as const;

export type MerchantWorkspaceSection = (typeof merchantWorkspaceNavigation)[number]['label'];

/**
 * Sections only the signed-in workspace has. The preview has no page for
 * them, so they stay out of its navigation and search.
 */
export const merchantWorkspaceOnlyNavigation = [{ label: 'Hiring', icon: Briefcase }] as const;

export type MerchantWorkspaceNavLabel =
  | MerchantWorkspaceSection
  | (typeof merchantWorkspaceOnlyNavigation)[number]['label'];

export function workspaceNavIcon(label: MerchantWorkspaceNavLabel) {
  return [...merchantWorkspaceNavigation, ...merchantWorkspaceOnlyNavigation].find(
    (entry) => entry.label === label,
  )!.icon;
}

export function permittedWorkspaceNavigation(sections?: readonly MerchantWorkspaceSection[]) {
  return merchantWorkspaceNavigation.filter((item) => !sections || sections.includes(item.label));
}
