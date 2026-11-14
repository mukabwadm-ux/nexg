'use client';

import { CalendarPlus, Check } from 'lucide-react';
import * as React from 'react';

import { addOwnHoliday, setHolidayHours, setHolidayHoursMany } from '@/app/merchant/actions';
import {
  Actions,
  Drawer,
  Field,
  Grid,
  Said,
  Submit,
  Text,
  useAction,
} from '@/components/partner/form';

import { hhmm, holidayDate, type HolidayRow } from './hours-vocab';

/**
 * Open or closed on one public holiday, saved the moment it is chosen.
 *
 * The Hours board and the Availability workspace draw it differently and
 * share this. The answer shown is the one the database accepted: it changes
 * only when the save succeeds, so a refusal never leaves a wrong button lit.
 */
export function useHolidayAnswer(holiday: HolidayRow) {
  const [closed, setClosed] = React.useState<boolean | null>(holiday.closed);
  const { pending, outcome, run } = useAction();

  const choose = (next: boolean) => {
    if (pending || next === closed) return;
    run(
      () => setHolidayHours({ holidayId: holiday.holiday_id, closed: next }),
      (o) => {
        if (o.ok) setClosed(next);
      },
    );
  };

  return { closed, choose, pending, failed: outcome && !outcome.ok ? outcome : null };
}

type Mode = 'usual' | 'custom' | 'closed';

const MODES: { value: Mode; label: string }[] = [
  { value: 'usual', label: 'Usual hours' },
  { value: 'custom', label: 'Custom hours' },
  { value: 'closed', label: 'Closed' },
];

function modeOf(h: HolidayRow): Mode | null {
  if (h.closed === null) return null;
  if (h.closed) return 'closed';
  return h.opens && h.closes ? 'custom' : 'usual';
}

function answerFor(mode: Mode, opens: string, closes: string) {
  return mode === 'closed'
    ? { closed: true }
    : mode === 'custom'
      ? { closed: false, opens, closes }
      : { closed: false };
}

/**
 * The Hours board's holidays: each public holiday in the next twelve
 * months with its answer (usual hours, custom hours or closed), a way to
 * tick several and answer them together, and a way to add a day of the
 * merchant's own.
 */
