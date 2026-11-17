'use client';

import { buttonVariants, cn } from '@nexg/ui';
import { ExternalLink, FlaskConical } from 'lucide-react';
import * as React from 'react';

import {
  loadDeveloperAccess,
  type DeveloperAccess,
  type DeveloperEndpoint,
  type DeveloperKey,
} from '@/app/merchant/settings/developer-actions';

import { Badge, Card, Empty, Note } from './ui';
import s from './settings.module.css';

export const DEVELOPER_CONSOLE_URL = 'https://api.nexgapp.com/developers';
export const API_DOCS_URL = 'https://api.nexgapp.com/docs';
const EVENTS_DOCS_URL = 'https://api.nexgapp.com/docs/events';

const SCOPE_WORDS: Record<string, string> = {
  public_read: 'Public catalogue',
  merchant_read: 'Your orders',
  merchant_write: 'Book services',
  internal_read: 'NexG internal',
  internal_write: 'NexG internal',
};

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-KE', {
        timeZone: 'Africa/Nairobi',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

function TestBadge() {
  return (
    <Badge tone="info">
      <FlaskConical size={12} aria-hidden="true" /> Test
    </Badge>
  );
}

function KeysTable({ keys }: { keys: DeveloperKey[] }) {
  if (!keys.length) {
    return (
      <Empty title="No API keys yet">
        Create one in the developer console. The key is shown once there, so copy it to your system
        straight away.
      </Empty>
    );
  }
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Key</th>
            <th>Can</th>
            <th>Status</th>
            <th>Last used</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id}>
              <td>
                <strong className="font-mono">{k.prefix}…</strong>{' '}
                {k.environment === 'test' && <TestBadge />}
                <span className={cn(s.small, s.muted)} style={{ display: 'block' }}>
                  Created {when(k.createdAt)}
                </span>
              </td>
              <td className={s.muted}>
                {[...new Set(k.scopes.map((x) => SCOPE_WORDS[x] ?? x))].join(', ')}
              </td>
              <td>
                <Badge
                  tone={
                    k.state === 'active' ? 'success' : k.state === 'expired' ? 'warning' : 'neutral'
                  }
                >
                  {k.state === 'active' ? 'Active' : k.state === 'expired' ? 'Expired' : 'Revoked'}
                </Badge>
              </td>
              <td className={s.muted}>{when(k.lastUsedAt) ?? 'Not used yet'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointsList({
  endpoints,
  isOwner,
}: {
  endpoints: DeveloperEndpoint[] | null;
  isOwner: boolean;
}) {
  if (endpoints === null) {
    return <Note>Your webhook endpoints could not be read right now. They are not affected.</Note>;
  }
  if (!endpoints.length) {
    return (
      <Empty title="No webhook endpoints yet">
        {isOwner
          ? 'Add one in the developer console, and NexG will post each new booking and status change to your system.'
          : 'The business owner can add one in the developer console.'}
      </Empty>
    );
  }
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Address</th>
            <th>Status</th>
            <th>Last delivery</th>
          </tr>
        </thead>
        <tbody>
          {endpoints.map((e) => (
            <tr key={e.id}>
              <td>
                <span className={s.url}>{e.url}</span> {e.environment === 'test' && <TestBadge />}
              </td>
              <td>
                <Badge tone={e.enabled ? 'success' : 'neutral'}>{e.enabled ? 'On' : 'Off'}</Badge>
              </td>
              <td className={s.muted}>
                {e.lastDeliveryAt
                  ? `${e.lastDeliveryOk ? 'Worked' : 'Failed'}${e.lastStatusCode ? ` (${e.lastStatusCode})` : ''}, ${when(e.lastDeliveryAt)}`
                  : 'Nothing sent yet'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Settings › API & webhooks for a real workspace.
 *
 * Keys and webhook endpoints are created in the developer console on
 * api.nexgapp.com, signed in with the same NexG account; this screen sends
 * people there and shows, read-only, what this business already has.
 */
export function LiveDeveloperAccess({
  merchantId,
  initial,
}: {
  merchantId: string;
  /** Rendered as given; when absent, the screen loads it. */
  initial?: DeveloperAccess;
}) {
  const [access, setAccess] = React.useState<DeveloperAccess | null>(initial ?? null);

  React.useEffect(() => {
    if (initial) return;
    let live = true;
    loadDeveloperAccess(merchantId)
      .then((result) => live && setAccess(result))
      .catch(
        () => live && setAccess({ ok: false, message: 'Developer access could not be loaded.' }),
      );
    return () => {
      live = false;
    };
  }, [merchantId, initial]);

  return (
    <div className={s.stack}>
      <Card
        title="API & webhooks"
        description="Connect your own systems to NexG with an API key."
        action={
          <a
            href={DEVELOPER_CONSOLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'gold' }), s.button)}
          >
            Open developer console
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        }
      >
        <p>
          With an API key, your system can read your NexG orders, get an event each time a booking
          is created or changes status, and book NexG services such as airport transfers. Create
          keys and webhook endpoints in the developer console, signed in with this same NexG
          account. Try everything first with a test key: test bookings never become real orders.
        </p>
        <p className={s.small} style={{ marginTop: 12 }}>
          <a className={s.textLink} href={API_DOCS_URL} target="_blank" rel="noopener noreferrer">
            Read the API documentation
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </p>
        {access?.ok && !access.isOwner && (
          <Note>
            Only the business owner can create API keys and webhook endpoints. You can see what is
            connected below.
          </Note>
        )}
      </Card>

      {access === null ? (
        <Card title="Connected to this business">
          <p className={s.muted} role="status">
            Loading…
          </p>
        </Card>
      ) : !access.ok ? (
        <Card title="Connected to this business">
          <Note tone="warning">{access.message}</Note>
        </Card>
      ) : (
        <>
          <Card
            title="API keys"
            description="Keys for this business. The key itself is shown only once, in the console, and NexG does not keep a copy."
          >
            <KeysTable keys={access.keys} />
          </Card>
          <Card
            title="Webhook endpoints"
            description={
              <>
                Where NexG sends this business&apos;s booking events.{' '}
                <a
                  className={s.textLink}
                  href={EVENTS_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  How events work
                </a>
              </>
            }
          >
            <EndpointsList endpoints={access.endpoints} isOwner={access.isOwner} />
          </Card>
        </>
      )}
    </div>
  );
}
