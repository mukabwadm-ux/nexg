import { z } from 'zod';
import { bookingHeaders, MERCHANT_BOOKING_ID, type BookingIdentity } from './bridge';
import { resolveNativeMovieCustomer as resolveVerifiedBookingCustomer } from './native-movie-customer';

const uuid=z.string().regex(MERCHANT_BOOKING_ID).transform(v=>v.toLowerCase());
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instant=z.string().datetime({offset:true});
const minor=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const quoteInput=z.object({propertyId:uuid,unitId:uuid,checkIn:date,checkOut:date,adults:z.number().int().min(1).max(20),children:z.number().int().min(0).max(20)}).strict();
const quoteView=quoteInput.extend({quoteId:uuid,offeringId:uuid,nights:z.number().int().min(1).max(90),nightlyMinor:minor,totalMinor:minor,currency:z.literal('KES'),expiresAt:instant});
const availabilityView=quoteInput.extend({contractVersion:z.literal(1),authority:z.literal('nexg-booking-engine'),held:z.literal(false),offeringId:uuid,nights:z.number().int().min(1).max(90),available:z.boolean(),nightlyMinor:minor,totalMinor:minor,currency:z.literal('KES'),observedAt:instant}).strip();
const availabilityKeys=['propertyId','unitId','checkIn','checkOut','adults','children'] as const;
const holdInput=z.object({quoteId:uuid,firstName:z.string().trim().min(1).max(80),expectedTotalMinor:minor}).strict();
const holdView=z.object({quoteId:uuid,id:uuid,expiresAt:instant,currency:z.literal('KES'),totalMinor:minor,
  status:z.enum(['held','confirmed','expired','cancelled','in_stay','departed']),paymentStatus:z.enum(['unpaid','pending','failed','paid']).optional(),
  refundDue:z.boolean().optional(),paymentReconciliationRequired:z.literal(true).optional(),reference:z.string().min(1).max(128).optional()});
const activityView=z.object({id:z.string(),kind:z.literal('stay'),source:z.literal('nexg-booking-engine'),bookingId:uuid,bookingReference:uuid,quoteId:uuid,propertyId:uuid,unitId:uuid,offeringId:uuid,status:z.literal('confirmed'),paymentStatus:z.literal('paid'),checkIn:date,checkOut:date,startTime:instant,endTime:instant,timeZone:z.literal('Africa/Nairobi'),nights:z.number().int().min(1).max(90),adults:z.number().int().min(1).max(20),children:z.number().int().min(0).max(20),totalMinor:minor,currency:z.literal('KES')});
function civilNights(checkIn:string,checkOut:string){
  const first=Date.parse(checkIn+'T00:00:00.000Z'), last=Date.parse(checkOut+'T00:00:00.000Z');
  if(!Number.isFinite(first)||!Number.isFinite(last)||new Date(first).toISOString().slice(0,10)!==checkIn||new Date(last).toISOString().slice(0,10)!==checkOut) return null;
  const nights=(last-first)/86400000;
  return Number.isInteger(nights)&&nights>=1&&nights<=90?nights:null;
}
const headers={'Cache-Control':'private, no-store'};
function issue(status:number, code:string, title:string) {
  return Response.json({type:'about:blank',title,status,code},{status,headers:{...headers,'Content-Type':'application/problem+json'}});
}
const missing=()=>issue(404,'NOT_FOUND','This stay checkout is unavailable.');
const unavailable=()=>issue(503,'SERVICE_UNAVAILABLE','Stay checkout is unavailable. Try again shortly.');
const invalid=()=>issue(422,'INVALID_REQUEST','Check the stay dates, guests or reviewed quote.');

async function readJson(message:Request|Response) {
  const reader=message.body?.getReader();
  if(!reader) throw new Error('Missing body');
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let total=0, result='';
  try {
    for(;;){
      const chunk=await reader.read();
      if(chunk.done) break;
      total+=chunk.value.byteLength;
      if(total>4096){await reader.cancel(); throw new Error('Body too large');}
      result+=decoder.decode(chunk.value,{stream:true});
    }
    return JSON.parse(result+decoder.decode()) as unknown;
  } finally { reader.releaseLock(); }
}

