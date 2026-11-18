import { MERCHANT_TAXONOMY } from '@nexg/contracts';
import { describe, expect, it } from 'vitest';

import { ASK_CATEGORIES } from './ask-categories';
import { askPhoneProblem, askPrefill, askTicketBody, askWhenLabel } from './ask-request';

const query = (search: string) => new URLSearchParams(search);

describe('the Ask form categories', () => {
  it('are the canonical list, in its order', () => {
    expect(ASK_CATEGORIES.map((c) => c.id)).toEqual(MERCHANT_TAXONOMY.map((c) => c.id));
    expect(ASK_CATEGORIES.every((c) => c.name && c.desc)).toBe(true);
  });
});

describe('askPrefill', () => {
  it('takes a category id or name', () => {
    expect(askPrefill(query('category=airport_transfers'), ASK_CATEGORIES)).toEqual({
      category: 'airport_transfers',
    });
    expect(askPrefill(query('category=Laundry%20Services'), ASK_CATEGORIES)).toEqual({
      category: 'laundry_cleaning',
    });
  });

  it('reads the old chips links still name', () => {
    expect(askPrefill(query('need=Airport%20Transfer'), ASK_CATEGORIES)).toEqual({
      category: 'airport_transfers',
    });
    expect(askPrefill(query('need=Food'), ASK_CATEGORIES)).toEqual({
      category: 'restaurants_food',
    });
    expect(askPrefill(query('need=Beauty%20%26%20Fashion'), ASK_CATEGORIES)).toEqual({
      category: 'beauty',
    });
  });

  it('keeps a need in their own words as the request text', () => {
    expect(askPrefill(query('need=Two%20pizzas%20from%20Mama%27s'), ASK_CATEGORIES)).toEqual({
      notes: "Two pizzas from Mama's",
    });
    expect(askPrefill(query(`need=${'x'.repeat(700)}`), ASK_CATEGORIES).notes).toHaveLength(600);
  });

  it('ignores an unknown category and an empty query', () => {
    expect(askPrefill(query('category=nope'), ASK_CATEGORIES)).toEqual({});
    expect(askPrefill(query(''), ASK_CATEGORIES)).toEqual({});
    expect(askPrefill(query('category=nope&need=Drinks'), ASK_CATEGORIES)).toEqual({
      category: 'alcohol_beverages',
    });
  });
});

describe('askPhoneProblem', () => {
  it('accepts the numbers the server action accepts', () => {
    expect(askPhoneProblem('0712 345 678')).toBeUndefined();
    expect(askPhoneProblem('+254 712 345678')).toBeUndefined();
  });

  it('names what is wrong', () => {
    expect(askPhoneProblem('  ')).toMatch(/Enter your WhatsApp number/);
    expect(askPhoneProblem('call me maybe')).toBe('That does not look like a phone number.');
    expect(askPhoneProblem('0712 345 678 0712 345 678')).toBe(
      'That does not look like a phone number.',
    );
  });
});

describe('askTicketBody', () => {
  it('reads as sentences, with the category first', () => {
    expect(
      askTicketBody({
        categoryName: 'Airport Transfers',
        when: 'later',
        whenDetail: 'Friday 6am',
        stayingAt: 'Riverside Drive',
        notes: 'KQ 101, two bags',
      }),
    ).toBe(
      'Airport Transfers — Friday 6am.\nStaying at: Riverside Drive.\nIn their words: KQ 101, two bags',
    );
    expect(
      askTicketBody({ categoryName: 'Laundry Services', when: 'asap', stayingAt: 'Kilimani' }),
    ).toBe('Laundry Services — as soon as possible.\nStaying at: Kilimani.');
  });

  it('says when a time is still to arrange', () => {
    expect(askWhenLabel('later', '  ')).toBe('At a time to arrange');
    expect(askWhenLabel('asap', 'ignored')).toBe('As soon as possible');
  });
});
