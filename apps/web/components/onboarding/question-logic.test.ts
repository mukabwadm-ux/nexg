import { describe, expect, it } from 'vitest';

import {
  conditionMatches,
  needsRiderPickup,
  questionHasAnswer,
  questionIsVisible,
} from './question-logic';
import type { Question } from './types';

describe('onboarding question conditions', () => {
  const answers = {
    business_types: ['bakery', 'catering'],
    fulfillment_methods: ['delivery'],
    order_models: ['made_to_order'],
  };

  it('matches selected values in multi-select answers', () => {
    expect(conditionMatches({ answer: 'business_types', includes: 'bakery' }, answers)).toBe(true);
    expect(conditionMatches({ answer: 'business_types', includes: 'restaurant' }, answers)).toBe(
      false,
    );
  });

  it('supports any/all conditions for conditional questions', () => {
    expect(
      conditionMatches(
        {
          any: [
            { answer: 'fulfillment_methods', includes: 'pickup' },
            { answer: 'fulfillment_methods', includes: 'delivery' },
          ],
        },
        answers,
      ),
    ).toBe(true);
    expect(
      conditionMatches(
        {
          all: [
            { answer: 'business_types', includes: 'bakery' },
            { answer: 'order_models', includes: 'preorder_custom' },
          ],
        },
        answers,
      ),
    ).toBe(false);
  });

  it('filters by onboarding step and matching conditions', () => {
    const question: Question = {
      key: 'catering_notice',
      label: 'How much notice do catering orders need?',
      type: 'single',
      step: 4,
      when: { answer: 'business_types', includes: 'catering' },
      options: [{ value: 'week', label: 'One week' }],
    };

    expect(questionIsVisible(question, 4, answers)).toBe(true);
    expect(questionIsVisible(question, 2, answers)).toBe(false);
    expect(
      questionIsVisible(
        { ...question, when: { answer: 'business_types', includes: 'cafe' } },
        4,
        answers,
      ),
    ).toBe(false);
    expect(questionIsVisible({ ...question, step: 6 }, 6, answers)).toBe(true);
  });

  it('only requires answers for questions marked required', () => {
    const required: Question = { key: 'food_style', label: 'Food style', type: 'text' };
    const optional: Question = { ...required, required: false };

    expect(questionHasAnswer(required, {})).toBe(false);
    expect(questionHasAnswer(required, { food_style: 'Kenyan coastal' })).toBe(true);
    expect(questionHasAnswer(optional, {})).toBe(true);
  });

  it('requires pickup details only for rider delivery or collection', () => {
    expect(needsRiderPickup({ fulfillment_methods: ['delivery'] })).toBe(true);
    expect(needsRiderPickup({ collection: 'rider_collects' })).toBe(true);
    expect(needsRiderPickup({ collection: 'either' })).toBe(true);
    expect(needsRiderPickup({ fulfillment_methods: ['customer_pickup'] })).toBe(false);
    expect(needsRiderPickup({ collection: 'guest_drops' })).toBe(false);
    expect(needsRiderPickup({})).toBe(false);
  });
});
