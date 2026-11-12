'use client';

import { Button, Card, Input, Select } from '@nexg/ui';
import * as React from 'react';

import { removeHoliday, saveHoliday } from '@/app/settings/actions';

import { useRun } from './controls';
import { DASH, Pill, Td, Th } from './shared';

/** One row of rpc_holiday_calendar. */
export interface HolidayAdminRow {
  holiday_id: string;
  date: string;
  label: string;
  scope: string;
  estimated: boolean;
  source: string;
  closed_count: number;
  open_count: number;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* `2026-12-12` to `Sat 12 Dec 2026`, by hand so the server and the browser
   print the same thing. */
function holidayDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTH[m - 1]} ${y}`;
}

function answers(h: HolidayAdminRow): string {
  if (h.closed_count + h.open_count === 0) return DASH;
  return `${h.closed_count} closed · ${h.open_count} open`;
}

/**
 * The public holidays a city's merchants answer open or closed: its
 * country's and its own, from today on.
 *
 * A date is corrected in place, so the merchants' answers follow it. That
 * is how an Eid estimate becomes the announced day without anybody being
 * asked again. The database decides who may write; `canEdit` only hides
 * the buttons from someone it would refuse.
 */
export function HolidayCalendar({
  cityId,
  cityName,
  country,
  holidays,
  canEdit,
  lockedBy,
}: {
  cityId: string;
  cityName: string;
  country: string;
  holidays: HolidayAdminRow[];
  canEdit: boolean;
  lockedBy: string;
}) {
  return (
    <>
      <Card className="overflow-x-auto p-0">
        {holidays.length === 0 ? (
          <p className="text-muted px-5 py-8 text-center text-[0.8125rem] font-semibold leading-[1.7]">
            No public holidays on the calendar from today on. Merchants in {cityName} have nothing
            to answer until some are added.
          </p>
        ) : (
          <table className="w-full min-w-[44rem] text-left text-[0.8125rem]">
            <thead className="bg-bg text-muted-light">
              <tr>
                <Th>Date</Th>
                <Th>Holiday</Th>
                <Th>Applies to</Th>
                <Th>Merchants</Th>
                {canEdit ? (
                  <Th>
                    <span className="sr-only">Change</span>
                  </Th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {holidays.map((h) => (
                <HolidayLine
                  key={h.holiday_id}
                  holiday={h}
                  place={h.scope === 'city' ? `${cityName} only` : country}
                  canEdit={canEdit}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {canEdit ? (
        <AddHoliday cityId={cityId} cityName={cityName} country={country} />
      ) : (
        <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">🔒 {lockedBy}</p>
      )}
    </>
  );
}

function HolidayLine({
  holiday,
  place,
  canEdit,
}: {
  holiday: HolidayAdminRow;
  place: string;
  canEdit: boolean;
}) {
  const { pending, run } = useRun();
  const [mode, setMode] = React.useState<'view' | 'edit' | 'remove'>('view');
  const [date, setDate] = React.useState(holiday.date);
  const [label, setLabel] = React.useState(holiday.label);
  const [estimated, setEstimated] = React.useState(holiday.estimated);
  const answered = holiday.closed_count + holiday.open_count;
  const id = holiday.holiday_id;

  /* An existing holiday keeps its scope, so only its id goes with the change. */
  const save = (next: { date: string; label: string; estimated: boolean }) =>
    run(() => saveHoliday({ holidayId: id, ...next }));

  if (mode === 'edit') {
    return (
      <tr className="bg-gold-soft/30">
        <Td>
          <Input
            id={`holiday-date-${id}`}
            label="Date"
            labelHidden
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Td>
        <Td>
          <Input
            id={`holiday-name-${id}`}
            label="Name"
            labelHidden
            value={label}
            maxLength={60}
            onChange={(e) => setLabel(e.target.value)}
          />
          <label className="mt-2 flex items-center gap-2 text-[0.75rem] font-semibold">
            <input
              type="checkbox"
              checked={estimated}
              onChange={(e) => setEstimated(e.target.checked)}
              className="accent-gold h-4 w-4"
            />
            Date is an estimate
          </label>
        </Td>
        <Td>
          <span className="text-muted text-[0.75rem] font-semibold">{place}</span>
        </Td>
        <Td>
          <span className="text-muted text-[0.75rem] font-semibold">{answers(holiday)}</span>
        </Td>
        <Td>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              loading={pending}
              disabled={pending}
              onClick={async () => {
                const r = await save({ date, label, estimated });
                if (r.ok) setMode('view');
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setDate(holiday.date);
                setLabel(holiday.label);
                setEstimated(holiday.estimated);
                setMode('view');
              }}
            >
              Cancel
            </Button>
          </div>
        </Td>
      </tr>
    );
  }

  return (
    <tr>
      <Td>
        <span className="font-extrabold tabular-nums">{holidayDay(holiday.date)}</span>
        {holiday.estimated ? (
          <span className="mt-1 block">
            <Pill tone="bg-warning-bg text-warning">ESTIMATE</Pill>
          </span>
        ) : null}
      </Td>
      <Td>
        <span className="font-bold">{holiday.label}</span>
      </Td>
      <Td>
        <span className="text-muted text-[0.75rem] font-semibold">{place}</span>
      </Td>
      <Td>
        <span className="text-muted text-[0.75rem] font-semibold tabular-nums">
          {answers(holiday)}
        </span>
      </Td>
      {canEdit ? (
        <Td>
          {mode === 'remove' ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-danger text-[0.75rem] font-semibold">
                {answered === 0
                  ? `Remove ${holiday.label}?`
                  : `Remove it? ${answered} merchant ${answered === 1 ? 'answer goes' : 'answers go'} with it.`}
              </span>
              <Button
                size="sm"
                variant="danger"
                loading={pending}
                disabled={pending}
                onClick={async () => {
                  const r = await run(() => removeHoliday(id));
                  if (!r.ok) setMode('view');
                }}
              >
                Remove
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMode('view')}>
                Keep
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              {holiday.estimated ? (
                <Button
                  size="sm"
                  variant="outline"
                  loading={pending}
                  disabled={pending}
                  onClick={() =>
                    save({ date: holiday.date, label: holiday.label, estimated: false })
                  }
                >
                  Confirm date
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMode('edit')}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setMode('remove')}
              >
                Remove
              </Button>
            </div>
          )}
        </Td>
      ) : null}
    </tr>
  );
}

function AddHoliday({
  cityId,
  cityName,
  country,
}: {
  cityId: string;
  cityName: string;
  country: string;
}) {
  const { pending, run } = useRun();
  const [date, setDate] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [scope, setScope] = React.useState('country');
  const [estimated, setEstimated] = React.useState(false);

  return (
    <Card className="mt-3 p-4">
      <p className="text-[0.8125rem] font-extrabold">Add a holiday</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_12rem]">
        <Input
          id={`holiday-new-date-${cityId}`}
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Input
          id={`holiday-new-name-${cityId}`}
          label="Name"
          value={label}
          maxLength={60}
          placeholder="Utamaduni Day"
          onChange={(e) => setLabel(e.target.value)}
        />
        <Select
          id={`holiday-new-scope-${cityId}`}
          label="Applies to"
          value={scope}
          onValueChange={setScope}
          options={[
            { value: 'country', label: `All of ${country}` },
            { value: 'city', label: `${cityName} only` },
          ]}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-[0.75rem] font-semibold">
          <input
            type="checkbox"
            checked={estimated}
            onChange={(e) => setEstimated(e.target.checked)}
            className="accent-gold h-4 w-4"
          />
          The date is an estimate (merchants see &ldquo;to be confirmed&rdquo;)
        </label>
        <Button
          size="sm"
          loading={pending}
          disabled={pending || date === '' || label.trim() === ''}
          onClick={async () => {
            const r = await run(() =>
              saveHoliday({ cityId, countryWide: scope === 'country', date, label, estimated }),
            );
            if (r.ok) {
              setDate('');
              setLabel('');
              setEstimated(false);
            }
          }}
        >
          Add holiday
        </Button>
      </div>
    </Card>
  );
}
