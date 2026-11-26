import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {createPayload} from '../src/payload.js';
import {quoteStay,createStayHold,readStayHold,stayHoldView,assertStayHoldReady} from '../src/stays.js';
import {setupStayFixture} from './stay-fixture.js';
delete process.env.BOOKING_DATABASE_URL;delete process.env.BOOKING_DB_PUSH;
Object.assign(process.env,{NODE_ENV:'test',PAYLOAD_FORCE_DRIZZLE_PUSH:'true'});
test('native Stay core owns real room nights, reviewed price and replay',async t=>{
 const payload=await createPayload({sqliteUrl:'file:'+path.join(process.cwd(),'stay-'+randomUUID()+'.db').replaceAll('\\','/'),secret:'isolated-stay-core-only-secret-123456789',cacheKey:randomUUID()});
 let now=Date.parse('2030-01-01T00:00:00Z');
 try{
 const f=await setupStayFixture(payload,true,()=>now),{engine,owner,guest,customer,docs,update,input}=f;
 const quote=(extra={})=>quoteStay(engine,guest,{...input,...extra},randomUUID());
 const intent=(q:any)=>({quoteId:q.quoteId,requestId:q.quoteId,expectedTotalMinor:q.totalMinor});
 const code=(c:string)=>(e:any)=>e.code===c;
 let first:any,q:any;
 await t.test('Nairobi dates and room-only nightly price are persisted, strict input and actor scope fail closed',async()=>{
  q=await quote();assert.equal(q.nights,2);assert.equal(q.totalMinor,20000);assert.equal(q.expiresAt,'2030-01-01T00:05:00.000Z');
  for(const extra of [{checkIn:'2030-02-30'},{children:-1},{adults:8},{checkOut:'2030-01-02'}])await assert.rejects(()=>quote(extra));
  await assert.rejects(()=>createStayHold(engine,{...guest,userId:randomUUID()},intent(q),customer),code('stay_quote_required'));
  await assert.rejects(()=>createStayHold(engine,guest,intent(q)),code('stay_customer_required'));
 });
 await t.test('mixed authority and changed reviewed price reject without creating a reservation',async()=>{
  await update('businesses',f.business.id,{configuration:{...f.config,canonicalAnswers:{Q_DATA_AUTHORITY:[...f.authority,{...f.authority[0],authority:'EXTERNAL_AUTHORITATIVE'}]}}});
  await assert.rejects(()=>createStayHold(engine,guest,intent(q),customer),code('stay_authority_required'));
  await update('businesses',f.business.id,{configuration:f.config});
  await assert.rejects(()=>createStayHold(engine,guest,{...intent(q),expectedTotalMinor:1},customer),code('stay_price_changed'));
  assert.equal((await docs('reservations')).length,0);
 });
 await t.test('concurrent quotes for same room lead to exactly one real held reservation',async()=>{
  const other=await quote();const race=await Promise.allSettled([createStayHold(engine,guest,intent(q),customer),createStayHold(engine,guest,intent(other),customer)]);
  assert.equal(race.filter(r=>r.status==='fulfilled').length,1);first=(race.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value;
  assert.equal(first.startTime,'2030-01-02T12:00:00.000Z');assert.equal(first.endTime,'2030-01-04T07:00:00.000Z');assert.equal(first.expiresAt,'2030-01-01T00:15:00.000Z');assert.equal(first.paymentStatus,'unpaid');
  assert.equal((await docs('reservations')).length,1);assert.ok(!JSON.stringify(first).includes(customer.email));
 });
 await t.test('idempotent replay and private status never allocate again; generic bypass fails',async()=>{
  const before=(await docs('reservations')).length;const replay=await createStayHold(engine,guest,{quoteId:first.quoteId,requestId:first.quoteId,expectedTotalMinor:first.totalMinor},customer);assert.deepEqual(replay,first);
  assert.deepEqual(await readStayHold(engine,guest,first.quoteId),first);
  await assert.rejects(()=>readStayHold(engine,{...guest,userId:randomUUID()},first.id),code('not_found'));
  await assert.rejects(()=>engine.changeBooking(owner,first.id,'confirm',{expectedVersion:1},randomUUID()),code('stay_command_required'));
  await assert.rejects(()=>engine.createBooking(owner,{offeringId:f.offering.id,startTime:first.startTime,endTime:first.endTime,customer,hold:true},randomUUID()),code('stay_command_required'));
  assert.equal((await docs('reservations')).length,before);
 });
 await t.test('adjacent departure/check-in nights do not overlap; expired holds release but replay stays expired',async()=>{
  const adjacent=await quote({checkIn:'2030-01-04',checkOut:'2030-01-05'});assert.equal(adjacent.nights,1);
  now+=900000;const replay=await createStayHold(engine,guest,{quoteId:first.quoteId,requestId:first.quoteId,expectedTotalMinor:first.totalMinor},customer);assert.equal(replay.status,'expired');
  const fresh=await quote();const held=await createStayHold(engine,guest,intent(fresh),customer);assert.notEqual(held.id,first.id);assert.equal(held.status,'held');
  const row=(await docs('reservations')).find(r=>r.publicId===held.id)!;
  assert.equal(stayHoldView({...row,status:'confirmed'},now).paymentStatus,'unpaid');
  await assertStayHoldReady(engine,owner,row,engine.managementContext().request(owner));
 });
 }finally{await payload.destroy();}
});
