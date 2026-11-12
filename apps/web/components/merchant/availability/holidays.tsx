'use client';

import { useHolidayAnswer } from '../holiday-hours';
import { holidayDate, type HolidayRow } from '../hours-vocab';

/**
 * Public holidays in the Availability workspace: each one in the next
 * twelve months, answered open or closed. Read-only for anyone who cannot
 * edit the hours here.
 */
export function HolidaysCard({ holidays, canEdit }: { holidays: HolidayRow[]; canEdit: boolean }) {
  return (
    <section className="av-card mt-4" aria-labelledby="av-holidays-title">
      <div className="av-card-heading">
        <h2 id="av-holidays-title">Public holidays</h2>
      </div>
      {holidays.length === 0 ? (
        <p role="status" className="px-4 pb-4 text-sm">
          No public holidays on the calendar for your city yet.
        </p>
      ) : (
        <>
          <div className="px-4">
            <p className="av-scope-note">
              The next twelve months. Your answer covers every branch. Until you answer, guests see
              your usual hours for that day.
            </p>
          </div>
          <div className="av-table-wrap">
            <table className="av-hours">
              <thead>
                <tr>
                  <th>Holiday</th>
                  <th>Open or closed</th>
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => (
                  <HolidayLine key={h.holiday_id} holiday={h} canEdit={canEdit} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function HolidayLine({ holiday, canEdit }: { holiday: HolidayRow; canEdit: boolean }) {
  const { closed, choose, pending, failed } = useHolidayAnswer(holiday);
  const day = holidayDate(holiday.date);
  const answer = closed === null ? 'Not answered' : closed ? 'Closed' : 'Open';

  return (
    <tr>
      <th scope="row">
        {holiday.label}
        <small>
          {day}
          {holiday.estimated ? ' · date to be confirmed' : ''}
        </small>
      </th>
      <td>
        {canEdit ? (
          <>
            <div className="av-segment w-fit" role="group" aria-label={`${holiday.label}, ${day}`}>
              <button
                type="button"
                aria-pressed={closed === false}
                disabled={pending}
                onClick={() => choose(false)}
              >
                Open
              </button>
              <button
                type="button"
                aria-pressed={closed === true}
                disabled={pending}
                onClick={() => choose(true)}
              >
                Closed
              </button>
            </div>
            {closed === null ? <small>Not answered</small> : null}
          </>
        ) : (
          <span className={`av-badge ${closed === null ? 'av-amber' : closed ? '' : 'av-green'}`}>
            {answer}
          </span>
        )}
        {failed?.message ? (
          <p className="av-error" role="status">
            {failed.message}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
