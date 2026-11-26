import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertStayPilotEnabled} from '../src/stay-pilot.js';
test('production and development cannot activate room inventory even with a fixture marker',()=>{
 for(const environment of ['production','development',undefined])for(const pilotState of [undefined,'disabled','enabled','synthetic_fixture_enabled'])
  assert.throws(()=>assertStayPilotEnabled({pilotState},environment??'unset'),{code:'stay_pilot_disabled'});
});
test('test environment also stays closed unless explicit synthetic fixture state is present',()=>{
 for(const pilotState of [undefined,'disabled','enabled'])assert.throws(()=>assertStayPilotEnabled({pilotState},'test'),{code:'stay_pilot_disabled'});
 assert.doesNotThrow(()=>assertStayPilotEnabled({pilotState:'synthetic_fixture_enabled'},'test'));
});
