'use client';

import * as React from 'react';

import { type ApiOutcome, revokeApiKey } from '@/app/settings/api-actions';

import { Pill } from './shared';

/** One API key as the API tab lists it. The key itself is never stored. */
export interface AdminApiKey {
  id: string;
  merchantId: string | null;
  merchantName: string | null;
  prefix: string;
  environment: 'live' | 'test';
  scopes: string[];
  state: 'active' | 'expired' | 'revoked';
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

const card = 'border-border bg-surface rounded-2xl border p-4 sm:p-5';
const button =
  'border-border-strong rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-50';

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-KE', {
        timeZone: 'Africa/Nairobi',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

/**
 * Every API key issued on api.nexgapp.com, with Revoke on the active ones.
 *
 * Any staff member may revoke a key (rpc_api_key_revoke), and the audit log
 * names them with the reason given. Merchants revoke their own keys in the
 * developer console or in their Settings.
 */
export function ApiKeysSection({
  keys,
  consoleUrl,
}: {
  /** Null when the keys could not be read. */
  keys: AdminApiKey[] | null;
  consoleUrl: string;
}) {
  const [pending, startTransition] = React.useTransition();
  const [outcome, setOutcome] = React.useState<ApiOutcome | null>(null);
  const [showPast, setShowPast] = React.useState(false);

  function revoke(k: AdminApiKey) {
    const reason = window.prompt(
      `Revoke ${k.prefix}… (${k.merchantName ?? 'no merchant'})?\n\nRequests with it are refused at once, and it cannot be switched back on.\n\nWhy? This goes in the audit log.`,
      '',
    );
    if (reason === null) return;
    startTransition(async () => setOutcome(await revokeApiKey(k.id, reason)));
  }

  const active = keys?.filter((k) => k.state === 'active') ?? [];
  const past = keys?.filter((k) => k.state !== 'active') ?? [];
  const shown = showPast ? [...active, ...past] : active;

  return (
    <section className={card} aria-labelledby="api-keys">
      <h3 id="api-keys" className="text-lg font-extrabold tracking-tight">
        API keys
      </h3>
      <p className="text-muted text-[0.75rem] font-semibold">
        Keys issued in the{' '}
        <a className="underline" href={consoleUrl} target="_blank" rel="noreferrer">
          developer console
        </a>
        . NexG stores only a hash, so a key is named here by its first characters. Revoke a key that
        may have leaked: requests with it are refused at once. Owners can also revoke their own keys
        in the console or in their Settings.
      </p>

      {outcome?.message && (
        <p
          role={outcome.ok ? 'status' : 'alert'}
          className={`mt-3 text-[0.75rem] font-bold ${outcome.ok ? 'text-success' : 'text-danger'}`}
        >
          {outcome.message}
        </p>
      )}

      {keys === null ? (
        <p className="text-muted-light mt-3 text-sm font-semibold">
          The keys could not be read right now.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-muted-light mt-3 text-sm font-semibold">No active keys.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[0.75rem]">
            <thead className="text-muted-light uppercase">
              <tr>
                <th className="py-1.5 pr-3">Key</th>
                <th className="py-1.5 pr-3">Merchant</th>
                <th className="py-1.5 pr-3">Scopes</th>
                <th className="py-1.5 pr-3">Status</th>
                <th className="py-1.5 pr-3">Last used</th>
                <th className="py-1.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y font-semibold">
              {shown.map((k) => (
                <tr key={k.id} className="align-top">
                  <td className="whitespace-nowrap py-1.5 pr-3">
                    <span className="font-mono font-bold">{k.prefix}…</span>{' '}
                    {k.environment === 'test' && <Pill tone="bg-info-bg text-info">TEST</Pill>}
                    <span className="text-muted-light block">issued {day(k.createdAt)}</span>
                  </td>
                  <td className="py-1.5 pr-3">{k.merchantName ?? 'No merchant'}</td>
                  <td className="text-muted py-1.5 pr-3 font-mono">{k.scopes.join(', ')}</td>
                  <td className="py-1.5 pr-3">
                    {k.state === 'active' ? (
                      <span className="text-success">Active</span>
                    ) : k.state === 'expired' ? (
                      <span className="text-warning">Expired</span>
                    ) : (
                      <span className="text-muted">
                        Revoked {day(k.revokedAt)}
                        {k.revokeReason && (
                          <span className="text-muted-light block">{k.revokeReason}</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="text-muted py-1.5 pr-3">{day(k.lastUsedAt) ?? 'never'}</td>
                  <td className="py-1.5">
                    {k.state === 'active' && (
                      <button
                        type="button"
                        className={button}
                        disabled={pending}
                        onClick={() => revoke(k)}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {past.length > 0 && (
        <button
          type="button"
          className="text-muted mt-3 text-[0.75rem] font-bold underline"
          onClick={() => setShowPast((v) => !v)}
        >
          {showPast ? 'Hide revoked and expired keys' : `Show revoked and expired (${past.length})`}
        </button>
      )}
    </section>
  );
}
