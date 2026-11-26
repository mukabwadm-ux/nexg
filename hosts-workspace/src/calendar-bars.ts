type DatedStay = { status: string; start: string; end: string };

/**
 * The stays a unit's calendar row draws, in painting order: a later bar covers an earlier one.
 *
 * A checked-out stay keeps its booked dates, but its nights from today on are free again. Its bar ends at
 * today at the latest (`drawnEnd`), and it is painted under every other bar, so a booking, hold or block on
 * its nights stays visible and can be opened. Drafts and cancelled stays aren't drawn.
 */
export function calendarBars<T extends DatedStay>(stays: readonly T[], today: string) {
  const departed = stays
    .filter((stay) => stay.status === 'Completed')
    .sort((a, b) => a.start.localeCompare(b.start));
  const others = stays.filter((stay) => !['Cancelled', 'Draft', 'Completed'].includes(stay.status));
  return [
    ...departed.map((stay) => ({ stay, drawnEnd: stay.end < today ? stay.end : today })),
    ...others.map((stay) => ({ stay, drawnEnd: stay.end })),
  ].filter((bar) => bar.drawnEnd > bar.stay.start);
}
