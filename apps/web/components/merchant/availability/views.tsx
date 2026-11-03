'use client';

import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Search } from 'lucide-react';
import {
  CalendarLegend,
  PRESENTATION,
  ResourceIdentity,
  timeGridSegments,
  type CalendarItem,
} from './calendar';
import {
  DAYS,
  activeEvents,
  addMinutes,
  afterBuffer,
  dateAdd,
  effectiveIntervals,
  localDate,
  localInput,
  localTime,
  monday,
  overlaps,
  poolUsage,
  prettyDate,
  stamp,
  type Commitment,
  type Context,
  type Snapshot,
} from './model';

export function HoursView({
  s,
  date,
  onEdit,
  onSelect,
}: {
  s: Snapshot;
  date: string;
  onEdit: () => void;
  onSelect: (e: Commitment) => void;
}) {
  const week = monday(date);
  return (
    <section className="av-card">
      <div className="av-card-heading">
        <h2>Hours this week</h2>
        <button className="av-button av-quiet" onClick={onEdit}>
          <Pencil size={15} />
          Edit hours
        </button>
      </div>
      <div className="av-table-wrap">
        <table className="av-hours">
          <thead>
            <tr>
              <th>Day</th>
              <th>Effective hours</th>
              <th>Status</th>
              <th>
                <span className="av-sr">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {s.hours.map((h) => {
              const d = dateAdd(week, h.day),
                today = d === localDate(s.now);
              const effective = effectiveIntervals(s, d);
              const exceptions = activeEvents(s).filter(
                (e) => e.status === 'block' && !e.resources.length && localDate(e.start) === d,
              );
              return (
                <tr key={h.day} className={today ? 'av-today' : ''}>
                  <th scope="row">
                    {DAYS[h.day]}
                    <small>
                      {prettyDate(d)}
                      {today ? ' · Today' : ''}
                    </small>
                  </th>
                  <td>
                    {effective.length
                      ? effective.map((i, n) => (
                          <div key={n}>
                            {i.start}–{i.end}
                            {i.nextDay ? <small>Ends next day</small> : null}
                          </div>
                        ))
                      : (s.dateHours?.[d]?.state ?? h.state) === 'unspecified'
                        ? 'Hours not set'
                        : 'Closed'}
                  </td>
                  <td>
                    {s.dateHours?.[d] ? (
                      <span className="av-badge av-amber">Special date hours</span>
                    ) : exceptions.length ? (
                      <button className="av-link" onClick={() => onSelect(exceptions[0]!)}>
                        Date exception · {exceptions[0]!.title}
                      </button>
                    ) : (
                      <span className={'av-badge ' + (h.state === 'unspecified' ? 'av-amber' : '')}>
                        {h.state === 'open'
                          ? h.intervals.length > 1
                            ? 'Split hours'
                            : 'Scheduled open'
                          : h.state === 'closed'
                            ? 'Scheduled closed'
                            : 'Unspecified'}
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="av-icon"
                      aria-label={'Edit ' + DAYS[h.day] + ' hours'}
                      onClick={onEdit}
                    >
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="av-footnote">
        Nairobi time · EAT. Dated exceptions override the regular intervals shown.
      </p>
    </section>
  );
}
function EventButton({
  e,
  s,
  onSelect,
  style,
  draggable = false,
}: {
  e: Commitment;
  s: Snapshot;
  onSelect: (e: Commitment) => void;
  style?: React.CSSProperties;
  draggable?: boolean;
}) {
  const { Icon } = PRESENTATION[e.status];
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-nexg-event', e.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      className={'av-event av-event-' + e.status}
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(e);
      }}
      aria-label={e.workId + ' ' + e.title + ' ' + localTime(e.start) + ' to ' + localTime(e.end)}
    >
      <Icon className="av-event-status-icon" size={12} aria-hidden="true" />
      <strong>
        {e.status === 'break'
          ? e.title
          : e.workId +
            ' · ' +
            (e.status === 'held' ? 'Hold' : e.status === 'overdue' ? 'Return overdue' : e.title)}
      </strong>
      <span>
        {localTime(e.start)}–{localTime(e.end)}
        {e.role ? ' · ' + e.role : ''}
      </span>
      {e.status === 'held' && e.expiresAt && stamp(e.expiresAt) <= stamp(s.now) && (
        <span>Expiry being checked</span>
      )}
    </button>
  );
}
export function CalendarView({
  s,
  c,
  date,
  resourceFilter,
  onSelect,
  onSlot,
  onMove,
  editable = false,
}: {
  s: Snapshot;
  c: Context;
  date: string;
  resourceFilter: string;
  onSelect: (e: Commitment) => void;
  onSlot?: (start: string, resourceId?: string) => void;
  onMove?: (event: Commitment, start: string, end: string, resourceId?: string) => void;
  editable?: boolean;
}) {
  const resources = s.resources.filter((r) => resourceFilter === 'all' || r.id === resourceFilter);
  if (!resources.length)
    return (
      <Empty
        title="No resources linked"
        text="Link the actual staff, room or equipment in Offerings. Missing resources do not imply available time."
      />
    );
  const items: CalendarItem[] = activeEvents(s)
    .filter((e) => e.resources.some((id) => resources.some((r) => r.id === id)))
    .map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.ongoing ? s.coverageEnd : e.end,
      status: e.status,
      label: e.workId,
      resources: e.resources,
      event: e,
    }));
  const dayStart = stamp(date + 'T00:00');
  let firstHour = 9,
    lastHour = 17;
  for (const item of items)
    if (stamp(item.start) < dayStart + 86400000 && stamp(item.end) > dayStart) {
      firstHour = Math.min(
        firstHour,
        Math.max(0, Math.floor((stamp(item.start) - dayStart) / 3600000)),
      );
      lastHour = Math.max(
        lastHour,
        Math.min(
          24,
          Math.ceil(
            (stamp(item.end) + (item.event?.afterMinutes ?? afterBuffer(c)) * 60000 - dayStart) /
              3600000,
          ),
        ),
      );
    }
  const hourCount = lastHour - firstHour,
    hours = Array.from({ length: hourCount }, (_, i) => firstHour + i);
  const pos = (value: string) =>
    ((stamp(value) - dayStart - firstHour * 3600000) / (hourCount * 3600000)) * 100;
  const minuteAt = (y: number, box: DOMRect, keyboard = false) =>
    keyboard
      ? (Math.max(firstHour, 9) - firstHour) * 60
      : Math.max(
          0,
          Math.min(
            hourCount * 60 - 15,
            Math.floor((((y - box.top) / box.height) * hourCount * 60) / 15) * 15,
          ),
        );
  const at = (minute: number) => localInput(addMinutes(date + 'T00:00', firstHour * 60 + minute));
  return (
    <section className="av-card av-calendar-card">
      <div className="av-calendar-scroll">
        <div
          className="av-calendar"
          style={{ minWidth: Math.max(510, resources.length * 170 + 66) }}
        >
          <div
            className="av-calendar-head"
            style={{ gridTemplateColumns: '66px repeat(' + resources.length + ',minmax(0,1fr))' }}
          >
            <div>EAT</div>
            {resources.map((r) => (
              <div key={r.id}>
                <ResourceIdentity name={r.name} kind={r.kind} />
                {r.state === 'unknown' && <small>Source unknown</small>}
              </div>
            ))}
          </div>
          <div
            className="av-calendar-body"
            style={{
              gridTemplateColumns: '66px repeat(' + resources.length + ',minmax(0,1fr))',
              minHeight: hourCount * 26,
            }}
          >
            <div className="av-time-axis">
              {hours.map((h) => (
                <span key={h} style={{ top: ((h - firstHour) / hourCount) * 100 + '%' }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {resources.map((r) => (
              <div
                key={r.id}
                className={'av-calendar-lane ' + (r.state === 'unknown' ? 'av-hatched' : '')}
                style={{ backgroundSize: '100% ' + 100 / hourCount + '%' }}
                onDragOver={(e) => {
                  if (editable && r.state === 'current') e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!editable || r.state !== 'current') return;
                  const event = s.events.find(
                    (x) => x.id === e.dataTransfer.getData('application/x-nexg-event'),
                  );
                  if (event) {
                    const start = at(minuteAt(e.clientY, e.currentTarget.getBoundingClientRect()));
                    onMove?.(
                      event,
                      start,
                      addMinutes(start, (stamp(event.end) - stamp(event.start)) / 60000),
                      r.id,
                    );
                  }
                }}
              >
                <button
                  type="button"
                  className="av-slot-hit"
                  disabled={!editable || r.state !== 'current'}
                  aria-label={'Plan time for ' + r.name}
                  onClick={(e) =>
                    onSlot?.(
                      at(
                        minuteAt(
                          e.clientY,
                          e.currentTarget.getBoundingClientRect(),
                          e.detail === 0,
                        ),
                      ),
                      r.id,
                    )
                  }
                />
                {r.state === 'unknown' && <p className="av-lane-note">Source unknown</p>}
                {timeGridSegments(
                  items.filter((i) => i.resources.includes(r.id)),
                  date,
                  firstHour,
                  lastHour,
                ).map(({ item, top, height, lane, lanes }) => {
                  const event = item.event!;
                  const buffer = event.afterMinutes ?? afterBuffer(c);
                  return (
                    <div key={event.id}>
                      <EventButton
                        e={event}
                        s={s}
                        onSelect={onSelect}
                        draggable={
                          editable &&
                          !event.ongoing &&
                          !event.ownerScope &&
                          event.role !== 'Session anchor'
                        }
                        style={{
                          position: 'absolute',
                          top: top + '%',
                          height: Math.max(3, height) + '%',
                          left: 'calc(' + (lane / lanes) * 100 + '% + 5px)',
                          width: 'calc(' + 100 / lanes + '% - 10px)',
                        }}
                      />
                      {buffer > 0 &&
                        ['confirmed', 'held'].includes(event.status) &&
                        pos(event.end) < 100 &&
                        pos(addMinutes(event.end, buffer)) > 0 && (
                          <div
                            className="av-buffer"
                            style={{
                              top: Math.max(0, pos(event.end)) + '%',
                              height:
                                Math.min(
                                  100 - Math.max(0, pos(event.end)),
                                  Math.max(2, (buffer / (hourCount * 60)) * 100),
                                ) + '%',
                            }}
                          >
                            Buffer {localTime(event.end)}–{localTime(addMinutes(event.end, buffer))}
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            ))}
            {localDate(s.now) === date && pos(s.now) >= 0 && pos(s.now) <= 100 && (
              <div className="av-now" style={{ top: pos(s.now) + '%' }}>
                <span>{localTime(s.now)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <Legend s={s} />
      <p className="av-footnote">
        Required resources still block availability when filtered out. Use Agenda for a linear
        reading order.
      </p>
    </section>
  );
}
export function TimelineView({
  s,
  c,
  date,
  resourceFilter,
  onSelect,
  onSlot,
  onMove,
  editable = false,
  dayCount = 7,
}: {
  s: Snapshot;
  c: Context;
  date: string;
  resourceFilter: string;
  onSelect: (e: Commitment) => void;
  onSlot?: (start: string, resourceId?: string) => void;
  onMove?: (event: Commitment, start: string, end: string, resourceId?: string) => void;
  editable?: boolean;
  dayCount?: number;
}) {
  const week = dayCount === 1 ? date : monday(date),
    start = stamp(week + 'T00:00'),
    end = stamp(dateAdd(week, dayCount) + 'T00:00'),
    width = end - start;
  const pc = (v: string) => Math.max(0, Math.min(100, ((stamp(v) - start) / width) * 100));
  const resources = s.resources.filter((r) => resourceFilter === 'all' || r.id === resourceFilter);
  if (!resources.length)
    return (
      <Empty
        title="No resources linked"
        text="Choose the actual asset or space in Offerings before promising capacity."
      />
    );
  return (
    <section className="av-card av-timeline-card">
      <div className="av-table-wrap">
        <div className="av-timeline">
          <div className="av-timeline-heading">
            <strong>Resource</strong>
            <div
              className="av-days"
              style={{ gridTemplateColumns: 'repeat(' + dayCount + ',1fr)' }}
            >
              {Array.from({ length: dayCount }, (_, i) => (
                <span key={i} className={dateAdd(week, i) === localDate(s.now) ? 'av-today' : ''}>
                  {prettyDate(dateAdd(week, i))}
                </span>
              ))}
            </div>
          </div>
          {resources.map((r) => (
            <div className="av-timeline-row" key={r.id}>
              <div className="av-resource-name">
                <ResourceIdentity name={r.name} kind={r.kind} />
              </div>
              <div
                className={'av-timeline-track ' + (r.state === 'unknown' ? 'av-hatched' : '')}
                onDragOver={(e) => {
                  if (editable && r.state === 'current') e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!editable || r.state !== 'current') return;
                  const event = s.events.find(
                    (x) => x.id === e.dataTransfer.getData('application/x-nexg-event'),
                  );
                  if (!event) return;
                  const b = e.currentTarget.getBoundingClientRect(),
                    minutes =
                      Math.floor((((e.clientX - b.left) / b.width) * dayCount * 1440) / 15) * 15,
                    start = addMinutes(week + 'T00:00', minutes);
                  onMove?.(
                    event,
                    start,
                    addMinutes(start, (stamp(event.end) - stamp(event.start)) / 60000),
                    r.id,
                  );
                }}
              >
                <button
                  type="button"
                  className="av-slot-hit"
                  disabled={!editable || r.state !== 'current'}
                  aria-label={'Plan time for ' + r.name}
                  onClick={(e) => {
                    const box = e.currentTarget.getBoundingClientRect(),
                      minutes =
                        e.detail === 0
                          ? 540
                          : Math.floor(
                              (((e.clientX - box.left) / box.width) * dayCount * 1440) / 15,
                            ) * 15;
                    onSlot?.(localInput(addMinutes(week + 'T00:00', minutes)), r.id);
                  }}
                />
                {r.state === 'unknown' ? (
                  <span className="av-track-note">Source unknown · Last checked 09:12 EAT</span>
                ) : null}
                {activeEvents(s)
                  .filter(
                    (e) =>
                      e.resources.includes(r.id) &&
                      stamp(e.start) < end &&
                      stamp(e.ongoing ? s.coverageEnd : e.end) > start,
                  )
                  .map((e) => {
                    const left = pc(e.start),
                      right = pc(e.ongoing ? s.now : e.end),
                      hasCustody = activeEvents(s).some(
                        (x) => x.resources.includes(r.id) && x.ongoing,
                      ),
                      hasBlock = activeEvents(s).some(
                        (x) => x.resources.includes(r.id) && x.status === 'block',
                      ),
                      track =
                        e.status === 'overdue'
                          ? 0
                          : e.status === 'block'
                            ? hasCustody
                              ? 1
                              : 0
                            : hasCustody
                              ? 2
                              : hasBlock
                                ? 1
                                : 0;
                    return (
                      <div key={e.id}>
                        <EventButton
                          e={e}
                          s={s}
                          onSelect={onSelect}
                          draggable={
                            editable && !e.ongoing && !e.ownerScope && e.role !== 'Session anchor'
                          }
                          style={{
                            position: 'absolute',
                            left: left + '%',
                            width: Math.max(1, right - left) + '%',
                            top:
                              'calc(var(--av-track-inset, 8px) + ' +
                              track +
                              ' * var(--av-track-step, 34px))',
                            height: 'var(--av-track-height, 31px)',
                          }}
                        />
                        {e.ongoing && pc(s.now) < 100 && (
                          <button
                            className="av-ongoing"
                            style={{ left: pc(s.now) + '%', width: 100 - pc(s.now) + '%', top: 8 }}
                            onClick={() => onSelect(e)}
                          >
                            Return not recorded · Future unconfirmed
                          </button>
                        )}
                      </div>
                    );
                  })}
                {r.state === 'current' &&
                  !activeEvents(s).some(
                    (e) =>
                      e.resources.includes(r.id) &&
                      stamp(e.start) < end &&
                      stamp(e.ongoing ? s.coverageEnd : e.end) > start,
                  ) && (
                    <span className="av-track-note">
                      No sample commitments in this covered range
                    </span>
                  )}
                {stamp(s.now) >= start && stamp(s.now) <= end && (
                  <div className="av-timeline-now" style={{ left: pc(s.now) + '%' }} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Legend s={s} />
      <p className="av-footnote">
        Exclusive intervals include configured turnover ({afterBuffer(c)} min). Actual return is
        recorded in Work.
      </p>
    </section>
  );
}
export function CapacityView({ s, onCapacity }: { s: Snapshot; onCapacity: (id: string) => void }) {
  return (
    <div className="av-pool-grid">
      {s.pools.map((p) => {
        const n = poolUsage(s, p.id);
        return (
          <section className="av-card av-pool" key={p.id}>
            <div className="av-card-heading">
              <h2>{p.label}</h2>
              <button
                className="av-icon"
                onClick={() => onCapacity(p.id)}
                aria-label={'Edit ' + p.label}
              >
                <Pencil size={16} />
              </button>
            </div>
            <div className="av-capacity">
              <span>
                <strong>{n.total}</strong>Total {p.unit}
              </span>
              <span>
                <strong>{n.reserved}</strong>Reserved
              </span>
              <span>
                <strong>{n.held}</strong>Held
              </span>
              <span>
                <strong>{n.remaining}</strong>Remaining
              </span>
            </div>
            <p className="av-footnote">
              One sample source revision. Unlike units are never added together.
            </p>
          </section>
        );
      })}
    </div>
  );
}
export function OccurrenceView({
  s,
  onSelect,
  onAdd,
  onCapacity,
}: {
  s: Snapshot;
  onSelect: (e: Commitment) => void;
  onAdd: () => void;
  onCapacity: (id: string) => void;
}) {
  return (
    <>
      <CapacityView s={s} onCapacity={onCapacity} />
      <section className="av-card">
        <div className="av-card-heading">
          <h2>Published dated occurrences</h2>
          <button className="av-button" onClick={onAdd}>
            <Plus size={16} />
            Add occurrence
          </button>
        </div>
        {!s.occurrences.length ? (
          <Empty
            title="No sessions published"
            text="A regular opening day does not create a session. Add a real date and its capacity pool."
          />
        ) : (
          s.occurrences.map((o) => {
            const p = s.pools.find((p) => p.id === o.poolId),
              n = poolUsage(s, o.poolId, o.start, o.end);
            return (
              <article className="av-occurrence" key={o.id}>
                <CalendarDays size={22} />
                <div>
                  <h3>{o.title}</h3>
                  <p>
                    {prettyDate(o.start)} · {localTime(o.start)}–{localTime(o.end)}
                  </p>
                  <small>
                    {o.resources
                      .map((id) => s.resources.find((r) => r.id === id)?.name)
                      .filter(Boolean)
                      .join(' + ')}
                  </small>
                </div>
                <span className="av-badge av-green">
                  {n.remaining} {p?.unit} remain
                </span>
                <div className="av-actions">
                  {activeEvents(s)
                    .filter(
                      (e) => e.poolId === o.poolId && overlaps(o.start, o.end, e.start, e.end),
                    )
                    .map((e) => (
                      <button key={e.id} className="av-link" onClick={() => onSelect(e)}>
                        {e.workId} · {e.quantity} {p?.unit}
                      </button>
                    ))}
                </div>
              </article>
            );
          })
        )}
      </section>
    </>
  );
}
export function Agenda({
  s,
  date,
  onSelect,
  allDates = false,
  search = '',
  resourceFilter = 'all',
}: {
  s: Snapshot;
  date: string;
  onSelect: (e: Commitment) => void;
  allDates?: boolean;
  search?: string;
  resourceFilter?: string;
}) {
  const events = activeEvents(s)
    .filter((e) => e.role !== 'Session anchor')
    .filter(
      (e) =>
        (allDates ||
          overlaps(date + 'T00:00', dateAdd(date, 1) + 'T00:00', e.start, e.end) ||
          e.ongoing) &&
        (resourceFilter === 'all' || e.resources.includes(resourceFilter)) &&
        (
          e.title +
          ' ' +
          e.workId +
          ' ' +
          e.customer +
          ' ' +
          e.status +
          ' ' +
          (e.role ?? '') +
          ' ' +
          e.resources.map((id) => s.resources.find((r) => r.id === id)?.name ?? id).join(' ')
        )
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => stamp(a.start) - stamp(b.start));
  if (!events.length)
    return (
      <Empty
        title={
          search || resourceFilter !== 'all' ? 'No matching work' : 'No scheduled work in this view'
        }
        text={
          search || resourceFilter !== 'all'
            ? 'Clear filters or choose another date. Filtering does not remove shared constraints.'
            : 'Opening hours and source coverage still apply; an empty list does not promise capacity.'
        }
      />
    );
  return (
    <section className="av-card">
      <h2 className="av-card-heading">Scheduled work</h2>
      <div className="av-agenda">
        {events.map((e) => (
          <button className="av-agenda-row" key={e.id} onClick={() => onSelect(e)}>
            <span className={'av-state-dot av-event-' + e.status} />
            <div>
              <strong>
                {e.workId} · {e.title}
              </strong>
              <span>
                {prettyDate(e.start)} · {localTime(e.start)}–{localTime(e.end)}
                {e.ongoing ? ' · Actual return outstanding' : ''}
              </span>
              <small>
                {e.role ? e.role + ' · ' : ''}
                {e.resources
                  .map((id) => s.resources.find((r) => r.id === id)?.name ?? id)
                  .join(' + ') || 'No exclusive resource claim'}
              </small>
            </div>
            <span className="av-badge">{e.status.replace('_', ' ')}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
export function Legend({ s }: { s?: Snapshot }) {
  const statuses = s ? [...new Set(s.events.map((e) => e.status))] : undefined;
  return (
    <CalendarLegend
      statusList={statuses}
      showBuffer={s?.resources.some((r) =>
        /Staff|Provider|Room|Existing booking resource/.test(r.kind),
      )}
    />
  );
}
export function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="av-empty">
      <CalendarDays size={28} />
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function DateToolbar({
  date,
  mode,
  modes = ['day', 'week', 'month', 'list'],
  setDate,
  setMode,
  now,
  resources,
  resourceFilter,
  setResourceFilter,
  search,
  setSearch,
}: {
  date: string;
  mode: string;
  modes?: string[];
  setDate: (d: string) => void;
  setMode: (m: string) => void;
  now: string;
  resources: Snapshot['resources'];
  resourceFilter: string;
  setResourceFilter: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  return (
    <div className="av-date-toolbar">
      <div className="av-actions">
        <button
          className="av-icon"
          aria-label="Previous period"
          onClick={() =>
            setDate(
              mode === 'month'
                ? new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 2, 1))
                    .toISOString()
                    .slice(0, 10)
                : dateAdd(date, mode === 'day' ? -1 : -7),
            )
          }
        >
          <ChevronLeft size={18} />
        </button>
        <label className="av-date-label">
          <span className="av-sr">Selected date</span>
          <input
            aria-label="Selected date"
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
        <button
          className="av-icon"
          aria-label="Next period"
          onClick={() =>
            setDate(
              mode === 'month'
                ? new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 1))
                    .toISOString()
                    .slice(0, 10)
                : dateAdd(date, mode === 'day' ? 1 : 7),
            )
          }
        >
          <ChevronRight size={18} />
        </button>
        <button className="av-button" onClick={() => setDate(localDate(now))}>
          Today
        </button>
      </div>
      <div className="av-actions">
        <div className="av-segment" aria-label="Schedule display">
          {modes.map((m) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === 'list' ? 'Agenda' : m === 'week' ? 'Week' : m === 'month' ? 'Month' : 'Day'}
            </button>
          ))}
        </div>
        {resources.length > 0 && (
          <label>
            <span className="av-sr">Filter resources</span>
            <select
              aria-label="Filter resources"
              value={resourceFilter}
              onChange={(e) => setResourceFilter(e.target.value)}
            >
              <option value="all">All resources</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="av-search">
          <Search size={15} />
          <input
            aria-label="Search scheduled work"
            placeholder="Search work"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

export function ResourceWeekView({
  s,
  c,
  date,
  resourceFilter,
  onSelect,
}: {
  s: Snapshot;
  c: Context;
  date: string;
  resourceFilter: string;
  onSelect: (e: Commitment) => void;
}) {
  const week = monday(date);
  return (
    <section className="av-card av-calendar-card">
      <div className="av-week-scroll">
        <div className="av-week-grid">
          {Array.from({ length: 7 }, (_, i) => {
            const d = dateAdd(week, i),
              events = activeEvents(s).filter(
                (e) =>
                  (localDate(e.start) === d || e.ongoing) &&
                  (resourceFilter === 'all' || e.resources.includes(resourceFilter)),
              );
            return (
              <section
                key={d}
                className={localDate(s.now) === d ? 'av-week-day av-today' : 'av-week-day'}
              >
                <h3>{prettyDate(d)}</h3>
                {events.map((e) => (
                  <div className="av-week-event" key={e.id}>
                    <EventButton e={e} s={s} onSelect={onSelect} />
                    <small>
                      {e.resources
                        .map((id) => s.resources.find((r) => r.id === id)?.name)
                        .filter(Boolean)
                        .join(' + ')}
                    </small>
                  </div>
                ))}
                {!events.length && (
                  <p className="av-footnote">
                    No sample work.
                    <br />
                    Source and schedule checks still apply.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </div>
      <Legend s={s} />
      <p className="av-footnote">
        Week of {prettyDate(week)}. Service span {Number(c.offering.fields.duration_minutes ?? 60)}{' '}
        min; use Day for exact resource positions.
      </p>
    </section>
  );
}
