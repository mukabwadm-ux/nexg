import { describe, expect, it } from 'vitest';

import {
  displayName,
  initials,
  isMissingFunction,
  kes,
  oneOf,
  parseList,
  parseProfile,
  repeatRate,
  SORTS,
  toneOf,
} from './customers';

describe('customers', () => {
  it('reads an empty or broken answer as nothing, not a crash', () => {
    const list = parseList(null);
    expect(list.rows).toEqual([]);
    expect(list.kpis.total).toBe(0);
    expect(list.level).toBe('view');
    const p = parseProfile(undefined);
    expect(p.found).toBe(false);
    expect(p.orders).toEqual([]);
    expect(p.customer.vip).toBe(false);
  });

  it('reads the list the database returns', () => {
    const list = parseList({
      level: 'full',
      total: 1,
      kpis: { total: 3, buyers: 4, repeat: 1, spend: '125000' },
      rows: [{ id: 'a', name: 'Amina', spend: 430000, has_account: true, purchases: 3 }],
    });
    expect(list.level).toBe('full');
    expect(list.kpis.spend).toBe(125000);
    expect(list.rows[0]).toMatchObject({ id: 'a', name: 'Amina', spend: 430000, hasAccount: true });
    expect(repeatRate(list.kpis)).toBe(25);
  });

  it('has no repeat rate before anybody has paid', () => {
    expect(repeatRate(parseList({ kpis: { buyers: 0 } }).kpis)).toBeNull();
  });

  it('knows when the database has not been updated yet', () => {
    expect(isMissingFunction({ code: 'PGRST202', message: 'Could not find the function' })).toBe(
      true,
    );
    expect(isMissingFunction({ code: '42501', message: 'Only people who reach Customers' })).toBe(
      false,
    );
    expect(isMissingFunction(null)).toBe(false);
  });

  it('writes names, money and states the way the screens show them', () => {
    expect(displayName(null, '+254711195002', null)).toBe('+254711195002');
    expect(displayName(null, null, null)).toBe('Unnamed customer');
    expect(initials('Amina Wanjiru')).toBe('AW');
    expect(initials('+254 711')).toBe('·');
    expect(kes(430000)).toBe('KES 4,300');
    expect(kes(null)).toBe('—');
    expect(toneOf('failed')).toBe('red');
    expect(toneOf('delivered')).toBe('green');
    expect(oneOf(SORTS, 'spend', 'recent')).toBe('spend');
    expect(oneOf(SORTS, 'drop table', 'recent')).toBe('recent');
  });
});
