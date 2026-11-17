'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@nexg/ui';
import { FlaskConical } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';

import type { ConsoleKey, KeyList } from '@/lib/keys';
import type { DeveloperMerchant } from '@/lib/merchants';

import { revokeApiKey } from './key-actions';

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
    <span className="border-ink/30 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold">
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      Test
    </span>
  );
}

/**
 * The keys this person can see: those of the merchants they belong to, and
 * the keys with no merchant that they issued themselves.
 *
 * A key is shown in full only once, when it is issued; here it is named by
 * its first characters. Revoking is offered where the database allows it:
 * on a merchant's keys to its owner, and on a key with no merchant to the
 * person who issued it.
 */
export function ApiKeys({
  merchants,
  initial,
}: {
  merchants: DeveloperMerchant[];
  initial: KeyList;
}) {
  const [pending, startTransition] = useTransition();
  const [keys, setKeys] = useState<ConsoleKey[]>(initial.ok ? initial.keys : []);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initial.ok ? null : initial.message);

  // Issuing a key above refreshes the page; take the new list.
  useEffect(() => {
    if (initial.ok) setKeys(initial.keys);
  }, [initial]);

  const byId = new Map(merchants.map((m) => [m.id, m]));
  const mayRevoke = (k: ConsoleKey) =>
    k.merchantId === null || byId.get(k.merchantId)?.role === 'owner';

  function revoke(k: ConsoleKey) {
    const reason = window.prompt(
      `Revoke the key ${k.prefix}…?\n\nAnything still using it is refused at once, and it cannot be switched back on. Issue a new key first if a system still needs one.\n\nWhy are you revoking it? (optional, kept in NexG's audit log)`,
      '',
    );
    if (reason === null) return;
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const result = await revokeApiKey(k.id, reason);
      if (result.ok) {
        setKeys(result.keys);
        setNotice(result.message);
      } else {
        setError(result.message);
      }
    });
  }

  const row = (k: ConsoleKey) => (
    <li key={k.id} className="border-border rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <span className="font-mono">{k.prefix}…</span>
        {k.environment === 'test' && <TestBadge />}
        {k.state !== 'active' && (
          <span className="text-ink/60 rounded-full border px-2 py-0.5 text-xs">
            {k.state === 'expired' ? 'Expired' : 'Revoked'}
          </span>
        )}
      </div>
      <p className="text-ink/60 mt-1 text-xs">
        {[
          k.merchantId ? (byId.get(k.merchantId)?.tradingName ?? 'A merchant') : 'No merchant',
          k.scopes.join(', '),
          `issued ${when(k.createdAt)}`,
          k.lastUsedAt ? `last used ${when(k.lastUsedAt)}` : 'not used yet',
        ].join(' · ')}
      </p>
      {k.state === 'active' && (
        <div className="mt-2">
          {mayRevoke(k) ? (
            <Button type="button" disabled={pending} onClick={() => revoke(k)}>
              Revoke
            </Button>
          ) : (
            <p className="text-ink/60 text-xs">Only the merchant&apos;s owner can revoke it.</p>
          )}
        </div>
      )}
    </li>
  );

  const active = keys.filter((k) => k.state === 'active');
  const past = keys.filter((k) => k.state !== 'active');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your API keys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-ink/70 text-sm">
          Keys for your merchants, and the keys with no merchant that you issued. A key is shown in
          full only once, when it is issued, so here it is named by its first characters. Revoke a
          key the moment it may have leaked: requests with it are refused at once.
        </p>

        {notice && (
          <p role="status" className="border-border bg-surface rounded border px-3 py-2 text-sm">
            {notice}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="text-danger border-danger/40 bg-danger/5 rounded border px-3 py-2 text-sm font-semibold"
          >
            {error}
          </p>
        )}

        {active.length === 0 ? (
          <p className="text-ink/60 text-sm">No active keys. Issue one above.</p>
        ) : (
          <ul className="space-y-3">{active.map(row)}</ul>
        )}

        {past.length > 0 && (
          <details className="text-sm">
            <summary className="text-ink/70 cursor-pointer font-semibold">
              Revoked and expired ({past.length})
            </summary>
            <ul className="mt-3 space-y-3 opacity-80">{past.map(row)}</ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
