import { forwardBookingRequest, MERCHANT_BOOKING_ID, problem } from '@/lib/booking/bridge';
import { nairobiDate } from '@/lib/booking/customer';
import { publicMerchantBookingAccess } from '@/lib/booking/public-access';
import { customerApiClient } from '@/lib/supabase/customer-api';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const opaqueId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const inputSchema = z
  .object({
    stops: z
      .array(
        z
          .object({
            id: opaqueId,
            merchantId: z.string().max(128).optional(),
            offeringId: opaqueId.optional(),
            startsAt: z.string().datetime({ offset: true }).optional(),
            endsAt: z.string().datetime({ offset: true }).optional(),
            quantity: z.number().int().min(1).max(100).default(1),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();

const offeringsSchema = z.object({
  business: z.object({ id: z.string() }),
  offerings: z.array(z.object({ id: opaqueId, name: z.string().trim().min(1).max(250) })),
});
const slotsSchema = z.object({
  slots: z.array(
    z.object({
      start: z.string().datetime({ offset: true }),
      end: z.string().datetime({ offset: true }),
      occurrenceId: opaqueId.optional(),
    }),
  ),
});
const amount = z.number().int().min(0).max(1_000_000_000_000);
const quoteSchema = z.object({
  currency: z.literal('KES'),
  totalMinor: amount,
  dueNowMinor: amount,
  binding: z.literal(true),
  sourceRequired: z.literal(false),
});

type StopInput = z.infer<typeof inputSchema>['stops'][number];
type QuotedStop =
  | { id: string; status: 'unavailable'; message: string }
  | { id: string; status: 'choose_offering'; offerings: Array<{ id: string; name: string }> }
  | { id: string; status: 'ready'; totalMinor: number; dueNowMinor: number; message: string };

export async function POST(request: Request) {
  const token = /^Bearer ([\w.-]{1,4096})$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return problem(401, 'Sign in to review this plan.');
  const {
    data: { user },
    error,
  } = await customerApiClient(token).auth.getUser(token);
  if (error && ![400, 401, 403].includes(error.status ?? 0))
    return problem(503, 'Your sign-in could not be checked.');
  if (!user) return problem(401, 'Sign in to review this plan.');

  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (
    !input.success ||
    new Set(input.data.stops.map((stop) => stop.id)).size !== input.data.stops.length
  )
    return problem(422, 'Check the stops in your itinerary.');

  const origin = new URL(request.url).origin;
  function ownerCall(merchantId: string, path: string, params?: URLSearchParams, body?: object) {
    const url = new URL(`/api/customer/checkout/plans/${path}`, origin);
    if (params) url.search = params.toString();
    const options = body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {};
    return forwardBookingRequest(
      new Request(url, options),
      [path],
      { businessId: merchantId, userId: user!.id, role: 'customer' },
      'customer',
    );
  }
  const catalogs = new Map<string, ReturnType<typeof loadCatalog>>();
  async function loadCatalog(merchantId: string) {
    const access = await publicMerchantBookingAccess(request, merchantId);
    if (access !== 'available') return null;
    const response = await ownerCall(merchantId, 'catalog');
    const catalog = offeringsSchema.safeParse(
      response.ok ? await response.json().catch(() => null) : null,
    );
    return catalog.success && catalog.data.business.id === merchantId
      ? catalog.data.offerings
      : null;
  }
  async function check(stop: StopInput): Promise<QuotedStop> {
    const unavailable = (message: string): QuotedStop => ({
      id: stop.id,
      status: 'unavailable',
      message,
    });
    if (!stop.merchantId || !MERCHANT_BOOKING_ID.test(stop.merchantId))
      return unavailable('Booking is unavailable for this stop.');
    const merchantId = stop.merchantId.toLowerCase();
    const start = stop.startsAt ? Date.parse(stop.startsAt) : NaN;
    const end = stop.endsAt ? Date.parse(stop.endsAt) : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= Date.now() || end <= start)
      return unavailable('Choose a future date and time for this stop.');
    try {
      let catalog = catalogs.get(merchantId);
      if (!catalog) {
        catalog = loadCatalog(merchantId);
        catalogs.set(merchantId, catalog);
      }
      const offerings = await catalog;
      if (!offerings?.length)
        return unavailable('No online booking options could be checked for this stop.');
      const offering = stop.offeringId
        ? offerings.find((item) => item.id === stop.offeringId)
        : undefined;
      if (!offering)
        return { id: stop.id, status: 'choose_offering', offerings: offerings.slice(0, 100) };

      const startTime = new Date(start).toISOString();
      const endTime = new Date(end).toISOString();
      const params = new URLSearchParams({
        offeringId: offering.id,
        date: nairobiDate(new Date(start)),
        startTime,
        endTime,
        quantity: String(stop.quantity),
      });
      const availability = await ownerCall(merchantId, 'availability', params);
      const slots = slotsSchema.safeParse(
        availability.ok ? await availability.json().catch(() => null) : null,
      );
      const slot = slots.success
        ? slots.data.slots.find(
            (item) => Date.parse(item.start) === start && Date.parse(item.end) === end,
          )
        : undefined;
      if (!slot)
        return unavailable(
          'This exact time could not be confirmed. Check another time in your plan.',
        );
      const quoted = await ownerCall(merchantId, 'quote', undefined, {
        offeringId: offering.id,
        startTime,
        endTime,
        quantity: stop.quantity,
        ...(slot.occurrenceId ? { occurrenceId: slot.occurrenceId } : {}),
      });
      const result = quoteSchema.safeParse(
        quoted.ok ? await quoted.json().catch(() => null) : null,
      );
      if (!result.success || result.data.dueNowMinor > result.data.totalMinor)
        return unavailable('A current price could not be confirmed for this stop.');
      return {
        id: stop.id,
        status: 'ready',
        totalMinor: result.data.totalMinor,
        dueNowMinor: result.data.dueNowMinor,
        message: offering.name,
      };
    } catch {
      return unavailable('Booking could not be checked for this stop.');
    }
  }
  const stops: QuotedStop[] = [];
  for (const stop of input.data.stops) stops.push(await check(stop));
  const ready = stops.filter((stop) => stop.status === 'ready');
  const status =
    ready.length === stops.length
      ? 'ready'
      : stops.some((stop) => stop.status === 'choose_offering')
        ? 'needs_selection'
        : 'unavailable';
  return Response.json(
    {
      status,
      currency: 'KES',
      stops,
      ...(status === 'ready'
        ? {
            totalMinor: ready.reduce((sum, stop) => sum + stop.totalMinor, 0),
            dueNowMinor: ready.reduce((sum, stop) => sum + stop.dueNowMinor, 0),
          }
        : {}),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
