'use client';

import * as React from 'react';

import { type Outcome, saveEmailRoute } from '@/app/settings/actions';

export interface EmailRouteRow {
  key: string;
  label: string;
  description: string | null;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  recipient: string | null;
  enabled: boolean;
  updated_at: string;
  sent_30d: number;
  failed_30d: number;
  can_edit: boolean;
}

/** Keys where an internal inbox is meaningful. */
const HAS_INBOX = new Set(['forms', 'finance']);

export function EmailRoutingTab({ routes }: { routes: EmailRouteRow[] }) {
  return (
    <div className="mt-5 space-y-4">
      <p className="text-muted max-w-3xl text-[0.8125rem] font-semibold">
        Pick the sender for each kind of email. The domain must be verified in Resend (nexgapp.com
        is). Sign-in and password emails are sent by Supabase Auth and are set in the Supabase
        dashboard, not here.
      </p>
      {routes.length === 0 ? (
        <p className="text-muted-light text-sm font-semibold">No email kinds found.</p>
      ) : (
        routes.map((r) => <RouteCard key={r.key} route={r} />)
      )}
    </div>
  );
}

function RouteCard({ route }: { route: EmailRouteRow }) {
  const [fromName, setFromName] = React.useState(route.from_name);
  const [fromEmail, setFromEmail] = React.useState(route.from_email);
  const [replyTo, setReplyTo] = React.useState(route.reply_to ?? '');
  const [recipient, setRecipient] = React.useState(route.recipient ?? '');
  const [enabled, setEnabled] = React.useState(route.enabled);
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<Outcome | null>(null);

  const dirty =
    fromName !== route.from_name ||
    fromEmail !== route.from_email ||
    replyTo !== (route.reply_to ?? '') ||
    recipient !== (route.recipient ?? '') ||
    enabled !== route.enabled;

  function save() {
    startTransition(async () => {
      setResult(await saveEmailRoute({ key: route.key, fromName, fromEmail, replyTo, recipient, enabled }));
    });
  }

  const input =
    'border-border-strong bg-surface mt-1 w-full rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60';
  const label = 'text-muted-light block text-[0.625rem] font-extrabold uppercase tracking-wide';

  return (
    <section className="border-border bg-surface rounded-2xl border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[0.9375rem] font-extrabold tracking-tight">{route.label}</h3>
          {route.description ? (
            <p className="text-muted mt-0.5 max-w-2xl text-[0.75rem] font-semibold">
              {route.description}
            </p>
          ) : null}
          <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
            Last 30 days: {route.sent_30d} sent
            {route.failed_30d > 0 ? ` · ${route.failed_30d} failed` : ''}
          </p>
        </div>
        <label className="flex items-center gap-2 text-[0.75rem] font-bold">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!route.can_edit}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Sending on
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Sender name
          <input className={input} value={fromName} disabled={!route.can_edit} onChange={(e) => setFromName(e.target.value)} />
        </label>
        <label className={label}>
          Send from
          <input className={input} type="email" value={fromEmail} disabled={!route.can_edit} onChange={(e) => setFromEmail(e.target.value)} />
        </label>
        <label className={label}>
          Replies go to
          <input className={input} type="email" value={replyTo} placeholder="same as sender" disabled={!route.can_edit} onChange={(e) => setReplyTo(e.target.value)} />
        </label>
        {HAS_INBOX.has(route.key) ? (
          <label className={label}>
            Deliver team copies to
            <input className={input} type="email" value={recipient} disabled={!route.can_edit} onChange={(e) => setRecipient(e.target.value)} />
          </label>
        ) : null}
      </div>

      {route.can_edit ? (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="bg-ink rounded-lg px-4 py-2 text-[0.75rem] font-extrabold text-white disabled:opacity-40"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
          {result ? (
            <span
              role="status"
              className={`text-[0.75rem] font-bold ${result.ok ? 'text-success' : 'text-danger'}`}
            >
              {result.message}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold">
          View only. A super admin or someone with full Settings access can change this.
        </p>
      )}
    </section>
  );
}
