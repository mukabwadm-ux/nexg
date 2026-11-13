'use client';

import { useMemo } from 'react';
import { advanceMerchantBooking, loadMerchantWork } from '@/app/merchant/work/actions';
import { bookingRequest, isBookingNotInitialized } from '../booking/api';
import { kenyaDateLabel, kenyaTime, STATUS_LABELS } from '../booking/format';
import type { BookingWorkspaceData } from '../booking/types';
import type { WorkRecord, WorkSource } from './model';
import { WorkWorkspace } from './workspace';

async function loadScheduledWork(): Promise<WorkRecord[]> {
  let workspace: BookingWorkspaceData;
  try {
    workspace = await bookingRequest<BookingWorkspaceData>('/workspace');
  } catch (error) {
    /* A business whose booking setup has not been started has no scheduled
       work yet. That is an empty list, not an error to retry. */
    if (isBookingNotInitialized(error)) return [];
    throw error;
  }
  const resourceNames = new Map(
    workspace.resources.map((resource) => [resource.id, resource.name]),
  );
  return workspace.bookings.map((booking) => {
    const statusLabel = STATUS_LABELS[booking.status] ?? booking.status;
    const done = ['completed', 'cancelled', 'expired'].includes(booking.status);
    const resources = booking.resourceIds.flatMap((id) => {
      const name = resourceNames.get(id);
      return name ? [name] : [];
    });
    return {
      id: booking.id,
      workflowId: 'WF_SCHEDULED_WORK',
      customer: booking.customer.name,
      item: booking.offeringName,
      context: resources.join(', ') || 'No resource assigned',
      milestone: booking.startTime
        ? `${kenyaDateLabel(booking.startTime)} · ${kenyaTime(booking.startTime)}`
        : 'No start time',
      operator: resources[0] ?? 'Unassigned',
      stage: done
        ? 3
        : booking.status === 'in_progress'
          ? 2
          : ['confirmed', 'accepted'].includes(booking.status)
            ? 1
            : 0,
      statusLabel,
      attention: booking.status === 'pending' || Boolean(booking.occupancyOverdue),
      upcoming: !done && booking.startTime !== null && Date.parse(booking.startTime) > Date.now(),
      confirmation: statusLabel,
      sourceLabel: 'Booking calendar',
      history: [],
      manageHref: `/merchant/availability?booking=${encodeURIComponent(booking.id)}`,
    };
  });
}

export function LiveWorkWorkspace({
  bookingId,
  initialWorkflow,
}: {
  bookingId?: string;
  initialWorkflow: 'WF_ORDER' | 'WF_SCHEDULED_WORK';
}) {
  const source = useMemo<WorkSource>(
    () => ({
      async list(workflow) {
        if (workflow === 'WF_SCHEDULED_WORK') return loadScheduledWork();
        if (workflow !== 'WF_ORDER' && workflow !== 'WF_BOOKING') return [];
        const result = await loadMerchantWork(workflow, bookingId);
        if (!result.ok) throw new Error(result.message);
        return result.records;
      },
      async advance(record, actionId) {
        if (record.workflowId !== 'WF_BOOKING') throw new Error('No action is available.');
        const result = await advanceMerchantBooking(record.id, actionId);
        if (!result.ok) throw new Error(result.message);
        return result.record;
      },
    }),
    [bookingId],
  );
  return (
    <WorkWorkspace
      key={bookingId ?? 'work'}
      source={source}
      preview={false}
      initialWorkId={bookingId}
      initialWorkflow={bookingId ? 'WF_BOOKING' : initialWorkflow}
    />
  );
}
