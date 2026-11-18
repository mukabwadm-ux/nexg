import { ArrowDown, ArrowRight } from 'lucide-react';

import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, List, P, Strong } from '@/components/docs/prose';
import { pageMetadata } from '@/lib/reference/navigation';

export const metadata = pageMetadata('/docs');

const AUDIENCES = [
  {
    name: 'Merchants',
    today:
      'Read your own orders into your back office with a key bound to your merchant, get order events instead of polling, and show your NexG listing and catalogue on your own website.',
    soon: 'Change and cancel bookings through the API, and every kind of booking in one list.',
    href: '/docs/merchants',
    link: 'Merchant integration guide',
  },
  {
    name: 'Partners and developers',
    today:
      'Build on NexG’s public data: live merchants and catalogues, delivery zones, delivery checks with an ETA and a fee, upcoming experiences and bookable services. Public reads work without a key, and test keys try bookings in a sandbox.',
    soon: 'Availability for every kind of booking, and OAuth sign-in for third-party apps.',
    href: '/docs/quickstart',
    link: 'Quickstart',
  },
  {
    name: 'Banks and payment providers',
    today:
      'Collect payments at checkout through the bank collection contract, with signed webhooks, tested end to end against the NexG Sandbox Bank.',
    soon: 'The first live bank connection, once finance has approved limits and reconciliation.',
    href: '/docs/bank-transfers',
    link: 'Bank collections',
  },
  {
    name: 'Hotels and stays',
    today:
      'Show guests what NexG offers in your city: live merchants and their menus, the zones NexG delivers to, and what is on.',
    soon: 'Airport transfers and couriers booked for guests from your own system.',
    href: '/docs/connecting-systems',
    link: 'Connecting your systems',
  },
];

function FlowNode({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border-border bg-surface shadow-card rounded-lg border px-4 py-3">
      <p className="text-ink text-sm font-bold">{title}</p>
      <p className="text-muted mt-0.5 text-xs leading-5">{detail}</p>
    </div>
  );
}

/** An arrow between two nodes. Monospace only when the label is a request. */
function FlowArrow({ label, code = false }: { label: string; code?: boolean }) {
  return (
    <div className="text-muted flex items-center justify-center gap-1.5 py-1 md:flex-col md:px-1 md:py-0">
      <ArrowDown className="h-4 w-4 md:hidden" aria-hidden="true" />
      <ArrowRight className="hidden h-4 w-4 md:block" aria-hidden="true" />
      <span
        className={
          code
            ? 'text-center font-mono text-xs font-semibold leading-4'
            : 'text-center text-xs font-semibold leading-4'
        }
      >
        {label}
      </span>
    </div>
  );
}

