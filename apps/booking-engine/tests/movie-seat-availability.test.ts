import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectMovieSeatAvailability as project, readMovieSeatAvailability } from '../src/movie-seat-availability.js';
const now = Date.parse('2030-01-01T00:00:00Z');
const identity = { businessId:'merchant', userId:'viewer', role:'customer', expiresAt:now+999999 };
const query = { occurrenceId:'occurrence', showingId:'showing', screenId:'screen', offeringId:'offering' };
function fixture(): any {
 const seats = ['A1','A2','A3'].map((code,i)=>({code,resourceId:'seat-'+i,type:'standard'}));
 return {
  configuration:{categoryKey:'experiences',subcategoryId:'cinemas',published:true,canonicalAnswers:{Q_DATA_AUTHORITY:
   ['reservations','availability','resources','pricing'].map(data_class=>({data_class,authority:'NEXG_AUTHORITATIVE',owner_reference:'nexg-booking-engine',scope:{business_id:'merchant'}}))}},
  occurrence:{businessId:'merchant',publicId:'occurrence',offeringId:'offering',published:true,locationId:'primary',version:2,
   startTime:'2030-01-02T12:00:00Z',endTime:'2030-01-02T14:00:00Z',resourceIds:seats.map(s=>s.resourceId),
   movies:{contractVersion:1,merchantId:'merchant',showingId:'showing',screenId:'screen',filmId:'film',pricesMinor:{standard:10000},seats}},
  offering:{businessId:'merchant',publicId:'offering',active:true,nexg:{bookingEnabled:true,model:'SESSION_CAPACITY',locationId:'primary',resourceIds:seats.map(s=>s.resourceId)}},
  resources:seats.map((s,i)=>({businessId:'merchant',id:i+1,publicId:s.resourceId,active:true,quantity:1,capacityMode:'per-reservation',resourceType:'asset',nexg:{locationId:'primary'}})),reservations:[]
 };
}
const reservation = (status='held', extras:any={})=>({businessId:'merchant',resource:1,items:[{resource:2}],status,startTime:'2030-01-02T12:00:00Z',endTime:'2030-01-02T14:00:00Z',nexg:{expiresAt:new Date(now+300000).toISOString()},guest:{email:'secret@example.test'},payment:{secret:'private'},...extras});
test('projects actual Reserve parent/item occupancy without geometry or private fields',()=>{
 const s=fixture();s.reservations=[reservation()];const before=JSON.stringify(s);const view=project(identity,query,s,now);
 assert.deepEqual(view.seats.map(s=>s.status),['unavailable','unavailable','available']);
 assert.deepEqual(Object.keys(view.seats[0]).sort(),['resourceId','seatId','status','type']);
 assert.equal(view.version,2);assert.equal(JSON.stringify(s),before);assert.ok(!JSON.stringify(view).includes('secret'));assert.ok(!JSON.stringify(view).includes('payment'));
});
test('expired holds release exactly at expiry; confirmed remains occupied',()=>{
 const s=fixture();s.reservations=[reservation()];assert.ok(project(identity,query,s,now+300000).seats.every(s=>s.status==='available'));
 s.reservations=[reservation('confirmed')];assert.equal(project(identity,query,s,now+300000).seats[0].status,'unavailable');
});
test('cancelled, expired and non-overlapping records do not block',()=>{
 for(const r of [reservation('cancelled'),reservation('expired'),reservation('confirmed',{endTime:'2030-01-02T12:00:00Z',startTime:'2030-01-02T10:00:00Z'})]){
  const s=fixture();s.reservations=[r];assert.ok(project(identity,query,s,now).seats.every(s=>s.status==='available'));
 }
});
test('closure, wrong tenant/scope, external ownership and incomplete inventory fail closed',()=>{
 const changes=[(s:any)=>s.occurrence.published=false,(s:any)=>s.configuration.published=false,(s:any)=>s.occurrence.movies.screenId='other',
  (s:any)=>s.offering.businessId='other',(s:any)=>s.resources.pop(),(s:any)=>s.occurrence.resourceIds.pop(),
  (s:any)=>s.configuration.canonicalAnswers.Q_DATA_AUTHORITY[0].authority='EXTERNAL_AUTHORITATIVE',
  (s:any)=>s.configuration.canonicalAnswers.Q_DATA_AUTHORITY.push({...s.configuration.canonicalAnswers.Q_DATA_AUTHORITY[0],authority:'EXTERNAL_AUTHORITATIVE'}),
  (s:any)=>s.occurrence.movies.seats[1].code='A1',(s:any)=>s.reservations=[reservation('held',{nexg:{}})],
  (s:any)=>s.reservations=[reservation('confirmed',{businessId:'other'})]];
 for(const change of changes){const s=fixture();change(s);assert.throws(()=>project(identity,query,s,now),{code:'movie_availability_unavailable'});}
 assert.throws(()=>project(identity,query,fixture(),Date.parse('2030-01-02T11:50:00Z')));
 assert.throws(()=>project({...identity,branches:['other']},query,fixture(),now));
});
test('populated relationships and non-movie overlaps still block; forged seat metadata cannot free seats',()=>{
 const s=fixture();s.reservations=[reservation('confirmed',{resource:{id:1},items:[{resource:{id:3}}],nexg:{movieHold:{seatIds:[]}}})];
 assert.deepEqual(project(identity,query,s,now).seats.map(s=>s.status),['unavailable','available','unavailable']);
});
test('read helper refuses absent/non-coherent transaction before reading',async()=>{
 await assert.rejects(()=>readMovieSeatAvailability({} as any,identity,query,{request:{},coherentSnapshot:true}));
 await assert.rejects(()=>readMovieSeatAvailability({} as any,identity,query,{request:{transactionID:1},coherentSnapshot:false} as any));
});

test('coherent reader never overlaps queries on its transaction client',async()=>{
 const s=fixture();for(const r of s.resources)r.nexg.schedule={};
 let active=0, calls=0;
 const read=async(value:any)=>{assert.equal(active,0);active++;calls++;await new Promise(resolve=>setTimeout(resolve,0));active--;return value;};
 const rows:Record<string,any>={businesses:[{configuration:s.configuration}],'booking-sessions':[s.occurrence],resources:s.resources,reservations:s.reservations};
 const engine={managementContext:()=>({request:()=>({transactionID:1}),all:(name:string)=>read(rows[name]),own:()=>read(s.offering),scheduleAllows:()=>true,now:()=>now})};
 const view=await readMovieSeatAvailability(engine as any,identity,query,{request:{transactionID:1},coherentSnapshot:true});
 assert.equal(calls,5);assert.ok(view.seats.every(seat=>seat.status==='available'));
});
