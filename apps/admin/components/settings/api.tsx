'use client';

import { Card } from '@nexg/ui';
import * as React from 'react';

import {
  type ApiOutcome,
  clearApiSecret,
  type ConnectionInput,
  readApiTest,
  saveApiConnection,
  setApiEnabled,
  setApiSecret,
  startApiTest,
} from '@/app/settings/api-actions';

import { type IntegrationRow, Pill, STATUS_LABEL, STATUS_TONE, Tile } from './shared';

export interface ApiConnectionRow {
  id: string;
  key: string;
  name: string;
  kind: 'bank' | 'merchant_system' | 'payment_provider' | 'nexg_api' | 'other';
  environment: 'sandbox' | 'live';
  base_url: string | null;
  auth_type: 'none' | 'bearer' | 'api_key_header' | 'basic';
  auth_header: string | null;
  test_path: string;
  has_credential: boolean;
  has_webhook_secret: boolean;
  contact_name: string | null;
  contact_email: string | null;
  notes: string | null;
  enabled: boolean;
  status: 'not_tested' | 'connected' | 'failing';
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_status: number | null;
  last_test_ms: number | null;
  last_test_detail: string | null;
}

export interface ApiTestRow {
  id: string;
  connection_id: string;
  url: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  status_code: number | null;
  latency_ms: number | null;
  detail: string | null;
}

export interface ApiOrigins {
  web: string;
  api: string;
}

export interface WebhookStatus {
  key: 'mpesa' | 'bank';
  secret_set: boolean;
  last_event_at: string | null;
  events_30d: number;
  unhandled_30d: number;
  prompts_30d?: number;
  answered_30d?: number;
}

export interface ApiOverview {
  webhooks: WebhookStatus[];
  api_keys: { active: number; merchant: number; platform: number };
}

const KIND_LABEL: Record<ApiConnectionRow['kind'], string> = {
  bank: 'Bank',
  merchant_system: 'Merchant system',
  payment_provider: 'Payment provider',
  nexg_api: 'NexG API',
  other: 'Other API',
};

const AUTH_LABEL: Record<ApiConnectionRow['auth_type'], string> = {
  none: 'No sign-in',
  bearer: 'Bearer token',
  api_key_header: 'API key header',
  basic: 'Username and password',
};

const input =
  'border-border-strong bg-surface mt-1 w-full rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60';
const label = 'text-muted-light block text-[0.625rem] font-extrabold uppercase tracking-wide';
const button =
  'border-border-strong rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-50';
const primary =
  'bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white disabled:opacity-50';
const card = 'border-border bg-surface rounded-2xl border p-4 sm:p-5';

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-KE', {
        timeZone: 'Africa/Nairobi',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'never';

