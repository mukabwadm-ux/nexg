import { getBookingProfile } from '@nexg/booking-config/profiles';
import { Card } from '@nexg/ui';

/** What each booking model means to a customer, in plain words. */
const MODEL_LABEL: Record<string, string> = {
  ORDER: 'Orders',
  REQUEST_QUOTE: 'Quote requests',
  APPOINTMENT: 'Appointments',
  SESSION_CAPACITY: 'Sessions with seats',
  TOUR: 'Tours',
  ASSET_INTERVAL: 'Rentals by the day or hour',
  TRANSFER: 'Transfers',
  FIELD_VISIT: 'Visits to the customer',
  SERVICE_JOB: 'Service jobs',
  LINKED_WINDOWS: 'Pickup and return windows',
  FREIGHT: 'Freight bookings',
  PRODUCTION_DUE: 'Made-to-order with a due date',
  ENTITLEMENT: 'Memberships',
  STORAGE: 'Storage',
};

export interface BookingReadinessInput {
  merchantId: string;
  status: string;
  exploreVisible: boolean;
  subcategory: string | null;
  activeResources: number;
}

type Published = { state: 'published'; offerings: number } | { state: 'none' | 'unknown' };

/**
 * The public catalog the customer's booking page reads. Only a merchant that
 * is live and shown in Discovery has one, so anything else is "none".
 */
async function engineCatalog(merchantId: string, listed: boolean): Promise<Published> {
  if (!listed) return { state: 'none' };
  const origin = process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'https://www.nexgapp.com';
  try {
    const response = await fetch(
      `${origin}/api/public/booking/${encodeURIComponent(merchantId)}/catalog`,
      { cache: 'no-store', signal: AbortSignal.timeout(5000) },
    );
    if (response.status === 404) return { state: 'none' };
    if (!response.ok) return { state: 'unknown' };
    const body = (await response.json()) as { offerings?: unknown };
    const offerings = Array.isArray(body.offerings) ? body.offerings.length : 0;
    return offerings ? { state: 'published', offerings } : { state: 'none' };
  } catch {
    return { state: 'unknown' };
  }
}

/** Can a customer book this merchant today, and if not, what is in the way. */
export async function BookingReadiness(input: BookingReadinessInput) {
  const profile = input.subcategory ? getBookingProfile(input.subcategory) : undefined;
  const live = input.status === 'live';
  const listed = live && input.exploreVisible;
  const catalog = await engineCatalog(input.merchantId, listed);
  const bookable = listed && (input.activeResources > 0 || catalog.state === 'published');

  const blockers = [
    !profile
      ? input.subcategory
        ? `Subcategory “${input.subcategory}” has no booking type, so the booking engine cannot set this merchant up.`
        : 'No subcategory is set, so the booking engine cannot set this merchant up.'
      : null,
    !live ? 'Not live yet. Take live once the documents are verified.' : null,
    live && !input.exploreVisible
      ? 'Hidden from Discovery, so customers cannot find or open its booking page.'
      : null,
    listed && input.activeResources === 0 && catalog.state === 'none'
      ? 'Nothing is published for booking. The merchant adds and publishes services in Availability.'
      : null,
  ].filter((line): line is string => line !== null);

  const rows: [string, string][] = [
    [
      'Booking type',
      profile
        ? `${profile.name}: ${MODEL_LABEL[profile.defaultModelId] ?? profile.defaultModelId}`
        : 'None',
    ],
    ['Shown in Discovery', listed ? 'Yes' : 'No'],
    [
      'Published for booking',
      input.activeResources > 0
        ? `${input.activeResources} bookable ${input.activeResources === 1 ? 'item' : 'items'}`
        : catalog.state === 'published'
          ? `${catalog.offerings} ${catalog.offerings === 1 ? 'service' : 'services'}`
          : catalog.state === 'unknown'
            ? 'Could not check'
            : 'Nothing yet',
    ],
  ];

  return (
    <Card className="p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">Bookings</h2>
      <p
        className={`mt-2 text-sm font-bold ${bookable ? 'text-success' : 'text-danger'}`}
        role="status"
      >
        {bookable
          ? 'Customers can book this merchant.'
          : catalog.state === 'unknown' && blockers.length === 0
            ? 'Booking status could not be checked. Reload to try again.'
            : 'Customers cannot book this merchant yet.'}
      </p>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted font-semibold">{label}</dt>
            <dd className="text-right font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      {blockers.length ? (
        <ul className="text-muted mt-3 list-disc space-y-1 pl-4 text-xs font-semibold leading-[1.7]">
          {blockers.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
