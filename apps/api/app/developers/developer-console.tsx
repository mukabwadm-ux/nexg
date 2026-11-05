'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@nexg/ui';
import { Building2, CheckCircle2 } from 'lucide-react';
import { useState, useTransition } from 'react';

import type { DeveloperMerchant } from '@/lib/merchants';

import { issueApiKey } from './actions';

/**
 * The key issuing form.
 *
 * The merchant is chosen from a list, not typed as a UUID. A person
 * does not know their merchant id, and asking for one turns a
 * two-minute task into a database query. Where the list is empty the
 * form says what to do about that instead of showing a field that
 * cannot be filled in correctly.
 */
export function DeveloperConsole({
  merchants,
  email,
}: {
  merchants: DeveloperMerchant[];
  email: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [scopes, setScopes] = useState<string[]>(['public_read']);
  const [merchantId, setMerchantId] = useState('');
  const [rateLimit, setRateLimit] = useState(60);
  const [issued, setIssued] = useState<{
    rawKey: string;
    keyPrefix: string;
    scopes: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wantsMerchantScope = scopes.some((s) => s === 'merchant_read' || s === 'merchant_write');

  function toggleScope(scope: string) {
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
    );
  }

  function submit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const result = await issueApiKey(formData);
      if (result.ok) {
        setIssued(result.key);
      } else {
        setError(result.message);
      }
    });
  }

  if (issued) {
    return (
      <div className="space-y-6">
        <Card className="border-ink/20 border-2">
          <CardHeader>
            <CardTitle>Your key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-ink/80 text-sm">
              This is the only time it will be shown. We store a hash, so it cannot be recovered
              later. Copy it now.
            </p>
            <pre className="bg-ink text-bg overflow-x-auto whitespace-pre-wrap break-all rounded p-4 font-mono text-xs">
              {issued.rawKey}
            </pre>
            <p className="text-ink/60 text-xs">Scopes: {issued.scopes.join(', ')}</p>
            <pre className="bg-surface overflow-x-auto whitespace-pre-wrap rounded p-3 font-mono text-xs">
              {`curl -H "X-Api-Key: ${issued.rawKey}" \\
  https://api.nexgapp.com/v1/catalog/merchants`}
            </pre>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setIssued(null)}>Issue another</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {email && (
        <p className="text-ink/60 text-sm">
          Signed in as <span className="text-ink font-semibold">{email}</span>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Issue an API key</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={submit} className="space-y-6">
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-bold">What will this key do?</legend>
              {[
                {
                  id: 'public_read',
                  label: 'Read the public catalog',
                  hint: 'Merchants, zones, experiences, services. Start here.',
                },
                {
                  id: 'merchant_read',
                  label: 'Read your merchant orders',
                  hint: 'Owner authorization and current merchant approval are required.',
                },
              ].map((s) => (
                <label key={s.id} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    name="scopes"
                    value={s.id}
                    checked={scopes.includes(s.id)}
                    onChange={() => toggleScope(s.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{s.label}</span>
                    <span className="text-ink/60 block text-xs">{s.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-bold">Merchant</legend>

              {merchants.length > 0 ? (
                <>
                  <p className="text-ink/60 text-xs">
                    {wantsMerchantScope
                      ? 'Choose the merchant this key acts for. The merchant scopes above need one.'
                      : 'Optional. A key with no merchant sees public data only.'}
                  </p>

                  <div className="space-y-2">
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                        merchantId === ''
                          ? 'border-ink bg-bg'
                          : 'border-border hover:border-border-strong'
                      }`}
                    >
                      <input
                        type="radio"
                        name="merchant_id"
                        value=""
                        checked={merchantId === ''}
                        onChange={() => setMerchantId('')}
                        className="mt-1"
                      />
                      <span>
                        <span className="text-sm font-medium">No merchant</span>
                        <span className="text-ink/60 block text-xs">
                          Public data only. The right choice while you are evaluating the API.
                        </span>
                      </span>
                    </label>

                    {merchants.map((m) => (
                      <label
                        key={m.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                          merchantId === m.id
                            ? 'border-ink bg-bg'
                            : 'border-border hover:border-border-strong'
                        }`}
                      >
                        <input
                          type="radio"
                          name="merchant_id"
                          value={m.id}
                          checked={merchantId === m.id}
                          onChange={() => setMerchantId(m.id)}
                          className="mt-1"
                        />
                        <span className="flex-1">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <Building2 className="text-ink/50 h-4 w-4" aria-hidden="true" />
                            {m.tradingName}
                            {m.bookable && (
                              <CheckCircle2
                                className="h-4 w-4 text-green-600"
                                aria-label="Live and taking bookings"
                              />
                            )}
                          </span>
                          <span className="text-ink/60 block text-xs">
                            {[m.cityName, m.bookable ? 'live' : m.status.replace(/_/g, ' '), m.role]
                              .filter(Boolean)
                              .join(' - ')}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>

                  {wantsMerchantScope && !merchantId && (
                    <p className="text-danger text-xs font-semibold">
                      Pick a merchant above, or untick the merchant scopes to issue a public-only
                      key.
                    </p>
                  )}
                </>
              ) : (
                <div className="border-border bg-surface rounded-lg border p-4">
                  <p className="text-ink text-sm font-bold">No merchants on this account</p>
                  <p className="text-ink/70 mt-1 text-xs">
                    You can still issue a key for the public catalog. Merchant order reads require a
                    key for a merchant you own.
                  </p>
                  <input type="hidden" name="merchant_id" value="" />
                </div>
              )}
            </fieldset>

            <div className="space-y-2">
              <label htmlFor="rate_limit" className="text-sm font-bold">
                Tokens per minute
              </label>
              <input
                id="rate_limit"
                name="rate_limit"
                type="number"
                min={10}
                max={600}
                value={rateLimit}
                onChange={(e) => setRateLimit(Number(e.target.value))}
                className="w-32 rounded border px-3 py-2 text-sm"
              />
              <p className="text-ink/60 text-xs">
                Keys share one bucket per merchant or developer. Public reads cost one token and
                merchant order reads cost three. Adding a key does not add a separate quota.
              </p>
            </div>

            {error && (
              <p
                role="alert"
                className="text-danger border-danger/40 bg-danger/5 rounded border px-3 py-2 text-sm font-semibold"
              >
                {error}
              </p>
            )}

            <Button type="submit" disabled={pending}>
              {pending ? 'Issuing...' : 'Issue key'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
