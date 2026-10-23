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

  const wantsMerchantScope = scopes.some(
    (s) => s === 'merchant_read' || s === 'merchant_write',
  );

  function toggleScope(scope: string) {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((s) => s !== scope)
        : [...current, scope],
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
        <Card className="border-2 border-ink/20">
          <CardHeader>
            <CardTitle>Your key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-ink/80">
              This is the only time it will be shown. We store a hash, so it
              cannot be recovered later. Copy it now.
            </p>
            <pre className="bg-ink text-bg p-4 rounded font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all">
              {issued.rawKey}
            </pre>
            <p className="text-xs text-ink/60">
              Scopes: {issued.scopes.join(', ')}
            </p>
            <pre className="bg-surface p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">
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
        <p className="text-sm text-ink/60">
          Signed in as <span className="font-semibold text-ink">{email}</span>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Issue an API key</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={submit} className="space-y-6">
            <fieldset className="space-y-3">
              <legend className="font-bold text-sm mb-2">What will this key do?</legend>
              {[
                {
                  id: 'public_read',
                  label: 'Read the public catalog',
                  hint: 'Merchants, zones, experiences, services. Start here.',
                },
                {
                  id: 'merchant_read',
                  label: 'Read a merchant’s own records',
                  hint: 'Its orders and its catalogue.',
                },
                {
                  id: 'merchant_write',
                  label: 'Book services for a merchant',
                  hint: 'Act on behalf of that merchant.',
                },
              ].map((s) => (
                <label key={s.id} className="flex items-start gap-3 cursor-pointer">
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
                    <span className="block text-xs text-ink/60">{s.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="font-bold text-sm">Merchant</legend>

              {merchants.length > 0 ? (
                <>
                  <p className="text-xs text-ink/60">
                    {wantsMerchantScope
                      ? 'Choose the merchant this key acts for. The merchant scopes above need one.'
                      : 'Optional. A key with no merchant sees public data only.'}
                  </p>

                  <div className="space-y-2">
                    <label
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
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
                        <span className="font-medium text-sm">No merchant</span>
                        <span className="block text-xs text-ink/60">
                          Public data only. The right choice while you are
                          evaluating the API.
                        </span>
                      </span>
                    </label>

                    {merchants.map((m) => (
                      <label
                        key={m.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
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
                          <span className="font-medium text-sm flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-ink/50" aria-hidden="true" />
                            {m.tradingName}
                            {m.bookable && (
                              <CheckCircle2
                                className="h-4 w-4 text-green-600"
                                aria-label="Live and taking bookings"
                              />
                            )}
                          </span>
                          <span className="block text-xs text-ink/60">
                            {[
                              m.cityName,
                              m.bookable ? 'live' : m.status.replace(/_/g, ' '),
                              m.role,
                            ]
                              .filter(Boolean)
                              .join(' - ')}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>

                  {wantsMerchantScope && !merchantId && (
                    <p className="text-xs font-semibold text-danger">
                      Pick a merchant above, or untick the merchant scopes to
                      issue a public-only key.
                    </p>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-border bg-surface p-4">
                  <p className="text-sm font-bold text-ink">
                    No merchants on this account
                  </p>
                  <p className="text-xs text-ink/70 mt-1">
                    You can still issue a key for the public catalog. If you
                    meant to book services, you need a merchant account first.
                  </p>
                  <input type="hidden" name="merchant_id" value="" />
                </div>
              )}
            </fieldset>

            <div className="space-y-2">
              <label htmlFor="rate_limit" className="font-bold text-sm">
                Requests per minute
              </label>
              <input
                id="rate_limit"
                name="rate_limit"
                type="number"
                min={10}
                max={600}
                value={rateLimit}
                onChange={(e) => setRateLimit(Number(e.target.value))}
                className="w-32 border rounded px-3 py-2 text-sm"
              />
              <p className="text-xs text-ink/60">
                How many requests this key may make each minute. Sixty is
                plenty for most integrations.
              </p>
            </div>

            {error && (
              <p
                role="alert"
                className="text-sm font-semibold text-danger border border-danger/40 bg-danger/5 rounded px-3 py-2"
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