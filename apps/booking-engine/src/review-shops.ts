/**
 * Review shops (App Store and Google Play review, owner 28 Nov 2026).
 *
 * The review shops are NexG's own test businesses: their ids are fixed and
 * all start with `ae7e` (scripts/review-merchants). Nobody works their
 * merchant portal, so after a reviewer pays, the engine plays the business:
 * it runs the same workflow commands a business would (accept, confirm), up
 * to the point a real customer would next hear from a person, and then shows
 * the details the customer would otherwise wait for (driver, vehicle, plate,
 * pickup point and time, reference).
 *
 * Every step is recorded on the booking as `reviewAutopilot` (internal: never
 * shown to the customer as such), and the details shown are pretend: made up
 * from the booking itself, never a real person. No other business is touched.
 */

/** Only NexG's own review shops: fixed ids with this prefix. */
export function isReviewBusiness(businessId: string | undefined) {
  return typeof businessId === 'string' && /^ae7e[0-9a-f]{4}-/i.test(businessId);
}

type Doc = Record<string, any>;
export type ReviewStep = { action: string; input: Doc; label: string };

const ready = new Set([
  'READY_TO_DEPART',
  'COLLECTION_CONFIRMED',
  'DROPOFF_EXPECTED',
  'WORK_SCHEDULED',
  'ACTIVE',
  'PRODUCTION_COMMITTED',
  'BOOKED',
]);

/**
 * The next command a business would send for this booking, or null when it
 * has gone as far as it can before the customer turns up. `view` is the
 * merchant's booking view.
 */
export function nextReviewStep(view: Doc, now: number): ReviewStep | null {
  const status = view.status;
  if (['cancelled', 'completed', 'expired', 'no-show', 'held'].includes(status)) return null;
  if (view.paymentState === 'awaiting_payment') return null;
  const approval = {
    version: 1,
    acceptedBy: 'review-autopilot',
    acceptedAt: new Date(now).toISOString(),
    priceMinor: view.pricing?.totalDueMinor ?? view.priceMinor ?? 0,
  };
  const specialist = view.specialist;
  if (specialist?.model && specialist.state) {
    const state = specialist.state as string;
    if (ready.has(state)) return null;
    const step = (command: string, extra: Doc = {}) => ({
      action: 'workflow',
      input: { command, ...extra },
      label: command,
    });
    switch (specialist.model) {
      case 'TOUR':
        if (['ITINERARY_REVIEW', 'QUOTED'].includes(state))
          return step('AcceptTourScope', { approval });
        if (state === 'APPROVED') return step('ConfirmTour');
        return null;
      case 'LINKED_WINDOWS':
        if (state === 'REQUESTED') return step('AcceptLinkedScope', { approval });
        if (state === 'APPROVED') return step('ConfirmCollectionLeg');
        return null;
      case 'SERVICE_JOB':
        if (['REQUESTED', 'INTAKE_REVIEW'].includes(state))
          return step('AcceptFixedScopeServiceJob', { approval });
        if (state === 'APPROVED') return step('ConfirmServiceWorkSlot');
        return null;
      case 'ENTITLEMENT':
        if (state === 'ACTIVATION_PENDING') return step('ActivateMembership', { approval });
        return null;
      case 'PRODUCTION_DUE':
        if (['SPECIFICATION_REVIEW', 'QUOTED'].includes(state))
          return step('AcceptProductionScope', { approval });
        if (state === 'APPROVED') return step('CommitProduction');
        return null;
      case 'FREIGHT':
        if (['CARGO_REVIEW', 'QUOTED'].includes(state))
          return step('AcceptFreightQuote', { approval });
        if (state === 'APPROVED') return step('ConfirmFreightBooking');
        return null;
      default:
        return null;
    }
  }
  if (status !== 'pending') return null;
  // A quote: accepted at the top of its range, so the balance is due next.
  if (view.model === 'REQUEST_QUOTE' && view.quoteRange)
    return {
      action: 'accept',
      input: { finalPriceMinor: view.quoteRange.maxMinor },
      label: 'accept',
    };
  if (view.model === 'REQUEST_QUOTE') return { action: 'accept', input: {}, label: 'accept' };
  return { action: 'confirm', input: {}, label: 'confirm' };
}

// ── pretend details ──────────────────────────────────────────────────────────

const PEOPLE = [
  'Brian Otieno',
  'Grace Wanjiru',
  'Kevin Mwangi',
  'Faith Achieng',
  'Dennis Kiprono',
  'Mercy Njeri',
  'Samuel Kamau',
  'Lucy Atieno',
];
const VEHICLES = [
  'Toyota Noah (white)',
  'Toyota Land Cruiser (beige)',
  'Nissan X-Trail (silver)',
  'Toyota Hiace (white)',
  'Subaru Forester (blue)',
];
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