function StatusChip({ c }: { c: ApiConnectionRow }) {
  const [text, tone] = !c.enabled
    ? ['Off', 'bg-bg text-muted-light']
    : c.status === 'connected'
      ? ['Connected', 'bg-success-bg text-success']
      : c.status === 'failing'
        ? ['Failing', 'bg-danger-bg text-danger']
        : ['Not tested', 'bg-warning-bg text-warning'];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold uppercase ${tone}`}>
      {text}
    </span>
  );
}

function Note({ outcome }: { outcome: ApiOutcome | null }) {
  if (!outcome?.message) return null;
  return (
    <p
      role={outcome.ok ? 'status' : 'alert'}
      className={`mt-2 text-[0.75rem] font-bold ${outcome.ok ? 'text-success' : 'text-danger'}`}
    >
      {outcome.message}
    </p>
  );
}

export function ApiTab({
  connections,
  tests,
  canEdit,
  origins,
  integrations,
  overview,
}: {
  connections: ApiConnectionRow[];
  tests: ApiTestRow[];
  canEdit: boolean;
  origins: ApiOrigins;
  integrations: IntegrationRow[];
  /** Null until the database update for this tab is in place, or when it cannot be read. */
  overview: ApiOverview | null;
}) {
  const [adding, setAdding] = React.useState<'sandbox' | 'live' | null>(null);
  const byId = new Map(connections.map((c) => [c.id, c]));

  return (
    <div className="mt-5 space-y-8">
      <p className="text-muted max-w-3xl text-[0.8125rem] font-semibold">
        Everything NexG connects to: the external services it depends on, the webhooks that report
        payments to it, and connections to banks, merchants&apos; own systems and NexG&apos;s own
        API, each in a <strong>Sandbox</strong> for testing and a <strong>Live</strong> environment
        for real partners. Credentials are kept in Supabase Vault: you can set or replace one, but
        nobody can read it back. Connection tests are run by the database itself, so a credential
        never reaches this page.
        {!canEdit && ' You can view and test; changes need Finance or Tech.'}
      </p>

      <ApiTiles integrations={integrations} connections={connections} overview={overview} />

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <IntegrationsSection integrations={integrations} />
        <WebhooksSection origins={origins} overview={overview} />
      </div>

      {/* ───────────────────────────────────────────── environments */}
      <div className="grid gap-6 xl:grid-cols-2">
        {(['sandbox', 'live'] as const).map((env) => (
          <section key={env} aria-labelledby={`env-${env}`} className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 id={`env-${env}`} className="text-lg font-extrabold tracking-tight">
                  {env === 'sandbox' ? 'Sandbox environment' : 'Live environment'}
                </h3>
                <p className="text-muted text-[0.75rem] font-semibold">
                  {env === 'sandbox'
                    ? 'Test systems and fake money. Local http addresses are allowed.'
                    : 'Real partners and real data. https on a public address only.'}
                </p>
              </div>
              {canEdit && (
                <button type="button" className={button} onClick={() => setAdding(env)}>
                  Add connection
                </button>
              )}
            </div>
            {adding === env && (
              <ConnectionForm environment={env} onDone={() => setAdding(null)} initial={null} />
            )}
            {connections.filter((c) => c.environment === env).length === 0 ? (
              <p className="text-muted-light text-sm font-semibold">
                {env === 'live'
                  ? 'No live connections yet. Add one when a bank or merchant shares its live address and credentials.'
                  : 'No sandbox connections yet.'}
              </p>
            ) : (
              connections
                .filter((c) => c.environment === env)
                .map((c) => <ConnectionCard key={c.id} c={c} canEdit={canEdit} origins={origins} />)
            )}
          </section>
        ))}
      </div>

      <MerchantGuide origins={origins} />

      {/* ───────────────────────────────────────────── recent tests */}
      <section className={card} aria-labelledby="api-tests">
        <h3 id="api-tests" className="text-[0.9375rem] font-extrabold tracking-tight">
          Recent connection tests
        </h3>
        {tests.length === 0 ? (
          <p className="text-muted-light mt-2 text-sm font-semibold">No tests yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[0.75rem]">
              <thead className="text-muted-light uppercase">
                <tr>
                  <th className="py-1.5 pr-3">When</th>
                  <th className="py-1.5 pr-3">Connection</th>
                  <th className="py-1.5 pr-3">Result</th>
                  <th className="py-1.5 pr-3">Time</th>
                  <th className="py-1.5">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y font-semibold">
                {tests.map((t) => (
                  <tr key={t.id} className="align-top">
                    <td className="whitespace-nowrap py-1.5 pr-3">{when(t.started_at)}</td>
                    <td className="py-1.5 pr-3">{byId.get(t.connection_id)?.name ?? '—'}</td>
                    <td
                      className={`py-1.5 pr-3 ${t.ok ? 'text-success' : t.ok === false ? 'text-danger' : ''}`}
                    >
                      {t.ok == null
                        ? 'Waiting'
                        : t.ok
                          ? `Passed ${t.status_code}`
                          : `Failed ${t.status_code ?? ''}`}
                    </td>
                    <td className="py-1.5 pr-3">
                      {t.latency_ms != null ? `${t.latency_ms} ms` : '—'}
                    </td>
                    <td className="text-muted max-w-[22rem] truncate py-1.5" title={t.detail ?? ''}>
                      {t.detail ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ApiDocs origins={origins} />
    </div>
  );
}

// ─────────────────────────────────────────────── overview

function ApiTiles({
  integrations,
  connections,
  overview,
}: {
  integrations: IntegrationRow[];
  connections: ApiConnectionRow[];
  overview: ApiOverview | null;
}) {
  const healthy = integrations.filter((i) => i.status === 'connected').length;
  const pending = integrations.filter((i) => i.status === 'pending');
  const todo = integrations.filter((i) => i.status === 'to_do');
  const dueRotation = integrations.filter((i) => i.rotation_due).length;
  const switchedOn = connections.filter((c) => c.enabled);
  const passing = switchedOn.filter((c) => c.status === 'connected').length;
  const events = overview?.webhooks.reduce((n, w) => n + Number(w.events_30d), 0) ?? 0;
  const unhandled = overview?.webhooks.reduce((n, w) => n + Number(w.unhandled_30d), 0) ?? 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label="Integrations healthy"
        value={`${healthy} / ${integrations.length}`}
        hint={[
          pending.length > 0 ? `${pending.map((i) => i.label).join(', ')} pending` : null,
          todo.length > 0 ? `${todo.map((i) => i.label).join(', ')} to do` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        tone={todo.length > 0 ? 'warning' : undefined}
      />
      <Tile
        label="Keys due rotation"
        value={String(dueRotation)}
        hint="90-day rule"
        tone={dueRotation > 0 ? 'warning' : 'success'}
      />
      <Tile
        label="Connections passing"
        value={`${passing} / ${switchedOn.length}`}
        hint="last test of each switched-on connection"
        tone={passing < switchedOn.length ? 'warning' : 'success'}
      />
      <Tile
        label="Webhook events · 30 d"
        value={overview ? String(events) : '—'}
        hint={
          overview
            ? unhandled > 0
              ? `${unhandled} not handled`
              : 'none refused or unmatched'
            : 'status not available yet'
        }
        tone={unhandled > 0 ? 'warning' : undefined}
      />
    </div>
  );
}

function IntegrationsSection({ integrations }: { integrations: IntegrationRow[] }) {
  return (
    <section className={card} aria-labelledby="api-integrations">
      <h3 id="api-integrations" className="text-lg font-extrabold tracking-tight">
        Integrations
      </h3>
      <p className="text-muted text-[0.75rem] font-semibold">
        The external services NexG depends on.
      </p>
      <div className="mt-3 space-y-2">
        {integrations.length === 0 && (
          <p className="text-muted-light text-sm font-semibold">No integrations recorded.</p>
        )}
        {integrations.map((i) => (
          <Card key={i.key} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.875rem] font-extrabold">{i.label}</span>
              <Pill tone={STATUS_TONE[i.status]}>
                {i.status === 'pending' && (i.config.templates_total as number)
                  ? `PENDING ${
                      Number(i.config.templates_total) - Number(i.config.templates_approved)
                    }`
                  : (STATUS_LABEL[i.status] ?? i.status)}
              </Pill>
              {i.rotation_due && <Pill tone="bg-warning-bg text-warning">ROTATE KEY</Pill>}
            </div>
            <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.7]">
              {[i.provider ? `[${i.provider}]` : null, i.notes].filter(Boolean).join(' · ')}
            </p>
            {i.blocks.length > 0 && i.status !== 'connected' && (
              <p className="text-danger mt-1.5 text-[0.75rem] font-extrabold">
                Blocks: {i.blocks.join(', ').replace(/_/g, ' ')}
              </p>
            )}
            <p className="text-muted-light mt-1.5 text-[0.6875rem] font-semibold">
              {i.secrets > 0
                ? `${i.secrets} secret${i.secrets === 1 ? '' : 's'} in the vault · last rotated ${when(
                    i.key_rotated_at,
                  )}`
                : 'No secrets stored here.'}
            </p>
          </Card>
        ))}
      </div>
      <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
        Secrets live in the vault and this console holds only their names. There is no control here
        that could show you a key, which is the point.
      </p>
    </section>
  );
}

const WEBHOOKS: {
  key: WebhookStatus['key'];
  name: string;
  path: string;
  check: string;
  secret: string;
}[] = [
  {
    key: 'mpesa',
    name: 'M-Pesa (Safaricom Daraja)',
    path: '/api/payments/mpesa/callback?token=…',
    check: 'A secret token in the callback address, checked again in the database',
    secret: 'daraja_callback_secret',
  },
  {
    key: 'bank',
    name: 'Banks',
    path: '/api/payments/bank/webhook',
    check: 'X-Bank-Signature: HMAC-SHA256 of "timestamp.body", refused after five minutes',
    secret: 'bank_webhook_secret',
  },
];

function WebhooksSection({
  origins,
  overview,
}: {
  origins: ApiOrigins;
  overview: ApiOverview | null;
}) {
  return (
    <section className={card} aria-labelledby="api-webhooks">
      <h3 id="api-webhooks" className="text-lg font-extrabold tracking-tight">
        Webhooks
      </h3>
      <p className="text-muted text-[0.75rem] font-semibold">
        Where payment providers and banks tell NexG what happened. Only a verified event changes a
        payment.
      </p>
      <div className="mt-3 space-y-2">
        {WEBHOOKS.map((w) => {
          const s = overview?.webhooks.find((x) => x.key === w.key);
          const prompts = Number(s?.prompts_30d ?? 0);
          const silent = w.key === 'mpesa' && prompts > 0 && Number(s?.events_30d ?? 0) === 0;
          return (
            <Card key={w.key} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.875rem] font-extrabold">{w.name}</span>
                {s && (
                  <Pill
                    tone={
                      s.secret_set ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'
                    }
                  >
                    {s.secret_set ? 'SECRET SET' : 'NO SECRET'}
                  </Pill>
                )}
              </div>
              <p className="text-muted mt-1 break-all font-mono text-[0.6875rem]">
                POST {origins.web}
                {w.path}
              </p>
              <p className="text-muted mt-1 text-[0.75rem] font-semibold">{w.check}.</p>
              <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
                Vault secret <code className="font-mono">{w.secret}</code>
                {s
                  ? ` · last event ${when(s.last_event_at)} · ${s.events_30d} in 30 days${
                      Number(s.unhandled_30d) > 0 ? ` · ${s.unhandled_30d} not handled` : ''
                    }`
                  : ''}
                {s && w.key === 'mpesa'
                  ? ` · ${prompts} prompt${prompts === 1 ? '' : 's'} sent, ${s.answered_30d ?? 0} answered`
                  : ''}
              </p>
              {silent && (
                <p className="text-danger mt-1.5 text-[0.75rem] font-bold">
                  Prompts went out but no answer from Safaricom was recorded. Check that Safaricom
                  can reach this address and that DARAJA_CALLBACK_SECRET on the website matches{' '}
                  <code className="font-mono">daraja_callback_secret</code> in Vault.
                </p>
              )}
            </Card>
          );
        })}
      </div>
      <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
        {overview
          ? `API keys: ${overview.api_keys.active} active (${overview.api_keys.merchant} for merchants, ${overview.api_keys.platform} platform). `
          : 'Live webhook status appears once the database update for this tab has been run. '}
        Keys are created in the{' '}
        <a
          className="underline"
          href={`${origins.api}/developers`}
          target="_blank"
          rel="noreferrer"
        >
          developer console
        </a>{' '}
        and shown once.
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────── one connection

function ConnectionCard({
  c,
  canEdit,
  origins,
}: {
  c: ApiConnectionRow;
  canEdit: boolean;
  origins: ApiOrigins;
}) {
  const [editing, setEditing] = React.useState(false);
  const [secretFor, setSecretFor] = React.useState<'credential' | 'webhook' | null>(null);
  const [testing, setTesting] = React.useState(false);
  const [outcome, setOutcome] = React.useState<ApiOutcome | null>(null);
  const [pending, startTransition] = React.useTransition();

  async function test() {
    setTesting(true);
    setOutcome(null);
    const started = await startApiTest(c.id);
    if (!started.ok || !started.id) {
      setTesting(false);
      setOutcome(started);
      return;
    }
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const r = await readApiTest(started.id);
      if (r.done) {
        setTesting(false);
        setOutcome({
          ok: !!r.ok,
          message:
            r.message ??
            (r.ok
              ? `Passed: HTTP ${r.status_code} in ${r.latency_ms} ms.`
              : `Failed${r.status_code ? `: HTTP ${r.status_code}` : ''}. ${r.detail ?? ''}`),
        });
        return;
      }
    }
    setTesting(false);
    setOutcome({ ok: false, message: 'Still waiting for an answer. Check again in a moment.' });
  }

  const needsCredential = c.auth_type !== 'none';
  return (
    <article className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-[0.9375rem] font-extrabold tracking-tight">{c.name}</h4>
            <span className="bg-bg text-muted rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold uppercase">
              {KIND_LABEL[c.kind]}
            </span>
            <StatusChip c={c} />
          </div>
          <p className="text-muted mt-1 break-all font-mono text-[0.75rem]">
            {c.base_url ? `${c.base_url}${c.test_path}` : 'No address yet'}
          </p>
          <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
            {AUTH_LABEL[c.auth_type]}
            {c.auth_type === 'api_key_header' && c.auth_header ? ` (${c.auth_header})` : ''}
            {needsCredential && (c.has_credential ? ' · credential set' : ' · no credential yet')}
            {c.kind === 'bank' && (c.has_webhook_secret ? ' · webhook secret set' : '')}
            {' · last tested '}
            {when(c.last_tested_at)}
            {c.last_test_ms != null ? ` (${c.last_test_ms} ms)` : ''}
          </p>
          {c.last_test_ok === false && c.last_test_detail && (
            <p className="text-danger mt-1 text-[0.6875rem] font-semibold">{c.last_test_detail}</p>
          )}
          {c.notes && <p className="text-muted mt-2 max-w-xl text-[0.75rem]">{c.notes}</p>}
          {c.kind === 'bank' && (
            <p className="text-muted mt-2 text-[0.6875rem] font-semibold">
              Give the bank this webhook address:{' '}
              <code className="font-mono">{origins.web}/api/payments/bank/webhook</code>
            </p>
          )}
          {(c.contact_name || c.contact_email) && (
            <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
              Contact: {[c.contact_name, c.contact_email].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={primary}
            disabled={testing || !c.enabled || !c.base_url}
            onClick={() => void test()}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          {canEdit && (
            <>
              <button type="button" className={button} onClick={() => setEditing((v) => !v)}>
                Edit
              </button>
              {needsCredential && (
                <button type="button" className={button} onClick={() => setSecretFor('credential')}>
                  {c.has_credential ? 'Replace credential' : 'Set credential'}
                </button>
              )}
              {c.kind === 'bank' && (
                <button type="button" className={button} onClick={() => setSecretFor('webhook')}>
                  {c.has_webhook_secret ? 'Replace webhook secret' : 'Set webhook secret'}
                </button>
              )}
              <button
                type="button"
                className={button}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => setOutcome(await setApiEnabled(c.id, !c.enabled)))
                }
              >
                {c.enabled ? 'Switch off' : 'Switch on'}
              </button>
            </>
          )}
        </div>
      </div>
      <Note outcome={outcome} />
      {editing && (
        <ConnectionForm environment={c.environment} initial={c} onDone={() => setEditing(false)} />
      )}
      {secretFor && (
        <SecretForm
          c={c}
          kind={secretFor}
          onDone={(o) => {
            setSecretFor(null);
            if (o) setOutcome(o);
          }}
        />
      )}
    </article>
  );
}

function SecretForm({
  c,
  kind,
  onDone,
}: {
  c: ApiConnectionRow;
  kind: 'credential' | 'webhook';
  onDone: (o: ApiOutcome | null) => void;
}) {
  const [value, setValue] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const [outcome, setOutcome] = React.useState<ApiOutcome | null>(null);
  const isSet = kind === 'credential' ? c.has_credential : c.has_webhook_secret;
  return (
    <form
      className="border-border mt-4 space-y-2 rounded-xl border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const o = await setApiSecret(c.id, kind, value);
          setValue('');
          if (o.ok) onDone(o);
          else setOutcome(o);
        });
      }}
    >
      <label className="block">
        <span className={label}>
          {kind === 'webhook'
            ? 'Webhook signing secret (the value the bank signs its events with)'
            : c.auth_type === 'basic'
              ? 'username:password'
              : 'API key or token'}
        </span>
        <input
          className={input}
          type="password"
          autoComplete="off"
          required
          minLength={8}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <p className="text-muted-light text-[0.6875rem] font-semibold">
        Stored in Supabase Vault. It cannot be shown again, only replaced or removed. Paste it here
        directly from the partner; do not send it by chat or email.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={pending || value.length < 8}>
          Save to Vault
        </button>
        {isSet && (
          <button
            type="button"
            className={button}
            disabled={pending}
            onClick={() => startTransition(async () => onDone(await clearApiSecret(c.id, kind)))}
          >
            Remove
          </button>
        )}
        <button type="button" className={button} onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
      <Note outcome={outcome} />
    </form>
  );
}

function ConnectionForm({
  environment,
  initial,
  onDone,
}: {
  environment: 'sandbox' | 'live';
  initial: ApiConnectionRow | null;
  onDone: () => void;
}) {
  const [form, setForm] = React.useState<ConnectionInput>({
    id: initial?.id,
    name: initial?.name ?? '',
    kind: initial?.kind ?? 'merchant_system',
    environment: initial?.environment ?? environment,
    base_url: initial?.base_url ?? '',
    auth_type: initial?.auth_type ?? 'bearer',
    auth_header: initial?.auth_header ?? '',
    test_path: initial?.test_path ?? '/health',
    contact_name: initial?.contact_name ?? '',
    contact_email: initial?.contact_email ?? '',
    notes: initial?.notes ?? '',
  });
  const [pending, startTransition] = React.useTransition();
  const [outcome, setOutcome] = React.useState<ApiOutcome | null>(null);
  const set =
    (k: keyof ConnectionInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      className="border-border mt-3 grid gap-3 rounded-xl border p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const o = await saveApiConnection(form);
          setOutcome(o);
          if (o.ok) onDone();
        });
      }}
    >
      <label>
        <span className={label}>Name</span>
        <input
          className={input}
          required
          minLength={2}
          maxLength={80}
          value={form.name}
          onChange={set('name')}
        />
      </label>
      <label>
        <span className={label}>Type</span>
        <select className={input} value={form.kind} onChange={set('kind')}>
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={label}>Environment</span>
        <select className={input} value={form.environment} onChange={set('environment')}>
          <option value="sandbox">Sandbox</option>
          <option value="live">Live</option>
        </select>
      </label>
      <label>
        <span className={label}>Base address</span>
        <input
          className={input}
          placeholder={
            form.environment === 'live'
              ? 'https://api.partner.co.ke'
              : 'https://sandbox.partner.co.ke'
          }
          value={form.base_url}
          onChange={set('base_url')}
        />
      </label>
      <label>
        <span className={label}>Sign-in</span>
        <select className={input} value={form.auth_type} onChange={set('auth_type')}>
          {Object.entries(AUTH_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {form.auth_type === 'api_key_header' ? (
        <label>
          <span className={label}>Header name</span>
          <input
            className={input}
            placeholder="X-Api-Key"
            value={form.auth_header}
            onChange={set('auth_header')}
          />
        </label>
      ) : (
        <span />
      )}
      <label>
        <span className={label}>Test path (GET)</span>
        <input
          className={input}
          placeholder="/health"
          value={form.test_path}
          onChange={set('test_path')}
        />
      </label>
      <label>
        <span className={label}>Partner contact</span>
        <input
          className={input}
          placeholder="Name"
          value={form.contact_name}
          onChange={set('contact_name')}
        />
      </label>
      <label>
        <span className={label}>Contact email</span>
        <input
          className={input}
          type="email"
          value={form.contact_email}
          onChange={set('contact_email')}
        />
      </label>
      <label className="sm:col-span-2">
        <span className={label}>Notes</span>
        <textarea
          className={input}
          rows={2}
          maxLength={2000}
          value={form.notes}
          onChange={set('notes')}
        />
      </label>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className={primary} disabled={pending}>
          {pending ? 'Saving…' : 'Save connection'}
        </button>
        <button type="button" className={button} onClick={onDone}>
          Cancel
        </button>
      </div>
      <div className="sm:col-span-2">
        <Note outcome={outcome} />
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────── merchant systems

function MerchantGuide({ origins }: { origins: ApiOrigins }) {
  return (
    <section className={card} aria-labelledby="api-merchants">
      <h3 id="api-merchants" className="text-lg font-extrabold tracking-tight">
        Connecting merchant systems
      </h3>
      <div className="mt-3 grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="text-[0.8125rem] font-extrabold">
            NexG calling the merchant&apos;s system
          </h4>
          <p className="text-muted mt-1 text-[0.75rem]">
            For a merchant&apos;s POS, ERP, booking or stock system that NexG reads from or sends
            to.
          </p>
          <ol className="text-muted mt-2 list-decimal space-y-1 pl-5 text-[0.75rem] font-semibold">
            <li>
              Ask the merchant for their <strong>test</strong> address, a health or status path (any
              GET that answers 200), and a test key.
            </li>
            <li>
              Add it in the <strong>Sandbox environment</strong> as a <em>Merchant system</em>, set
              the credential, and press <strong>Test connection</strong>.
            </li>
            <li>
              A pass means the address answers and the key is accepted. A 401 or 403 means the key
              is wrong; no answer means the address is wrong or not public.
            </li>
            <li>
              When they share live details, add the same system in the{' '}
              <strong>Live environment</strong> (https, public address) and test again.
            </li>
          </ol>
        </div>
        <div>
          <h4 className="text-[0.8125rem] font-extrabold">
            The merchant&apos;s system calling NexG
          </h4>
          <p className="text-muted mt-1 text-[0.75rem]">
            Merchants and partners read NexG&apos;s data with an API key.
          </p>
          <ol className="text-muted mt-2 list-decimal space-y-1 pl-5 text-[0.75rem] font-semibold">
            <li>
              The merchant creates a key in the developer console:{' '}
              <a
                className="underline"
                href={`${origins.api}/developers`}
                target="_blank"
                rel="noreferrer"
              >
                {origins.api}/developers
              </a>
              .
            </li>
            <li>
              They send it on every request as <code className="font-mono">X-Api-Key</code>.
            </li>
            <li>
              To check they are connected, they call:
              <pre className="bg-bg mt-1 overflow-x-auto rounded-lg p-2 font-mono text-[0.6875rem]">
                {`curl -H "X-Api-Key: <their key>" ${origins.api}/v1/zones`}
              </pre>
            </li>
            <li>
              The <strong>NexG public API</strong> card above tests the same address from our side.
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────── documentation

function ApiDocs({ origins }: { origins: ApiOrigins }) {
  const h = 'text-[0.8125rem] font-extrabold mt-5';
  const p = 'text-muted mt-1 text-[0.75rem] leading-relaxed';
  const code = 'font-mono text-[0.6875rem]';
  const rows: [string, string, string][] = [
    ['GET', '/v1/catalog/merchants', 'Live merchants; filter by city, category, text. Public.'],
    ['GET', '/v1/catalog/merchants/{id}', 'One merchant and its catalogue. Public.'],
    ['GET', '/v1/zones', 'Active delivery zones. Public.'],
    ['GET', '/v1/experiences', 'Upcoming events. Public.'],
    ['GET', '/v1/services', 'Service types. Public.'],
    ['GET', '/v1/orders', 'Orders of the merchant the key belongs to. Needs merchant_read.'],
  ];
  const urls: [string, string, string][] = [
    [
      'NexG API',
      `${origins.api}/v1`,
      'Partners and merchants read NexG data here, with X-Api-Key.',
    ],
    ['API docs', `${origins.api}/docs`, 'The full public reference, including the bank guide.'],
    ['Developer console', `${origins.api}/developers`, 'Where keys are created.'],
    [
      'Bank webhook',
      `${origins.web}/api/payments/bank/webhook`,
      'Banks post signed collection events here.',
    ],
    [
      'M-Pesa callback',
      `${origins.web}/api/payments/mpesa/callback`,
      'Safaricom Daraja results (secret token in the URL).',
    ],
  ];
  return (
    <section className={card} aria-labelledby="api-docs">
      <h3 id="api-docs" className="text-lg font-extrabold tracking-tight">
        API documentation
      </h3>

      <h4 className={h}>How the NexG API works</h4>
      <p className={p}>
        A JSON API over HTTPS at <code className={code}>{origins.api}/v1</code>. Every response is{' '}
        <code className={code}>{'{ ok, data, meta }'}</code> or{' '}
        <code className={code}>{'{ ok: false, error: { code, message } }'}</code>. Lists are
        cursor-paginated (<code className={code}>cursor</code>, <code className={code}>limit</code>{' '}
        up to 100). Requests are rate-limited per key; a 429 carries{' '}
        <code className={code}>Retry-After</code>.
      </p>

      <h4 className={h}>Signing in</h4>
      <p className={p}>
        Send the key as <code className={code}>X-Api-Key: &lt;key&gt;</code> (or{' '}
        <code className={code}>Authorization: Bearer &lt;key&gt;</code>). Keys are stored only as a
        hash and shown once. Scopes: <code className={code}>public_read</code> (default),{' '}
        <code className={code}>merchant_read</code> (a merchant&apos;s own orders),{' '}
        <code className={code}>merchant_write</code>, <code className={code}>internal_read</code>,{' '}
        <code className={code}>internal_write</code>. A merchant key only ever sees its own
        merchant.
      </p>

      <h4 className={h}>What it can access</h4>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-[0.75rem]">
          <tbody className="divide-border divide-y">
            {rows.map(([m, path, what]) => (
              <tr key={path} className="align-top">
                <td className="py-1.5 pr-3 font-mono font-bold">{m}</td>
                <td className="py-1.5 pr-3 font-mono">{path}</td>
                <td className="text-muted py-1.5">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={p}>
        It does not expose guests&apos; personal details, payments, payouts or other merchants&apos;
        orders, and there are no write endpoints for API keys yet.
      </p>

      <h4 className={h}>How NexG connects to other systems</h4>
      <p className={p}>
        <strong>Outgoing:</strong> each system NexG calls is a connection on this page, with a base
        address, a sign-in method (bearer token, API key header, or username and password) and a
        test path. Tests send{' '}
        <code className={code}>GET &lt;base address&gt;&lt;test path&gt;</code> from the database,
        with the credential from Vault, and pass on any 2xx answer within 10 seconds.
        <br />
        <strong>Incoming:</strong> banks and payment providers tell NexG about payments with signed
        webhooks. A bank signs with{' '}
        <code className={code}>
          X-Bank-Signature: t=&lt;unix seconds&gt;,v1=&lt;HMAC-SHA256 of &quot;t.body&quot;&gt;
        </code>
        ; NexG refuses anything unsigned, altered or more than five minutes old, and checks the
        amount and currency against the order.
      </p>

      <h4 className={h}>Environments</h4>
      <p className={p}>
        <strong>Sandbox</strong>: test systems, such as the NexG Sandbox Bank (no real money;
        refused on the production site). <strong>Live</strong>: partners&apos; production systems,
        https on a public address only, added when the partner shares its live details.
      </p>

      <h4 className={h}>Addresses</h4>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-[0.75rem]">
          <tbody className="divide-border divide-y">
            {urls.map(([name, url, what]) => (
              <tr key={name} className="align-top">
                <td className="whitespace-nowrap py-1.5 pr-3 font-bold">{name}</td>
                <td className="break-all py-1.5 pr-3 font-mono">{url}</td>
                <td className="text-muted py-1.5">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={p}>
        Full reference:{' '}
        <a className="underline" href={`${origins.api}/docs`} target="_blank" rel="noreferrer">
          {origins.api}/docs
        </a>{' '}
        and the bank guide at{' '}
        <a
          className="underline"
          href={`${origins.api}/docs/bank-transfers`}
          target="_blank"
          rel="noreferrer"
        >
          {origins.api}/docs/bank-transfers
        </a>
        .
      </p>
    </section>
  );
}
