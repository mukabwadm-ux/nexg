import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindStayPaymentAttempt, createStaySettlementReceiver, decideStaySettlement, type StaySettlementProof } from '../src/stay-settlement.js';
const now=Date.parse('2030-01-01T00:00:00Z');
const identity={businessId:'merchant',userId:'fixture-provider',role:'owner',expiresAt:now+999999};
const binding={attemptId:'attempt',provider:'fixture-only',providerAccountId:'fixture-account',providerReference:'fixture-reference'};
const proof=():StaySettlementProof=>({...binding,merchantId:'merchant',bookingId:'booking',eventId:'event',amountMinor:20000,currency:'KES',status:'settled',occurredAt:new Date(now+1000).toISOString()});
const held=():any=>({id:1,publicId:'booking',businessId:'merchant',status:'held',nexg:{version:1,createdBy:'customer',locationId:'primary',expiresAt:new Date(now+900000).toISOString(),stayHold:{contractVersion:1,totalMinor:20000,currency:'KES'},stayPayment:{...binding,state:'pending',amountMinor:20000,currency:'KES',createdAt:new Date(now).toISOString()}}});
test('only exact verified settlement for valid matching hold is accepted',()=>{
 assert.equal(decideStaySettlement(held(),proof(),now+2000).reason,'settlement_accepted');
 for(const patch of [{amountMinor:19999},{currency:'USD'},{attemptId:'other'},{providerReference:'other'},{providerAccountId:'other'},{status:'pending'},{status:'unknown'},{occurredAt:'bad'}])
  assert.equal(decideStaySettlement(held(),{...proof(),...patch} as any,now+2000).outcome,'reconciliation');
});
test('expired/cancelled/unknown/mismatched booking can never be resurrected',()=>{
 const doc=held();assert.equal(decideStaySettlement(doc,proof(),now+900000).reason,'hold_no_longer_valid');
 for(const status of ['expired','cancelled','confirmed'])assert.equal(decideStaySettlement({...doc,status},proof(),now+2000).outcome,'reconciliation');
 assert.equal(decideStaySettlement(undefined,proof(),now+2000).reason,'unknown_booking');
 assert.equal(decideStaySettlement({...doc,businessId:'other'},proof(),now+2000).reason,'unknown_booking');
});
/** Simulated transaction store ONLY, no provider, database, callback, charge or payout. */
function fixture(){
 let clock=now;const state:any={docs:[held()],audits:[],ops:new Map()};delete state.docs[0].nexg.stayPayment;
 const req={transactionID:'fixture-transaction'};
 const context={now:()=>clock,own:async(_c:string,id:string,i:any,r:any)=>{assert.equal(r,req);const row=state.docs.find((d:any)=>d.publicId===id&&d.businessId===i.businessId);if(!row)throw Error('not_found');return row;},
  all:async(_c:string,i:any,r:any)=>{assert.equal(r,req);return state.docs.filter((d:any)=>d.businessId===i.businessId);},
  update:async(_c:string,id:number,data:any,_i:any,r:any)=>{assert.equal(r,req);Object.assign(state.docs.find((d:any)=>d.id===id),data);},
  audit:async(_i:any,r:any,operation:string,recordId:string,detail:any)=>{assert.equal(r,req);state.audits.push({operation,recordId,detail});},
  command:async(i:any,key:string,operation:string,body:any,fn:any)=>{
   const k=i.businessId+':'+operation+':'+key,hash=JSON.stringify(body),old=state.ops.get(k);
   if(old){if(old.hash!==hash)throw Error('idempotency_conflict');return old.result;}
   const snapshot=structuredClone({docs:state.docs,audits:state.audits});
   try{const result=await fn(req);state.ops.set(k,{hash,result});return result;}catch(e){state.docs=snapshot.docs;state.audits=snapshot.audits;throw e;}
  }};
 const engine={managementContext:()=>context} as any;
 const receive=(check:()=>Promise<boolean>=async()=>true)=>createStaySettlementReceiver(engine,{verify:async raw=>({identity,proof:raw as StaySettlementProof}),canConfirm:async(_i,_d,r)=>{assert.equal(r,req);return check();}});
 return {state,engine,receive,tick:(n:number)=>clock=n,bind:()=>bindStayPaymentAttempt(engine,identity,'booking',binding,'bind')};
}
test('simulated end-to-end binds, confirms exactly once and replays without double payment',async()=>{
 const f=fixture();await f.bind();f.tick(now+2000);const receive=f.receive();const first=await receive(proof());
 assert.equal(first.outcome,'confirmed');assert.equal(f.state.docs[0].status,'confirmed');assert.equal(f.state.docs[0].nexg.paidMinor,20000);
 assert.equal(f.state.docs[0].nexg.paymentState,'provider_verified');assert.equal(f.state.docs[0].nexg.expiresAt,null);
 const before=JSON.stringify(f.state.docs),audits=f.state.audits.length;assert.deepEqual(await receive(proof()),first);
 assert.equal((await receive({...proof(),eventId:'redelivery-event'})).reason,'already_settled');
 assert.equal(JSON.stringify(f.state.docs),before);assert.equal(f.state.audits.length,audits);
 await assert.rejects(()=>receive({...proof(),amountMinor:1}),/idempotency_conflict/);
});
test('simulated late/mismatched/unknown settlement is durable reconciliation with no confirmation',async()=>{
 for(const patch of [{amountMinor:20001},{bookingId:'unknown'},{status:'unknown'}]){
  const f=fixture();await f.bind();f.tick(now+2000);const out=await f.receive()({...proof(),...patch});
  assert.equal(out.outcome,'reconciliation');assert.equal(f.state.docs[0].status,'held');assert.equal(f.state.docs[0].nexg.paidMinor,undefined);
  assert.equal(f.state.audits.at(-1).operation,'stay.payment.reconciliation');
 }
 const f=fixture();await f.bind();f.tick(now+900000);assert.equal((await f.receive()(proof())).reason,'hold_no_longer_valid');
});
test('readiness unavailable or expiry during verification never force-confirms',async()=>{
 const f=fixture();await f.bind();f.tick(now+2000);assert.equal((await f.receive(async()=>false)(proof())).reason,'native_confirmation_unavailable');
 const g=fixture();await g.bind();g.tick(now+2000);
 assert.equal((await g.receive(async()=>{g.tick(now+900000);return true;})(proof())).reason,'hold_no_longer_valid');
 assert.equal(g.state.docs[0].status,'held');
});
test('binding rejects replacement attempts, duplicate references and customer actor',async()=>{
 const f=fixture();await f.bind();await assert.rejects(()=>bindStayPaymentAttempt(f.engine,identity,'booking',{...binding,attemptId:'other'},'other'));
 const second=held();second.id=2;second.publicId='second';delete second.nexg.stayPayment;f.state.docs.push(second);
 await assert.rejects(()=>bindStayPaymentAttempt(f.engine,identity,'second',binding,'second'));
 await assert.rejects(()=>bindStayPaymentAttempt(f.engine,{...identity,role:'customer'},'booking',binding,'customer'));
});
test('unverified provider or wrong merchant is rejected before writes',async()=>{
 const f=fixture();const receive=createStaySettlementReceiver(f.engine,{verify:async()=>{throw Error('invalid signature');},canConfirm:async()=>true});
 await assert.rejects(()=>receive(proof()),/invalid signature/);assert.equal(f.state.ops.size,0);
 await assert.rejects(()=>f.receive()({...proof(),merchantId:'other'}));assert.equal(f.state.ops.size,0);
});
test('verified late funds persist blocked reconciliation and never silently become unpaid or retry-confirm',async()=>{
 const f=fixture();await f.bind();f.tick(now+900000);const receive=f.receive();
 assert.equal((await receive(proof())).reason,'hold_no_longer_valid');
 const row=f.state.docs[0];assert.equal(row.status,'held');assert.equal(row.nexg.paidMinor,undefined);
 assert.equal(row.nexg.stayPaymentReconciliation.state,'required');assert.equal(row.nexg.stayPaymentReconciliation.fundsObserved,true);
 assert.equal(row.nexg.stayPaymentReconciliation.amountMinor,20000);assert.equal(row.nexg.stayPaymentReconciliation.currency,'KES');
 const snapshot=JSON.stringify(row);await receive(proof());assert.equal(JSON.stringify(row),snapshot);
 assert.equal((await receive({...proof(),eventId:'new-event'})).reason,'unresolved_reconciliation');assert.equal(row.status,'held');
});
test('mismatched verified funds persist evidence, but unmatched attempt cannot poison a hold',async()=>{
 const f=fixture();await f.bind();f.tick(now+2000);const receive=f.receive();
 await receive({...proof(),amountMinor:19999});assert.equal(f.state.docs[0].nexg.stayPaymentReconciliation.amountMinor,19999);
 assert.equal((await receive({...proof(),eventId:'corrected-event'})).reason,'unresolved_reconciliation');
 const g=fixture();await g.bind();g.tick(now+2000);await g.receive()({...proof(),attemptId:'different-attempt'});
 assert.equal(g.state.docs[0].nexg.stayPaymentReconciliation,undefined);
});
