import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => vi.fn());
vi.mock('./native-movie-customer', () => ({resolveNativeMovieCustomer:auth}));
import { nativeMovieHold, nativeMovieAvailability } from './native-movie-hold';
const uuid = (v:number) => '01a12345-168a-4456-8b79-'+String(v).padStart(12,'0');
const merchantId=uuid(1), actorId=uuid(2), holdId=uuid(3);
const secret='fixture-only-bridge-secret-123456789';
const input={showingId:uuid(4),screenId:uuid(5),occurrenceId:uuid(6),offeringId:uuid(7),seatIds:['A1'],requestId:uuid(8),expectedTotalMinor:12000};
const iso='2030-01-01T12:00:00.000Z';
const view={id:holdId,status:'held', showingId:input.showingId,screenId:input.screenId,occurrenceId:input.occurrenceId,filmId:uuid(9),seatIds:input.seatIds,quantity:1,totalMinor:12000,currency:'KES',startTime:iso,endTime:iso,expiresAt:iso,version:1};
const contact={name:'Verified Guest',email:'verified@example.test'};
const post=(body:object=input)=>new Request('https://nexg.example.test/holds',{method:'POST',headers:{authorization:'Bearer original-token','x-nexg-booking-signature':'untrusted'},body:JSON.stringify(body)});
const get=()=>new Request('https://nexg.example.test/holds/'+holdId,{headers:{authorization:'Bearer original-token'}});
const upstream=vi.fn();
describe('native NexG-managed Movies hold bridge',()=>{
  beforeEach(()=>{
    vi.stubEnv('NEXG_NATIVE_MOVIES_PILOT_MERCHANT_IDS',merchantId);
    vi.stubEnv('BOOKING_ENGINE_URL','https://booking.example.test');
    vi.stubEnv('BOOKING_BRIDGE_SECRET',secret);
    vi.stubGlobal('fetch',upstream);
    upstream.mockReset();
    auth.mockReset();
    auth.mockResolvedValue({ok:true,userId:actorId,contact});
  });
  afterEach(()=>{vi.unstubAllEnvs(); vi.unstubAllGlobals();});
  it('is off by default and rejects other merchants before Auth or network',async()=>{
    vi.stubEnv('NEXG_NATIVE_MOVIES_PILOT_MERCHANT_IDS','');
    expect((await nativeMovieHold(post(),{merchantId})).status).toBe(404);
    expect(auth).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
  });
  it('does not forward missing or unverified identity',async()=>{
    auth.mockResolvedValueOnce({ok:false,reason:'sign_in'}).mockResolvedValueOnce({ok:false,reason:'profile_required'});
    expect((await nativeMovieHold(post(),{merchantId})).status).toBe(401);
    expect((await nativeMovieHold(post(),{merchantId})).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('signs server-resolved actor, allows exactly hold intent, and strips extra response fields',async()=>{
    upstream.mockResolvedValue(Response.json({...view,guest:{email:'hidden@example.test'}}));
    const result=await nativeMovieHold(post(),{merchantId});
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual(view);
    const [url,init]=upstream.mock.calls[0]!;
    expect(url.toString()).toBe('https://booking.example.test/v1/movies/'+merchantId+'/holds');
    const headers=new Headers(init.headers);
    const ctx=headers.get('x-nexg-booking-context')!;
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-nexg-booking-signature')).toBe(createHmac('sha256',secret).update(ctx).digest('hex'));
    expect(headers.get('idempotency-key')).toBe(input.requestId);
    expect(JSON.parse(Buffer.from(ctx,'base64url').toString())).toMatchObject({businessId:merchantId,userId:actorId,role:'customer',moviesCustomer:{purpose:'nexg.movies.customer.v1',verified:true,customer:contact}});
    expect(JSON.parse(init.body)).toEqual(input);
    expect(init.redirect).toBe('error');
  });
  it('refuses identity, contact and normalized duplicate seats from the request body',async()=>{
    for(const bad of [{...input,customer:contact},{...input,userId:actorId},{...input,seatIds:['A1',' A1 ']}])
      expect((await nativeMovieHold(post(bad),{merchantId})).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('reads only the intended hold and fails closed on invalid response or engine outage',async()=>{
    upstream.mockResolvedValueOnce(Response.json(view)).mockResolvedValueOnce(Response.json({...view,id:uuid(99)})).mockRejectedValueOnce(new Error('offline'));
    expect((await nativeMovieHold(get(),{merchantId,holdId})).status).toBe(200);
    expect(upstream.mock.calls[0]![0].pathname).toBe('/v1/movies/'+merchantId+'/holds/'+holdId);
    expect((await nativeMovieHold(get(),{merchantId,holdId})).status).toBe(503);
    expect((await nativeMovieHold(post(),{merchantId})).status).toBe(503);
    expect(upstream).toHaveBeenCalledTimes(3);
  });
  const scope={showingId:input.showingId,screenId:input.screenId,occurrenceId:input.occurrenceId,offeringId:input.offeringId};
  const avail=(query=new URLSearchParams(scope).toString())=>new Request('https://nexg.example.test/availability?'+query);
  const seatView={...scope,merchantId,contractVersion:1,filmId:view.filmId,version:1,observedAt:iso,startTime:iso,endTime:iso,seats:[{seatId:'A1',type:'standard',status:'available'}]};
  it('reads a scoped availability snapshot without resource IDs or customer data', async()=>{
    const seats=[{...seatView.seats[0],resourceId:'private-resource',guest:contact}];
    upstream.mockResolvedValue(Response.json({...seatView,seats,payment:'private'}));
    const result=await nativeMovieAvailability(avail(),{merchantId});
    expect(result.status).toBe(200); expect(await result.json()).toEqual(seatView);
    const [target,init]=upstream.mock.calls[0]!;
    expect(target.pathname).toBe('/v1/movies/'+merchantId+'/availability');
    expect(Object.fromEntries(target.searchParams)).toEqual(scope);
    expect(new Headers(init.headers).get('x-nexg-booking-signature')).toBeTruthy();
  });
  it('fails closed on duplicate query, mismatched showing or missing inventory', async()=>{
    expect((await nativeMovieAvailability(avail(new URLSearchParams(scope)+'&showingId='+input.showingId),{merchantId})).status).toBe(422);
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValueOnce(Response.json({...seatView,showingId:uuid(98)})).mockResolvedValueOnce(Response.json({...seatView,seats:[]}));
    expect((await nativeMovieAvailability(avail(),{merchantId})).status).toBe(503);
    expect((await nativeMovieAvailability(avail(),{merchantId})).status).toBe(503);
  });
});