export function HolidayList({
  holidays,
  branchId,
  branchName,
}: {
  holidays: HolidayRow[];
  branchId: string | null;
  branchName: string;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const allSelected = holidays.length > 0 && selected.size === holidays.length;

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <p className="text-muted max-w-xl text-[0.75rem] font-semibold leading-[1.65]">
          Choose usual hours, custom hours or closed for each holiday. Tick several to set them
          together. Until you answer, guests see your usual hours. Your answer covers every branch.
        </p>
        <AddOwnHoliday branchId={branchId} branchName={branchName} />
      </div>

      {holidays.length === 0 ? (
        <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
          No public holidays on the calendar for your city yet. You can still add your own.
        </p>
      ) : (
        <>
          {/* Tall enough for the "Set to" controls, so ticking a holiday
              does not push the list down under the pointer. */}
          <div className="border-border bg-bg flex min-h-[3.5rem] flex-wrap items-center gap-3 border-b px-4 py-2.5">
            <label className="flex cursor-pointer items-center gap-2 text-[0.75rem] font-extrabold">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(holidays.map((h) => h.holiday_id)))
                }
                className="accent-ink h-4 w-4"
              />
              {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
            </label>
            {selected.size > 0 ? (
              <BulkAnswer
                holidays={holidays.filter((h) => selected.has(h.holiday_id))}
                onDone={() => setSelected(new Set())}
              />
            ) : null}
          </div>
          <ul>
            {holidays.map((h) => (
              <HolidayItem
                /* A saved answer comes back from the server as new props;
                   the key starts the row afresh from them. */
                key={`${h.holiday_id}:${h.answered_at ?? 'new'}`}
                holiday={h}
                selected={selected.has(h.holiday_id)}
                onToggle={() => toggle(h.holiday_id)}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function ModeSwitch({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: Mode | null;
  disabled?: boolean;
  onChange: (mode: Mode) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="border-border-strong bg-bg flex items-center gap-0.5 rounded-lg border p-0.5"
    >
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          aria-pressed={value === m.value}
          disabled={disabled}
          onClick={() => onChange(m.value)}
          className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-50 ${
            value === m.value ? 'bg-ink text-white' : 'text-muted hover:text-ink'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function TimeRange({
  opens,
  closes,
  onOpens,
  onCloses,
  label,
}: {
  opens: string;
  closes: string;
  onOpens: (v: string) => void;
  onCloses: (v: string) => void;
  label: string;
}) {
  const input =
    'border-border-strong bg-surface focus-visible:ring-gold h-9 rounded-lg border px-2 text-[0.8125rem] font-bold focus-visible:outline-none focus-visible:ring-2';
  return (
    <div className="flex items-center gap-2">
      <input
        type="time"
        aria-label={`${label}: opens`}
        value={opens}
        onChange={(e) => onOpens(e.target.value)}
        className={input}
      />
      <span className="text-muted text-[0.75rem] font-bold">to</span>
      <input
        type="time"
        aria-label={`${label}: closes`}
        value={closes}
        onChange={(e) => onCloses(e.target.value)}
        className={input}
      />
    </div>
  );
}

function Status({ holiday }: { holiday: HolidayRow }) {
  const mode = modeOf(holiday);
  const [text, look] =
    mode === null
      ? ['Not answered', 'bg-warning-bg text-warning']
      : mode === 'closed'
        ? ['Closed', 'bg-danger-bg text-danger']
        : mode === 'custom'
          ? [`Open ${hhmm(holiday.opens!)}–${hhmm(holiday.closes!)}`, 'bg-success-bg text-success']
          : ['Usual hours', 'bg-success-bg text-success'];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${look}`}>
      {text}
    </span>
  );
}

function HolidayItem({
  holiday,
  selected,
  onToggle,
}: {
  holiday: HolidayRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const saved = modeOf(holiday);
  const [mode, setMode] = React.useState<Mode | null>(saved);
  const [opens, setOpens] = React.useState(hhmm(holiday.opens ?? null) || '10:00');
  const [closes, setCloses] = React.useState(hhmm(holiday.closes ?? null) || '16:00');
  const { pending, outcome, run } = useAction();
  const day = holidayDate(holiday.date);
  const editingCustom = mode === 'custom';
  const customChanged =
    saved !== 'custom' ||
    opens !== hhmm(holiday.opens ?? null) ||
    closes !== hhmm(holiday.closes ?? null);

  const save = (next: Mode) =>
    run(() =>
      setHolidayHours({ holidayId: holiday.holiday_id, ...answerFor(next, opens, closes) }),
    );

  const choose = (next: Mode) => {
    if (pending) return;
    setMode(next);
    /* Usual and closed save at once; custom waits for its times. */
    if (next !== 'custom' && next !== saved) save(next);
  };

  return (
    <li
      className={`border-border border-b px-4 py-3 last:border-0 ${selected ? 'bg-gold/[0.07]' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-w-0 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select ${holiday.label}`}
            className="accent-ink mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[0.8125rem] font-extrabold">{holiday.label}</span>
              <Status holiday={holiday} />
            </span>
            <span className="text-muted block text-[0.75rem] font-semibold">
              {day}
              {holiday.estimated ? ' · date to be confirmed' : ''}
            </span>
          </span>
        </label>
        <ModeSwitch
          label={`${holiday.label}, ${day}`}
          value={mode}
          disabled={pending}
          onChange={choose}
        />
      </div>

      {editingCustom ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 pl-7">
          <TimeRange
            label={holiday.label}
            opens={opens}
            closes={closes}
            onOpens={setOpens}
            onCloses={setCloses}
          />
          {customChanged ? (
            <button
              type="button"
              disabled={pending || !opens || !closes}
              onClick={() => save('custom')}
              className="bg-ink inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.75rem] font-extrabold text-white disabled:opacity-50"
            >
              <Check aria-hidden="true" className="h-3.5 w-3.5" />
              {pending ? 'Saving…' : 'Save hours'}
            </button>
          ) : null}
          {saved !== 'custom' ? (
            <button
              type="button"
              onClick={() => setMode(saved)}
              className="text-muted hover:text-ink text-[0.75rem] font-extrabold"
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}

      {outcome && !outcome.ok ? (
        <div className="mt-2 pl-7">
          <Said outcome={outcome} />
        </div>
      ) : null}
    </li>
  );
}

/** One answer for every ticked holiday. */
function BulkAnswer({ holidays, onDone }: { holidays: HolidayRow[]; onDone: () => void }) {
  const [mode, setMode] = React.useState<Mode | null>(null);
  const [opens, setOpens] = React.useState('10:00');
  const [closes, setCloses] = React.useState('16:00');
  const { pending, outcome, run } = useAction();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted text-[0.75rem] font-bold">Set to</span>
      <ModeSwitch
        label="Answer for the selected holidays"
        value={mode}
        disabled={pending}
        onChange={setMode}
      />
      {mode === 'custom' ? (
        <TimeRange
          label="Selected holidays"
          opens={opens}
          closes={closes}
          onOpens={setOpens}
          onCloses={setCloses}
        />
      ) : null}
      <button
        type="button"
        disabled={!mode || pending}
        onClick={() =>
          mode &&
          run(
            () =>
              setHolidayHoursMany({
                holidays: holidays.map((h) => ({ id: h.holiday_id, label: h.label })),
                ...answerFor(mode, opens, closes),
              }),
            (o) => {
              if (o.ok) onDone();
            },
          )
        }
        className="bg-ink h-9 rounded-lg px-3 text-[0.75rem] font-extrabold text-white disabled:opacity-40"
      >
        {pending ? 'Saving…' : `Apply to ${holidays.length}`}
      </button>
      {outcome && !outcome.ok ? (
        <div className="basis-full">
          <Said outcome={outcome} />
        </div>
      ) : null}
    </div>
  );
}

/** A day of the merchant's own: closed, or open with its own hours. */
function AddOwnHoliday({ branchId, branchName }: { branchId: string | null; branchName: string }) {
  const [open, setOpen] = React.useState(false);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const [date, setDate] = React.useState('');
  const [name, setName] = React.useState('');
  const [closed, setClosed] = React.useState(true);
  const [opens, setOpens] = React.useState('10:00');
  const [closes, setCloses] = React.useState('16:00');
  const { pending, outcome, run, reset } = useAction();

  const close = () => {
    setOpen(false);
    reset();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border-strong hover:border-ink inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[0.8125rem] font-extrabold"
      >
        <CalendarPlus aria-hidden="true" className="h-4 w-4" />
        Add your own holiday
      </button>

      <Drawer
        open={open}
        onClose={close}
        title="Add your own holiday"
        lead={`A day you close or keep different hours, such as a staff party or a family event. It applies to ${
          branchId ? branchName : 'every branch'
        } and shows under Date overrides, where you can remove it.`}
      >
        <div className="space-y-4">
          <Grid>
            <Field label="Date">
              <Text
                type="date"
                min={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Name" hint="For you and NexG; guests only see open or closed.">
              <Text
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder="Staff party"
              />
            </Field>
          </Grid>

          <fieldset className="space-y-2">
            <legend className="text-[0.8125rem] font-extrabold">That day you are</legend>
            <div className="border-border-strong bg-bg inline-flex items-center gap-0.5 rounded-lg border p-0.5">
              {[
                { value: true, label: 'Closed' },
                { value: false, label: 'Open, custom hours' },
              ].map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={closed === o.value}
                  onClick={() => setClosed(o.value)}
                  className={`rounded-md px-3 py-1.5 text-[0.75rem] font-extrabold ${
                    closed === o.value ? 'bg-ink text-white' : 'text-muted hover:text-ink'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {!closed ? (
              <div className="pt-1">
                <TimeRange
                  label="Your holiday"
                  opens={opens}
                  closes={closes}
                  onOpens={setOpens}
                  onCloses={setCloses}
                />
              </div>
            ) : null}
          </fieldset>

          <Said outcome={outcome} />

          <Actions>
            <Submit
              type="button"
              pending={pending}
              onClick={() =>
                run(
                  () =>
                    addOwnHoliday({
                      date,
                      name,
                      closed,
                      opens: closed ? null : opens,
                      closes: closed ? null : closes,
                      branchId,
                    }),
                  (o) => {
                    if (o.ok) {
                      setDate('');
                      setName('');
                      setOpen(false);
                    }
                  },
                )
              }
            >
              Save holiday
            </Submit>
            <Submit type="button" tone="quiet" onClick={close}>
              Cancel
            </Submit>
          </Actions>
        </div>
      </Drawer>
    </>
  );
}
