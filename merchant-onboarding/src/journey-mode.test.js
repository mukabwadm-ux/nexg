import test from 'node:test';
import assert from 'node:assert/strict';
import {platformRegistrationHref,DEMO_REGISTRATION} from './journey-mode.js';

test('real entry uses a configured platform registration without copying URL data',()=>{
  assert.equal(platformRegistrationHref('https://nexg.example'),'https://nexg.example/merchants/apply');
  assert.equal(platformRegistrationHref('https://nexg.example?merchantId=private'),null);
  assert.equal(platformRegistrationHref('https://nexg.example/#private'),null);
});
test('entry rejects credential-bearing or unsafe destination configuration',()=>{
  for(const value of ['https://user:password@nexg.example','javascript:alert(1)','//evil.example','http://remote.example','https://nexg.example/other'])assert.equal(platformRegistrationHref(value),null);
});
test('local platform defaults are development only',()=>{
  assert.equal(platformRegistrationHref('',true),'http://127.0.0.1:3000/merchants/apply');
  assert.equal(platformRegistrationHref('',false),null);
  assert.equal(platformRegistrationHref('http://localhost:3000',false),null);
});
test('demo starts from synthetic entry data without identity or operation references',()=>{
  assert.equal(DEMO_REGISTRATION.business.name,'Demo business');
  assert.equal(DEMO_REGISTRATION.business.email,'demo@example.invalid');
  for(const key of ['merchantId','operationId','session','payout','documents'])assert.equal(key in DEMO_REGISTRATION,false);
});
