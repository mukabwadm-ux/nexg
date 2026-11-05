'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { profiles, fulfilmentOptions } from '../offerings/model';
import { localOfferingsSource } from '../offerings/source';
import { invoices, resolveMoneyView, transactions, type Context, type Snapshot } from './model';
import { localMoneySource, moneyHref } from './source';
import styles from './workspace.module.css';

/** An opt-in reference bridge: no operational record or payment status is invented. */
export function MoneyWorkEntry() {
  const [context, setContext] = useState<Context | null>(null),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [work, setWork] = useState(''),
    [back, setBack] = useState('/merchant-live-preview/money'),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    const p = new URLSearchParams(window.location.search),
      profile = profiles.find((item) => item.id === p.get('moneyProfile'));
    const requestedReturn = p.get('returnTo');
    if (requestedReturn?.startsWith('/merchant-live-preview/money?')) setBack(requestedReturn);
    if (!profile) {
      setError('This sample specialty is no longer registered.');
      setLoading(false);
      return;
    }
    const storage = {
      getItem: (k: string) => window.localStorage.getItem(k),
      setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
      removeItem: (k: string) => window.localStorage.removeItem(k),
    };
    void localOfferingsSource(storage)
      .load(profile)
      .then(async (catalogue) => {
        const offering = catalogue.offerings.find(
          (o) => o.id === p.get('offering') && o.publication !== 'archived',
        );
        if (!offering) throw new Error('This offering is no longer available in the sample.');
        const view = resolveMoneyView(profile, offering, catalogue.configuration.enabledSchemas);
        const c: Context = {
          profile,
          offering,
          location: p.get('location') ?? 'Westlands',
          method:
            p.get('method') ??
            offering.fulfilmentMethods?.[0] ??
            fulfilmentOptions(offering.schemaId)[0]!,
          scenario: 'current',
          role: 'manager',
        };
        const s = await localMoneySource(storage).load(c),
          id = p.get('work') ?? '';
        const exists =
          s.security.some((r) => r.work === id) ||
          (s.features.balances && invoices(view).some((r) => r.work === id)) ||
          transactions(view).some((r) => r.work === id) ||
          (s.features.reservation && id === 'BK-1048');
        if (!exists)
          throw new Error('This reference is not available in the selected Money sample.');
        if (!current) return;
        setContext(c);
        setSnapshot(s);
        setWork(id);
        const returnTo = p.get('returnTo');
        setBack(returnTo?.startsWith('/merchant-live-preview/money?') ? returnTo : moneyHref(c));
      })
      .catch((e) => {
        if (current)
          setError(e instanceof Error ? e.message : 'This sample reference could not be read.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);
  const security = snapshot?.security.find((r) => r.work === work);
  return (
    <div className={styles.root}>
      <main className="mo-workspace" style={{ minHeight: 'calc(100dvh - 3rem)', height: 'auto' }}>
        <div className="mo-heading">
          <div>
            <h1>Work</h1>
            <p>
              {work || 'Money reference'} · {context?.profile.name ?? 'Sample'}
            </p>
          </div>
          {!loading && (
            <a className="mo-button" href={back}>
              <ArrowLeft size={16} /> Back to Money
            </a>
          )}
        </div>
        {loading ? (
          <p role="status">Loading sample reference…</p>
        ) : error ? (
          <p role="alert" className="mo-note mo-note-error">
            {error}
          </p>
        ) : (
          <section className="mo-inspector" style={{ maxWidth: 720, minHeight: 260 }}>
            <div className="mo-inspector-head">
              <h2>{work}</h2>
              <span className="mo-badge mo-badge-neutral">Sample reference</span>
            </div>
            <div className="mo-inspector-content">
              <p>
                {context?.offering.name} · {context?.location} · {context?.method}
              </p>
              <p>
                This is the same reference selected in the Money sample. Its operational source is
                not linked to this preview yet.
              </p>
              {security && (
                <p className="mo-note">
                  The Money sample has a security record for this reference. Work completion, refund
                  outcome and payment remain separate.
                </p>
              )}
              <p className="mo-muted">
                No customer, booking or financial data has been sent to another system.
              </p>
            </div>
            <div className="mo-inspector-actions">
              <a className="mo-button mo-primary" href={back}>
                Return to the selected Money record
              </a>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
