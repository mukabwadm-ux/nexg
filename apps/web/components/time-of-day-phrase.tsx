'use client';

import * as React from 'react';

import { TIME_OF_DAY_PHRASE, timeOfDay, type TimeOfDay } from '@/lib/time-of-day';

/**
 * "this morning" / "this afternoon" / "this evening" / "tonight", from the
 * visitor's own device clock.
 *
 * The server renders `initial` (worked out for Nairobi, where most visitors
 * are), so the page never flashes an empty word; once in the browser it
 * switches to the device's local time and keeps up if the page stays open
 * across a boundary (checked every minute).
 */
export function TimeOfDayPhrase({ initial }: { initial: TimeOfDay }) {
  const [part, setPart] = React.useState<TimeOfDay>(initial);
  React.useEffect(() => {
    const update = () => setPart(timeOfDay(new Date().getHours()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <span suppressHydrationWarning>{TIME_OF_DAY_PHRASE[part]}</span>;
}
