import type { BookingEngine } from './engine.js';
import { BookingError, type Identity } from './types.js';
import { projectStayActivity } from './stay-activity.js';
import { stayHoldView } from './stays.js';
import { assertStayPilotEnvironment } from './stay-pilot.js';

/** One signed tenant scope, not a global account catalogue. No fallback or writes. */
export async function readStayActivityList(
  engine: BookingEngine,
  identity: Identity,
  transaction: { request: any; coherentSnapshot: true },
) {
  assertStayPilotEnvironment();
  if (identity.role !== 'customer' || !identity.userId || !identity.businessId)
    throw new BookingError(403, 'A signed customer account is required.', 'forbidden');
  if (transaction?.coherentSnapshot !== true || transaction.request?.transactionID == null)
    throw new BookingError(503, 'A coherent snapshot is required.', 'stay_snapshot_required');
  const c = engine.managementContext();
  // Rebuild scope rather than accepting the caller's request context.
  const req = c.request(identity, transaction.request.transactionID);
  const result = await req.payload.find({
    collection: 'reservations',
    where: {
      and: [{ businessId: { equals: identity.businessId } }, { status: { equals: 'confirmed' } }],
    },
    limit: 1001,
    page: 1,
    depth: 0,
    overrideAccess: false,
    req,
  });
  if (result.hasNextPage || result.docs.length > 1000)
    throw new BookingError(503, 'Stay activity scope is too large.', 'stay_activity_scope_limit');
  const items: ReturnType<typeof projectStayActivity>[] = [];
  const seen = new Set<string>();
  const now = c.now();
  for (const row of result.docs) {
    if (
      row.businessId !== identity.businessId ||
      row.status !== 'confirmed' ||
      row.nexg?.createdBy !== identity.userId ||
      row.nexg?.model !== 'ASSET_INTERVAL' ||
      row.nexg?.stayHold?.contractVersion !== 1
    )
      continue;
    try {
      const item = projectStayActivity(identity, {
        businessId: row.businessId,
        createdBy: row.nexg.createdBy,
        hold: stayHoldView(row, now),
      });
      if (seen.has(item.bookingId))
        throw new BookingError(503, 'Duplicate Stay identity.', 'stay_activity_identity_conflict');
      seen.add(item.bookingId);
      items.push(item);
    } catch (error) {
      // Unpaid/reconciliation or malformed records are not confirmed Activity.
      // Never swallow storage or other unexpected failures as an empty feed.
      if (!(error instanceof BookingError) || error.code !== 'stay_activity_unavailable')
        throw error;
    }
  }
  items.sort(
    (a, b) => b.startTime.localeCompare(a.startTime) || a.bookingId.localeCompare(b.bookingId),
  );
  return {
    source: 'nexg-booking-engine' as const,
    scope: 'tenant' as const,
    businessId: identity.businessId,
    complete: true as const,
    items,
  };
}