function seed(id: string) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}
function pick<T>(list: T[], h: number, salt = 0) {
  return list[(h + salt * 7919) % list.length]!;
}
function plate(h: number) {
  const l = (n: number) => LETTERS[(h >>> n) % LETTERS.length];
  return `K${l(3)}${l(8)} ${100 + (h % 900)}${l(13)}`;
}
function when(at: string | undefined) {
  if (!at) return undefined;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
/** ISO 8601 in Nairobi time, with its offset: 2030-01-03T13:45:00+03:00. */
function nairobi(at: string | undefined) {
  if (!at) return undefined;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return undefined;
  return new Date(t + 3 * 3_600_000).toISOString().slice(0, 19) + '+03:00';
}
function minus(at: string | undefined, minutes: number) {
  if (!at) return undefined;
  const t = Date.parse(at);
  return Number.isNaN(t) ? undefined : new Date(t - minutes * 60_000).toISOString();
}

const ROLE: Record<string, string> = {
  TRANSFER: 'Your driver',
  ASSET_INTERVAL: 'Handover agent',
  TOUR: 'Your guide',
  LINKED_WINDOWS: 'Collection rider',
  SERVICE_JOB: 'Wash team lead',
  REQUEST_QUOTE: 'Your coordinator',
  APPOINTMENT: 'Your therapist',
  SPACE_RESERVATION: 'Your host',
  SESSION_CAPACITY: 'Event host',
  ENTITLEMENT: 'Membership desk',
};

/**
 * The `details` a reviewer sees once the review autopilot has run (the same
 * field real businesses can fill later): pretend but
 * complete details, worked out from the booking (same booking, same details).
 * `contactPhone` is the number shown for the person (REVIEW_CONTACT_PHONE);
 * without it no phone number is shown, so no stranger's number is ever made up.
 */
export function reviewDetails(view: Doc, contactPhone?: string) {
  const id = String(view.id ?? '');
  const h = seed(id);
  const model = String(view.model ?? '');
  const start: string | undefined = view.startTime ?? view.specialist?.startTime;
  const trip = view.trip ?? {};
  const moving = ['TRANSFER', 'ASSET_INTERVAL', 'TOUR', 'LINKED_WINDOWS'].includes(model);
  const vehicle = moving ? pick(VEHICLES, h, 1) : undefined;
  const plateNo = moving ? plate(h) : undefined;
  const person = {
    name: pick(PEOPLE, h),
    role: ROLE[model] ?? 'Your contact',
    ...(contactPhone ? { phone: contactPhone } : {}),
    ...(vehicle ? { vehicle: `${plateNo} · ${vehicle}`, plate: plateNo } : {}),
  };
  const reference = `NXG-${id
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(-6)
    .toUpperCase()}`;
  const pickupAt = model === 'TOUR' ? minus(start, 15) : model === 'ASSET_INTERVAL' ? start : start;
  const pickupPoint =
    trip.pickupAddress ??
    trip.pickupArea ??
    (model === 'TOUR'
      ? 'Hotel lobby or the meeting point in your booking'
      : model === 'ASSET_INTERVAL'
        ? 'Delivered to the address in your booking'
        : model === 'LINKED_WINDOWS'
          ? 'Your address in the booking'
          : undefined);
  const dropoffPoint = trip.dropoffAddress ?? trip.dropoffArea;
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | undefined) => {
    if (value) rows.push({ label, value });
  };
  add('Reference', reference);
  add(person.role, person.name);
  if (contactPhone) add('Phone', contactPhone);
  if (vehicle) add('Vehicle', vehicle);
  if (plateNo) add('Number plate', plateNo);
  add(model === 'LINKED_WINDOWS' ? 'Collection point' : 'Pickup point', pickupPoint);
  add(model === 'LINKED_WINDOWS' ? 'Collection time' : 'Pickup time', when(pickupAt));
  add('Drop-off point', dropoffPoint);
  if (model === 'ASSET_INTERVAL') add('Return by', when(view.endTime));
  const endsAt = ['ASSET_INTERVAL', 'LINKED_WINDOWS'].includes(model)
    ? nairobi(view.endTime)
    : undefined;
  if (model === 'LINKED_WINDOWS') add('Back to you by', when(view.endTime));
  if (model === 'SERVICE_JOB') add('Bay', 'Wash Bay 1');
  if (view.bookingCode) add('Ticket code', String(view.bookingCode));
  return {
    reviewShop: true as const,
    person,
    ...(pickupPoint || pickupAt
      ? {
          pickup: {
            ...(pickupPoint ? { point: { label: pickupPoint } } : {}),
            ...(pickupAt ? { at: nairobi(pickupAt) } : {}),
          },
        }
      : {}),
    ...(dropoffPoint ? { dropoff: { point: { label: dropoffPoint } } } : {}),
    reference,
    ...(endsAt ? { returnAt: endsAt } : {}),
    // The exact string a door scanner or check-in reads; the engine only gives
    // it out once the booking is paid and confirmed (codeUsable).
    ...(view.bookingCode ? { code: String(view.bookingCode) } : {}),
    rows,
  };
}
