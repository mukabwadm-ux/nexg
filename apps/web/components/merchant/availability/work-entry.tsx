'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { WorkWorkspace } from '../work/workspace';
import { profiles } from '../offerings/model';
import { localOfferingsSource } from '../offerings/source';
import { Field } from './forms';
import { localInput, stamp, prettyDate, localTime, type Context, type Snapshot } from './model';
import { localAvailabilitySource, type AvailabilitySource } from './source';
import styles from './workspace.module.css';

/** Opt-in contextual work uses the very same local reservation records. Ordinary Work is unchanged. */
export function AvailabilityWorkEntry() {
  const [requested, setRequested] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [c, setContext] = useState<Context | null>(null),
    [s, setSnapshot] = useState<Snapshot | null>(null),
    [source, setSource] = useState<AvailabilitySource | null>(null);
  const [workId, setWorkId] = useState(''),
    [returnTo, setReturnTo] = useState('/merchant-live-preview/availability');
  const [referenceId, setReferenceId] = useState('');
  const [resource, setResource] = useState(''),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (!p.has('availabilityProfile')) {
      setLoading(false);
      return;
    }
    setRequested(true);
    let current = true;
    const storage = {
      getItem: (k: string) => window.localStorage.getItem(k),
      setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
      removeItem: (k: string) => window.localStorage.removeItem(k),
    };
    const src = localAvailabilitySource(storage);
    setSource(src);
    const profile = profiles.find((x) => x.id === p.get('availabilityProfile'));
    if (!profile) {
      setError('This sample specialty is no longer registered.');
      setLoading(false);
      return;
    }
    void localOfferingsSource(storage)
      .load(profile)
      .then(async (data) => {
        const offering = data.offerings.find((o) => o.id === p.get('offering'));
        if (!offering)
          throw new Error(
            'This offering was removed. Return to Availability and select a current offering.',
          );
        const ctx: Context = {
          profile,
          offering,
          location: p.get('location') ?? 'Westlands',
          method: p.get('method') ?? offering.fulfilmentMethods?.[0] ?? 'Merchant location',
          scenario: (['current', 'stale', 'unknown', 'partial', 'external', 'offline'].includes(
            p.get('scenario') ?? '',
          )
            ? p.get('scenario')
            : 'current') as Context['scenario'],
          role: p.get('role') === 'viewer' ? 'viewer' : 'manager',
        };
        const snap = await src.load(ctx);
        if (!current) return;
        setContext(ctx);
        setSnapshot(snap);
        setWorkId(p.get('work') ?? '');
        const event =
          snap.events.find((e) => e.id === p.get('referenceEvent') && e.workId === p.get('work')) ??
          snap.events.find((e) => e.workId === p.get('work'));
        if (event) {
          setReferenceId(event.id);
          const proposedStart = p.get('proposedStart'),
            proposedEnd = p.get('proposedEnd');
          setStart(
            proposedStart && Number.isFinite(stamp(proposedStart))
              ? localInput(proposedStart)
              : localInput(event.start),
          );
          setEnd(
            proposedEnd && Number.isFinite(stamp(proposedEnd))
              ? localInput(proposedEnd)
              : localInput(event.end),
          );
          setResource(event.resources[0] ?? '');
        }
        const r = p.get('returnTo');
        setReturnTo(
          r?.startsWith('/merchant-live-preview/availability?')
            ? r
            : '/merchant-live-preview/availability?' +
                new URLSearchParams({
                  profile: profile.id,
                  offering: offering.id,
                  location: ctx.location,
                  method: ctx.method,
                }),
        );
      })
      .catch((e) => {
        if (current)
          setError(e instanceof Error ? e.message : 'This work record could not be read.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);
  if (!requested) return <WorkWorkspace />;
  const canEdit =
    c?.role === 'manager' &&
    c?.scenario === 'current' &&
    c.offering.sources.availability === 'nexg' &&
    c.offering.sync === 'current';
  const events = s?.events.filter((e) => e.workId === workId) ?? [],
    record = events[0];
  async function act(action: 'return' | 'reassign' | 'reschedule' | 'fee') {
    if (!source || !c || !s) return;
    setBusy(true);
    setError('');
    try {
      const next = await source.resolveWork(
        c,
        workId,
        action,
        { resourceId: resource, start, end, referenceEventId: referenceId || undefined },
        s.revision,
      );
      setSnapshot(next);
      setNotice('Work record updated in this preview. Availability uses the same saved revision.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The sample action failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.root}>
      <main className="av-workspace">
        <div className="av-page-heading">
          <div>
            <h1>Work</h1>
            <p>
              {workId} · {c?.profile.name} · Availability handoff
            </p>
          </div>
          <a className="av-button" href={returnTo}>
            <ArrowLeft size={16} />
            Back to Availability
          </a>
        </div>
        {loading ? (
          <p role="status">Loading the same sample work record…</p>
        ) : !record ? (
          <p className="av-error" role="alert">
            {error || 'This work record no longer exists in the selected scope.'}
          </p>
        ) : (
          <div className="av-rule-grid">
            <section className="av-card av-spaced">
              <h2>{record.title}</h2>
              <span className="av-badge">{record.status.replace('_', ' ')}</span>
              <p>
                {record.customer} · {c?.location}
              </p>
              <p>
                Existing work is retained. Resolve only the actual record selected from
                Availability.
              </p>
              {events.map((e) => (
                <dl className="av-details-list" key={e.id}>
                  <dt>{e.role ?? 'Allocation'}</dt>
                  <dd>
                    {prettyDate(e.start)} {localTime(e.start)} → {prettyDate(e.end)}{' '}
                    {localTime(e.end)}
                    {e.ongoing ? ' · Actual return outstanding' : ''}
                  </dd>
                  <dt>Resources</dt>
                  <dd>
                    {e.resources
                      .map((id) => s?.resources.find((r) => r.id === id)?.name ?? id)
                      .join(' + ') || 'No exclusive claim'}
                  </dd>
                </dl>
              ))}
              {record.fee && (
                <p>
                  Reservation fee KES {record.fee.amount} ·{' '}
                  {record.fee.state === 'awaiting' ? 'Awaiting collection' : 'Recorded in sample'}
                </p>
              )}
              {record.ongoing && (
                <button
                  className="av-button av-primary"
                  disabled={busy || !canEdit}
                  onClick={() => void act('return')}
                >
                  Record actual sample return
                </button>
              )}
              {record.status === 'held' && record.fee?.state === 'awaiting' && (
                <>
                  <p className="av-note">
                    Record sample payment evidence. The local source rechecks the accepted hold
                    before automatically confirming. This does not charge a customer.
                  </p>
                  <button
                    className="av-button av-primary"
                    disabled={busy || !canEdit}
                    onClick={() => void act('fee')}
                  >
                    Record sample reservation fee
                  </button>
                </>
              )}
              <h3>Local activity</h3>
              {s?.history
                .filter((h) => h.title.includes(workId))
                .map((h) => (
                  <p key={h.operationId}>
                    {h.title} · revision {h.revision}
                  </p>
                ))}
            </section>
            <section className="av-card av-spaced">
              <h2>Resolve a scheduling conflict</h2>
              {c?.offering.schemaId === 'PICKUP_RETURN_V1' && (
                <p className="av-note">
                  A reschedule shifts incoming, processing and outgoing together from the processing
                  window shown. Accepted durations are retained and every role is rechecked.
                </p>
              )}
              <p>
                Reassignment and rescheduling recheck the current local source. No booking is
                cancelled silently.
              </p>
              {c?.offering.schemaId === 'RENTAL_ASSET_V1' &&
                !record.ongoing &&
                record.status !== 'completed' && (
                  <div className="av-form">
                    <Field label="Replacement asset">
                      <select value={resource} onChange={(e) => setResource(e.target.value)}>
                        {s?.resources.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                            {r.state === 'unknown' ? ' · Unknown' : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button
                      className="av-button"
                      disabled={busy || !canEdit}
                      onClick={() => void act('reassign')}
                    >
                      Reassign this sample booking
                    </button>
                  </div>
                )}
              {!record.ongoing && ['confirmed', 'held'].includes(record.status) && (
                <div className="av-form">
                  <Field label="New start (EAT)">
                    <input
                      type="datetime-local"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </Field>
                  <Field label="New end (EAT)">
                    <input
                      type="datetime-local"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </Field>
                  <button
                    className="av-button"
                    disabled={busy || !canEdit}
                    onClick={() => void act('reschedule')}
                  >
                    Reschedule this sample booking
                  </button>
                </div>
              )}
              <button
                className="av-button"
                disabled={busy || !canEdit}
                onClick={async () => {
                  if (source && c) {
                    setSnapshot(await source.load(c));
                    setNotice('Current local revision loaded.');
                  }
                }}
              >
                <RefreshCw size={15} />
                Reload current revision
              </button>
            </section>
          </div>
        )}
        {notice && (
          <p className="av-notice" role="status">
            {notice}
          </p>
        )}
        {error && record && (
          <p className="av-error" role="alert">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
