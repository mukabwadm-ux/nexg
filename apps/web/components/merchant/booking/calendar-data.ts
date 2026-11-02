import { humanize } from './format';
import type { BookingRecord } from './types';

/** A work promise is not a continuous capacity reservation. Keep specialist
 * calendar entries tied to the actual committed role windows. */
export function bookingCalendarSegments(booking: BookingRecord): BookingRecord[] {
  if (!booking.specialist) return booking.executionMode === 'native_workflow' ? [] : [booking];
  if (booking.status === 'cancelled' || booking.status === 'expired') return [];
  return booking.specialist.allocations
    .filter((allocation) => !['cancelled', 'expired'].includes(allocation.status ?? ''))
    .map((allocation) => ({
      ...booking,
      startTime: allocation.startTime,
      endTime: allocation.endTime,
      resourceIds: allocation.resourceIds,
      offeringName: `${booking.offeringName} · ${humanize(allocation.role)}`,
      calendarSegmentId: allocation.id,
    }));
}