const errors: Record<string,[number,string,string]>={
  stay_unavailable:[409,'STAY_UNAVAILABLE','The room is no longer available for these dates.'],
  quote_expired:[410,'QUOTE_EXPIRED','The quote expired. Request a fresh price.'],
  stay_quote_expired:[410,'QUOTE_EXPIRED','The quote expired. Request a fresh price.'],
  price_changed:[409,'PRICE_CHANGED','The price changed. Request a fresh quote.'],
  stay_price_changed:[409,'PRICE_CHANGED','The price changed. Request a fresh quote.'],
  idempotency_conflict:[409,'OPERATION_CONFLICT','This checkout already has a different request.'],
  operation_conflict:[409,'OPERATION_CONFLICT','This checkout already has a different request.'],
};
async function upstreamFailure(response:Response){
  if(response.status===404) return missing();
  if(response.status===400 || response.status===422) return invalid();
  if(response.status===409 || response.status===410){
    const value=await readJson(response).catch(()=>null);
    const body=value as {code?:unknown; type?:unknown}|null;
    const tag=typeof body?.code==='string'?body.code.toLowerCase():typeof body?.type==='string'?body.type.split(':').at(-1)??'':'';
    const error=Object.hasOwn(errors,tag)?errors[tag]:undefined;
    return error?issue(...error):(response.status===410?issue(410,'QUOTE_EXPIRED','The quote expired.'):issue(409,'STAY_UNAVAILABLE','The stay could not be held.'));
  }
  return unavailable();
}