export default function IntroductionPage() {
  return (
    <DocPage
      href="/docs"
      toc={[
        { id: 'what-it-does', label: 'What the API does' },
        { id: 'how-it-fits', label: 'How it fits together' },
        { id: 'who-its-for', label: 'Who it is for' },
        { id: 'getting-started', label: 'Getting started' },
        { id: 'not-yet', label: 'Not available yet' },
      ]}
    >
      <H2 id="what-it-does">What the API does</H2>
      <P>
        NexG is a concierge delivery and booking platform for Kenya. What a guest sees on
        nexgapp.com, from verified merchants and their catalogues to delivery zones and events, is
        also available to your systems as JSON over HTTPS, from <C>https://api.nexgapp.com/v1</C>.
      </P>
      <List>
        <li>
          <Strong>Read</Strong> NexG&apos;s public data: merchants, catalogues, zones, upcoming
          experiences and bookable services. No key is needed to start.
        </li>
        <li>
          <Strong>Check a delivery</Strong> before you offer it: whether NexG delivers between two
          points, how long it usually takes and the fee, with{' '}
          <A href="/docs/reference/check-delivery">POST /v1/delivery/check</A>.
        </li>
        <li>
          <Strong>Read your own orders</Strong> with a key bound to your merchant, newest first,
          with the same stage the merchant console shows.
        </li>
        <li>
          <Strong>Book services</Strong> such as airport transfers and couriers, and{' '}
          <Strong>hear about every booking</Strong> as it changes, through signed order events.
        </li>
        <li>
          <Strong>Keep your catalogue in step</Strong>: update prices and what is sold out from your
          own till or ERP, one item or up to 100 at a time.
        </li>
        <li>
          <Strong>Try all of it in the sandbox</Strong> with a test key, without touching real
          orders or prices.
        </li>
        <li>
          <Strong>Call back to NexG</Strong> with signed events. Banks do this today for payments at
          checkout.
        </li>
      </List>

      <H2 id="how-it-fits">How it fits together</H2>
      <P>
        NexG keeps one record of every merchant, item and order in its database. The website, the
        merchant console and this API all read that same record, so what your system reads is what a
        guest sees.
      </P>
      <figure className="mt-6">
        <div className="grid items-center gap-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
          <FlowNode title="Your system" detail="Website, POS, ERP, booking or bank" />
          <FlowArrow label="GET /v1/…" code />
          <FlowNode title="NexG API" detail="api.nexgapp.com · keys, scopes, limits" />
          <FlowArrow label="one record" />
          <FlowNode title="nexgapp.com" detail="Storefronts in NexG’s own design" />
        </div>
        <div className="mt-1 grid items-center gap-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
          <FlowNode title="Your bank" detail="Signs every event it sends" />
          <FlowArrow label="signed POST" />
          <FlowNode title="NexG webhook" detail="Checks the signature twice" />
          <FlowArrow label="once per event" />
          <FlowNode title="The order" detail="Marked paid only by a verified event" />
        </div>
        <figcaption className="text-muted-light mt-3 text-xs">
          Reads go to the API. Events come back to the website&apos;s webhook. Both end in the same
          database.
        </figcaption>
      </figure>

      <H2 id="who-its-for">Who it is for</H2>
      <div className="divide-border border-border mt-6 divide-y border-y">
        {AUDIENCES.map((audience) => (
          <div
            key={audience.name}
            className="grid gap-x-8 gap-y-2 py-5 md:grid-cols-[11rem_minmax(0,1fr)]"
          >
            <h3 className="text-ink text-base font-extrabold">{audience.name}</h3>
            <div className="min-w-0">
              <p className="text-muted text-sm leading-6">
                <span className="text-ink font-bold">Today. </span>
                {audience.today}
              </p>
              <p className="text-muted mt-1.5 text-sm leading-6">
                <span className="text-ink font-bold">Coming soon. </span>
                {audience.soon}
              </p>
              <p className="mt-2 text-sm">
                <A href={audience.href}>{audience.link}</A>
              </p>
            </div>
          </div>
        ))}
      </div>

      <H2 id="getting-started">Getting started</H2>
      <List ordered>
        <li>
          Make a request without a key: <C>curl https://api.nexgapp.com/v1/zones</C>. The{' '}
          <A href="/docs/quickstart">quickstart</A> walks through it.
        </li>
        <li>
          Sign in to the <A href="/developers">developer console</A> with your NexG account and
          issue a key. It is shown once.
        </li>
        <li>
          Read <A href="/docs/auth">Authentication</A>, <A href="/docs/errors">Errors</A> and{' '}
          <A href="/docs/rate-limits">Rate limits</A> before you go live, then build against the{' '}
          <A href="/docs/reference">API reference</A>.
        </li>
        <li>
          Prefer tools? Download the <A href="/openapi.json">OpenAPI spec</A> for code generators
          and API clients, or the <A href="/postman.json">Postman collection</A> and set its{' '}
          <C>apiKey</C> variable to a test key.
        </li>
      </List>

      <H2 id="not-yet">Not available yet</H2>
      <P>
        These are designed or planned, and each is marked coming soon wherever it appears in these
        docs. Do not build against them until the <A href="/docs/changelog">changelog</A> says they
        are live.
      </P>
      <List>
        <li>Changing or cancelling a booking through the API.</li>
        <li>Two-way sync with a POS, ERP, booking or inventory system.</li>
        <li>OAuth sign-in for third-party apps. Use API keys.</li>
      </List>
      <Callout tone="note" title="Reads are safe to explore">
        <p>
          Every endpoint except booking a service only reads, so you can explore the live API
          safely. A booking made with a live key is a real order: it carries an idempotency key, so
          a retried booking is never made twice. Try bookings with a{' '}
          <A href="/docs/environments#test-keys">test key</A> first.
        </p>
      </Callout>
    </DocPage>
  );
}
