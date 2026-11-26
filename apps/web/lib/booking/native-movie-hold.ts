import { z } from 'zod';
import { bookingHeaders, MERCHANT_BOOKING_ID, problem, type BookingIdentity } from './bridge';
import { resolveNativeMovieCustomer } from './native-movie-customer';

const id = z.string().regex(MERCHANT_BOOKING_ID).transform(v => v.toLowerCase());
const seat = z.string().trim().min(1).max(12);
const seats = z.array(seat).min(1).max(10).refine(v => new Set(v).size === v.length);
const minor = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const holdInput = z.object({showingId:id,screenId:id,occurrenceId:id,offeringId:id,seatIds:seats,requestId:id,expectedTotalMinor:minor}).strict();
const instant = z.string().refine(v => v.length <= 40 && Number.isFinite(Date.parse(v)));
const holdView = z.object({id,status:z.enum(['held','expired','confirmed','cancelled']),showingId:id,screenId:id,
  filmId:id,occurrenceId:id,seatIds:seats,quantity:z.number().int().min(1).max(10),totalMinor:minor,currency:z.literal('KES'),
  startTime:instant,endTime:instant,expiresAt:instant,version:z.number().int().positive()});
const unavailable = () => problem(503, 'Movies booking is temporarily unavailable.', 'movies_unavailable');
const notFound = () => problem(404, 'This Movies booking is unavailable.', 'not_found');

