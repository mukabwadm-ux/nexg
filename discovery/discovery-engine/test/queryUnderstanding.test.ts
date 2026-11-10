import test from 'node:test';
import assert from 'node:assert/strict';
import { understandQuery, type QueryRules } from '../engines/query-understanding/src/index.js';
import { lexicalMatch } from '../engines/search-retrieval/src/lexical.js';
import { release } from './helpers.js';
import { merchantRequest } from './readControls.js';
import { ContractError } from '../src/contracts/index.js';

test('normalization preserves models, units, Unicode, ordered phrases and negative tokens', () => {
  const request = { ...merchantRequest(), query: '  Canon   R50 -accessory ' };
  const plan = understandQuery(request, release)!;
  assert.equal(plan.normalized, 'canon r50 -accessory');
  assert.deepEqual(lexicalMatch(plan, 'Canon R50', []), { tier: 0, nameMatches: 2 });
  assert.equal(lexicalMatch(plan, 'Canon R5', []), undefined);
  assert.equal(lexicalMatch(plan, 'Canon R50 accessory', []), undefined);
  const phrase = understandQuery({ ...request, query: '"café control"' }, release)!;
  assert.deepEqual(lexicalMatch(phrase, 'Cafe\u0301 control', []), { tier: 0, nameMatches: 1 });
  assert.equal(lexicalMatch(phrase, 'Control café', []), undefined);
  assert.deepEqual(understandQuery({ ...request, query: 'milk 1 litre' }, release)!.issues[0],
    { code: 'unsupported', key: 'unit_or_variant_facts_required', paths: ['/query'] });
});

test('malformed queries never become wildcard/broader search; no-query stays browse', () => {
  assert.equal(understandQuery(merchantRequest(), release), undefined);
  for (const query of [' ', '*', '-control', '"control', '"control"annex', 'control\u200b', 'control\nannex', 'a | b', 'x '.repeat(65).trim()]) {
    assert.throws(() => understandQuery({ ...merchantRequest(), query }, release), error => error instanceof ContractError && error.code === 'INVALID_REQUEST', query);
  }
  const plan = understandQuery({ ...merchantRequest(), query: 'control name' }, release)!;
  assert.deepEqual(lexicalMatch(plan, 'Control name', []), { tier: 0, nameMatches: 2 });
});

test('DE-AC-001 keeps transfer and party intent without inventing composition, route or time', () => {
  const plan = understandQuery({ ...merchantRequest(), query: 'Airport pickup for 4 from JKIA tonight' }, release)!;
  assert.deepEqual(plan.requirements, [{ kind: 'workflow', value: 'TRANSFER' }, { kind: 'party_total', value: 4 }]);
  assert.deepEqual(plan.intents, [{ key: 'workflow:TRANSFER', confidenceBand: 'high' }]);
  assert.ok(plan.issues.some(issue => issue.key === 'date_timezone_required')); assert.equal(plan.terms.length, 0);
});

test('DE-AC-002 retains local food wording and requires review for correction/proximity', () => {
  const plan = understandQuery({ ...merchantRequest(), query: 'Nyama choma near kilimni' }, release)!;
  assert.equal(plan.normalized, 'nyama choma near kilimni');
  assert.deepEqual(plan.intents, [{ key: 'offering:food_phrase', confidenceBand: 'medium' }]);
  assert.deepEqual(plan.issues.map(issue => issue.key), ['location_correction_required', 'proximity_facts_required', 'entity_mode_required']);
});

test('DE-AC-003 preserves strict KES whole-request budget intent and conflicting party controls', () => {
  const request = { ...merchantRequest(), query: 'Couples massage tomorrow under KSh 7,000' };
  const plan = understandQuery(request, release)!;
  assert.deepEqual(plan.requirements, [{ kind: 'party_total', value: 2 }, { kind: 'budget_minor', value: 700000, comparison: 'lt', currency: 'KES' }]);
  assert.ok(plan.issues.some(issue => issue.key === 'budget_basis_required')); assert.ok(plan.issues.some(issue => issue.key === 'date_timezone_required'));
  const conflict = understandQuery({ ...request, filters: [{ kind: 'party', adults: 1 }] }, release)!;
  assert.equal(conflict.issues[0]!.key, 'party_conflict');
  const inclusive = understandQuery({ ...request, query: 'massage up to KES 2.50' }, release)!;
  assert.deepEqual(inclusive.requirements, [{ kind: 'budget_minor', value: 250, comparison: 'lte', currency: 'KES' }]);
});

