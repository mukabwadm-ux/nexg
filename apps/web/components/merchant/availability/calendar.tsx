'use client';

import {
  Bike,
  CarFront,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DoorOpen,
  Hammer,
  Hourglass,
  MapPin,
  Package,
  PauseCircle,
  Plus,
  ShieldQuestion,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { offeringHref } from './source';
import {
  activeEvents,
  addMinutes,
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
  type Occurrence,
  type Snapshot,
  type View,
} from './model';

export const PRESENTATION: Record<
  Commitment['status'] | 'occurrence',
  { label: string; className: string; Icon: LucideIcon }
> = {
  confirmed: { label: 'Confirmed', className: 'av-event-confirmed', Icon: CheckCircle2 },
  held: { label: 'Held', className: 'av-event-held', Icon: Hourglass },
  in_use: { label: 'In use', className: 'av-event-in_use', Icon: Package },
  overdue: { label: 'Return overdue', className: 'av-event-overdue', Icon: Clock3 },
  block: { label: 'Time block', className: 'av-event-block', Icon: Wrench },
  break: { label: 'Break', className: 'av-event-break', Icon: PauseCircle },
  tentative: { label: 'Unscheduled', className: 'av-event-tentative', Icon: Clock3 },
  completed: { label: 'Completed', className: 'av-event-completed', Icon: CheckCircle2 },
  occurrence: { label: 'Published session', className: 'av-event-occurrence', Icon: Users },
};
export type CalendarItem = {
  id: string;
  title: string;
  start: string;
  end: string;
  status: keyof typeof PRESENTATION;
  label: string;
  event?: Commitment;
  occurrence?: Occurrence;
  milestone?: boolean;
  resources: string[];
  ongoing?: boolean;
};
export type CalendarCallbacks = {
  onEvent: (e: Commitment) => void;
  onOccurrence: (o: Occurrence) => void;
  onSlot: (date: string, resourceId?: string) => void;
  onMove?: (event: Commitment, start: string, end: string, resourceId?: string) => void;
  editable: boolean;
};
export function calendarItems(s: Snapshot, _c: Context, view: View): CalendarItem[] {
  if (view.renderer === 'sessions')
    return s.occurrences.map((o) => {
      const usage = poolUsage(s, o.poolId, o.start, o.end);
      return {
        id: o.id,
        title: o.title,
        start: o.start,
        end: o.end,
        status: 'occurrence',
        label: usage.remaining + ' places remain · ' + usage.held + ' held',
        resources: o.resources,
        occurrence: o,
      };
    });
  const result: CalendarItem[] = [];
  for (const e of activeEvents(s).filter((e) => e.role !== 'Session anchor' || e.ownerScope)) {
    if (
      view.model === 'FREIGHT' &&
      result.some((i) => i.event?.workId === e.workId && i.start === e.start && i.end === e.end)
    ) {
      const target = result.find(
        (i) => i.event?.workId === e.workId && i.start === e.start && i.end === e.end,
      )!;
      target.label += ' · ' + e.quantity + ' ' + s.pools.find((p) => p.id === e.poolId)?.unit;
      continue;
    }
    const due = view.model === 'PRODUCTION_DUE' && e.status !== 'block' && e.status !== 'break';
    result.push({
      id: e.id,
      title: due
        ? 'Due · ' + e.title
        : e.role && view.model === 'LINKED_WINDOWS'
          ? e.role + ' · ' + e.title
          : e.title,
      start: due ? e.end : e.start,
      end: e.ongoing ? s.coverageEnd : e.end,
      status: e.status,
      label: due
        ? (e.quantity ?? 0) +
          ' ' +
          (s.pools.find((p) => p.id === e.poolId)?.unit ?? 'items') +
          ' due'
        : e.ongoing
          ? 'Actual return not recorded · Future unconfirmed'
          : e.poolId
            ? (e.quantity ?? 1) + ' ' + s.pools.find((p) => p.id === e.poolId)?.unit
            : (e.role ?? e.workId),
      resources: e.resources,
      event: e,
      milestone: due,
      ongoing: e.ongoing,
    });
  }
  return result;
}
export function CalendarChip({
  item,
  onSelect,
  editable = false,
}: {
  item: CalendarItem;
  onSelect: (item: CalendarItem) => void;
  editable?: boolean;
}) {
  const { Icon, className } = PRESENTATION[item.status];
  return (
    <button
      className={'av-calendar-chip ' + className}
      aria-label={
        (item.event?.workId ? item.event.workId + ' · ' : '') +
        item.title +
        ' · ' +
        prettyDate(item.start) +
        ' ' +
        localTime(item.start) +
        '–' +
        localTime(item.end) +
        ' · ' +
        PRESENTATION[item.status].label +
        ' · ' +
        item.label
      }
      title={
        item.title +
        ' · ' +
        prettyDate(item.start) +
        ' ' +
        localTime(item.start) +
        ' · ' +
        item.label
      }
      draggable={
        editable &&
        !!item.event &&
        !item.event.ownerScope &&
        item.event.role !== 'Session anchor' &&
        !item.ongoing &&
        ['confirmed', 'held', 'block', 'break'].includes(item.status)
      }
      onDragStart={(e) => {
        if (!item.event) return;
        e.dataTransfer.setData('application/x-nexg-event', item.event.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item);
      }}
    >
      <Icon size={13} aria-hidden="true" />
      <span>
        <strong>{item.title}</strong>
        <small>
          {item.milestone ? 'Due ' : ''}
          {localTime(item.start)}
          {item.milestone ? '' : '–' + localTime(item.end)} · {item.label}
        </small>
      </span>
    </button>
  );
}
export function CalendarLegend({
  sessions = false,
  statusList,
  showBuffer = false,
}: {
  sessions?: boolean;
  statusList?: (keyof typeof PRESENTATION)[];
  showBuffer?: boolean;
}) {
  const statuses: (keyof typeof PRESENTATION)[] =
    statusList ??
    (sessions
      ? ['occurrence', 'confirmed', 'held', 'block']
      : ['confirmed', 'held', 'block', 'break']);
  return (
    <div className="av-legend" aria-label="Calendar status legend">
      {statuses.map((status) => {
        const p = PRESENTATION[status];
        return (
          <span key={status}>
            <p.Icon size={12} aria-hidden="true" />
            <i className={'av-state-dot ' + p.className} />
            {p.label}
          </span>
        );
      })}
      {showBuffer && (
        <span>
          <i className="av-state-dot av-hatched" />
          Buffer
        </span>
      )}
      <span>
        <ShieldQuestion size={12} />
        Unknown is never free
      </span>
    </div>
  );
}
function selectItem(item: CalendarItem, actions: CalendarCallbacks) {
  if (item.occurrence) actions.onOccurrence(item.occurrence);
  else if (item.event) actions.onEvent(item.event);
}
function dropOnDate(
  e: React.DragEvent,
  date: string,
  s: Snapshot,
  actions: CalendarCallbacks,
  time?: string,
) {
  const id = e.dataTransfer.getData('application/x-nexg-event'),
    event = s.events.find((x) => x.id === id);
  if (!event || !actions.editable || !actions.onMove) return;
  const start = date + 'T' + (time ?? localTime(event.start)),
    end = addMinutes(start, (stamp(event.end) - stamp(event.start)) / 60000);
  actions.onMove(event, start, end);
}
export function MonthCalendar({
  s,
  c,
  view,
  date,
  search = '',
  resourceFilter = 'all',
  onDate,
  ...actions
}: {
  s: Snapshot;
  c: Context;
  view: View;
  date: string;
  search?: string;
  resourceFilter?: string;
  onDate: (d: string) => void;
} & CalendarCallbacks) {
  const month = date.slice(0, 7),
    first = month + '-01',
    start = monday(first),
    nextMonth = new Date(first + 'T12:00Z');
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const count =
    Math.ceil(
      (stamp(nextMonth.toISOString().slice(0, 10) + 'T00:00') - stamp(start + 'T00:00')) /
        86400000 /
        7,
    ) * 7;
  const items = useMemo(
    () =>
      calendarItems(s, c, view).filter(
        (i) =>
          (resourceFilter === 'all' || i.resources.includes(resourceFilter)) &&
          (i.title + ' ' + i.label + ' ' + (i.event?.workId ?? ''))
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [s, c, view, resourceFilter, search],
  );
  const hoursOnly = ['hours', 'coverage', 'access'].includes(view.renderer);
  return (
    <section className="av-card av-month-card">
      <div className="av-month-weekdays">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div
        className="av-month-grid"
        style={{ gridTemplateRows: 'repeat(' + count / 7 + ',minmax(0,1fr))' }}
      >
        {Array.from({ length: count }, (_, i) => {
          const d = dateAdd(start, i),
            today = d === localDate(s.now),
            matches = items.filter((item) =>
              item.milestone
                ? localDate(item.start) === d
                : overlaps(d + 'T00:00', dateAdd(d, 1) + 'T00:00', item.start, item.end),
            ),
            intervals = hoursOnly ? effectiveIntervals(s, d) : [];
          return (
            <section
              className={
                'av-month-day ' +
                (!d.startsWith(month) ? 'av-outside-month' : '') +
                (today ? 'av-today' : '')
              }
              key={d}
              onDragOver={(e) => {
                if (actions.editable) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropOnDate(e, d, s, actions);
              }}
              onDoubleClick={(e) => {
                if (e.target === e.currentTarget && actions.editable) actions.onSlot(d + 'T09:00');
              }}
            >
              <header>
                <button
                  className={today ? 'av-day-number av-day-today' : 'av-day-number'}
                  aria-label={'Open ' + prettyDate(d)}
                  onClick={() => onDate(d)}
                >
                  {Number(d.slice(-2))}
                </button>
                {actions.editable && (
                  <button
                    className="av-day-add"
                    aria-label={'Plan ' + prettyDate(d)}
                    onClick={() => (actions.editable ? actions.onSlot(d + 'T09:00') : onDate(d))}
                  >
                    <Plus size={13} />
                  </button>
                )}
              </header>
              {hoursOnly && (
                <button className="av-hours-chip" onClick={() => actions.onSlot(d + 'T09:00')}>
                  <DoorOpen size={12} />
                  {intervals.length
                    ? intervals.map((x) => x.start + '–' + x.end).join(' / ')
                    : 'Closed / not set'}
                </button>
              )}
              <div className="av-month-events">
                {matches.slice(0, 2).map((item) => (
                  <CalendarChip
                    key={item.id}
                    item={item}
                    onSelect={(item) => selectItem(item, actions)}
                    editable={actions.editable}
                  />
                ))}
                {matches.length > 2 && (
                  <button className="av-more-events" onClick={() => onDate(d)}>
                    +{matches.length - 2} more · Open day
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <CalendarLegend sessions={view.renderer === 'sessions'} />
    </section>
  );
}
/** Pack intersecting visible intervals into columns, including clipped multi-day spans. */
export function timeGridSegments(
  items: CalendarItem[],
  day: string,
  firstHour: number,
  lastHour: number,
) {
  const rangeStart = stamp(day + 'T00:00') + firstHour * 3600000;
  const rangeEnd = stamp(day + 'T00:00') + lastHour * 3600000;
  const segments = items
    .map((item) => ({
      item,
      start: Math.max(rangeStart, stamp(item.start)),
      end: Math.min(rangeEnd, item.milestone ? stamp(item.start) + 1800000 : stamp(item.end)),
      lane: 0,
      lanes: 1,
    }))
    .filter((x) => x.end > x.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let group: typeof segments = [],
    laneEnds: number[] = [],
    groupEnd = 0;
  const finish = () => {
    for (const segment of group) segment.lanes = laneEnds.length;
  };
  for (const segment of segments) {
    if (segment.start >= groupEnd) {
      finish();
      group = [];
      laneEnds = [];
    }
    let lane = laneEnds.findIndex((end) => end <= segment.start);
    if (lane < 0) lane = laneEnds.length;
    segment.lane = lane;
    laneEnds[lane] = segment.end;
    group.push(segment);
    groupEnd = Math.max(segment.end, ...laneEnds);
  }
  finish();
  return segments.map((segment) => ({
    ...segment,
    top: ((segment.start - rangeStart) / (rangeEnd - rangeStart)) * 100,
    height: ((segment.end - segment.start) / (rangeEnd - rangeStart)) * 100,
  }));
}
export function TimeWeekCalendar({
  s,
  c,
  view,
  date,
  resourceFilter = 'all',
  search = '',
  dayCount = 7,
  ...actions
}: {
  s: Snapshot;
  c: Context;
  view: View;
  date: string;
  resourceFilter?: string;
  search?: string;
  dayCount?: number;
} & CalendarCallbacks) {
  const week = dayCount === 1 ? date : monday(date);
  const items = useMemo(
    () =>
      calendarItems(s, c, view).filter(
        (i) =>
          (resourceFilter === 'all' || i.resources.includes(resourceFilter)) &&
          (i.title + ' ' + i.label + ' ' + (i.event?.workId ?? ''))
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [s, c, view, resourceFilter, search],
  );
  const days = Array.from({ length: dayCount }, (_, i) => dateAdd(week, i));
  let firstHour = 9,
    lastHour = 17;
  for (const d of days)
    for (const item of items) {
      const base = stamp(d + 'T00:00'),
        begin = stamp(item.start),
        end = item.milestone ? begin + 1800000 : stamp(item.end);
      if (begin < base + 86400000 && end > base) {
        firstHour = Math.min(firstHour, Math.max(0, Math.floor((begin - base) / 3600000)));
        lastHour = Math.max(lastHour, Math.min(24, Math.ceil((end - base) / 3600000)));
      }
    }
  const hourCount = lastHour - firstHour,
    hours = Array.from({ length: hourCount + 1 }, (_, i) => i + firstHour);
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
  const at = (d: string, minute: number) =>
    localInput(addMinutes(d + 'T00:00', firstHour * 60 + minute));
  return (
    <section className="av-card av-time-week">
      <div className="av-week-time-scroll">
        <div
          className="av-week-time-inner"
          style={{ minWidth: dayCount === 1 ? 420 : 880, minHeight: hourCount * 28 + 45 }}
        >
          <div
            className="av-week-time-header"
            style={{ gridTemplateColumns: '58px repeat(' + dayCount + ',minmax(0,1fr))' }}
          >
            <span>EAT</span>
            {days.map((d) => (
              <strong className={d === localDate(s.now) ? 'av-today' : ''} key={d}>
                {prettyDate(d)}
              </strong>
            ))}
          </div>
          <div
            className="av-week-hour-grid"
            style={{ gridTemplateColumns: '58px repeat(' + dayCount + ',minmax(0,1fr))' }}
          >
            <div className="av-time-axis">
              {hours.map((h) => (
                <span key={h} style={{ top: ((h - firstHour) / hourCount) * 100 + '%' }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {days.map((d) => (
              <div
                key={d}
                className="av-week-time-column"
                style={{ backgroundSize: '100% ' + 100 / hourCount + '%' }}
                onDragOver={(e) => {
                  if (actions.editable) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const minute = minuteAt(e.clientY, e.currentTarget.getBoundingClientRect());
                  dropOnDate(e, d, s, actions, localTime(at(d, minute)));
                }}
              >
                <button
                  type="button"
                  className="av-slot-hit"
                  disabled={!actions.editable}
                  aria-label={'Plan time on ' + prettyDate(d)}
                  onClick={(e) =>
                    actions.onSlot(
                      at(
                        d,
                        minuteAt(
                          e.clientY,
                          e.currentTarget.getBoundingClientRect(),
                          e.detail === 0,
                        ),
                      ),
                    )
                  }
                />
                {timeGridSegments(items, d, firstHour, lastHour).map(
                  ({ item, top, height, lane, lanes }) => (
                    <div
                      className="av-week-positioned"
                      key={item.id}
                      style={{
                        top: top + '%',
                        height: height + '%',
                        left: 'calc(' + (lane / lanes) * 100 + '% + 3px)',
                        width: 'calc(' + 100 / lanes + '% - 6px)',
                        right: 'auto',
                      }}
                    >
                      <CalendarChip
                        item={item}
                        onSelect={(item) => selectItem(item, actions)}
                        editable={actions.editable}
                      />
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <CalendarLegend sessions={view.renderer === 'sessions'} />
    </section>
  );
}
export function OccurrenceInspector({
  o,
  s,
  c,
  onEvent,
  onClose,
  onCapacity,
}: {
  o: Occurrence;
  s: Snapshot;
  c: Context;
  onEvent: (e: Commitment) => void;
  onClose: () => void;
  onCapacity: (id: string) => void;
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
  }, [o.id]);
  const pool = s.pools.find((p) => p.id === o.poolId),
    usage = poolUsage(s, o.poolId, o.start, o.end),
    events = activeEvents(s).filter(
      (e) => e.poolId === o.poolId && overlaps(o.start, o.end, e.start, e.end),
    );
  return (
    <aside className="av-inspector av-card" aria-label="Selected occurrence detail">
      <div className="av-card-heading">
        <h2 tabIndex={-1} ref={heading}>
          {o.title}
        </h2>
        <button className="av-icon" aria-label="Close occurrence detail" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="av-inspector-scroll">
        <span className="av-badge av-green">Published dated session</span>
        <dl className="av-details-list">
          <dt>
            <CalendarDays size={15} />
            Date
          </dt>
          <dd>{prettyDate(o.start)}</dd>
          <dt>
            <Clock3 size={15} />
            Time
          </dt>
          <dd>
            {localTime(o.start)}–{localTime(o.end)} EAT
          </dd>
          <dt>
            <MapPin size={15} />
            Location
          </dt>
          <dd>{c.location}</dd>
          <dt>
            <Users size={15} />
            Resources
          </dt>
          <dd>
            {o.resources.map((id) => s.resources.find((r) => r.id === id)?.name ?? id).join(' + ')}
          </dd>
        </dl>
        <div className="av-capacity">
          <span>
            <strong>{usage.total}</strong>Total {pool?.unit}
          </span>
          <span>
            <strong>{usage.reserved}</strong>Reserved
          </span>
          <span>
            <strong>{usage.held}</strong>Held
          </span>
          <span>
            <strong>{usage.remaining}</strong>Remaining
          </span>
        </div>

        <h3>Existing reservations</h3>
        {events.map((e) => (
          <button className="av-agenda-row" key={e.id} onClick={() => onEvent(e)}>
            <div>
              <strong>{e.workId}</strong>
              <span>
                {e.quantity} {pool?.unit} · {e.status}
              </span>
            </div>
          </button>
        ))}
        <p className="av-footnote">
          Participant bookings share this occurrence’s pool and resource anchor. Empty places do not
          free the instructor or room for unrelated work.
        </p>
      </div>
      <div className="av-inspector-actions">
        {' '}
        <button
          className="av-button"
          disabled={
            c.role !== 'manager' ||
            !['current', 'empty'].includes(c.scenario) ||
            c.offering.sources.availability === 'external'
          }
          onClick={() => onCapacity(o.poolId)}
        >
          Review capacity change
        </button>
        <a className="av-link" href={offeringHref(c)}>
          Offering and session definition
        </a>
      </div>
    </aside>
  );
}
export function ResourceIdentity({ name, kind }: { name: string; kind: string }) {
  const Icon = /bicycle|bike/i.test(name)
    ? Bike
    : /toyota|vehicle|car/i.test(name)
      ? CarFront
      : /asset|vehicle/i.test(kind)
        ? Truck
        : /room|space/i.test(kind)
          ? DoorOpen
          : /production/i.test(kind)
            ? Hammer
            : /team|driver|staff|provider|resource/i.test(kind)
              ? Users
              : Package;
  const [primary, ...secondary] = name.split(' · ');
  return (
    <span className="av-resource-identity" title={name}>
      <span className="av-resource-avatar">
        {/staff|provider|resource/i.test(kind) ? (
          name
            .split(' ')
            .map((x) => x[0])
            .slice(0, 2)
            .join('')
        ) : (
          <Icon size={16} />
        )}
      </span>
      <span>
        <strong>{primary}</strong>
        <small>{secondary.length ? secondary.join(' · ') : kind}</small>
      </span>
    </span>
  );
}

export function CalendarAgenda({
  s,
  c,
  view,
  date,
  allDates = false,
  ...actions
}: { s: Snapshot; c: Context; view: View; date: string; allDates?: boolean } & CalendarCallbacks) {
  const items = calendarItems(s, c, view)
    .filter(
      (i) =>
        allDates ||
        (i.milestone
          ? localDate(i.start) === date
          : overlaps(date + 'T00:00', dateAdd(date, 1) + 'T00:00', i.start, i.end)),
    )
    .sort((a, b) => stamp(a.start) - stamp(b.start));
  return (
    <section className="av-card av-calendar-agenda">
      <div className="av-card-heading">
        <h2>
          {view.model === 'PRODUCTION_DUE'
            ? 'Due schedule'
            : view.renderer === 'sessions'
              ? 'Published sessions'
              : 'Schedule agenda'}
        </h2>
      </div>
      {items.length ? (
        items.map((item) => (
          <article key={item.id}>
            <span>{prettyDate(item.start)}</span>
            <CalendarChip
              item={item}
              onSelect={(i) => selectItem(i, actions)}
              editable={actions.editable}
            />
          </article>
        ))
      ) : (
        <p className="av-footnote">
          No scheduled items in this view. Opening rules, source coverage and shared constraints
          still apply.
        </p>
      )}
    </section>
  );
}