async function readJson(message: Request | Response, cap = 4096) {
  const reader = message.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let count = 0, text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      count += chunk.value.byteLength;
      if (count > cap) { await reader.cancel(); throw new Error('Body too large'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally { reader.releaseLock(); }
}

async function movieBridge(request: Request, merchantId: string) {
  const pilot = (process.env.NEXG_NATIVE_MOVIES_PILOT_MERCHANT_IDS ?? '').split(',')
    .map(v => v.trim().toLowerCase()).filter(v => MERCHANT_BOOKING_ID.test(v));
  if (!pilot.includes(merchantId)) return notFound();
  const base = process.env.BOOKING_ENGINE_URL;
  const secret = process.env.BOOKING_BRIDGE_SECRET;
  if (!base || !secret || secret.length < 32) return unavailable();
  let engine: URL;
  try {
    engine = new URL(base);
    if (engine.username || engine.password || !(engine.protocol === 'https:' ||
      (process.env.NODE_ENV !== 'production' && engine.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(engine.hostname))))
      return unavailable();
  } catch { return unavailable(); }

  const actor = await resolveNativeMovieCustomer(request);
  if (!actor.ok) {
    if (actor.reason === 'sign_in') return problem(401, 'Sign in to hold movie seats.', 'sign_in_required');
    if (actor.reason === 'profile_required') return problem(422, 'Add a name and verify your email or phone before holding seats.', 'movie_customer_required');
    return unavailable();
  }
  const identity: BookingIdentity & { moviesCustomer: { purpose: 'nexg.movies.customer.v1'; verified: true; customer: typeof actor.contact } } = {
    businessId: merchantId, userId: actor.userId, role:'customer',
    moviesCustomer:{purpose:'nexg.movies.customer.v1',verified:true,customer:actor.contact},
  };
  return { engine, headers: bookingHeaders(identity, secret) };
}

export async function nativeMovieHold(request: Request, params: { merchantId: string; holdId?: string }) {
  const merchantId = id.safeParse(params.merchantId);
  const holdId = id.safeParse(params.holdId);
  const write = request.method === 'POST' && params.holdId === undefined;
  if (!merchantId.success || (!write && (request.method !== 'GET' || !holdId.success))) return notFound();
  const bridge = await movieBridge(request, merchantId.data);
  if (bridge instanceof Response) return bridge;
  let input: z.infer<typeof holdInput> | undefined;
  if (write) {
    try {
      const parsed = holdInput.safeParse(await readJson(request));
      if (!parsed.success) return problem(422,'Check the showing, seats and reviewed price.','invalid_movie_intent');
      input = parsed.data;
    } catch { return problem(400,'Send a valid Movies hold request.','invalid_json'); }
  }
  const target = new URL('/v1/movies/' + merchantId.data + '/holds' + (holdId.success ? '/' + holdId.data : ''), bridge.engine);
  try {
    const response = await fetch(target, {
      method: write ? 'POST' : 'GET',
      headers: { ...bridge.headers, accept:'application/json',
        ...(input ? {'content-type':'application/json','idempotency-key':input.requestId} : {}) },
      ...(input ? {body:JSON.stringify(input)} : {}),
      cache:'no-store', redirect:'error', signal:AbortSignal.timeout(15000),
    });
    if (response.status === 404) return notFound();
    if (response.status === 409 || response.status === 410)
      return problem(409,'Seats, prices or showtime availability changed. Refresh and try again.','movie_hold_conflict');
    if (response.status === 422) return problem(422,'Check the showing, seats and reviewed price.','invalid_movie_intent');
    if (!response.ok) return unavailable();
    const view = holdView.safeParse(await readJson(response));
    if (!view.success || view.data.quantity !== view.data.seatIds.length ||
      (holdId.success && view.data.id !== holdId.data) ||
      (input && (view.data.showingId !== input.showingId || view.data.screenId !== input.screenId ||
        view.data.occurrenceId !== input.occurrenceId || view.data.totalMinor !== input.expectedTotalMinor ||
        [...view.data.seatIds].sort().join('\0') !== [...input.seatIds].sort().join('\0')))) return unavailable();
    return Response.json(view.data, { status: write ? 201 : 200, headers:{'Cache-Control':'private, no-store'} });
  } catch { return unavailable(); }
}

const availabilityFields = ['showingId','screenId','occurrenceId','offeringId'] as const;
const availabilityQuery = z.object({showingId:id,screenId:id,occurrenceId:id,offeringId:id});
const availabilityView = availabilityQuery.extend({
  contractVersion:z.literal(1),merchantId:id,filmId:id,version:z.number().int().positive(),
  observedAt:instant,startTime:instant,endTime:instant,
  seats:z.array(z.object({seatId:seat,type:z.enum(['standard','vip','wheelchair']),status:z.enum(['available','unavailable'])})).min(1).max(5000),
});
export async function nativeMovieAvailability(request: Request, params: {merchantId:string}) {
  const merchantId=id.safeParse(params.merchantId);
  if(request.method!=='GET' || !merchantId.success) return notFound();
  const query=new URL(request.url).searchParams;
  if([...query.keys()].length!==availabilityFields.length || availabilityFields.some(k=>query.getAll(k).length!==1))
    return problem(422,'Choose the exact showing and screen.','invalid_movie_availability');
  const input=availabilityQuery.safeParse(Object.fromEntries(query));
  if(!input.success) return problem(422,'Choose the exact showing and screen.','invalid_movie_availability');
  const bridge=await movieBridge(request,merchantId.data);
  if(bridge instanceof Response) return bridge;
  const target=new URL('/v1/movies/'+merchantId.data+'/availability',bridge.engine);
  target.search=new URLSearchParams(input.data).toString();
  try {
    const response=await fetch(target,{headers:{...bridge.headers,accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
    if(response.status===404) return notFound();
    if(response.status===409) return problem(409,'This showing is not taking new holds.','movie_not_on_sale');
    if(!response.ok) return unavailable();
    const view=availabilityView.safeParse(await readJson(response,512*1024));
    if(!view.success || view.data.merchantId!==merchantId.data ||
      availabilityFields.some(k=>view.data[k]!==input.data[k]) ||
      new Set(view.data.seats.map(s=>s.seatId)).size!==view.data.seats.length) return unavailable();
    return Response.json(view.data,{headers:{'Cache-Control':'private, no-store'}});
  } catch {return unavailable();}
}