test('relative date uses supplied timezone and a fixed request clock; controls cannot be overwritten', () => {
  const request = { ...merchantRequest(), query: 'massage tomorrow', filters: [{ kind: 'required_availability' as const,
    start: '2026-10-21T10:00:00+03:00', end: '2026-10-21T11:00:00+03:00', timezone: 'Africa/Nairobi' }] };
  const plan = understandQuery(request, release, { now: new Date('2026-10-19T22:30:00Z') })!;
  assert.deepEqual(plan.requirements, [{ kind: 'local_date', value: '2026-10-21' }]);
  assert.deepEqual(plan.issues.map(issue => issue.key), ['availability_facts_required']);
  request.filters[0]!.start = '2026-10-20T10:00:00+03:00';
  assert.equal(understandQuery(request, release, { now: new Date('2026-10-19T22:30:00Z') })!.issues[0]!.key, 'date_conflict');
});

test('reviewed aliases are release/selection-bound, exact and cannot erase hard intent', () => {
  const request = { ...merchantRequest(), query: 'protcol control' };
  const rules: QueryRules = { releaseId: release.releaseId, revision: 'protocol-review-1', aliases: [
    { from: 'protcol control', to: 'protocol control', selectionId: request.selection.subcategoryId!, approvalRef: 'isolated-review-control' },
    { from: 'airport pickup', to: 'protocol control', selectionId: request.selection.subcategoryId!, approvalRef: 'isolated-review-control' },
  ] };
  assert.equal(understandQuery(request, release, { rules })!.normalized, 'protocol control');
  assert.equal(understandQuery(request, release)!.normalized, 'protcol control');
  assert.equal(understandQuery({ ...request, query: 'airport pickup' }, release, { rules })!.issues[0]!.key, 'workflow_facts_required');
  assert.throws(() => understandQuery(request, release, { rules: { ...rules, releaseId: 'wrong' } }), error => error instanceof ContractError && error.code === 'RELEASE_INCOMPATIBLE');
  assert.throws(() => understandQuery(request, release, { rules: { ...rules, aliases: [...rules.aliases, rules.aliases[0]!] } }), ContractError);
});

test('natural exclusions/claims require facts, while an explicitly quoted merchant name is literal', () => {
  for (const query of ['control without sugar', 'vegan control', 'control in Kilimani', 'control open now']) {
    assert.equal(understandQuery({ ...merchantRequest(), query }, release)!.issues[0]!.code, 'unsupported', query);
  }
  const plan = understandQuery({ ...merchantRequest(), query: '"Tomorrow Control"' }, release)!;
  assert.deepEqual(lexicalMatch(plan, 'Tomorrow Control', []), { tier: 0, nameMatches: 1 });
});

test('explicit taxonomy scope and workflow controls take precedence without assuming category capabilities', () => {
  const request = merchantRequest();
  const other = release.nodes.find(node => node.kind === 'category' && node.id === 'airport-transfers')!;
  const mismatch = understandQuery({ ...request, query: other.label }, release)!;
  assert.ok(mismatch.issues.some(issue => issue.key === 'selection_text_conflict'));
  const control = understandQuery({ ...request, query: 'airport pickup', filters: [{ kind: 'workflow_kind', value: 'RENTAL' }] }, release)!;
  assert.deepEqual(control.issues[0], { code: 'clarify', key: 'selection_text_conflict', paths: ['/selection', '/filters', '/query'] });
  assert.deepEqual(control.requirements, [{ kind: 'workflow', value: 'TRANSFER' }]);
});
