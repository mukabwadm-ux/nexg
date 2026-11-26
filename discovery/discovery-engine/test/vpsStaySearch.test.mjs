import test from 'node:test';
import assert from 'node:assert/strict';
import {createVpsStaySearch} from '../src/stays/vpsSearch.ts';
import {createVpsStayAvailabilityReader} from '../src/stays/vpsAvailability.ts';
const id=n=>String(n).padStart(8,'0')+'-1111-4111-8111-111111111111';
const now=Date.parse('2026-11-17T12:00:00Z');
const query={scopeKey:'city=nairobi;amenity=wifi',checkIn:'2026-12-01',checkOut:'2026-12-03',adults:2,children:0};
const bindings=[{propertyId:id(1),unitId:id(2),offeringId:id(3)},{propertyId:id(1),unitId:id(4),offeringId:id(5)}];
const signal=()=>new AbortController().signal;
function setup({units=bindings,complete=true,echo=query,read,enumerate}={}){
 const calls=[];
 const availability=createVpsStayAvailabilityReader({authority:'nexg-booking-engine',read:async input=>{
  calls.push(input);
  return read?read(input):{...input,offeringId:bindings.find(x=>x.unitId===input.unitId)?.offeringId,nights:2,available:input.unitId===id(2),nightlyMinor:100,totalMinor:200,currency:'KES',observedAt:new Date(now).toISOString()};
 }},()=>now);
 const port={authority:'nexg-booking-engine',withSnapshot:async run=>run({authority:'nexg-booking-engine',availability,
  enumerate:enumerate??(async()=>({request:echo,complete,units}))})};
 return {port,calls};
}
test('no complete trusted runtime source explicitly unavailable',async()=>{
 assert.deepEqual(await createVpsStaySearch()(query,signal()),{status:'unavailable',complete:false,units:[],reason:'trusted_complete_source_missing'});
});
test('complete scope checks every binding, returns available units only and no coordinates',async()=>{
 const {port,calls}=setup();const r=await createVpsStaySearch(port,200,()=>now)(query,signal());
 assert.equal(r.complete,true);assert.equal(r.checkedUnits,2);assert.equal(r.matchedUnits,1);assert.equal(calls.length,2);
 assert.equal(r.units[0].unitId,id(2));assert.equal(r.held,false);assert.equal(r.coordinates,'not_supplied');
 assert.equal('latitude' in r.units[0],false);
});
test('incomplete and over-limit sets yield no partial results or availability calls',async()=>{
 for(const params of [{complete:false},{units:[...bindings,{propertyId:id(6),unitId:id(7),offeringId:id(8)}]}]){
  const {port,calls}=setup(params);const r=await createVpsStaySearch(port,2,()=>now)(query,signal());
  assert.equal(r.status,'incomplete');assert.equal(r.complete,false);assert.deepEqual(r.units,[]);assert.equal(calls.length,0);
 }
});
test('duplicate/cross-binding or mismatched scope rejected before reads',async()=>{
 for(const params of [{units:[bindings[0],bindings[0]]},{units:[{...bindings[0],offeringId:'bad'}]},{echo:{...query,scopeKey:'other'}}]){
  const {port,calls}=setup(params);await assert.rejects(createVpsStaySearch(port,200,()=>now)(query,signal()),/UNVERIFIED/);assert.equal(calls.length,0);
 }
});
test('changed offering or reader failure never returns an earlier partial result',async()=>{
 for(const read of [async input=>({...input,offeringId:id(99),nights:2,available:true,nightlyMinor:100,totalMinor:200,currency:'KES',observedAt:new Date(now).toISOString()}),async()=>{throw new Error('source down');}]){
  await assert.rejects(createVpsStaySearch(setup({read}).port,200,()=>now)(query,signal()),/CHANGED|source down/);
 }
});
test('complete empty source is honest zero, distinct from unavailable/incomplete',async()=>{
 const {port,calls}=setup({units:[]});const r=await createVpsStaySearch(port,200,()=>now)(query,signal());
 assert.equal(r.status,'ok');assert.equal(r.complete,true);assert.equal(r.matchedUnits,0);assert.equal(calls.length,0);
});
test('aborted scope never reads or returns candidates',async()=>{
 const c=new AbortController();const {port,calls}=setup({enumerate:async()=>{c.abort();return {request:query,complete:true,units:bindings};}});
 await assert.rejects(createVpsStaySearch(port,200,()=>now)(query,c.signal),/ABORTED/);assert.equal(calls.length,0);
});
test('invalid search and unsafe bounds fail closed',async()=>{
 assert.throws(()=>createVpsStaySearch(undefined,1001),/BOUND/);
 for(const patch of [{checkIn:'2026-02-30'},{children:-1},{adults:41},{scopeKey:''},{checkOut:query.checkIn}]){
  await assert.rejects(createVpsStaySearch()({...query,...patch},signal()),/INVALID/);
 }
});

test('units aging out during composition invalidate the entire result',async()=>{
 const {port}=setup();
 await assert.rejects(createVpsStaySearch(port,200,()=>now+60001)(query,signal()),/STALE_STAY_SEARCH/);
});
