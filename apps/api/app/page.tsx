import { ArrowRight, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import {
  EndpointPath,
  EndpointStatusBadge,
  IssueBadge,
  MethodBadge,
} from '@/components/docs/badges';
import { CopyButton } from '@/components/docs/code';
import { HeroExplorer, type ExplorerExample } from '@/components/home/hero-explorer';
import { CHANGELOG } from '@/lib/reference/changelog';
import { endpointBySlug, ENDPOINTS, endpointUrl } from '@/lib/reference/endpoints';

/**
 * api.nexgapp.com: the front door for developers. It says what the API is
 * and proves it in the first screen with requests anyone can run, then
 * sends each kind of visitor to the guide written for them.
 */

const BASE_URL = 'https://api.nexgapp.com/v1';

function explorerExamples(): ExplorerExample[] {
  return [
    { slug: 'list-zones', label: 'Zones' },
    { slug: 'list-services', label: 'Services' },
    { slug: 'list-merchants', label: 'Merchants' },
  ].flatMap(({ slug, label }) => {
    const endpoint = endpointBySlug(slug);
    if (!endpoint) return [];
    const query = new URLSearchParams(endpoint.example.query ?? {}).toString();
    return [
      {
        id: slug,
        label,
        // Quoted: an unquoted ? or & breaks the command in zsh and bash.
        command: `curl "${endpointUrl(endpoint)}${query ? `?${query}` : ''}"`,
        response: JSON.stringify(endpoint.responseExample, null, 2),
      },
    ];
  });
}

const AUDIENCES = [
  {
    name: 'Merchants',
    today: 'Read your orders into your own system, and show your NexG catalogue on your website.',
    soon: 'Book transfers and couriers for guests by API; order events pushed to you.',
    href: '/docs/merchants',
  },
  {
    name: 'Partners and developers',
    today:
      'Build on live merchants and catalogues, delivery zones, experiences and bookable services.',
    soon: 'Sandbox keys with test data, for building writes safely.',
    href: '/docs/quickstart',
  },
  {
    name: 'Banks and payment providers',
    today: 'Collections at checkout with signed webhooks, tested against the NexG Sandbox Bank.',
    soon: 'The first live bank connection.',
    href: '/docs/bank-transfers',
  },
  {
    name: 'Hotels and stays',
    today:
      'Show guests what NexG offers in your city: merchants and their menus, where NexG delivers, and what is on.',
    soon: 'Airport transfers and couriers booked for guests from your system.',
    href: '/docs/connecting-systems',
  },
];

const STEPS = [
  {
    title: 'Try it without a key',
    body: 'Public data answers anyone. Run the request above, or any read in the reference.',
    href: '/docs/quickstart',
    link: 'Quickstart',
  },
  {
    title: 'Get a key',
    body: 'Sign in to the developer console with your NexG account. Choose public data, your merchant’s orders, or both. The key is shown once.',
    href: '/developers',
    link: 'Developer console',
  },
  {
    title: 'Go live',
    body: 'Keep the key on your server, handle errors and limits, and follow cursors. Banks and partner systems connect in sandbox first.',
    href: '/docs/environments',
    link: 'Environments',
  },
];

const GUIDES = [
  {
    title: 'Webhooks',
    body: 'Send NexG signed events. How signatures, retries and duplicates work.',
    href: '/docs/webhooks',
  },
  {
    title: 'Connecting your systems',
    body: 'POS, ERP, booking and inventory: what moves each way, and how NexG shows your data.',
    href: '/docs/connecting-systems',
  },
  {
    title: 'Bank collections',
    body: 'The contract a bank provides, and the NexG Sandbox Bank to test it against.',
    href: '/docs/bank-transfers',
  },
];

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function HomePage() {
  const latest = CHANGELOG.slice(0, 3);

  return (
    <main>
      {/* ───────────────────────────────────────────── first screen */}
      <section className="bg-ink text-white">
        <div className="mx-auto grid max-w-[90rem] gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:items-center lg:px-8 lg:pb-24 lg:pt-20">
          <div className="min-w-0">
            <h1 className="max-w-[18ch] text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Connect your business to NexG.
            </h1>
            <p className="mt-6 max-w-[38rem] text-lg leading-8 text-white/75">
              Read the merchants, catalogues, delivery zones and events on nexgapp.com, and your own
              orders, as JSON over HTTPS. Banks send signed payment events back to NexG, in sandbox
              today, so both sides keep the same record.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/docs/quickstart"
                className="bg-gold text-ink hover:bg-gold/90 focus-visible:ring-offset-ink inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-extrabold transition-colors duration-150"
              >
                Start with the quickstart
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/docs/reference"
                className="focus-visible:ring-offset-ink inline-flex h-12 items-center rounded-full border border-white/20 px-6 text-sm font-bold text-white transition-colors duration-150 hover:bg-white/[0.08]"
              >
                API reference
              </Link>
            </div>
            <div className="mt-10 flex max-w-[30rem] items-center gap-3 rounded-lg border border-white/10 py-1.5 pl-4 pr-1.5">
              <span className="text-xs font-bold text-white/55">Base URL</span>
              <code className="min-w-0 flex-1 font-mono text-sm text-white [overflow-wrap:anywhere]">
                {BASE_URL}
              </code>
              <CopyButton text={BASE_URL} label="Copy the base URL" />
            </div>
          </div>
          <div className="min-w-0">
            <HeroExplorer examples={explorerExamples()} />
          </div>
        </div>
      </section>

      {/* ───────────────────────────────────────────── who it is for */}
      <section
        aria-labelledby="audiences"
        className="mx-auto max-w-[90rem] px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div>
            <h2
              id="audiences"
              className="text-ink text-balance text-3xl font-extrabold tracking-tight"
            >
              One API, four kinds of partner
            </h2>
            <p className="text-muted mt-4 text-base leading-7">
              What each can do today, and what is designed and coming. Nothing marked coming soon
              works yet; the{' '}
              <Link
                href="/docs/changelog"
                className="text-ink decoration-gold font-semibold underline decoration-2 underline-offset-4"
              >
                changelog
              </Link>{' '}
              says when it does.
            </p>
          </div>
          <ul className="divide-border border-border divide-y border-y">
            {AUDIENCES.map((audience) => (
              <li key={audience.name}>
                <Link
                  href={audience.href}
                  className="hover:bg-surface group -mx-3 grid gap-x-8 gap-y-2 rounded-lg px-3 py-6 transition-colors duration-150 md:grid-cols-[13rem_minmax(0,1fr)_auto]"
                >
                  <span className="text-ink text-lg font-extrabold">{audience.name}</span>
                  <span className="min-w-0">
                    <span className="text-muted block text-sm leading-6">
                      <span className="text-ink font-bold">Today. </span>
                      {audience.today}
                    </span>
                    <span className="text-muted mt-1 block text-sm leading-6">
                      <span className="text-ink font-bold">Coming soon. </span>
                      {audience.soon}
                    </span>
                  </span>
                  <ChevronRight
                    className="text-muted-light group-hover:text-ink hidden h-5 w-5 self-center transition-transform duration-200 group-hover:translate-x-0.5 md:block"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────────────────────────────────────────── three steps */}
      <section aria-labelledby="steps" className="border-border bg-surface border-y">
        <div className="mx-auto max-w-[90rem] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <h2 id="steps" className="text-ink text-3xl font-extrabold tracking-tight">
            From first request to live
          </h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((step, index) => (
              <li key={step.title} className="min-w-0">
                <span
                  aria-hidden="true"
                  className="bg-ink text-gold flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold"
                >
                  {index + 1}
                </span>
                <h3 className="text-ink mt-4 text-lg font-bold">{step.title}</h3>
                <p className="text-muted mt-2 text-sm leading-6">{step.body}</p>
                <Link
                  href={step.href}
                  className="text-ink decoration-gold mt-3 inline-flex items-center gap-1 text-sm font-bold underline decoration-2 underline-offset-4"
                >
                  {step.link}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────────────────────────────────────────── endpoints */}
      <section
        aria-labelledby="endpoints"
        className="mx-auto max-w-[90rem] px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="endpoints" className="text-ink text-3xl font-extrabold tracking-tight">
            Every endpoint
          </h2>
          <Link
            href="/docs/reference"
            className="text-ink decoration-gold text-sm font-bold underline decoration-2 underline-offset-4"
          >
            Full reference
          </Link>
        </div>
        <p className="text-muted mt-3 max-w-[40rem] text-base leading-7">
          Every endpoint on api.nexgapp.com today is a read, so trying them changes nothing. Writes
          are listed as they are designed, marked coming soon until they ship.
        </p>
        <ul className="divide-border border-border bg-surface mt-8 divide-y rounded-xl border">
          {ENDPOINTS.map((endpoint) => (
            <li key={endpoint.slug}>
              <Link
                href={`/docs/reference/${endpoint.slug}`}
                className="hover:bg-bg group flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors duration-150 first:rounded-t-xl sm:flex-nowrap sm:px-5"
              >
                <MethodBadge method={endpoint.method} />
                <EndpointPath
                  path={endpoint.host === 'web' ? `nexgapp.com${endpoint.path}` : endpoint.path}
                  className="min-w-0 text-sm font-bold sm:w-[22rem] sm:shrink-0"
                />
                <span className="text-muted min-w-0 flex-1 basis-full text-sm sm:basis-auto">
                  {endpoint.title}
                </span>
                {endpoint.status !== 'live' ? (
                  <EndpointStatusBadge status={endpoint.status} />
                ) : null}
                {endpoint.warning ? <IssueBadge title={endpoint.warning} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ───────────────────────────────────────────── guides and changes */}
      <section aria-labelledby="connected" className="border-border border-t">
        <div className="mx-auto grid max-w-[90rem] gap-16 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:px-8">
          <div>
            <h2 id="connected" className="text-ink text-3xl font-extrabold tracking-tight">
              Built to stay connected
            </h2>
            <ul className="divide-border border-border mt-8 divide-y border-y">
              {GUIDES.map((guide) => (
                <li key={guide.href}>
                  <Link
                    href={guide.href}
                    className="hover:bg-surface group -mx-3 flex items-center gap-4 rounded-lg px-3 py-5 transition-colors duration-150"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-ink block text-lg font-bold">{guide.title}</span>
                      <span className="text-muted mt-1 block text-sm leading-6">{guide.body}</span>
                    </span>
                    <ChevronRight
                      className="text-muted-light group-hover:text-ink h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-ink text-xl font-extrabold tracking-tight">Latest changes</h2>
            <ol className="mt-6 space-y-5">
              {latest.map((entry) => (
                <li key={`${entry.date}-${entry.title}`}>
                  <time dateTime={entry.date} className="text-muted-light text-xs font-bold">
                    {formatDate(entry.date)}
                  </time>
                  <p className="text-ink mt-1 text-sm font-semibold leading-6">{entry.title}</p>
                </li>
              ))}
            </ol>
            <Link
              href="/docs/changelog"
              className="text-ink decoration-gold mt-6 inline-flex text-sm font-bold underline decoration-2 underline-offset-4"
            >
              Changelog and versioning
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
