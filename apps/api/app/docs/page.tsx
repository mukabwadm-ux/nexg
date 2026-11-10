import { ArrowDown, ArrowRight } from 'lucide-react';

import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, List, P, Strong } from '@/components/docs/prose';
import { pageMetadata } from '@/lib/reference/navigation';

export const metadata = pageMetadata('/docs');

const AUDIENCES = [
  {
    name: 'Merchants',
    today:
      'Read your own orders into your back office with a key bound to your merchant, and show your NexG listing and catalogue on your own website.',
    soon: 'Book transfers and couriers for your guests through the API, and receive order events instead of polling.',
    href: '/docs/merchants',
    link: 'Merchant integration guide',
  },
  {
    name: 'Partners and developers',
    today:
      'Build on NexG’s public data: live merchants and catalogues, delivery zones and bookable services. Public reads work without a key.',
    soon: 'Sandbox keys with test data, for building writes without touching real orders.',
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
      'Show guests what NexG offers in your city: live merchants and their menus, and the zones NexG delivers to.',
    soon: 'Airport transfers and couriers booked for guests from your own system.',
    href: '/docs/connecting-systems',
    link: 'Connecting your systems',
  },
];

function FlowNode({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="border-border bg-surface rounded-lg border px-4 py-3 shadow-card">
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
        nexgapp.com, from verified merchants and their catalogues to the zones NexG delivers to,
        is also available to your systems as JSON over HTTPS, from{' '}
        <C>https://api.nexgapp.com/v1</C>.
      </P>
      <List>
        <li>
          <Strong>Read</Strong> NexG&apos;s public data: merchants, catalogues, zones and bookable
          services, and upcoming experiences once a{' '}
          <A href="/docs/reference/list-experiences">known issue</A> is fixed. No key is needed to
          start.
        </li>
        <li>
          <Strong>Read your own orders</Strong> with a key bound to your merchant, newest first,
          with the same stage the merchant console shows.
        </li>
        <li>
          <Strong>Call back to NexG</Strong> with signed events. Banks do this today for payments
          at checkout.
        </li>
      </List>

      <H2 id="how-it-fits">How it fits together</H2>
      <P>
        NexG keeps one record of every merchant, item and order in its database. The website,
        the merchant console and this API all read that same record, so what your system reads is
        what a guest sees.
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
          <div key={audience.name} className="grid gap-x-8 gap-y-2 py-5 md:grid-cols-[11rem_minmax(0,1fr)]">
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
      </List>

      <H2 id="not-yet">Not available yet</H2>
      <P>
        These are designed or planned, and each is marked coming soon wherever it appears in
        these docs. Do not build against them until the <A href="/docs/changelog">changelog</A>{' '}
        says they are live.
      </P>
      <List>
        <li>
          Writes: booking a service with <C>POST /v1/orders</C>, and any <C>PATCH</C> endpoint.
        </li>
        <li>Reading one order by id, <C>GET /v1/orders/{'{id}'}</C>.</li>
        <li>Events NexG sends to you, such as an order changing stage. Poll your orders for now.</li>
        <li>Sandbox API keys with test data.</li>
        <li>Two-way sync with a POS, ERP, booking or inventory system.</li>
        <li>OAuth sign-in for third-party apps. Use API keys.</li>
      </List>
      <Callout tone="note" title="Everything live today is read-only">
        <p>
          No endpoint on api.nexgapp.com changes anything at NexG, so you can explore against the live
          API safely. The first write, booking a service, is designed around an idempotency key,
          so a retried booking is never made twice.
        </p>
      </Callout>
    </DocPage>
  );
}
