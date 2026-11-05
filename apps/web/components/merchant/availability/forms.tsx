'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Trash2, X } from 'lucide-react';
import {
  cloneElement,
  isValidElement,
  useId,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  DAYS,
  LOCATIONS,
  prettyDate,
  localTime,
  type Context,
  type DayHours,
  type Impact,
  type Proposal,
  type Snapshot,
} from './model';
import { workHref } from './source';
import styles from './workspace.module.css';
import { schemas } from '../offerings/schemas';

export function Modal({
  title,
  description,
  children,
  footer,
  onClose,
  wide = false,
  side = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
  side?: boolean;
}) {
  const focus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay + (side ? ' ' + styles.drawerOverlay : '')} />
        <Dialog.Content
          className={
            styles.root +
            ' ' +
            styles.modal +
            (wide ? ' ' + styles.wide : '') +
            (side ? ' ' + styles.drawer : '')
          }
          onOpenAutoFocus={() => {
            focus.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (focus.current?.isConnected) focus.current.focus();
          }}
        >
          <header className="av-dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description ? (
                <Dialog.Description>{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="av-sr">
                  Local sample interaction. No live systems are changed.
                </Dialog.Description>
              )}
            </div>
            <button className="av-icon" aria-label="Close dialog" onClick={onClose}>
              <X size={20} />
            </button>
          </header>
          <div className="av-dialog-body">{children}</div>
          {footer && <footer className="av-dialog-footer">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const input = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          id?: string;
          'aria-label'?: string;
          'aria-describedby'?: string;
        }>,
        { id, 'aria-label': label, 'aria-describedby': hint ? id + '-hint' : undefined },
      )
    : children;
  return (
    <label className="av-field" htmlFor={id}>
      <span>{label}</span>
      {input}
      {hint && <small id={id + '-hint'}>{hint}</small>}
    </label>
  );
}
export function HoursEditor({
  hours,
  onChange,
  onlyDay,
  singleIntervalOnly = false,
}: {
  hours: DayHours[];
  onChange: (h: DayHours[]) => void;
  onlyDay?: number;
  singleIntervalOnly?: boolean;
}) {
  const patch = (day: number, v: Partial<DayHours>) =>
    onChange(hours.map((h) => (h.day === day ? { ...h, ...v } : h)));
  return (
    <div className="av-hours-editor">
      {hours
        .filter((h) => onlyDay === undefined || h.day === onlyDay)
        .map((h) => (
          <fieldset key={h.day}>
            <legend>{DAYS[h.day]}</legend>
            <div className="av-hour-controls">
              <select
                aria-label={DAYS[h.day] + ' state'}
                value={h.state}
                onChange={(e) =>
                  patch(h.day, {
                    state: e.target.value as DayHours['state'],
                    intervals: h.intervals.length
                      ? h.intervals
                      : [{ start: '08:00', end: '17:00', nextDay: false }],
                  })
                }
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="unspecified">Not set</option>
              </select>
              {!singleIntervalOnly && h.state === 'open' && (
                <button
                  className="av-icon"
                  aria-label={'Add ' + DAYS[h.day] + ' interval'}
                  onClick={() =>
                    patch(h.day, {
                      intervals: [...h.intervals, { start: '14:00', end: '18:00', nextDay: false }],
                    })
                  }
                >
                  <Plus size={17} />
                </button>
              )}
              {!singleIntervalOnly && (
                <button
                  className="av-link"
                  type="button"
                  onClick={() =>
                    patch(h.day, {
                      state: 'open',
                      intervals: [{ start: '00:00', end: '00:00', nextDay: true }],
                    })
                  }
                >
                  24 hours
                </button>
              )}
            </div>
            {h.state === 'open' &&
              h.intervals.map((i, n) => (
                <div className="av-interval-row" key={n}>
                  <input
                    type="time"
                    aria-label={DAYS[h.day] + ' start ' + (n + 1)}
                    value={i.start}
                    onChange={(e) =>
                      patch(h.day, {
                        intervals: h.intervals.map((x, k) =>
                          k === n ? { ...x, start: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <span>to</span>
                  <input
                    type="time"
                    aria-label={DAYS[h.day] + ' end ' + (n + 1)}
                    value={i.end}
                    onChange={(e) =>
                      patch(h.day, {
                        intervals: h.intervals.map((x, k) =>
                          k === n ? { ...x, end: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  {!singleIntervalOnly && (
                    <label className="av-check">
                      <input
                        type="checkbox"
                        checked={i.nextDay}
                        onChange={(e) =>
                          patch(h.day, {
                            intervals: h.intervals.map((x, k) =>
                              k === n ? { ...x, nextDay: e.target.checked } : x,
                            ),
                          })
                        }
                      />
                      Ends next day
                    </label>
                  )}
                  {!singleIntervalOnly && (
                    <button
                      className="av-icon"
                      aria-label={'Remove ' + DAYS[h.day] + ' interval ' + (n + 1)}
                      onClick={() =>
                        patch(h.day, { intervals: h.intervals.filter((_, k) => k !== n) })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
          </fieldset>
        ))}
    </div>
  );
}
export function ProposalFields({
  p,
  s,
  c,
  onChange,
}: {
  p: Proposal;
  s: Snapshot;
  c: Context;
  onChange: (p: Proposal) => void;
}) {
  const model = schemas[c.offering.schemaId]!.model;
  const patch = (v: Partial<Proposal>) => onChange({ ...p, ...v });
  return (
    <div className="av-form">
      {p.kind === 'block' ? (
        <details className="av-scope-detail">
          <summary>
            Scope · {c.location} · Revision {s.revision}
          </summary>{' '}
          <p className="av-scope-note">
            {c.profile.name} · {c.location} · {c.offering.name} · {c.method}
            <br />
            Local draft based on revision {s.revision}. Existing work will be retained.
          </p>
        </details>
      ) : (
        <p className="av-scope-note">
          {c.profile.name} · {c.location} · {c.offering.name} · {c.method}
          <br />
          Local draft based on revision {s.revision}. Existing work will be retained.
        </p>
      )}
      <div className="av-form-grid">
        <Field label="Change name">
          <input value={p.title} onChange={(e) => patch({ title: e.target.value })} />
        </Field>
        <Field label="Reason">
          <input value={p.reason} onChange={(e) => patch({ reason: e.target.value })} />
        </Field>
      </div>
      {p.eventId && s.events.find((e) => e.id === p.eventId)?.seriesId && (
        <Field label="Series change scope">
          <select
            value={p.affectScope ?? 'one'}
            onChange={(e) => patch({ affectScope: e.target.value as 'one' | 'future' })}
          >
            <option value="one">This block only</option>
            <option value="future">This and future blocks in the series</option>
          </select>
        </Field>
      )}
      {['hours', 'resource-hours', 'date-hours'].includes(p.kind) && (
        <>
          {p.kind !== 'date-hours' && (
            <Field
              label="Applies from date"
              hint="Existing work is retained. Later dates use this schedule only from the selected day."
            >
              <input
                type="date"
                value={p.effectiveFrom ?? s.now.slice(0, 10)}
                onChange={(e) => patch({ effectiveFrom: e.target.value })}
              />
            </Field>
          )}
          {p.kind === 'date-hours' && (
            <Field label="Special date">
              <input
                type="date"
                value={p.date ?? ''}
                onChange={(e) => patch({ date: e.target.value })}
              />
            </Field>
          )}
          <HoursEditor
            onlyDay={
              p.kind === 'date-hours' && p.date
                ? (new Date(p.date + 'T12:00Z').getUTCDay() + 6) % 7
                : undefined
            }
            hours={p.hours ?? s.hours}
            onChange={(hours) => patch({ hours })}
          />
          {p.kind === 'hours' && (
            <p className="av-footnote">
              This is the selected activity’s local schedule. Copying to other locations requires
              explicit targets. Resetting an override is a new reviewed change.
            </p>
          )}
        </>
      )}
      {['block', 'occurrence', 'hold'].includes(p.kind) && (
        <div className="av-form-grid av-dated-range">
          <Field label="Starts (EAT)">
            <input
              type="datetime-local"
              value={p.start ?? ''}
              onChange={(e) => patch({ start: e.target.value })}
            />
          </Field>
          <Field label="Ends (EAT)">
            <input
              type="datetime-local"
              value={p.end ?? ''}
              onChange={(e) => patch({ end: e.target.value })}
            />
          </Field>
        </div>
      )}
      {['block', 'resource-hours', 'occurrence'].includes(p.kind) && s.resources.length > 0 && (
        <details className="av-resource-choice" open={p.kind === 'block' ? undefined : true}>
          <summary>
            Affected resources ·{' '}
            {p.resourceIds?.length
              ? p.resourceIds
                  .map((id) => s.resources.find((r) => r.id === id)?.name ?? id)
                  .join(' + ')
              : 'Entire activity'}
          </summary>
          <fieldset className="av-fieldset">
            <legend>Affected resources</legend>
            {p.kind === 'block' && (
              <p className="av-footnote">
                No resource selection means this activity’s whole schedule. An asset-specific block
                needs its actual asset.
              </p>
            )}
            <div className="av-check-grid">
              {s.resources.map((r) => (
                <label className="av-check" key={r.id}>
                  <input
                    type="checkbox"
                    checked={p.resourceIds?.includes(r.id) ?? false}
                    onChange={(e) =>
                      patch({
                        resourceIds: e.target.checked
                          ? [...(p.resourceIds ?? []), r.id]
                          : (p.resourceIds ?? []).filter((id) => id !== r.id),
                      })
                    }
                  />
                  {r.name}
                  {r.state === 'unknown' ? ' · Unknown' : ''}
                </label>
              ))}
            </div>
          </fieldset>
        </details>
      )}
      {p.kind === 'pause' && (
        <>
          <Field label="Affected method">
            <select value={p.method} onChange={(e) => patch({ method: e.target.value })}>
              {[...new Set([...(c.offering.fulfilmentMethods ?? [c.method]), c.method])].map(
                (m) => (
                  <option key={m}>{m}</option>
                ),
              )}
            </select>
          </Field>
          <div className="av-form-grid">
            <Field label="Pause begins (EAT)">
              <input
                type="datetime-local"
                value={p.start ?? ''}
                onChange={(e) => patch({ start: e.target.value })}
              />
            </Field>
            <Field label="Resume at (EAT)" hint="Leave blank for an explicit manual resume.">
              <input
                type="datetime-local"
                value={p.end ?? ''}
                onChange={(e) => patch({ end: e.target.value || undefined })}
              />
            </Field>
          </div>
          <p className="av-note">
            Only new intake for this method is affected. Existing reservations and holds follow
            their saved terms.
          </p>
        </>
      )}
      {(p.kind === 'capacity' || p.kind === 'occurrence') && s.pools.length > 0 && (
        <div className="av-form-grid">
          <Field label="Capacity pool">
            <select
              value={p.poolId ?? s.pools[0]?.id}
              onChange={(e) => {
                const pool = s.pools.find((x) => x.id === e.target.value);
                patch({ poolId: pool?.id, unit: pool?.unit, quantity: pool?.total });
              }}
            >
              {s.pools.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.label} · {pool.unit}
                </option>
              ))}
            </select>
          </Field>
          {(p.kind === 'capacity' || p.kind === 'occurrence') && (
            <Field label={'Total capacity (' + p.unit + ')'}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={p.quantity ?? ''}
                onChange={(e) =>
                  patch({ quantity: e.target.value === '' ? NaN : Number(e.target.value) })
                }
              />
            </Field>
          )}
        </div>
      )}
      {['block', 'occurrence'].includes(p.kind) && (
        <details className="av-details">
          <summary>Repeat this change</summary>
          <label className="av-check">
            <input
              type="checkbox"
              checked={!!p.recurrence}
              onChange={(e) =>
                patch({ recurrence: e.target.checked ? { everyDays: 7, count: 4 } : undefined })
              }
            />
            Create a bounded series
          </label>
          {p.recurrence && (
            <div className="av-form-grid">
              <Field label="End series on (optional)">
                <input
                  type="date"
                  value={p.recurrence.until ?? ''}
                  onChange={(e) =>
                    patch({ recurrence: { ...p.recurrence!, until: e.target.value || undefined } })
                  }
                />
              </Field>
              <Field label="Skip dates (comma separated)">
                <input
                  placeholder="2026-11-10, 2026-11-17"
                  value={p.recurrence.excludeDates?.join(', ') ?? ''}
                  onChange={(e) =>
                    patch({
                      recurrence: {
                        ...p.recurrence!,
                        excludeDates: e.target.value
                          .split(',')
                          .map((x) => x.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </Field>
              <Field label="Repeat every (days)">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={p.recurrence.everyDays}
                  onChange={(e) =>
                    patch({ recurrence: { ...p.recurrence!, everyDays: Number(e.target.value) } })
                  }
                />
              </Field>
              <Field label="Occurrences">
                <input
                  type="number"
                  min="1"
                  max="52"
                  value={p.recurrence.count}
                  onChange={(e) =>
                    patch({ recurrence: { ...p.recurrence!, count: Number(e.target.value) } })
                  }
                />
              </Field>
            </div>
          )}
          <p className="av-footnote">
            Every date is checked. Existing reservations are never moved by a series edit. Remove a
            specific local block from its inspector.
          </p>
        </details>
      )}
      {p.kind === 'settings' && (
        <div className="av-form-grid">
          <Field label="Minimum notice (minutes)">
            <input
              type="number"
              min="0"
              value={p.settings?.noticeMinutes ?? s.settings.noticeMinutes}
              onChange={(e) =>
                patch({ settings: { ...p.settings, noticeMinutes: Number(e.target.value) } })
              }
            />
          </Field>
          <Field label="Booking horizon (days)">
            <input
              type="number"
              min="1"
              max="365"
              value={p.settings?.horizonDays ?? s.settings.horizonDays}
              onChange={(e) =>
                patch({ settings: { ...p.settings, horizonDays: Number(e.target.value) } })
              }
            />
          </Field>
          {model === 'ORDER' && (
            <Field label="Last-order cutoff (EAT)" hint="Only applies to order intake.">
              <input
                type="time"
                value={p.settings?.cutoff ?? s.settings.cutoff}
                onChange={(e) => patch({ settings: { ...p.settings, cutoff: e.target.value } })}
              />
            </Field>
          )}
          {model === 'SERVICE_JOB' && (
            <Field label="Service job scheduling">
              <select
                value={p.settings?.jobMode ?? s.settings.jobMode}
                onChange={(e) =>
                  patch({
                    settings: {
                      ...p.settings,
                      jobMode: e.target.value as Snapshot['settings']['jobMode'],
                    },
                  })
                }
              >
                <option value="queue">Walk-in queue</option>
                <option value="intake">Scheduled intake</option>
                <option value="work">Scheduled work</option>
              </select>
            </Field>
          )}
          {model === 'LINKED_WINDOWS' && (
            <Field label="Linked-window promise">
              <select
                value={p.settings?.promise ?? s.settings.promise}
                onChange={(e) =>
                  patch({
                    settings: {
                      ...p.settings,
                      promise: e.target.value as Snapshot['settings']['promise'],
                    },
                  })
                }
              >
                <option value="firm">Firm: all required roles</option>
                <option value="assessment">Assessment: incoming only</option>
              </select>
            </Field>
          )}
        </div>
      )}
      {p.targets && (
        <fieldset className="av-fieldset">
          <legend>Explicit target locations</legend>
          {LOCATIONS.map((l) => (
            <label className="av-check" key={l}>
              <input
                type="checkbox"
                checked={p.targets?.includes(l) ?? false}
                onChange={(e) =>
                  patch({
                    targets: e.target.checked
                      ? [...(p.targets ?? []), l]
                      : (p.targets ?? []).filter((x) => x !== l),
                  })
                }
              />
              {l}
            </label>
          ))}
          <p className="av-footnote">
            Only this offering/method and compatible time/unit model are copied. Each target is
            revalidated independently.
          </p>
          <label className="av-check">
            <input
              type="checkbox"
              checked={p.allowPartial ?? false}
              onChange={(e) => patch({ allowPartial: e.target.checked })}
            />
            Apply only eligible targets if some targets are blocked
          </label>
        </fieldset>
      )}
    </div>
  );
}
export function ImpactReview({ impact, c }: { impact: Impact; c: Context }) {
  const hasConflicts = impact.affected.length > 0;
  const errors = impact.errors.filter(
    (e) => !hasConflicts || !e.startsWith('Existing commitments are retained.'),
  );
  const warnings = impact.warnings.filter(
    (w) =>
      !(
        impact.affected.some((e) => e.ongoing) && w.startsWith('Overdue return remains unresolved.')
      ),
  );
  return (
    <section
      className={'av-impact ' + (impact.errors.length ? 'av-impact-error' : '')}
      aria-label="Change impact"
    >
      <h3>{hasConflicts ? 'Conflicts to resolve' : 'Review impact'}</h3>
      {impact.targets?.map((t) => (
        <p key={t.location}>
          <strong>{t.location}</strong> ·{' '}
          {t.errors.length ? t.errors.join(' ') : 'Eligible in preview'}
        </p>
      ))}
      {errors.length > 0 && (
        <ul>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {!impact.errors.length && (
        <p>No conflicting sample work. This change is ready to apply locally.</p>
      )}
      {hasConflicts && (
        <div className="av-impact-records">
          <h4>
            {new Set(impact.affected.map((e) => e.workId)).size} affected work record(s) · Existing
            work retained
          </h4>
          {impact.affected.map((e) => (
            <article key={e.id}>
              <a className="av-link" href={workHref(c, e.workId, e.ownerScope)}>
                {e.workId} ·{' '}
                {e.ongoing
                  ? 'Return outstanding'
                  : e.status === 'confirmed'
                    ? 'Confirmed booking'
                    : e.title}
              </a>
              <small>
                {e.ongoing
                  ? 'Planned return: ' +
                    prettyDate(e.end) +
                    ' ' +
                    localTime(e.end) +
                    ' · Resolve in Work'
                  : prettyDate(e.start) +
                    ' ' +
                    localTime(e.start) +
                    ' → ' +
                    prettyDate(e.end) +
                    ' ' +
                    localTime(e.end)}
                {e.role ? ' · ' + e.role : ''}
              </small>
            </article>
          ))}
        </div>
      )}
      {warnings.map((w) => (
        <p className="av-impact-warning" key={w}>
          {w}
        </p>
      ))}
      {impact.occurrences.length > 1 && (
        <details>
          <summary>{impact.occurrences.length} dated occurrence(s)</summary>
          <ul>
            {impact.occurrences.map((t, i) => (
              <li key={i}>
                {prettyDate(t.start)} {localTime(t.start)} → {prettyDate(t.end)} {localTime(t.end)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
