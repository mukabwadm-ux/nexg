import test from 'node:test';
import assert from 'node:assert/strict';
import {createVpsStayAvailabilityReader} from '../src/stays/vpsAvailability.ts';
const time=Date.parse('2026-11-17T12:00:00Z');
const input={propertyId:'11111111-1111-4111-8111-111111111111',unitId:'22222222-2222-4222-8222-222222222222',checkIn:'2026-12-01',checkOut:'2026-12-03',adults:2,children:1};
const response=()=>({...input,offeringId:'33333333-3333-4333-8333-333333333333',nights:2,available:true,nightlyMinor:10000,totalMinor:20000,currency:'KES',observedAt:new Date(time).toISOString()});
const signal=()=>new AbortController().signal;
const reader=(read=async()=>response())=>createVpsStayAvailabilityReader({authority:'nexg-booking-engine',read},()=>time);
test('no configured VPS port remains unavailable; never falls back',async()=>{
 const r=createVpsStayAvailabilityReader(); assert.equal(r.capabilities.enabled,false);
 await assert.rejects(r.read(input,signal()),/UNAVAILABLE/);
 let called=false;
 const wrong=createVpsStayAvailabilityReader({authority:'supabase',read:async()=>{called=true;return response();}});
 await assert.rejects(wrong.read(input,signal()),/UNAVAILABLE/);assert.equal(called,false);
});
test('fresh exact unit result is advisory, not a hold or booking',async()=>{
 const r=reader(async()=>({...response(),confirmed:true}));const result=await r.read(input,signal());
 assert.equal(result.available,true);assert.equal(result.held,false);assert.equal(result.booking,'not_checked');
 assert.equal(result.authority,'nexg-booking-engine');assert.equal('confirmed' in result,false);
 assert.equal(r.capabilities.enumeration,false);
});
test('unavailable is a verified negative, not source failure or an available room',async()=>{
 assert.equal((await reader(async()=>({...response(),available:false})).read(input,signal())).available,false);
});
test('identity, interval, party and offering mismatches fail closed',async()=>{
 for(const patch of [{unitId:input.propertyId},{propertyId:input.unitId},{checkOut:'2026-12-04'},{adults:1},{children:0},{offeringId:'missing'},{nights:3}]){
  await assert.rejects(reader(async()=>({...response(),...patch})).read(input,signal()),/UNVERIFIED/);
 }
});
test('stale/future/nonfinite observations and inconsistent money are rejected',async()=>{
 for(const patch of [{observedAt:new Date(time-60001).toISOString()},{observedAt:new Date(time+5001).toISOString()},{observedAt:'bad'},{totalMinor:1},{nightlyMinor:-1},{currency:'USD'},{available:'yes'}]){
  await assert.rejects(reader(async()=>({...response(),...patch})).read(input,signal()),/UNVERIFIED/);
 }
});
test('invalid dates, excess party, unknown input fields rejected before source read',async()=>{
 let calls=0;const r=reader(async()=>{calls++;return response();});
 for(const patch of [{checkIn:'2026-02-30'},{checkOut:input.checkIn},{adults:0},{children:40},{rooms:2},{unitId:''}]){
  await assert.rejects(r.read({...input,...patch},signal()),/INVALID/);
 }assert.equal(calls,0);
});
test('abort before and during read cannot yield availability',async()=>{
 let calls=0;const c=new AbortController();c.abort();
 await assert.rejects(reader(async()=>{calls++;return response();}).read(input,c.signal),/ABORTED/);assert.equal(calls,0);
 const d=new AbortController();
 await assert.rejects(reader(async()=>{d.abort();return response();}).read(input,d.signal),/ABORTED/);
});
test('snapshots caller request; source errors never turn into an empty result',async()=>{
 const mutable={...input};const r=reader(async()=>{mutable.adults=8;return response();});
 assert.equal((await r.read(mutable,signal())).adults,2);
 await assert.rejects(reader(async()=>{throw new Error('core unavailable');}).read(input,signal()),/core unavailable/);
});
