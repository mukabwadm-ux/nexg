import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prepareStayPaymentAttempt} from '../src/stay-payment-preparation.js';
import {bindPreparedStayPaymentAttempt,createStaySettlementReceiver} from '../src/stay-settlement.js';
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now=Date.parse('2030-01-01T00:00:00Z');
const customer={businessId:id(1),userId:id(2),role:'customer',expiresAt:now+999999};
const owner={...customer,userId:id(8),role:'owner'};
const input={bookingId:id(3),attemptId:id(4)};
/** Synthetic transaction store, including atomic rollback/outbox; no provider or live DB. */
function fixture(){
 let clock=now,failAudit=false,ready=true;
 const state:any={docs:[{id:1,publicId:input.bookingId,businessId:customer.businessId,status:'held',nexg:{version:1,createdBy:customer.userId,locationId:'primary',expiresAt:new Date(now+900000).toISOString(),stayHold:{contractVersion:1,totalMinor:24000,currency:'KES'}}}],outbox:[],ops:new Map()};
 const req={transactionID:'fixture'};
 const c={now:()=>clock,own:async(_c:string,id:string,i:any,r?:any)=>{if(r)assert.equal(r,req);const doc=state.docs.find((d:any)=>d.publicId===id&&d.businessId===i.businessId);if(!doc)throw Error('not_found');return doc;},
 all:async(_c:string,i:any,r:any)=>{assert.equal(r,req);return state.docs.filter((d:any)=>d.businessId===i.businessId);},
 update:async(_c:string,id:number,data:any,_i:any,r:any)=>{assert.equal(r,req);Object.assign(state.docs.find((d:any)=>d.id===id),data);},
 audit:async(_i:any,r:any,event:string,bookingId:string,data:any)=>{assert.equal(r,req);if(failAudit)throw Error('outbox unavailable');state.outbox.push({event,bookingId,data});},
 command:async(i:any,key:string,op:string,body:any,fn:any)=>{const k=i.userId+op+key,hash=JSON.stringify(body),old=state.ops.get(k);if(old){if(old.hash!==hash)throw Error('idempotency_conflict');return old.result;}
  const saved=structuredClone({docs:state.docs,outbox:state.outbox});try{const result=await fn(req);state.ops.set(k,{hash,result});return result;}catch(e){state.docs=saved.docs;state.outbox=saved.outbox;throw e;}}};
 const engine={managementContext:()=>c} as any;
 const readiness=async(_e:any,_i:any,_d:any,r:any)=>{assert.equal(r,req);if(!ready)throw Error('inventory unavailable');};
 return {state,engine,prepare:(i=customer,x=input)=>prepareStayPaymentAttempt(engine,i,x,x.attemptId,readiness),tick:(t:number)=>clock=t,
 failAudit:()=>failAudit=true,notReady:()=>ready=false};
}
test('prepares exact accepted amount and one durable event before any provider call',async()=>{
 const f=fixture();const result=await f.prepare();assert.equal(result.status,'prepared');assert.equal(result.amountMinor,24000);assert.equal(result.currency,'KES');
 assert.equal(f.state.docs[0].nexg.stayPaymentPreparation.actorId,customer.userId);assert.equal(f.state.outbox.length,1);assert.equal(f.state.outbox[0].event,'stay.payment.prepared');
 assert.deepEqual(await f.prepare(),result);assert.equal(f.state.outbox.length,1);assert.equal(f.state.docs[0].nexg.stayPayment,undefined);
});
test('wrong actor, manager, unknown booking and client amount injection are rejected',async()=>{
 const f=fixture();await assert.rejects(()=>f.prepare({...customer,userId:id(9)}));await assert.rejects(()=>f.prepare(owner));
 await assert.rejects(()=>f.prepare(customer,{...input,bookingId:id(99)}));
 await assert.rejects(()=>f.prepare(customer,{...input,amountMinor:1} as any));assert.equal(f.state.outbox.length,0);
});
test('expired/pending/reconciliation/changed-inventory states block new preparation',async()=>{
 for(const mutate of [(f:any)=>f.tick(now+900000),(f:any)=>f.state.docs[0].nexg.stayPayment={state:'pending'},
  (f:any)=>f.state.docs[0].nexg.stayPaymentReconciliation={state:'required'},(f:any)=>f.notReady()]){
  const f=fixture();mutate(f);await assert.rejects(()=>f.prepare());assert.equal(f.state.outbox.length,0);
 }
 const f=fixture();await f.prepare();await assert.rejects(()=>f.prepare(customer,{...input,attemptId:id(5)}));
 f.tick(now+900000);assert.equal((await f.prepare()).status,'unavailable');assert.equal(f.state.outbox.length,1);
});
test('outbox failure rolls back prepared reservation and idempotency result',async()=>{
 const f=fixture();f.failAudit();await assert.rejects(()=>f.prepare(),/outbox unavailable/);
 assert.equal(f.state.docs[0].nexg.stayPaymentPreparation,undefined);assert.equal(f.state.ops.size,0);assert.equal(f.state.outbox.length,0);
});
test('only original preparation can bind provider response and simulate settlement',async()=>{
 const f=fixture(),binding={attemptId:input.attemptId,provider:'fixture-only',providerAccountId:'fixture-account',providerReference:'fixture-reference'};
 await assert.rejects(()=>bindPreparedStayPaymentAttempt(f.engine,owner,input.bookingId,binding,id(7)));
 await f.prepare();await assert.rejects(()=>bindPreparedStayPaymentAttempt(f.engine,owner,input.bookingId,{...binding,attemptId:id(6)},id(6)));
 await bindPreparedStayPaymentAttempt(f.engine,owner,input.bookingId,binding,id(7));assert.equal((await f.prepare()).status,'bound');
 const receiver=createStaySettlementReceiver(f.engine,{verify:async raw=>({identity:owner,proof:raw as any}),canConfirm:async()=>true});
 const result=await receiver({...binding,merchantId:customer.businessId,bookingId:input.bookingId,eventId:id(10),amountMinor:24000,currency:'KES',status:'settled',occurredAt:new Date(now).toISOString()});
 assert.equal(result.outcome,'confirmed');assert.equal(f.state.docs[0].nexg.paidMinor,24000);
});
