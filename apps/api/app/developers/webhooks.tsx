'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@nexg/ui';
import { FlaskConical, Webhook } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { DeveloperMerchant } from '@/lib/merchants';
import type { WebhookDelivery, WebhookEndpoint } from '@/lib/webhooks';

import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  readWebhookDeliveries,
  sendWebhookTest,
  setWebhookEndpointEnabled,
} from './webhook-actions';

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-KE', {
        timeZone: 'Africa/Nairobi',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

function lastDelivery(e: WebhookEndpoint) {
  if (!e.lastDeliveryAt) return 'No deliveries yet';
  const code = e.lastStatusCode ? ` (${e.lastStatusCode})` : '';
  return `${e.lastDeliveryOk ? 'Last delivery worked' : 'Last delivery failed'}${code}, ${when(e.lastDeliveryAt)}`;
}

/**
 * Webhook endpoints for the merchants this person owns.
 *
 * The signing secret is shown once, straight after an endpoint is added,
 * the same way a new API key is. Everything after that names it by its
 * first characters only.
 */
export function Webhooks({
  merchants,
  initial,
}: {
  merchants: DeveloperMerchant[];
  initial: { ok: true; endpoints: WebhookEndpoint[] } | { ok: false; message: string };
}) {
  const owned = merchants.filter((m) => m.role === 'owner');
  /* The Test bookings box below reads the endpoints from the server render,
     so it said "No test endpoint is switched on" until a reload. Refreshing
     after a change keeps this card's own state, the one-time secret included. */
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>(
    initial.ok ? initial.endpoints : [],
  );
  const [environment, setEnvironment] = useState<'live' | 'test'>('live');
  const [secret, setSecret] = useState<{ value: string; url: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; deliveries: WebhookDelivery[] } | null>(null);

  if (!initial.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-ink/70 text-sm">
            Webhooks are not available right now. Try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  function run(
    action: () => Promise<{ ok: boolean; message?: string; endpoints?: WebhookEndpoint[] }>,
  ) {
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const result = await action();
      if (!result.ok) {
        setError(result.message ?? 'That did not work.');
        return;
      }
      if (result.endpoints) {
        setEndpoints(result.endpoints);
        router.refresh();
      }
      if (result.message) setNotice(result.message);
    });
  }

  function add(formData: FormData) {
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const result = await createWebhookEndpoint(formData);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEndpoints(result.endpoints);
      setSecret({ value: result.secret, url: String(formData.get('url') ?? '') });
      router.refresh();
    });
  }

  function showDeliveries(id: string) {
    if (open?.id === id) {
      setOpen(null);
      return;
    }
    startTransition(async () => {
      setError(null);
      const result = await readWebhookDeliveries(id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen({ id, deliveries: result.deliveries });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="h-5 w-5" aria-hidden="true" />
          Webhooks
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-ink/70 text-sm">
          NexG posts an event to your server when one of your bookings is created or its status
          changes, so you do not have to poll. Each event is signed with the endpoint&apos;s secret.{' '}
          <Link href="/docs/events" className="underline">
            How to receive and verify them
          </Link>
          .
        </p>

        {secret && (
          <div className="border-ink/20 space-y-3 rounded-lg border-2 p-4">
            <p className="text-sm font-bold">Signing secret for {secret.url}</p>
            <p className="text-ink/80 text-sm">
              This is the only time it will be shown. Keep it on your server, where you verify each
              event&apos;s signature.
            </p>
            <pre className="bg-ink text-bg overflow-x-auto whitespace-pre-wrap break-all rounded p-4 font-mono text-xs">
              {secret.value}
            </pre>
            <Button onClick={() => setSecret(null)}>I have stored it</Button>
          </div>
        )}

        {endpoints.length > 0 && (
          <ul className="space-y-3">
            {endpoints.map((e) => (
              <li key={e.id} className="border-border rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="break-all font-mono text-xs">{e.url}</span>
                  {e.environment === 'test' && (
                    <span className="border-ink/30 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold">
                      <FlaskConical className="h-3 w-3" aria-hidden="true" />
                      Test
                    </span>
                  )}
                  {!e.enabled && (
                    <span className="text-ink/60 rounded-full border px-2 py-0.5 text-xs">Off</span>
                  )}
                </div>
                <p className="text-ink/60 mt-1 text-xs">
                  {[
                    e.merchantName,
                    e.description,
                    `secret ${e.secretPrefix}…`,
                    lastDelivery(e),
                    e.waiting ? `${e.waiting} waiting` : null,
                    e.failed ? `${e.failed} failed` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={pending || !e.enabled}
                    onClick={() => run(() => sendWebhookTest(e.id))}
                  >
                    Send test event
                  </Button>
                  <Button type="button" disabled={pending} onClick={() => showDeliveries(e.id)}>
                    {open?.id === e.id ? 'Hide deliveries' : 'Recent deliveries'}
                  </Button>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setWebhookEndpointEnabled(e.id, !e.enabled))}
                  >
                    {e.enabled ? 'Switch off' : 'Switch on'}
                  </Button>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Remove this endpoint? Events stop at once and its delivery history is deleted.',
                        )
                      ) {
                        run(() => deleteWebhookEndpoint(e.id));
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
                {open?.id === e.id && (
                  <div className="mt-3 text-xs">
                    {open.deliveries.length === 0 ? (
                      <p className="text-ink/60">Nothing sent yet.</p>
                    ) : (
                      <ul className="divide-border divide-y">
                        {open.deliveries.map((d) => (
                          <li key={d.id} className="flex flex-wrap gap-x-3 py-1.5">
                            <span className="font-mono">{d.type}</span>
                            {d.reference && <span>{d.reference}</span>}
                            {d.status && <span>{d.status}</span>}
                            <span className="font-semibold">
                              {d.state === 'delivered'
                                ? `delivered ${when(d.deliveredAt)}`
                                : d.state === 'queued' && d.attempts > 0
                                  ? `retrying ${when(d.nextAttemptAt)}`
                                  : d.state}
                            </span>
                            {d.lastStatusCode && <span>HTTP {d.lastStatusCode}</span>}
                            {d.lastError && d.state !== 'delivered' && (
                              <span className="text-danger">{d.lastError}</span>
                            )}
                            <span className="text-ink/50">
                              {d.attempts} {d.attempts === 1 ? 'attempt' : 'attempts'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {owned.length > 0 ? (
          <form action={add} className="space-y-4">
            <p className="text-sm font-bold">Add an endpoint</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['live', 'test'] as const).map((env) => (
                <label
                  key={env}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    environment === env
                      ? 'border-ink bg-bg'
                      : 'border-border hover:border-border-strong'
                  }`}
                >
                  <input
                    type="radio"
                    name="environment"
                    value={env}
                    checked={environment === env}
                    onChange={() => setEnvironment(env)}
                    className="mt-1"
                  />
                  <span>
                    <span className="text-sm font-medium">{env === 'live' ? 'Live' : 'Test'}</span>
                    <span className="text-ink/60 block text-xs">
                      {env === 'live'
                        ? 'Events for real bookings.'
                        : 'Events for bookings made with a test key.'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="space-y-1">
              <label htmlFor="webhook_merchant" className="text-sm font-medium">
                Merchant
              </label>
              <select
                id="webhook_merchant"
                name="merchant_id"
                className="w-full rounded border px-3 py-2 text-sm"
                defaultValue={owned[0]?.id}
              >
                {owned.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.tradingName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="webhook_url" className="text-sm font-medium">
                Address
              </label>
              <input
                id="webhook_url"
                name="url"
                type="url"
                required
                placeholder="https://example.com/nexg/events"
                className="w-full rounded border px-3 py-2 font-mono text-sm"
              />
              <p className="text-ink/60 text-xs">
                https on a public host. Answer each event with a 2xx within 10 seconds; anything
                else is retried for about two days.
              </p>
            </div>
            <div className="space-y-1">
              <label htmlFor="webhook_description" className="text-sm font-medium">
                Note (optional)
              </label>
              <input
                id="webhook_description"
                name="description"
                maxLength={120}
                placeholder="Back office"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? 'Working...' : 'Add endpoint'}
            </Button>
          </form>
        ) : (
          <p className="text-ink/70 text-sm">
            Webhooks are for merchants you own. Ask the merchant&apos;s owner to add an endpoint.
          </p>
        )}

        {notice && <p className="text-ink/80 text-sm">{notice}</p>}
        {error && (
          <p
            role="alert"
            className="text-danger border-danger/40 bg-danger/5 rounded border px-3 py-2 text-sm font-semibold"
          >
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
