'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';
import { BookingsBoard } from '../bookings-board';
import type { BookingBoardData } from '@/lib/booking/board-data';
import { dateAdd, localDate, type DayHours } from './model';
import { HoursView } from './views';
import { SetupHours } from './setup-hours';
import styles from './workspace.module.css';

const BookingWorkspace = dynamic(() =>
  import('../booking/workspace').then((module) => module.MerchantBookingWorkspace),
);

export function LiveAvailability({
  hours,
  dateHours,
  now,
  activities,
  canEdit,
  hoursMessage,
  legacyHoursHref,
  initialBookingId,
  board,
}: {
  hours: DayHours[] | null;
  dateHours: Record<string, DayHours>;
  now: string;
  activities: { id: string; name: string }[];
  canEdit: boolean;
  hoursMessage?: string;
  legacyHoursHref?: string;
  initialBookingId?: string;
  /** The main-database bookings board, used while the booking engine is not hosted. */
  board?: BookingBoardData;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'hours' | 'bookings'>(initialBookingId ? 'bookings' : 'hours');
  const [date, setDate] = useState(() => localDate(now));
  const [editing, setEditing] = useState(false);
  return (
    <div className={styles.root}>
      <div className="av-workspace" data-availability-workspace>
        <header className="av-page-heading">
          <div>
            <h1>Availability</h1>
            <p>Manage your opening hours, resources and scheduled work.</p>
          </div>
        </header>
        <div className="av-tabs" aria-label="Availability view">
          <button type="button" aria-pressed={tab === 'hours'} onClick={() => setTab('hours')}>
            <Clock3 size={16} /> Opening hours
          </button>
          <button
            type="button"
            aria-pressed={tab === 'bookings'}
            onClick={() => setTab('bookings')}
          >
            <CalendarDays size={16} /> Resources and bookings
          </button>
        </div>
        {tab === 'bookings' ? (
          board ? (
            <div className="av-card">
              <BookingsBoard {...board} />
            </div>
          ) : (
            <BookingWorkspace initialBookingId={initialBookingId} />
          )
        ) : hours ? (
          <>
            <div className="av-date-toolbar">
              <button className="av-button" onClick={() => setDate(dateAdd(date, -7))}>
                Previous week
              </button>
              <button className="av-button" onClick={() => setDate(localDate(now))}>
                This week
              </button>
              <button className="av-button" onClick={() => setDate(dateAdd(date, 7))}>
                Next week
              </button>
            </div>
            <HoursView
              s={{ hours, dateHours, now, events: [] }}
              date={date}
              onEdit={canEdit ? () => setEditing(true) : undefined}
              onSelect={() => {}}
            />
          </>
        ) : (
          <section className="av-card">
            <h2>Opening hours</h2>
            <p role="status">{hoursMessage}</p>
            {legacyHoursHref && (
              <Link href={legacyHoursHref} className="av-link">
                Open existing hours
              </Link>
            )}
          </section>
        )}
      </div>
      {editing && (
        <SetupHours
          open
          activities={activities}
          onClose={() => setEditing(false)}
          onSaved={() => router.refresh()}
          onUnavailable={legacyHoursHref ? () => router.push(legacyHoursHref) : undefined}
        />
      )}
    </div>
  );
}
