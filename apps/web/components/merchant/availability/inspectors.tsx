'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Clock3, X } from 'lucide-react';
import {
  addMinutes,
  afterBuffer,
  duration,
  evaluate,
  localInput,
  localTime,
  poolUsage,
  prettyDate,
  stamp,
  type AvailabilityRequest,
  type Commitment,
  type Context,
  type Proposal,
  type Snapshot,
  type View,
} from './model';
import { offeringHref, workHref } from './source';
import { Field } from './forms';

export function WorkInspector({
  e,
  s,
  c,
  onClose,
  onRemove,
  onEdit,
}: {
  e: Commitment;
  s: Snapshot;
  c: Context;
  onClose: () => void;
  onRemove: (e: Commitment) => void;
  onEdit?: (e: Commitment) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    heading.current?.focus();
    return () => {
      requestAnimationFrame(() => {
        if (trigger?.isConnected) trigger.focus();
      });
    };
  }, [e.id]);
  return (
    <aside className="av-inspector av-card" aria-label="Selected schedule detail">
      <div className="av-card-heading">
        <h2 tabIndex={-1} ref={heading}>
          {e.status === 'held' ? 'Hold' : e.status === 'block' ? 'Time block' : 'Work'} · {e.workId}
        </h2>
        <button className="av-icon" aria-label="Close schedule detail" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      <div className="av-inspector-scroll">
        <span
          className={
            'av-badge ' +
            (e.status === 'held' ? 'av-amber' : e.status === 'overdue' ? 'av-red' : '')
          }
        >
          {e.status.replace('_', ' ')}
        </span>
        <h3>{e.title}</h3>
        <p>{e.customer}</p>
        <dl className="av-details-list">
          <dt>{e.status === 'tentative' ? 'Estimate only' : 'When'}</dt>
          <dd>
            {prettyDate(e.start)} · {localTime(e.start)}
            <br />
            {prettyDate(e.end)} · {localTime(e.end)}
          </dd>
          <dt>Location</dt>
          <dd>{e.location ?? c.location}</dd>
          <dt>Resources</dt>
          <dd>
            {e.resources.map((id) => (
              <span className="av-chip" key={id}>
                {s.resources.find((r) => r.id === id)?.name ?? id}
              </span>
            ))}
            {!e.resources.length ? 'No exclusive resource claim' : ''}
          </dd>
          {e.poolId && (
            <>
              <dt>Capacity</dt>
              <dd>
                {e.quantity} {s.pools.find((p) => p.id === e.poolId)?.unit}
              </dd>
            </>
          )}
        </dl>
        {e.role && <p className="av-note">{e.role}</p>}
        {e.status === 'tentative' && (
          <p className="av-note">
            No time or resources are reserved. Complete any required customer agreement and work
            planning in Work.
          </p>
        )}
        {e.ongoing && (
          <p className="av-error">
            Return not recorded. Actual custody continues beyond the planned end.
          </p>
        )}
        {e.status === 'held' && <p className="av-note">Capacity held; not confirmed.</p>}
        {e.fee && (
          <section className="av-inspector-section">
            <h4>Reservation fee</h4>
            <p>
              KES {e.fee.amount.toLocaleString('en-KE')} ·{' '}
              {e.fee.state === 'awaiting' ? 'Awaiting collection' : 'Recorded in sample Work'}
            </p>
            <small>Fee status and capacity confirmation are separate.</small>
          </section>
        )}
        {e.status === 'held' && e.expiresAt && (
          <section className="av-note">
            <Clock3 size={20} />
            <strong>Held until {localTime(e.expiresAt)} EAT</strong>
            <p>
              {stamp(e.expiresAt) <= stamp(s.now)
                ? 'Expiry being checked. The timer has not released capacity.'
                : Math.ceil((stamp(e.expiresAt) - stamp(s.now)) / 60000) +
                  ' minutes remain at this sample snapshot.'}
            </p>
            <small>Release follows the sample source result.</small>
          </section>
        )}
      </div>
      <div className="av-stack av-inspector-actions">
        {['block', 'break'].includes(e.status) ? (
          <>
            {onEdit && (
              <button className="av-button" onClick={() => onEdit(e)}>
                Edit this time block
              </button>
            )}
            <button className="av-button" onClick={() => onRemove(e)}>
              Review removal of this block
            </button>
          </>
        ) : e.role === 'Session anchor' ? (
          <a
            className="av-button av-primary"
            href={
              '/merchant-live-preview/availability?' +
              new URLSearchParams({
                profile: c.profile.id,
                offering: e.ownerScope?.offeringId ?? c.offering.id,
                location: e.ownerScope?.location ?? c.location,
                method: e.ownerScope?.method ?? c.method,
                date: e.start.slice(0, 10),
              })
            }
          >
            View owning session <ArrowUpRight size={16} />
          </a>
        ) : (
          <a className="av-button av-primary" href={workHref(c, e.workId, e.ownerScope)}>
            Open in Work
            <ArrowUpRight size={16} />
          </a>
        )}
        <a className="av-link" href={offeringHref(c)}>
          View offering and fee policy
        </a>
      </div>
      <p className="av-footnote">
        Existing bookings keep their accepted terms. Changes here are local sample data.
      </p>
    </aside>
  );
}
export function AvailabilityTester({
  s,
  c,
  view,
  onHold,
}: {
  s: Snapshot;
  c: Context;
  view: View;
  onHold: (p: Proposal) => Promise<void>;
}) {
  const initial = s.occurrences[0];
  const [request, setRequest] = useState<AvailabilityRequest>(() => ({
    start: initial ? localInput(initial.start) : '2026-11-03T15:00',
    end: initial
      ? localInput(initial.end)
      : localInput(addMinutes('2026-11-03T15:00', duration(c))),
    quantity: 1,
    resourceIds: s.resources
      .filter((r) => r.kind !== 'Existing booking resource')
      .filter((r, i) => i === 0 || r.kind === 'Driver')
      .map((r) => r.id),
    poolId: s.pools[0]?.id,
    quantities: Object.fromEntries(s.pools.slice(1).map((p) => [p.id, 0])),
    luggage: 0,
    coverageConfirmed: false,
  }));
  const [tested, setTested] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const patch = (p: Partial<AvailabilityRequest>) => {
    setRequest((q) => ({ ...q, ...p }));
    setTested(false);
    setError('');
  };
  const result = evaluate(s, c, request);
  const mayHold =
    result.state === 'available' &&
    !['ORDER', 'ENTITLEMENT', 'REQUEST_QUOTE', 'PRODUCTION_DUE'].includes(view.model);
  return (
    <div className="av-form">
      <p className="av-note">
        Internal sample only. No discovery, customer booking, charge or external reservation is
        created.
      </p>
      {s.occurrences.length > 0 && (
        <Field label="Published occurrence">
          <select
            aria-label="Published occurrence"
            value={s.occurrences.find((o) => stamp(o.start) === stamp(request.start))?.id ?? ''}
            onChange={(e) => {
              const o = s.occurrences.find((x) => x.id === e.target.value);
              if (o)
                patch({ start: localInput(o.start), end: localInput(o.end), poolId: o.poolId });
            }}
          >
            <option value="">Custom date (will be validated)</option>
            {s.occurrences.map((o) => (
              <option key={o.id} value={o.id}>
                {prettyDate(o.start)} · {localTime(o.start)} · {o.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="av-form-grid">
        <Field
          label={
            view.model === 'PRODUCTION_DUE'
              ? 'Production / due window begins (EAT)'
              : 'Requested start (EAT)'
          }
        >
          <input
            type="datetime-local"
            value={request.start}
            onChange={(e) =>
              patch({
                start: e.target.value,
                end: e.target.value ? localInput(addMinutes(e.target.value, duration(c))) : '',
              })
            }
          />
        </Field>
        <Field label="Requested end (EAT)">
          <input
            type="datetime-local"
            value={request.end}
            onChange={(e) => patch({ end: e.target.value })}
          />
        </Field>
        <Field label={view.model === 'SPACE_RESERVATION' ? 'Party size' : 'Quantity'}>
          <input
            type="number"
            min="0.01"
            step={
              ['SESSION_CAPACITY', 'TOUR', 'SPACE_RESERVATION'].includes(view.model) ? '1' : '0.01'
            }
            value={request.quantity}
            onChange={(e) =>
              patch({ quantity: Number(e.target.value), partySize: Number(e.target.value) })
            }
          />
        </Field>
        {s.pools.length > 0 && (
          <Field label="Capacity / unit">
            <select
              value={request.poolId ?? ''}
              onChange={(e) => patch({ poolId: e.target.value })}
            >
              {s.pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.unit} · {poolUsage(s, p.id, request.start, request.end).remaining}{' '}
                  remaining
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {view.resources && s.resources.length > 0 && (
        <fieldset className="av-fieldset">
          <legend>Required resources for this test</legend>
          <div className="av-check-grid">
            {s.resources.map((r) => (
              <label className="av-check" key={r.id}>
                <input
                  type="checkbox"
                  checked={request.resourceIds.includes(r.id)}
                  onChange={(e) =>
                    patch({
                      resourceIds: e.target.checked
                        ? [...request.resourceIds, r.id]
                        : request.resourceIds.filter((id) => id !== r.id),
                    })
                  }
                />
                {r.name}
                {r.state === 'unknown' ? ' · Source unknown' : ''}
              </label>
            ))}
          </div>
          <p className="av-footnote">
            Select the actual joint resources. An existing booking’s additional room claim remains
            blocking, even if its lane is hidden.
          </p>
        </fieldset>
      )}
      {view.model === 'FREIGHT' &&
        s.pools
          .filter((p) => p.id !== request.poolId)
          .map((p) => (
            <Field key={p.id} label={'Cargo quantity (' + p.unit + ')'}>
              <input
                type="number"
                min="0"
                step="0.001"
                value={request.quantities?.[p.id] ?? 0}
                onChange={(e) =>
                  patch({ quantities: { ...request.quantities, [p.id]: Number(e.target.value) } })
                }
              />
            </Field>
          ))}
      {view.model === 'TRANSFER' && c.offering.fields.transport_mode !== 'Greeter only' && (
        <Field label="Luggage pieces">
          <input
            type="number"
            min="0"
            step="1"
            value={request.luggage ?? 0}
            onChange={(e) => patch({ luggage: Number(e.target.value) })}
          />
        </Field>
      )}
      {view.model === 'FIELD_VISIT' && (
        <Field label="Sample coverage">
          <select
            value={request.coverageConfirmed ? 'covered' : 'unknown'}
            onChange={(e) => patch({ coverageConfirmed: e.target.value === 'covered' })}
          >
            <option value="unknown">Coverage not checked</option>
            <option value="covered">
              Covered sample area: {String(c.offering.fields.service_area_reference || 'Westlands')}
            </option>
          </select>
        </Field>
      )}
      {view.model === 'LINKED_WINDOWS' && s.settings.promise === 'firm' && (
        <div className="av-form-grid">
          <Field label="Outgoing starts (EAT)">
            <input
              type="datetime-local"
              value={request.outgoingStart ?? ''}
              onChange={(e) => patch({ outgoingStart: e.target.value })}
            />
          </Field>
          <Field label="Outgoing ends (EAT)">
            <input
              type="datetime-local"
              value={request.outgoingEnd ?? ''}
              onChange={(e) => patch({ outgoingEnd: e.target.value })}
            />
          </Field>
        </div>
      )}
      {view.model === 'STORAGE' && (
        <p className="av-footnote">
          Quantity must use the selected source unit. Area, volume and handling slots are separate;
          no hidden conversion.
        </p>
      )}
      <p className="av-footnote">
        Service span: {duration(c)} min · Before/travel:{' '}
        {Number(c.offering.fields.buffer_before_minutes ?? c.offering.fields.travel_minutes ?? 0)}{' '}
        min · After/turnover: {afterBuffer(c)} min.
      </p>
      <button className="av-button av-primary" onClick={() => setTested(true)}>
        Check sample availability
      </button>
      {tested && (
        <section
          className={'av-impact ' + (result.state === 'unavailable' ? 'av-impact-error' : '')}
          aria-live="polite"
        >
          <h3>
            {result.state === 'available'
              ? 'Available in sample'
              : result.state === 'request-only'
                ? 'Request intake only'
                : result.state === 'unknown'
                  ? 'Availability unknown'
                  : 'Unavailable for this request'}
          </h3>
          <ul>
            {result.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {mayHold && (
            <button
              className="av-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await onHold({
                    id: crypto.randomUUID(),
                    kind: 'hold',
                    title: 'Sample hold for ' + c.offering.name,
                    reason: 'Internal availability test',
                    start: request.start,
                    end: request.end,
                    resourceIds: request.resourceIds,
                    poolId: request.poolId,
                    quantity: request.quantity,
                    offeringVersion: c.offering.version,
                    request,
                  });
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not create the local hold.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Checking…' : 'Create 5-minute sample hold'}
            </button>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="av-error">
          {error}
        </p>
      )}
    </div>
  );
}
