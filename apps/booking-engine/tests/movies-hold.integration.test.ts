import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {createPayload} from '../src/payload.js';
import {BookingEngine} from '../src/engine.js';
import {addOccurrence} from '../src/occurrences.js';
import {reviseMovieShowing} from '../src/movie-showings.js';
import type {Identity} from '../src/types.js';
import type {MovieHoldInput, MoviesOccurrence} from '../src/movies.js';
delete process.env.BOOKING_DATABASE_URL;delete process.env.BOOKING_DB_PUSH;
const pgTest = process.env.BOOKING_TEST_POSTGRES_URL ? new URL(process.env.BOOKING_TEST_POSTGRES_URL) : undefined;
if (pgTest && (pgTest.protocol !== 'postgres:' || pgTest.hostname !== '127.0.0.1' || pgTest.pathname !== '/nexg_movies_test' || pgTest.username !== 'nexg_fixture' || pgTest.search || pgTest.hash)) throw new Error('Movies PG tests require an isolated loopback fixture.');
Object.assign(process.env,{NODE_ENV:'test',PAYLOAD_FORCE_DRIZZLE_PUSH:'true'});
// Explicit synthetic trusted publication fixture. NOT a production publication writer.
test('internal exact-seat Movies command uses actual Payload and Reserve atomically',async(t)=>{
 let postgresUrl: string | undefined;
 if(pgTest){
  const {default:pg}=await import('pg');
  const name='nexg_movies_test_'+randomUUID().replaceAll('-','');
  const admin=new pg.Client({connectionString:pgTest.toString()});
  await admin.connect();try{await admin.query('CREATE DATABASE "'+name+'"');}finally{await admin.end();}
  const fixture=new URL(pgTest);fixture.pathname='/'+name;postgresUrl=fixture.toString();
  t.after(async()=>{const client=new pg.Client({connectionString:pgTest.toString()});await client.connect();try{await client.query('DROP DATABASE "'+name+'" WITH (FORCE)');}finally{await client.end();}});
 }
 const options={secret:'isolated-movie-hold-test-only-secret-123456789',cacheKey:randomUUID()};
 const payload=await createPayload({...options,...(postgresUrl?{postgresUrl,push:true}:{sqliteUrl:'file:'+path.join(process.cwd(),'movie-'+randomUUID()+'.db').replaceAll('\\','/')})});
 let peerPayload: typeof payload | undefined;
 let now=Date.parse('2030-01-01T00:00:00Z');const engine=new BookingEngine(payload,!postgresUrl,()=>now);
 const owner:Identity={businessId:randomUUID(),userId:randomUUID(),role:'owner',expiresAt:Date.now()+3600000};
 const customer={name:'Fixture customer',email:'fixture@example.test'};
 const docs=async(collection:string)=>(await payload.find({collection:collection as any,limit:1000,depth:0,overrideAccess:true})).docs as any[];
 const update=async(collection:string,id:any,data:any)=>payload.update({collection:collection as any,id,data,overrideAccess:true,context:{nexgSystem:true},depth:0});
 const counts=async()=>Object.fromEntries(await Promise.all(['reservations','booking-operations','booking-audit','booking-outbox'].map(async c=>[c,(await docs(c)).length])));
 try{
  if(postgresUrl) peerPayload=await createPayload({...options,cacheKey:randomUUID(),postgresUrl,push:false});
  const peer=peerPayload?new BookingEngine(peerPayload,false,()=>now):engine;
  await engine.configure(owner,{subcategoryId:'haircare',published:false},randomUUID());
  const seats: MoviesOccurrence['seats']=[];
  for(let i=1;i<=9;i++){const r:any=await engine.addResource(owner,{name:'Fixture seat A'+i,kind:'asset',quantity:1,schedule:{days:[0,1,2,3,4,5,6],start:'08:00',end:'20:00'}},randomUUID());seats.push({code:'A'+i,type:i===2?'vip':'standard',resourceId:r.id});}
  const offering:any=await engine.addOffering(owner,{name:'Fixture owned showing',model:'APPOINTMENT',durationMinutes:120,resourceIds:seats.map(s=>s.resourceId),priceMinor:10000,currency:'KES',intakeMode:'instant_after_requirements',active:true,bookingEnabled:true,leadTimeMinutes:0,horizonDays:3650,paymentPolicyId:'NO_PREPAYMENT_V1',changePolicyId:'CHANGE_BEFORE_START_V1',policyVersion:1},randomUUID());
  const business=(await docs('businesses'))[0],service=(await docs('services'))[0];
  const serviceNexg={...service.nexg,model:'SESSION_CAPACITY'};await update('services',service.id,{nexg:serviceNexg});
  const authority=['reservations','availability','resources','pricing'].map(data_class=>({data_class,authority:'NEXG_AUTHORITATIVE',owner_reference:'nexg-booking-engine',scope:{business_id:owner.businessId}}));
  const config={...business.configuration,categoryKey:'experiences',subcategoryId:'cinemas',published:true,canonicalAnswers:{Q_DATA_AUTHORITY:authority}};
  await update('businesses',business.id,{configuration:config});
  const metadata={contractVersion:1,merchantId:owner.businessId,filmId:randomUUID(),showingId:randomUUID(),screenId:randomUUID(),pricesMinor:{standard:10000,vip:15000},seats};
  const occurrence:any=await payload.create({collection:'booking-sessions',overrideAccess:true,context:{nexgSystem:true},data:{businessId:owner.businessId,sessionKey:randomUUID(),publicId:randomUUID(),capacity:9,resourceIds:seats.map(s=>s.resourceId),movies:metadata,published:true,version:1,locationId:'primary',offeringId:offering.id,startTime:'2030-01-02T12:00:00Z',endTime:'2030-01-02T14:00:00Z'}} as any);
  const intent=(seatIds:string[],extra:any={}):MovieHoldInput=>({showingId:metadata.showingId,screenId:metadata.screenId,occurrenceId:occurrence.publicId,offeringId:offering.id,seatIds,requestId:randomUUID(),expectedTotalMinor:seatIds.reduce((n,s)=>n+(s==='A2'?15000:10000),0),...extra});
  const hold=(i:MovieHoldInput,actor=owner)=>engine.createMovieHold(actor,i,customer);
  const code=(c:string)=>(e:any)=>e.code===c;
  let first:any;const original=intent(['A2','A1']);
  await t.test('general occurrence edits cannot move an exact-seat showing even before its first hold',async()=>{const before=(await docs('booking-sessions'))[0];await assert.rejects(()=>addOccurrence(engine,owner,offering.id,{occurrenceId:occurrence.publicId,expectedOccurrenceVersion:1,expectedVersion:serviceNexg.version??1,startTime:'2030-01-02T13:00:00Z',endTime:'2030-01-02T15:00:00Z',capacity:9,published:true,resourceIds:seats.map(s=>s.resourceId)},randomUUID()),code('movie_command_required'));assert.deepEqual((await docs('booking-sessions'))[0],before);});
  await t.test('no trusted contact, staff and invalid seat requests fail closed',async()=>{await assert.rejects(()=>engine.createMovieHold(owner,original),code('movie_customer_required'));await assert.rejects(()=>hold(original,{...owner,role:'staff'}),code('forbidden'));for(const seatIds of [[],['A1','A1'],[' '],Array(11).fill('A1')])await assert.rejects(()=>hold(intent(seatIds)),code('invalid_movie_intent'));});
  await t.test('owner category, specialty and publication are mandatory',async()=>{for(const change of [{categoryKey:undefined},{subcategoryId:'movies'},{published:false}]){await update('businesses',business.id,{configuration:{...config,...change}});await assert.rejects(()=>hold(original),code('movie_owner_required'));}await update('businesses',business.id,{configuration:config});});
  await t.test('missing, external and wrong-business authority are rejected',async()=>{for(const bindings of [[],authority.map(a=>({...a,authority:'EXTERNAL_AUTHORITATIVE'})),authority.map(a=>({...a,scope:{business_id:randomUUID()}}))]){await update('businesses',business.id,{configuration:{...config,canonicalAnswers:{Q_DATA_AUTHORITY:bindings}}});await assert.rejects(()=>hold(original),code('movie_authority_required'));}await update('businesses',business.id,{configuration:config});});
  await t.test('exact source scope, published layout and strictly positive prices are required',async()=>{await assert.rejects(()=>hold(intent(['A1'],{screenId:randomUUID()})),code('movie_publication_required'));await assert.rejects(()=>hold(intent(['A1'],{showingId:randomUUID()})),code('movie_publication_required'));for(const movies of [null,{...metadata,seats:[null]},{...metadata,pricesMinor:{standard:0,vip:15000}},{...metadata,merchantId:randomUUID()}]){await update('booking-sessions',occurrence.id,{movies});await assert.rejects(()=>hold(original),code('movie_publication_required'));}await update('booking-sessions',occurrence.id,{movies:metadata,published:false});await assert.rejects(()=>hold(original),code('movie_publication_required'));await update('booking-sessions',occurrence.id,{published:true});});
  await t.test('unknown seat and changed reviewed total are rejected',async()=>{await assert.rejects(()=>hold(intent(['Z9'])),code('movie_unknown_seat'));await assert.rejects(()=>hold(intent(['A1'],{expectedTotalMinor:1})),code('movie_price_changed'));});
  await t.test('exact pair creates real Reserve held items, five-minute expiry and allowlisted DTO',async()=>{first=await hold(original);assert.equal(first.status,'held');assert.deepEqual(first.seatIds,['A1','A2']);assert.equal(first.totalMinor,25000);assert.equal(first.expiresAt,new Date(now+300000).toISOString());const row=(await docs('reservations'))[0];assert.equal(row.items.length,1);assert.equal(row.guestCount,1);assert.equal(row.items[0].guestCount,1);assert.equal(row.endTime,'2030-01-02T14:00:00.000Z');for(const view of [first,engine.bookingView(row)]){assert.deepEqual(Object.keys(view).sort(),['id','status','showingId','screenId','filmId','occurrenceId','seatIds','quantity','totalMinor','currency','startTime','endTime','expiresAt','version'].sort());assert.ok(!JSON.stringify(view).includes(customer.email));}});
  await t.test('canonical seat-order replay returns original hold and changed details conflict',async()=>{const before=await counts();const replay=await hold({...original,seatIds:['A1','A2']});assert.deepEqual(replay,first);assert.deepEqual(await counts(),before);await assert.rejects(()=>hold({...original,showingId:randomUUID()}),code('idempotency_conflict'));await assert.rejects(()=>hold({...original,expectedTotalMinor:26000}),code('idempotency_conflict'));});
  const revision=(extra:Record<string,unknown>={})=>({occurrenceId:occurrence.publicId,showingId:metadata.showingId,screenId:metadata.screenId,expectedVersion:1,published:true,pricesMinor:{...metadata.pricesMinor},...extra});
  await t.test('hold and revision reject overlapping external authority despite native bindings',async()=>{
   const before=await counts(),row=(await docs('booking-sessions'))[0];
   for(const conflict of [{...authority[0],authority:'EXTERNAL_AUTHORITATIVE'},
    {...authority[3],authority:'EXTERNAL_AUTHORITATIVE',scope:{business_id:owner.businessId,session_id:occurrence.publicId}},
    {...authority[0],owner_reference:'another-engine'}]){
    await update('businesses',business.id,{configuration:{...config,canonicalAnswers:{Q_DATA_AUTHORITY:[...authority,conflict]}}});
    await assert.rejects(()=>hold(intent(['A9'])),code('movie_authority_required'));
    await assert.rejects(()=>reviseMovieShowing(engine,owner,revision(),randomUUID()),code('movie_authority_required'));
   }
   assert.deepEqual(await counts(),before);assert.deepEqual((await docs('booking-sessions'))[0],row);
   await update('businesses',business.id,{configuration:config});
  });
  await t.test('showing revisions reject destructive fields, untrusted roles, branches, identities and stale versions without writes',async()=>{
   const before=await counts(), row=(await docs('booking-sessions'))[0];
   for(const extra of [{filmId:randomUUID()},{startTime:'2030-01-03T12:00:00Z'},{seats:[]},{resourceIds:[]},{offeringId:randomUUID()}])
    await assert.rejects(()=>reviseMovieShowing(engine,owner,revision(extra) as any,randomUUID()),code('invalid_movie_revision'));
   for(const role of ['customer','staff'])await assert.rejects(()=>reviseMovieShowing(engine,{...owner,role} as Identity,revision(),randomUUID()),code('forbidden'));
   await assert.rejects(()=>reviseMovieShowing(engine,{...owner,branches:['west']},revision(),randomUUID()),code('forbidden'));
   await assert.rejects(()=>reviseMovieShowing(engine,owner,revision({screenId:randomUUID()}),randomUUID()),code('movie_publication_required'));
   await assert.rejects(()=>reviseMovieShowing(engine,owner,revision({expectedVersion:99}),randomUUID()),code('version_conflict'));
   await assert.rejects(()=>reviseMovieShowing(engine,owner,revision({pricesMinor:{standard:10000}}),randomUUID()),code('movie_publication_required'));
   assert.deepEqual(await counts(),before);assert.deepEqual((await docs('booking-sessions'))[0],row);
  });
  await t.test('repricing preserves accepted holds, rejects stale reviewed totals and replays only once',async()=>{
   const before=await docs('reservations'), key=randomUUID(), input=revision({pricesMinor:{standard:12000,vip:16000}});
   const revised=await reviseMovieShowing(engine,owner,input,key);assert.equal(revised.version,2);
   const after=await counts();assert.deepEqual(await reviseMovieShowing(engine,owner,input,key),revised);assert.deepEqual(await counts(),after);
   await assert.rejects(()=>reviseMovieShowing(engine,owner,{...input,published:false},key),code('idempotency_conflict'));
   assert.deepEqual(await docs('reservations'),before);assert.equal((await hold(original)).totalMinor,25000);
   await assert.rejects(()=>hold(intent(['A9'])),code('movie_price_changed'));
   await reviseMovieShowing(engine,owner,revision({expectedVersion:2}),randomUUID());
  });
  await t.test('closing sales shares the hold lock, preserves commitments and blocks new holds',async()=>{
   const before=await docs('reservations');
   const result=await Promise.allSettled([
    reviseMovieShowing(engine,owner,revision({expectedVersion:3,published:false}),randomUUID()),peer.createMovieHold(owner,intent(['A9']),customer)]);
   assert.equal(result[0].status,'fulfilled');
   // The lock serializes either ordering: a successful pre-close hold must be preserved.
   if(result[1].status==='fulfilled')assert.equal(result[1].value.status,'held');
   else assert.equal((result[1].reason as any).code,'movie_publication_required');
   for(const row of before)assert.deepEqual((await docs('reservations')).find(r=>r.id===row.id),row);
   await assert.rejects(()=>hold(intent(['A9'])),code('movie_publication_required'));
   await reviseMovieShowing(engine,owner,revision({expectedVersion:4}),randomUUID());
  });
  await t.test('overlapping pair rolls back all state; unrelated pair still succeeds',async()=>{const before=await counts();await assert.rejects(()=>hold(intent(['A2','A3'])));assert.deepEqual(await counts(),before);const separate:any=await hold(intent(['A3','A4']));assert.equal(separate.status,'held');});
  await t.test('racing exact pairs yield one winner and no partial loser claim',async()=>{const result=await Promise.allSettled([hold(intent(['A5','A6'])),hold(intent(['A6','A7']))]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);const free=result[0].status==='rejected'?'A5':'A7';assert.equal((await hold(intent([free]))).status,'held');});
  await t.test('generic create and lifecycle cannot bypass exact-seat semantics',async()=>{const generic={offeringId:offering.id,occurrenceId:occurrence.publicId,startTime:occurrence.startTime,endTime:occurrence.endTime,customer,hold:true};await assert.rejects(()=>engine.createBooking(owner,generic,randomUUID()),code('movie_command_required'));await update('businesses',business.id,{configuration:{...config,subcategoryId:'haircare'}});await assert.rejects(()=>engine.createBooking(owner,generic,randomUUID()),code('movie_command_required'));await update('businesses',business.id,{configuration:config});for(const action of ['confirm','cancel','reschedule','record_payment'])await assert.rejects(()=>engine.changeBooking(owner,first.id,action,{expectedVersion:1},randomUUID()),code('movie_command_required'));});
  await t.test('authorized non-primary branch works; another branch is denied',async()=>{const resources=await docs('resources');for(const r of resources)await update('resources',r.id,{nexg:{...r.nexg,locationId:'east'}});await update('services',service.id,{nexg:{...serviceNexg,locationId:'east'}});await update('booking-sessions',occurrence.id,{locationId:'east'});await assert.rejects(()=>hold(intent(['A8']),{...owner,branches:['west']}),code('forbidden'));const branch=await hold(intent(['A8']),{...owner,branches:['east']});assert.equal(branch.status,'held');for(const r of resources)await update('resources',r.id,{nexg:r.nexg});await update('services',service.id,{nexg:serviceNexg});await update('booking-sessions',occurrence.id,{locationId:'primary'});});
  await t.test('expiry replay does not allocate again; new request can reuse expired seats',async()=>{now+=360000;const before=(await docs('reservations')).length;const replay=await hold(original);assert.equal(replay.id,first.id);assert.equal(replay.status,'expired');assert.equal((await docs('reservations')).length,before);const fresh=await hold(intent(['A1','A2']));assert.notEqual(fresh.id,first.id);assert.equal(fresh.status,'held');});
  await t.test('hold clips to ten-minute cutoff; requests at cutoff fail',async()=>{now=Date.parse('2030-01-02T11:48:00Z');const clipped=await hold(intent(['A9']));assert.equal(clipped.expiresAt,'2030-01-02T11:50:00.000Z');now=Date.parse('2030-01-02T11:50:00Z');await assert.rejects(()=>hold(intent(['A9'])),code('movie_not_on_sale'));});
 }finally{try{await peerPayload?.destroy();}finally{await payload.destroy();}}
});
