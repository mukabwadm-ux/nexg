import { describe, expect, it } from 'vitest';

import type { ReviewDocument } from '@/components/document-review';

import { catalogueChip, syncLabel } from './catalogues';
import { categoryGroup, groupKeys, merchantPhotoUrl, shortCategory } from './merchant-categories';
import { payoutChip, runChip } from './payouts';
import { byGroup, change, insights, leaderboard, parsePerformance, rollUp } from './performance';
import {
  documentStanding,
  parseVerificationDetail,
  verificationChecks,
  verificationProgress,
} from './verification';

const doc = (kind: string, status: ReviewDocument['status'], required = true): ReviewDocument => ({
  id: status === 'missing' ? null : `${kind}-id`,
  kind,
  label: kind,
  helpText: null,
  required,
  status,
  expiresAt: null,
  rejectionReason: null,
  url: null,
  mime: null,
  chase: null,
});

const detail = (over: Record<string, unknown> = {}) =>
  parseVerificationDetail({
    id: 'm1',
    name: 'Urban Bistro',
    status: 'under_review',
    state: 'under_review',
    branches: 1,
    banking: { rail: 'mpesa_till', provided: true, matched: null },
    duplicates: [],
    notes: [],
    ...over,
  })!;

describe('merchant categories', () => {
  it('gives the design one-word chips and groups', () => {
    expect(shortCategory('restaurants_food')).toBe('Food');
    expect(shortCategory('unknown_key', 'Custom label')).toBe('Custom label');
    expect(categoryGroup('alcohol_beverages')).toBe('food');
    expect(categoryGroup('pharmacy')).toBe('more');
    expect(groupKeys('stays')).toEqual([]);
    expect(groupKeys('all')).toBeNull();
    expect(groupKeys('groceries')).toContain('groceries_essentials');
  });

  it('only draws plain https photo addresses', () => {
    expect(merchantPhotoUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
    expect(merchantPhotoUrl('http://example.com/a.jpg')).toBeNull();
    expect(merchantPhotoUrl('javascript:alert(1)')).toBeNull();
    expect(merchantPhotoUrl(null)).toBeNull();
  });
});

describe('verification', () => {
  it('reads each check from what is on record', () => {
    const docs = [
      doc('kra_pin', 'verified', false),
      doc('business_permit', 'missing'),
      doc('owner_id', 'uploaded', false),
    ];
    const checks = Object.fromEntries(verificationChecks(docs, detail()).map((c) => [c.key, c]));
    expect(checks.kra?.text).toBe('Verified');
    expect(checks.owner?.text).toBe('In review');
    expect(checks.permits?.text).toBe('1 missing');
    expect(checks.banking?.text).toBe('Provided');
    expect(checks.banking?.ok).toBeNull();
    expect(checks.duplicates?.text).toBe('No match');
  });

  it('never calls banking verified unless the name check matched', () => {
    const checks = verificationChecks([], detail({ banking: { provided: true, matched: true } }));
    expect(checks.find((c) => c.key === 'banking')?.text).toBe('Verified');
  });

  it('walks the progress line from documents to the decision', () => {
    const docs = [doc('business_permit', 'uploaded')];
    const d = detail();
    const steps = verificationProgress(docs, d, verificationChecks(docs, d));
    expect(steps.map((s) => s.state)).toEqual(['done', 'current', 'todo', 'todo']);
    expect(steps[1]?.note).toBe('In Review');

    const ready = [doc('business_permit', 'verified')];
    const done = verificationProgress(ready, d, verificationChecks(ready, d));
    expect(done.map((s) => s.state)).toEqual(['done', 'done', 'done', 'current']);
    expect(documentStanding(ready).allVerified).toBe(true);
  });
});

describe('performance', () => {
  const p = parsePerformance({
    kpis: {
      gmv: { now: 300, before: 200 },
      orders: { now: 3, before: 0 },
      active: { now: 5, before: 4 },
    },
    series: [
      { day: '2026-11-16', gmv: 100, commission: 10 },
      { day: '2026-11-18', gmv: 200, commission: 20 },
      { day: '2026-11-23', gmv: 300, commission: 30 },
    ],
    categories: [
      { key: 'restaurants_food', gmv: 250, commission: 25, prev_gmv: 100 },
      { key: 'alcohol_beverages', gmv: 50, commission: 5, prev_gmv: 100 },
    ],
    merchants: [
      { id: 'a', name: 'A', gmv: 200, orders: 1, prev_gmv: 100 },
      { id: 'b', name: 'B', gmv: 100, orders: 2, prev_gmv: 0 },
    ],
  });

  it('gives no change when there was nothing before', () => {
    expect(change(150, 100)).toBe(50);
    expect(change(5, 0)).toBeNull();
  });

  it('rolls days up to weeks starting Monday', () => {
    expect(rollUp(p.series, 'weekly').map((w) => w.day)).toEqual(['2026-11-16', '2026-11-23']);
  });

  it('adds drinks into Food, as the design groups them', () => {
    const food = byGroup(p.categories).find((g) => g.group === 'food');
    expect(food?.gmv).toBe(300);
    expect(food?.growth).toBe(50);
  });

  it('ranks growth only where there were sales before', () => {
    expect(leaderboard(p.merchants, 'growth').map((m) => m.id)).toEqual(['a']);
    expect(leaderboard(p.merchants, 'orders').map((m) => m.id)).toEqual(['b', 'a']);
    expect(leaderboard(p.merchants, 'rated')).toEqual([]);
  });

  it('writes insights only from the figures', () => {
    const lines = insights(p);
    expect(lines[0]).toMatch(/^Food sales up 50%/);
    expect(lines[1]).toBe('3 orders, and none the period before.');
    expect(lines[2]).toBe('Active merchants increased by 25% (5).');
  });
});

describe('payouts and catalogues', () => {
  it('names held and netted lines', () => {
    expect(payoutChip('pending', 'Held').label).toBe('Held');
    expect(payoutChip('settled', 'Netted').label).toBe('Netted');
    expect(payoutChip('scheduled', null).label).toBe('Scheduled');
    expect(runChip('reconciled').label).toBe('Settled');
    expect(runChip('built').label).toBe('Built');
  });

  it('labels a sync today in Nairobi time', () => {
    const now = new Date('2026-11-18T09:00:00Z');
    expect(syncLabel('2026-11-18T07:24:00Z', now)).toBe('Today, 10:24 AM');
    expect(syncLabel(null, now)).toBeNull();
    expect(catalogueChip('not_live').label).toBe('Not live');
  });
});
