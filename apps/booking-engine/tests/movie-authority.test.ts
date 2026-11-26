import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hasNativeMovieAuthority as native} from '../src/movie-authority.js';
const scope={businessId:'business',offeringId:'offering',occurrenceId:'showing',locationId:'branch'};
const required=['reservations','availability','resources','pricing'];
const binding=(data_class:string,extra:Record<string,any>={})=>({data_class,authority:'NEXG_AUTHORITATIVE',owner_reference:'nexg-booking-engine',scope:{business_id:scope.businessId},...extra});
const config=(bindings:any[])=>({categoryKey:'experiences',subcategoryId:'cinemas',canonicalAnswers:{Q_DATA_AUTHORITY:bindings}});
const baseline=()=>required.map(c=>binding(c));
test('all four native bindings are required and correct duplicates are harmless',()=>{
 assert.equal(native(config(baseline()),scope),true);
 assert.equal(native(config([...baseline(),binding('pricing')]),scope),true);
 for(const missing of required)assert.equal(native(config(baseline().filter(b=>b.data_class!==missing)),scope),false);
});
test('applicable mixed/external/unknown authority and wrong native owner always reject',()=>{
 for(const dataClass of required)for(const extra of [{authority:'EXTERNAL_AUTHORITATIVE'},{authority:'MIXED'},{authority:'UNKNOWN'},{owner_reference:'another-engine'}]){
  assert.equal(native(config([...baseline(),binding(dataClass,extra)]),scope),false);
  assert.equal(native(config([binding(dataClass,extra),...baseline()]),scope),false);
 }
});
test('matching narrow conflicts reject but explicitly disjoint scopes do not',()=>{
 const keys={activity_id:'cinemas',offering_id:scope.offeringId,session_id:scope.occurrenceId,location_id:scope.locationId};
 for(const [key,value] of Object.entries(keys)){
  assert.equal(native(config([...baseline(),binding('pricing',{authority:'EXTERNAL_AUTHORITATIVE',scope:{business_id:scope.businessId,[key]:value}})]),scope),false);
  assert.equal(native(config([...baseline(),binding('pricing',{authority:'EXTERNAL_AUTHORITATIVE',scope:{business_id:scope.businessId,[key]:'other'}})]),scope),true);
 }
 assert.equal(native(config([...baseline(),binding('pricing',{authority:'EXTERNAL_AUTHORITATIVE',scope:{business_id:'other'}})]),scope),true);
});
test('unknown applicable scope keys cannot silently weaken ownership',()=>{
 assert.equal(native(config([...baseline(),binding('pricing',{scope:{business_id:scope.businessId,unknown_dimension:'x'}})]),scope),false);
});
