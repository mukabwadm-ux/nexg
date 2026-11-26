import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stayHoldView} from '../src/stays.js';
const now=Date.parse('2030-01-01T00:00:00Z');
function row(){return {publicId:'booking',status:'confirmed',startTime:'2030-01-02T12:00:00Z',endTime:'2030-01-04T07:00:00Z',guest:{email:'private@example.test'},nexg:{offeringId:'offering',version:2,expiresAt:null,paymentState:'provider_verified',paidMinor:20000,
 stayPayment:{state:'settled',amountMinor:20000,currency:'KES',providerReference:'private-reference',providerAccountId:'private-account',eventId:'private-event'},
 stayHold:{quoteId:'quote',propertyId:'property',unitId:'unit',checkIn:'2030-01-02',checkOut:'2030-01-04',adults:2,children:0,nights:2,nightlyMinor:10000,totalMinor:20000}}};}
test('paid is shown only for exact verified settlement and never exposes provider or customer internals',()=>{
 const value=stayHoldView(row(),now);assert.equal(value.paymentStatus,'paid');assert.equal(value.refundDue,false);assert.ok(!JSON.stringify(value).includes('private'));
 for(const change of [(r:any)=>r.nexg.paymentState='unpaid',(r:any)=>r.nexg.paidMinor=19999,(r:any)=>r.nexg.stayPayment.amountMinor=1,(r:any)=>r.nexg.stayPayment.currency='USD',(r:any)=>r.status='held']){
  const r=row();change(r);assert.notEqual(stayHoldView(r,now).paymentStatus,'paid');
 }
});
test('verified unresolved funds block retries even when the underlying hold expired',()=>{
 const r:any=row();r.status='held';r.nexg.expiresAt=new Date(now-1).toISOString();r.nexg.stayPaymentReconciliation={state:'required',fundsObserved:true,eventId:'private-evidence'};
 const view=stayHoldView(r,now);assert.equal(view.status,'expired');assert.equal(view.paymentStatus,'pending');assert.equal(view.paymentReconciliationRequired,true);assert.equal(view.refundDue,false);assert.ok(!JSON.stringify(view).includes('private'));
});
