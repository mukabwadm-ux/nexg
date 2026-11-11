import type { Metadata } from 'next';

import { ENDPOINT_GROUPS, endpointsInGroup } from './endpoints';
import type { EndpointStatus, HttpMethod } from './types';

/**
 * The documentation's table of contents.
 *
 * One list drives the sidebar, the mobile menu, each page's title and
 * description, and the previous/next links at the foot of every page, so
 * a page's name is written once. The reference entries are derived from
 * the endpoint registry, so a new endpoint appears in the navigation the
 * moment it is added there.
 */

export interface NavLink {
  href: string;
  /** The label in the sidebar. */
  label: string;
  /** The page's heading, when it differs from the label. */
  title?: string;
  /** One sentence: the page's lead paragraph and meta description. */
  description: string;
  method?: HttpMethod;
  status?: EndpointStatus;
  /** A live endpoint that is failing right now (its registry `warning`). */
  issue?: boolean;
}

export interface NavSection {
  label: string;
  links: NavLink[];
  /** A resource group inside the API reference, set smaller in the sidebar. */
  nested?: boolean;
}

export const GUIDE_SECTIONS: NavSection[] = [
  {
    label: 'Get started',
    links: [
      {
        href: '/docs',
        label: 'Introduction',
        title: 'The NexG API',
        description:
          'What the API does, who it is for, and the shortest path from a first request to a live integration.',
      },
      {
        href: '/docs/quickstart',
        label: 'Quickstart',
        description:
          'Make your first request in a minute, then get a key and read your own merchant’s orders.',
      },
    ],
  },
  {
    label: 'How it works',
    links: [
      {
        href: '/docs/auth',
        label: 'Authentication',
        description: 'API keys, the scopes they carry, how to send them and how to keep them safe.',
      },
      {
        href: '/docs/environments',
        label: 'Environments',
        title: 'Environments and base URLs',
        description:
          'Where the API lives, what sandbox means at NexG today, and how a connection moves from sandbox to live.',
      },
      {
        href: '/docs/requests',
        label: 'Requests and responses',
        description:
          'The JSON envelope every response shares, pagination, money, times, caching and versions.',
      },
      {
        href: '/docs/errors',
        label: 'Errors',
        description: 'How errors are shaped, every code the API sends, and what to do about each.',
      },
      {
        href: '/docs/rate-limits',
        label: 'Rate limits',
        description:
          'How the token bucket works, what each request costs, and how to handle a 429.',
      },
      {
        href: '/docs/idempotency',
        label: 'Retries and idempotency',
        description:
          'Which requests are safe to retry, and how idempotency keys stop a retry from doing something twice.',
      },
    ],
  },
  {
    label: 'Integrate',
    links: [
      {
        href: '/docs/webhooks',
        label: 'Webhooks',
        title: 'Webhooks: calling back to NexG',
        description:
          'How a partner sends signed events to NexG, how signatures are checked, and how retries and duplicates are handled.',
      },
      {
        href: '/docs/connecting-systems',
        label: 'Connecting your systems',
        description:
          'How a POS, ERP, booking or inventory system connects to NexG, how data moves each way, and how NexG shows your data on nexgapp.com.',
      },
      {
        href: '/docs/merchants',
        label: 'For merchants',
        title: 'Merchant integration guide',
        description:
          'Connect your website or back office to NexG: issue a merchant key and keep your orders in step.',
      },
      {
        href: '/docs/bank-transfers',
        label: 'For banks',
        title: 'Bank collections',
        description:
          'The API a bank provides, the signed events NexG receives, and the NexG Sandbox Bank for testing.',
      },
    ],
  },
];

const REFERENCE_OVERVIEW: NavLink = {
  href: '/docs/reference',
  label: 'Overview',
  title: 'API reference',
  description:
    'Every endpoint NexG serves or has designed, with parameters, request samples, responses and errors.',
};

export const REFERENCE_SECTIONS: NavSection[] = ENDPOINT_GROUPS.map((group) => ({
  label: group,
  nested: true,
  links: endpointsInGroup(group).map((endpoint) => ({
    href: `/docs/reference/${endpoint.slug}`,
    label: endpoint.title,
    description: endpoint.summary,
    method: endpoint.method,
    status: endpoint.status,
    ...(endpoint.warning ? { issue: true } : {}),
  })),
}));

const CHANGELOG_LINK: NavLink = {
  href: '/docs/changelog',
  label: 'Changelog',
  title: 'Changelog and versioning',
  description: 'What changed in the API and when, and the rules NexG follows when the API changes.',
};

/** Everything, in reading order. */
export const DOCS_NAV: NavSection[] = [
  ...GUIDE_SECTIONS,
  { label: 'API reference', links: [REFERENCE_OVERVIEW] },
  ...REFERENCE_SECTIONS,
  { label: 'Updates', links: [CHANGELOG_LINK] },
];

const ORDERED_LINKS: NavLink[] = DOCS_NAV.flatMap((section) => section.links);

export function navLink(href: string): NavLink {
  const link = ORDERED_LINKS.find((candidate) => candidate.href === href);
  if (!link)
    throw new Error(`No navigation entry for ${href}. Add it to lib/reference/navigation.ts.`);
  return link;
}

export function neighbours(href: string): { previous?: NavLink; next?: NavLink } {
  const index = ORDERED_LINKS.findIndex((link) => link.href === href);
  if (index === -1) return {};
  return { previous: ORDERED_LINKS[index - 1], next: ORDERED_LINKS[index + 1] };
}

export function pageMetadata(href: string): Metadata {
  const link = navLink(href);
  return { title: link.title ?? link.label, description: link.description };
}

/**
 * The navigation as plain data, for the client components that render it.
 * Passing this (rather than importing the registry in a client component)
 * keeps endpoint examples out of the browser bundle.
 */
export function navForClient(): NavSection[] {
  return DOCS_NAV.map((section) => ({
    label: section.label,
    ...(section.nested ? { nested: true } : {}),
    links: section.links.map(({ href, label, method, status, issue }) => ({
      href,
      label,
      description: '',
      ...(method ? { method } : {}),
      ...(status ? { status } : {}),
      ...(issue ? { issue } : {}),
    })),
  }));
}
