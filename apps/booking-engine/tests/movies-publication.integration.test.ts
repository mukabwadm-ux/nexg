import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {createPayload} from '../src/payload.js';
import {BookingEngine} from '../src/engine.js';
import {publishMovieShowing,reviseMovieShowing,type MovieShowingPublication} from '../src/movie-showings.js';
import type {Identity} from '../src/types.js';

delete process.env.BOOKING_DATABASE_URL;delete process.env.BOOKING_TEST_POSTGRES_URL;delete process.env.BOOKING_DB_PUSH;
Object.assign(process.env,{NODE_ENV:'test',PAYLOAD_FORCE_DRIZZLE_PUSH:'true'});
test('trusted first cinema publication is closed, immutable, scoped and serialized',async t=>{
 const payload=await createPayload({sqliteUrl:'file:'+path.join(process.cwd(),'movie-publication-'+randomUUID()+'.db').replaceAll('\\','/'),secret:'isolated-movie-publication-only-secret-123456789',cacheKey:randomUUID()});
 const now=Date.parse('2030-01-01T00:00:00Z'), engine=new BookingEngine(payload,true,()=>now);
 const owner:Identity={businessId:randomUUID(),userId:randomUUID(),role:'owner',expiresAt:Date.now()+3600000};
 const docs=async(collection:string)=>(await payload.find({collection:collection as any,limit:1000,depth:0,overrideAccess:true})).docs as any[];
 const update=async(collection:string,id:any,data:any)=>payload.update({collection:collection as any,id,data,overrideAccess:true,context:{nexgSystem:true},depth:0});
 const code=(value:string)=>(e:any)=>e.code===value;
 try{
  await engine.configure(owner,{subcategoryId:'haircare',published:false},randomUUID());
  const seats:MovieShowingPublication['seats']=[];
  for(let i=1;i<=2;i++){const r:any=await engine.addResource(owner,{name:'Publication seat A'+i,kind:'asset',quantity:1,schedule:{days:[0,1,2,3,4,5,6],start:'08:00',end:'20:00'}},randomUUID());seats.push({code:'A'+i,type:'standard',resourceId:r.id});}
  const offering:any=await engine.addOffering(owner,{name:'Publication fixture',model:'APPOINTMENT',durationMinutes:120,resourceIds:seats.map(s=>s.resourceId),priceMinor:10000,currency:'KES',intakeMode:'instant_after_requirements',active:true,bookingEnabled:true,leadTimeMinutes:0,horizonDays:3650,paymentPolicyId:'NO_PREPAYMENT_V1',changePolicyId:'CHANGE_BEFORE_START_V1',policyVersion:1},randomUUID());
  const business=(await docs('businesses'))[0], service=(await docs('services'))[0];
  const serviceNexg={...service.nexg,model:'SESSION_CAPACITY'};await update('services',service.id,{nexg:serviceNexg});
  const authority=['reservations','availability','resources','pricing'].map(data_class=>({data_class,authority:'NEXG_AUTHORITATIVE',owner_reference:'nexg-booking-engine',scope:{business_id:owner.businessId}}));
  const config={...business.configuration,categoryKey:'experiences',subcategoryId:'cinemas',published:true,canonicalAnswers:{Q_DATA_AUTHORITY:authority}};
  await update('businesses',business.id,{configuration:config});
  const input:MovieShowingPublication={occurrenceId:randomUUID(),offeringId:offering.id,expectedOfferingVersion:serviceNexg.version??1,showingId:randomUUID(),screenId:randomUUID(),filmId:randomUUID(),startTime:'2030-01-02T12:00:00Z',endTime:'2030-01-02T14:00:00Z',seats,pricesMinor:{standard:10000}};
  const publish=(value=input,actor=owner,key=randomUUID())=>publishMovieShowing(engine,actor,value,key);
  await t.test('first publication rejects applicable mixed native/external ownership atomically',async()=>{
   const before=(await docs('booking-operations')).length;
   await update('businesses',business.id,{configuration:{...config,canonicalAnswers:{Q_DATA_AUTHORITY:[...authority,{...authority[0],authority:'EXTERNAL_AUTHORITATIVE'}]}}});
   await assert.rejects(()=>publish(),code('movie_authority_required'));
   assert.equal((await docs('booking-sessions')).length,0);assert.equal((await docs('booking-operations')).length,before);
   await update('businesses',business.id,{configuration:config});
  });
  await t.test('untrusted scope, malformed inventory, stale version and external authority reject without publication',async()=>{
   await assert.rejects(()=>publish(input,{...owner,role:'customer'}),code('forbidden'));
   await assert.rejects(()=>publish(input,{...owner,branches:['west']}),code('forbidden'));
   await assert.rejects(()=>publish({...input,expectedOfferingVersion:999}),code('version_conflict'));
   for(const change of [{seats:[seats[0]!,seats[0]!]},{pricesMinor:{standard:0}},{published:true},{filmId:'invented'}])
    await assert.rejects(()=>publish({...input,...change} as any),code('invalid_movie_publication'));
   await update('businesses',business.id,{configuration:{...config,canonicalAnswers:{Q_DATA_AUTHORITY:[]}}});
   await assert.rejects(()=>publish(),code('movie_authority_required'));
   await update('businesses',business.id,{configuration:config});
   assert.equal((await docs('booking-sessions')).length,0);
  });
  await t.test('resource activity and exact window/schedule are required',async()=>{
   const r=(await docs('resources'))[0];await update('resources',r.id,{active:false});
   await assert.rejects(()=>publish(),code('movie_resource_required'));await update('resources',r.id,{active:true});
   await assert.rejects(()=>publish({...input,endTime:'2030-01-02T15:00:00Z'}),code('movie_publication_required'));
   await assert.rejects(()=>publish({...input,startTime:'2030-01-02T00:00:00Z',endTime:'2030-01-02T02:00:00Z'}),code('movie_resource_required'));
  });
  await t.test('first publication is closed, exact, idempotent and creates no reservations',async()=>{
   const key=randomUUID(), result=await publish(input,owner,key);assert.equal(result.published,false);assert.equal(result.version,1);
   assert.deepEqual(await publish({...input,seats:[...seats].reverse()},owner,key),result);
   await assert.rejects(()=>publish({...input,filmId:randomUUID()},owner,key),code('idempotency_conflict'));
   const row=(await docs('booking-sessions'))[0];assert.deepEqual(row.movies.seats,seats);assert.equal(row.movies.filmId,input.filmId);assert.equal(row.startTime,'2030-01-02T12:00:00.000Z');assert.equal(row.capacity,2);
   assert.equal((await docs('reservations')).length,0);assert.equal((await docs('booking-sessions')).length,1);
  });
  await t.test('duplicate identities, overlapping closed showings and screen remapping are refused',async()=>{
   await assert.rejects(()=>publish(),code('movie_duplicate_showing'));
   await assert.rejects(()=>publish({...input,occurrenceId:randomUUID(),showingId:randomUUID()}),code('movie_showing_overlap'));
   await assert.rejects(()=>publish({...input,occurrenceId:randomUUID(),showingId:randomUUID(),startTime:'2030-01-03T12:00:00Z',endTime:'2030-01-03T14:00:00Z',seats:[{...seats[0]!,code:'B1'},seats[1]!]}),code('movie_inventory_required'));
  });
  await t.test('tested revision opens publication and real exact-seat hold works',async()=>{
   const intent={showingId:input.showingId,screenId:input.screenId,occurrenceId:input.occurrenceId,offeringId:input.offeringId,seatIds:['A1'],requestId:randomUUID(),expectedTotalMinor:10000}, customer={name:'Publication fixture',email:'publication@example.test'};
   await assert.rejects(()=>engine.createMovieHold(owner,intent,customer),code('movie_publication_required'));
   await reviseMovieShowing(engine,owner,{occurrenceId:input.occurrenceId,showingId:input.showingId,screenId:input.screenId,expectedVersion:1,published:true,pricesMinor:input.pricesMinor},randomUUID());
   const held=await engine.createMovieHold(owner,intent,customer);assert.equal(held.status,'held');assert.equal(held.filmId,input.filmId);assert.equal(held.totalMinor,10000);
  });
  await t.test('competing first publications serialize to exactly one inventory record',async()=>{
   const next={...input,startTime:'2030-01-03T12:00:00Z',endTime:'2030-01-03T14:00:00Z'};
   const result=await Promise.allSettled([publish({...next,occurrenceId:randomUUID(),showingId:randomUUID()}),publish({...next,occurrenceId:randomUUID(),showingId:randomUUID()})]);
   assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);assert.equal((await docs('booking-sessions')).length,2);
  });
 }finally{await payload.destroy();}
});