export async function nativeVpsStayCheckout(request:Request, params:{merchantId:string; path:string[]}) {
  const merchant=uuid.safeParse(params.merchantId);
  const [section,operation,action]=params.path;
  const availability=request.method==='GET'&&section==='availability'&&params.path.length===1;
  const quote=request.method==='POST'&&section==='quote'&&params.path.length===1;
  const hold=request.method==='POST'&&section==='holds'&&params.path.length===1;
  const activity=request.method==='GET'&&section==='holds'&&action==='activity'&&params.path.length===3;
  const status=request.method==='GET'&&section==='holds'&&params.path.length===2;
  const payment=request.method==='POST'&&section==='holds'&&action==='payment'&&params.path.length===3;
  const operationId=uuid.safeParse(operation);
  if(!merchant.success || !(quote||hold||status||payment||availability||activity) || ((status||payment||activity)&&!operationId.success)) return missing();
  const allowed=(process.env.NEXG_NATIVE_STAYS_PILOT_MERCHANT_IDS??'').split(',').map(v=>v.trim().toLowerCase()).filter(v=>MERCHANT_BOOKING_ID.test(v));
  if(!allowed.includes(merchant.data)) return missing();
  if(activity&&new URL(request.url).search)return invalid();
  const secret=process.env.BOOKING_BRIDGE_SECRET;
  const configured=process.env.BOOKING_ENGINE_URL;
  if(!secret || secret.length<32 || !configured) return unavailable();
  let base:URL;
  try{
    base=new URL(configured);
    if(base.username||base.password||!(base.protocol==='https:'||(process.env.NODE_ENV!=='production'&&base.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(base.hostname)))) return unavailable();
  }catch{return unavailable();}
  const actor=await resolveVerifiedBookingCustomer(request);
  if(!actor.ok){
    if(actor.reason==='sign_in') return issue(401,'AUTH_REQUIRED','Sign in to book a stay.');
    if(actor.reason==='profile_required') return issue(422,'INVALID_REQUEST','Add your name and a verified contact to book.');
    return unavailable();
  }
  // No provider has been connected to the VPS reservation for payment yet.
  // Never start the legacy Supabase payment RPC for a VPS-owned hold.
  if(payment) return issue(503,'PAYMENT_UNAVAILABLE','Payment is not connected for this stay.');
  const key=uuid.safeParse(request.headers.get('idempotency-key'));
  let availableFor:z.infer<typeof quoteInput>|undefined;
  if(availability){
    const query=new URL(request.url).searchParams;
    if([...query.keys()].length!==availabilityKeys.length||availabilityKeys.some(k=>query.getAll(k).length!==1))return invalid();
    const input=Object.fromEntries(query);
    if(!/^\d{1,2}$/.test(input.adults??'')||!/^\d{1,2}$/.test(input.children??''))return invalid();
    const checked=quoteInput.safeParse({...input,adults:Number(input.adults),children:Number(input.children)});
    if(!checked.success||civilNights(checked.data.checkIn,checked.data.checkOut)===null)return invalid();
    availableFor=checked.data;
  }
  let quoted:z.infer<typeof quoteInput>|undefined;
  let held:z.infer<typeof holdInput>|undefined;
  let body:string|undefined;
  if(quote||hold){
    if(!key.success) return invalid();
    const json=await readJson(request).catch(()=>null);
    if(quote){
      const parsed=quoteInput.safeParse(json);
      if(!parsed.success||civilNights(parsed.data.checkIn,parsed.data.checkOut)===null) return invalid();
      quoted=parsed.data;
      body=JSON.stringify(quoted);
    }else{
      const parsed=holdInput.safeParse(json);
      if(!parsed.success||parsed.data.quoteId!==key.data) return invalid();
      held=parsed.data;
      body=JSON.stringify({quoteId:held.quoteId,requestId:key.data,expectedTotalMinor:held.expectedTotalMinor});
    }
  }
  const identity:BookingIdentity&{staysCustomer:{purpose:'nexg.stays.customer.v1';verified:true;customer:typeof actor.contact}}={
    role:'customer',businessId:merchant.data,userId:actor.userId,
    staysCustomer:{purpose:'nexg.stays.customer.v1',verified:true,customer:actor.contact},
  };
  const path=availability?'availability':quote?'quote':hold?'holds':'holds/'+(operationId.success?operationId.data:'')+(activity?'/activity':'');
  try{
    const target=new URL('/v1/stays/'+merchant.data+'/'+path,base);
    if(availableFor)target.search=new URLSearchParams(availabilityKeys.map(k=>[k,String(availableFor![k])])).toString();
    const upstream=await fetch(target,{
      method:status||availability||activity?'GET':'POST',headers:{...bookingHeaders(identity,secret),accept:'application/json',
        ...(body&&key.success?{'content-type':'application/json','idempotency-key':key.data}:{})},body,
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
    });
    if(!upstream.ok) return upstreamFailure(upstream);
    const raw=await readJson(upstream);
    if(activity&&operationId.success){
      const view=activityView.safeParse(raw);
      if(!view.success||view.data.bookingId!==operationId.data||view.data.bookingReference!==view.data.bookingId||view.data.id!=='stay:'+view.data.bookingId||view.data.nights!==civilNights(view.data.checkIn,view.data.checkOut))return unavailable();
      return Response.json(view.data,{headers});
    }
    if(availableFor){
      const view=availabilityView.safeParse(raw);
      if(!view.success||availabilityKeys.some(k=>view.data[k]!==availableFor![k])||
        view.data.nights!==civilNights(view.data.checkIn,view.data.checkOut)||view.data.nightlyMinor*view.data.nights!==view.data.totalMinor)return unavailable();
      const age=Date.now()-Date.parse(view.data.observedAt);
      if(!Number.isFinite(age)||age < -5000||age>60000)return unavailable();
      return Response.json(view.data,{headers});
    }
    if(quoted){
      const view=quoteView.safeParse(raw);
      if(!view.success||Object.entries(quoted).some(([k,v])=>view.data[k as keyof typeof quoted]!==v)||
        view.data.nights!==civilNights(view.data.checkIn,view.data.checkOut)||view.data.nightlyMinor*view.data.nights!==view.data.totalMinor) return unavailable();
      const {offeringId:_offering,...value}=view.data;
      return Response.json({...value,roomSubtotalMinor:value.totalMinor,taxesMinor:0,paymentMethods:[],checkoutPaymentReady:false,
        termsText:'Your room is not booked until payment is verified and the reservation is confirmed.',
        cancellationText:'Unpaid holds expire automatically.'},{headers});
    }
    const view=holdView.safeParse(raw);
    const expected=held?.quoteId??(operationId.success?operationId.data:undefined);
    if(!view.success||view.data.quoteId!==expected||(held&&view.data.totalMinor!==held.expectedTotalMinor)) return unavailable();
    const booking=view.data;
    const confirmed=['confirmed','in_stay','departed'].includes(booking.status);
    if(confirmed&&(booking.paymentStatus!=='paid'||booking.refundDue!==false||booking.paymentReconciliationRequired)) return unavailable();
    return Response.json({operationId:booking.quoteId,stayId:booking.id,holdExpiresAt:booking.expiresAt,
      currency:booking.currency,totalMinor:booking.totalMinor,status:booking.status==='confirmed'?'booked':booking.status,
      paymentStatus:booking.paymentReconciliationRequired?'pending':(booking.paymentStatus??'unpaid'),refundDue:booking.refundDue??false,
      ...(booking.paymentReconciliationRequired?{paymentReconciliationRequired:true}:{}),...(booking.reference?{reference:booking.reference}:{})},{headers});
  }catch{return unavailable();}
}
