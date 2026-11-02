import { describe, expect, it } from 'vitest';

import type { Database } from '@nexg/db';

import { categoryConfigFromRow } from './category-config';

const row: Database['public']['Tables']['category_config']['Row'] = {
  badge_rules: {},
  bg: null,
  card_kind: 'services',
  catalogue_example: {},
  category: 'airport_transfers',
  color: null,
  created_at: '',
  description: null,
  eta_style: 'turnaround',
  extra_doc_rules: [],
  featured_eligible: true,
  icon: 'Plane',
  image_path: null,
  is_active: true,
  label: 'Airport Transfers',
  prep_time_required: false,
  questions: [
    {
      key: 'age_gate_method',
      label: 'Age Gate Method',
      type: 'single',
      options: [{ value: 'checkout', label: 'Checkout confirmation' }],
    },
    {
      key: 'booking_notice',
      label: 'How much notice do you need?',
      type: 'single',
      options: [{ value: '24h', label: '24 hours' }],
    },
  ],
  requires_ops_mapping: false,
  sort: 1,
  subcategories: [
    {
      id: 'airport_pickup',
      name: 'Airport Pickup',
      fields: ['age_gate_method', 'packaging_style', 'min_order', 'vehicle_types_transfer'],
      questions: [
        {
          key: 'age_gate_method',
          label: 'Age Gate Method',
          type: 'single',
          options: [{ value: 'checkout', label: 'Checkout confirmation' }],
        },
      ],
    },
  ],
  updated_at: '',
};

describe('category configuration questions', () => {
  it('omits age-restriction and retail fields from airport transfers', () => {
    const config = categoryConfigFromRow(row, null);

    expect(config.questions.map((question) => question.key)).toEqual(['booking_notice']);
    expect(config.subcategories?.[0]?.fields).toEqual(['vehicle_types_transfer']);
    expect(config.subcategories?.[0]?.questions).toEqual([]);
  });

  it('keeps age-gate questions for adult and alcohol categories', () => {
    const config = categoryConfigFromRow({ ...row, category: 'adults_only' }, null);

    expect(config.questions.map((question) => question.key)).toContain('age_gate_method');
    expect(config.subcategories?.[0]?.fields).toContain('age_gate_method');
    expect(config.subcategories?.[0]?.questions?.map((question) => question.key)).toContain(
      'age_gate_method',
    );

    const alcoholConfig = categoryConfigFromRow({ ...row, category: 'alcohol_beverages' }, null);
    expect(alcoholConfig.questions.map((question) => question.key)).toContain('age_gate_method');
    expect(alcoholConfig.subcategories?.[0]?.fields).toContain('age_gate_method');
    expect(alcoholConfig.subcategories?.[0]?.questions?.map((question) => question.key)).toContain(
      'age_gate_method',
    );
  });

  it('omits age-gate questions from categories without age restrictions', () => {
    const config = categoryConfigFromRow({ ...row, category: 'restaurants_food' }, null);

    expect(config.questions.map((question) => question.key)).not.toContain('age_gate_method');
    expect(config.subcategories?.[0]?.fields).not.toContain('age_gate_method');
    expect(config.subcategories?.[0]?.questions).toEqual([]);
  });
});
