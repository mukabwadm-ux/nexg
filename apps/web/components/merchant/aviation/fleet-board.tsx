'use client';

import { DetailRow } from '@nexg/ui';
import { Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

import { browserUuid } from '@/lib/browser-uuid';
import { Field, Modal } from '../availability/forms';
import { localDate, localTime, type Commitment } from '../availability/model';
import {
  Agenda,
  AvailabilityHeading,
  DateToolbar,
  TimelineView,
  type ResourceSchedule,
} from '../availability/views';
import styles from '../availability/workspace.module.css';
import {
  AIRCRAFT_DAY_END,
  AIRCRAFT_DAY_START,
  availabilityConflict,
  DEMO_DATE,
  fleet,
  flightDateLabel,
  flightEnd,
  minutesTime,
  routeLabel,
  timeMinutes,
  type AviationState,
  type FleetBlock,
} from './model';

const sampleNow = `${DEMO_DATE}T09:40`;
const dayHours = { start: AIRCRAFT_DAY_START, end: AIRCRAFT_DAY_END };
const earliest = minutesTime(AIRCRAFT_DAY_START * 60);
const latest = minutesTime(AIRCRAFT_DAY_END * 60);
const aircraftResources: ResourceSchedule['resources'] = fleet.map((aircraft) => ({
  id: aircraft.id,
  name: `${aircraft.model} · ${aircraft.registration} · ${aircraft.seats} seats`,
  kind: 'Aircraft',
  state: 'current',
}));
type BlockDraft = Omit<FleetBlock, 'id' | 'flightId'>;

function toResourceSchedule(state: AviationState): ResourceSchedule {
  return {
    resources: aircraftResources,
    now: sampleNow,
    coverageEnd: `${DEMO_DATE}T${latest}`,
    events: [
      ...state.flights
        .filter((flight) => flight.stage === 'confirmed')
        .map(
          (flight): Commitment => ({
            id: flight.id,
            workId: flight.id,
            title: routeLabel(flight),
            customer: flight.quote.customer,
            start: `${flight.quote.date}T${flight.quote.time}`,
            end: `${flight.quote.date}T${flightEnd(flight)}`,
            resources: [flight.quote.aircraftId],
            status: 'confirmed',
            role: 'Confirmed flight',
          }),
        ),
      ...state.blocks.map(
        (block): Commitment => ({
          id: block.id,
          workId: block.flightId ?? 'Fleet',
          title: block.label,
          customer: '',
          start: `${block.date}T${block.start}`,
          end: `${block.date}T${block.end}`,
          resources: [block.aircraftId],
          status: block.kind === 'hold' ? 'held' : 'block',
          role: block.kind === 'hold' ? 'Aircraft hold' : 'Maintenance block',
        }),
      ),
    ],
  };
}

export function AviationFleetBoard({
  state,
  onChange,
  onOpenFlight,
}: {
  state: AviationState;
  onChange: (next: AviationState) => void;
  onOpenFlight: (id: string) => void;
}) {
  const [date, setDate] = useState(DEMO_DATE);
  const [mode, setMode] = useState('day');
  const requestedResource = useSearchParams().get('resource');
  const [resource, setResource] = useState(
    () => aircraftResources.find((item) => item.id === requestedResource)?.id ?? 'all',
  );
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const schedule = useMemo(() => toResourceSchedule(state), [state]);
  const dayEvents = schedule.events.filter((event) => localDate(event.start) === date);
  const timeline = {
    ...schedule,
    events: dayEvents.filter((event) =>
      `${event.workId} ${event.title} ${event.customer} ${event.role} ${aircraftResources.find((item) => item.id === event.resources[0])?.name ?? ''}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    ),
  };
  const event = schedule.events.find((item) => item.id === selection);
  const block = state.blocks.find((item) => item.id === selection);
  const flightId = event?.status === 'confirmed' ? event.workId : block?.flightId;

  function openBlock(start?: string, aircraftId?: string) {
    const departure = start ? localTime(start) : '09:00';
    setDraft({
      aircraftId: aircraftId ?? (resource === 'all' ? fleet[0].id : resource),
      date: start ? localDate(start) : date,
      start: departure,
      end: minutesTime(Math.min(AIRCRAFT_DAY_END * 60, timeMinutes(departure) + 60)),
      kind: 'hold',
      label: '',
    });
    setError('');
  }

  function addBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.label.trim()) {
      setError('Give this hold or maintenance block a label.');
      return;
    }
    const start = timeMinutes(draft.start);
    const end = timeMinutes(draft.end);
    if (
      !draft.date ||
      !/^\d{2}:\d{2}$/.test(draft.start) ||
      !/^\d{2}:\d{2}$/.test(draft.end) ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < AIRCRAFT_DAY_START * 60 ||
      end > AIRCRAFT_DAY_END * 60 ||
      end <= start
    ) {
      setError('Choose a valid interval within 07:00–19:00 EAT.');
      return;
    }
    const conflict = availabilityConflict(
      state,
      draft.aircraftId,
      draft.date,
      draft.start,
      draft.end,
    );
    if (conflict) {
      setError(
        `This aircraft is already allocated to ${conflict}. Choose another aircraft or time.`,
      );
      return;
    }
    onChange({
      ...state,
      blocks: [
        ...state.blocks,
        { ...draft, id: `block-${browserUuid()}`, label: draft.label.trim() },
      ],
    });
    setDate(draft.date);
    if (resource !== 'all') setResource(draft.aircraftId);
    setSearch('');
    setDraft(null);
    setNotice(
      draft.kind === 'hold'
        ? 'Aircraft hold added to the sample schedule.'
        : 'Maintenance block added to the sample schedule.',
    );
  }

  function releaseBlock(current: FleetBlock) {
    onChange({ ...state, blocks: state.blocks.filter((item) => item.id !== current.id) });
    setSelection(null);
    setNotice(
      current.kind === 'hold'
        ? 'Sample aircraft hold released.'
        : 'Sample maintenance block released.',
    );
  }

  return (
    <div className={styles.root}>
      <main className="av-workspace" data-availability-workspace data-profile="flights_aviation">
        <AvailabilityHeading
          description="Manage aircraft schedules, holds and maintenance."
          scope="Wilson Airport · East Africa Time"
          actions={
            <button type="button" className="av-button av-primary" onClick={() => openBlock()}>
              <Plus size={16} aria-hidden="true" /> Add time block
            </button>
          }
        />
        <p className="av-footnote">
          {flightDateLabel(date)} · {dayEvents.filter((item) => item.status === 'confirmed').length}{' '}
          confirmed · {dayEvents.filter((item) => item.status === 'held').length} holds ·{' '}
          {dayEvents.filter((item) => item.status === 'block').length} maintenance blocks
        </p>
        {notice && (
          <p className="av-notice" role="status">
            {notice}
          </p>
        )}
        <DateToolbar
          date={date}
          mode={mode}
          modes={['day', 'list']}
          listDays={1}
          setDate={setDate}
          setMode={setMode}
          now={sampleNow}
          resources={aircraftResources}
          resourceFilter={resource}
          setResourceFilter={setResource}
          search={search}
          setSearch={setSearch}
        />
        {mode === 'list' ? (
          <Agenda
            s={schedule}
            date={date}
            resourceFilter={resource}
            search={search.trim()}
            onSelect={(item) => setSelection(item.id)}
          />
        ) : (
          <TimelineView
            s={timeline}
            date={date}
            dayCount={1}
            dayHours={dayHours}
            resourceLabel="Aircraft · EAT"
            resourceFilter={resource}
            onSelect={(item) => setSelection(item.id)}
            onSlot={openBlock}
            editable
            footnote="Sample allocations include positioning and a 30 minute turnaround buffer. The operator reviews flight availability."
          />
        )}
      </main>
      {draft && (
        <Modal
          title="Add time block"
          description="Hold an aircraft or record maintenance in the sample schedule."
          onClose={() => setDraft(null)}
          side
          footer={
            <>
              <button type="button" className="av-button" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="submit" form="heliflight-block" className="av-button av-primary">
                Add to schedule
              </button>
            </>
          }
        >
          <form id="heliflight-block" className="av-form" onSubmit={addBlock}>
            <Field label="Label">
              <input
                value={draft.label}
                maxLength={80}
                required
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </Field>
            <Field label="Aircraft">
              <select
                value={draft.aircraftId}
                onChange={(e) => setDraft({ ...draft, aircraftId: e.target.value })}
              >
                {aircraftResources.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Allocation type">
              <select
                value={draft.kind}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    kind: e.target.value === 'maintenance' ? 'maintenance' : 'hold',
                  })
                }
              >
                <option value="hold">Aircraft hold</option>
                <option value="maintenance">Maintenance block</option>
              </select>
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={draft.date}
                required
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </Field>
            <Field label="Start · EAT">
              <input
                type="time"
                value={draft.start}
                min={earliest}
                max={latest}
                required
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              />
            </Field>
            <Field label="End · EAT">
              <input
                type="time"
                value={draft.end}
                min={earliest}
                max={latest}
                required
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              />
            </Field>
            {error && (
              <p className="av-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </Modal>
      )}
      {event && (
        <Modal
          title={event.title}
          description={`${event.role} · Sample schedule`}
          onClose={() => setSelection(null)}
          side
          footer={
            <>
              {block && (
                <button type="button" className="av-button" onClick={() => releaseBlock(block)}>
                  Release {block.kind === 'hold' ? 'hold' : 'block'}
                </button>
              )}
              {flightId && (
                <button
                  type="button"
                  className="av-button av-primary"
                  onClick={() => onOpenFlight(flightId)}
                >
                  Open flight
                </button>
              )}
            </>
          }
        >
          <dl>
            <DetailRow label="Aircraft">
              {aircraftResources.find((item) => item.id === event.resources[0])?.name}
            </DetailRow>
            <DetailRow label="Date">{flightDateLabel(localDate(event.start))}</DetailRow>
            <DetailRow label="Time">
              {localTime(event.start)}–{localTime(event.end)} EAT
            </DetailRow>
            {event.customer && <DetailRow label="Guest">{event.customer}</DetailRow>}
          </dl>
        </Modal>
      )}
    </div>
  );
}
