import type { BookingEngine } from './engine.js';
import { BookingError, type Identity } from './types.js';
import { assertStayHoldReady } from './stays.js';

export interface StayPaymentPreparationInput { bookingId: string; attemptId: string }
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const fail=(code:string):never=>{throw new BookingError(409,'Stay payment preparation is unavailable.',code);};
/** Internal-only pre-dispatch command. No HTTP route, provider, worker, charge or payout.
 * A prepared result is NOT provider acceptance or permission to dispatch after expiry.
 * A future dispatcher must claim/revalidate this same attempt transactionally and must
 * reconcile ambiguous sends, never mint another attempt or retry a charge blindly.
 */
export async function prepareStayPaymentAttempt(engine:BookingEngine, identity:Identity, input:StayPaymentPreparationInput,
  key:string, readiness=assertStayHoldReady) {
  if(identity.role!=='customer'||!identity.userId) throw new BookingError(403,'Use the hold owner customer session.','forbidden');
  if(!input||Object.keys(input).some(k=>!['bookingId','attemptId'].includes(k))||!uuid(input.bookingId)||!uuid(input.attemptId)||key!==input.attemptId)
    throw new BookingError(422,'Use one stable attempt ID as the idempotency key.','invalid_stay_payment_preparation');
  const c=engine.managementContext();
  await c.command(identity,key,'stays.payment.prepare',input,async req=>{
    const doc=await c.own('reservations',input.bookingId,identity,req),n=doc.nexg,hold=n?.stayHold;
    if(doc.businessId!==identity.businessId||n?.createdBy!==identity.userId) throw new BookingError(404,'Stay not found.','not_found');
    if(identity.branches&&!identity.branches.includes(n.locationId)) throw new BookingError(403,'Branch unavailable.','forbidden');
    if(hold?.contractVersion!==1||hold.currency!=='KES'||!Number.isSafeInteger(hold.totalMinor)||hold.totalMinor<=0||
      doc.status!=='held'||!Number.isFinite(Date.parse(n.expiresAt))||Date.parse(n.expiresAt)<=c.now())fail('stay_payment_hold_required');
    if(n.stayPaymentReconciliation?.state==='required'||n.stayPayment||(n.paidMinor??0)!==0||(n.refundedMinor??0)!==0)fail('stay_payment_blocked');
    const old=n.stayPaymentPreparation;
    if(old){
      if(old.attemptId===input.attemptId&&old.actorId===identity.userId&&old.state==='prepared'&&old.amountMinor===hold.totalMinor&&old.currency==='KES')return {bookingId:input.bookingId};
      fail('stay_payment_attempt_exists');
    }
    // Production default revalidates current native inventory/authority in this transaction.
    // The optional dependency is only a trusted composition seam for isolated tests.
    await readiness(engine,identity,doc,req);
    if(Date.parse(n.expiresAt)<=c.now())fail('stay_payment_hold_required');
    const duplicate=(await c.all('reservations',identity,req)).some(r=>r.nexg?.stayPaymentPreparation?.attemptId===input.attemptId||r.nexg?.stayPayment?.attemptId===input.attemptId);
    if(duplicate)fail('duplicate_stay_payment');
    const prepared={contractVersion:1,state:'prepared',attemptId:input.attemptId,actorId:identity.userId,
      amountMinor:hold.totalMinor,currency:'KES',preparedAt:new Date(c.now()).toISOString(),expiresAt:n.expiresAt};
    await c.update('reservations',doc.id,{nexg:{...n,version:n.version+1,stayPaymentPreparation:prepared}},identity,req);
    // Existing audit writes a durable booking-outbox event in the SAME command transaction.
    // No worker consuming this new event is provided or enabled by this slice.
    await c.audit(identity,req,'stay.payment.prepared',input.bookingId,{attemptId:input.attemptId,amountMinor:hold.totalMinor,currency:'KES',expiresAt:n.expiresAt});
    return {bookingId:input.bookingId};
  });
  // Replays report current state, not a stale saved pre-dispatch permission.
  const doc=await c.own('reservations',input.bookingId,identity),n=doc.nexg,p=n?.stayPaymentPreparation;
  if(doc.businessId!==identity.businessId||n?.createdBy!==identity.userId||p?.attemptId!==input.attemptId)fail('stay_payment_blocked');
  const status=n.stayPaymentReconciliation?.state==='required'?'blocked':
    doc.status!=='held'||!Number.isFinite(Date.parse(n.expiresAt))||Date.parse(n.expiresAt)<=c.now()?'unavailable':
    p.state==='bound'?'bound':p.state==='prepared'?'prepared':'blocked';
  return {bookingId:doc.publicId,attemptId:p.attemptId,amountMinor:p.amountMinor,currency:p.currency,expiresAt:p.expiresAt,status};
}
