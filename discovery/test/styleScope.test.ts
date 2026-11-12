import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeSelector, scopeStyles } from '../src/styleScope';

test('every Discovery rule applies inside its root only', () => {
  assert.equal(scopeSelector('.discovery-header'), '#discovery-root .discovery-header');
  assert.equal(scopeSelector('button:focus-visible'), '#discovery-root button:focus-visible');
  assert.equal(scopeSelector('*'), '#discovery-root *');
  assert.equal(scopeSelector(' .rail a '), '#discovery-root .rail a', 'trimmed');
  assert.equal(scopeSelector(':is(.rail-heading,.store-row__header)+.rail'), '#discovery-root :is(.rail-heading,.store-row__header)+.rail');
  assert.equal(scopeSelector(':has(> .section-nav)'), '#discovery-root :has(> .section-nav)');
});

test(':root, body and html keep their meaning for the page Discovery is on', () => {
  assert.equal(scopeSelector(':root'), '#discovery-root', "Discovery's colours and tokens stay off the site's header");
  assert.equal(scopeSelector('body'), 'body:has(#discovery-root)');
  assert.equal(scopeSelector('html:has(.item-sheet[open])'), 'html:has(.item-sheet[open])', 'a rule for the document stays one');
  assert.equal(scopeSelector('html[data-store-docked] .discovery-header:focus-within'), 'html[data-store-docked] #discovery-root .discovery-header:focus-within');
  assert.equal(scopeSelector('#discovery-root :where(a)'), '#discovery-root :where(a)', 'a rule that names the root is left as written');
  assert.equal(scopeSelector('.htmlish'), '#discovery-root .htmlish');
});

test('the build plugin rewrites rules and leaves keyframe steps alone', () => {
  const plugin = scopeStyles();
  const rule = { selectors: ['a', 'b:hover'], parent: { type: 'root' } };
  plugin.Rule(rule);
  assert.deepEqual(rule.selectors, ['#discovery-root a', '#discovery-root b:hover']);
  const step = { selectors: ['from', '50%'], parent: { type: 'atrule', name: 'keyframes' } };
  plugin.Rule(step);
  assert.deepEqual(step.selectors, ['from', '50%']);
  const prefixed = { selectors: ['to'], parent: { type: 'atrule', name: '-webkit-keyframes' } };
  plugin.Rule(prefixed);
  assert.deepEqual(prefixed.selectors, ['to']);
  const scoped = { selectors: ['#discovery-root'], parent: { type: 'root' } };
  plugin.Rule(scoped);
  assert.deepEqual(scoped.selectors, ['#discovery-root'], 'a second pass over a rule changes nothing');
});
