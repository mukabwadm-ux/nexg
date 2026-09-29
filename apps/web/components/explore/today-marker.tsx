'use client';

import * as React from 'react';

/**
 * Marks today's row in the opening hours, after mount.
 *
 * The server cannot do it: the page is cached for an hour, so whichever day
 * it was rendered on is wrong for most readers and disagrees with their
 * browser — a hydration mismatch on every visit. This runs only in the
 * browser, which is the only place that knows what day it is for the person
 * reading.
 */
export function TodayMarker() {
  const ref = React.useRef<HTMLLIElement>(null);

  React.useEffect(() => {
    const list = ref.current?.parentElement;
    if (!list) return;
    const today = String(new Date().getDay());
    for (const row of list.querySelectorAll<HTMLElement>('[data-day]')) {
      if (row.dataset['day'] === today) row.setAttribute('data-today', '');
      else row.removeAttribute('data-today');
    }
  }, []);

  return <li ref={ref} hidden />;
}
