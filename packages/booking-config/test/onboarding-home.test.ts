import { describe, expect, it } from 'vitest';
import { projectOnboardingHome } from '@nexg/booking-config/onboarding-home';
import type { OnboardingHomeCapture } from '@nexg/booking-config/onboarding-home';
import { registry } from '../src/registry';

const business = {
  name: 'Acacia',
  firstName: 'Amina',
  lastName: 'Otieno',
  email: 'amina@example.com',
  phone: '0712345678',
  registered: false,
  branchCount: 1,
};
const restaurant: OnboardingHomeCapture = {
  business,
  categoryId: 'restaurants_food',
  subcategories: ['restaurant'],
};
const restaurantAnswers = {
  restaurant: {
    Q_CUISINE_TYPES: ['kenyan'],
    Q_TABLE_SERVICE: false,
    Q_AVG_PREP_TIME: 0,
    Q_HAS_PHYSICAL_SEATING: false,
    Q_RESERVATION_SYSTEM: false,
    Q_MIN_ORDER: 'none',
  },
};
const enquiry: OnboardingHomeCapture = {
  business,
  categoryId: 'financial_services',
  subcategories: ['business_services'],
  answersBySubcategory: {
    business_services: {
      Q_REGULATORY_LICENSE: 'Declared provider role, subject to review',
      Q_BIZ_SERVICES_OFFERED: ['accounting'],
      Q_PHYSICAL_LOCATIONS_COUNT: '1',
      Q_DIGITAL_PLATFORM: 'none',
    },
  },
};

describe('onboarding Home readiness projection', () => {
  it('keeps valid basic entry details complete while restaurant setup and launch remain pending', () => {
    const home = projectOnboardingHome(restaurant, { preview: true });
    expect(home.businessName).toBe('Acacia');
    expect(home.subcategoryIds).toEqual(['restaurant']);
    expect(home.rows.map((row) => [row.id, row.status, row.required])).toEqual([
      ['business', 'complete', true],
      ['specialty:restaurant', 'missing', true],
      ['offerings', 'missing', false],
      ['hours', 'missing', true],
      ['model:restaurant', 'waiting', false],
      ['documents', 'waiting', false],
      ['payout', 'waiting', false],
      ['launch', 'waiting', true],
    ]);
    expect(home.rows[0]).toMatchObject({ statusLabel: 'Details supplied', editorStep: 0 });
    expect(home.progress).toEqual({ done: 1, total: 4, remaining: 3, percent: 25 });
    expect(home.profiles[0]?.missingQuestionIds).toEqual([
      'Q_CUISINE_TYPES',
      'Q_TABLE_SERVICE',
      'Q_AVG_PREP_TIME',
      'Q_HAS_PHYSICAL_SEATING',
      'Q_RESERVATION_SYSTEM',
      'Q_MIN_ORDER',
    ]);
    expect(home.rows.find((row) => row.id === 'launch')).toMatchObject({
      status: 'waiting',
      editorStep: null,
      required: true,
    });
  });

  it('recognizes complete restaurant declarations and hours without treating a priced draft as live inventory', () => {
    const home = projectOnboardingHome({
      ...restaurant,
      answersBySubcategory: restaurantAnswers,
      operations: { hours: { Monday: { open: true, from: '09:00', to: '17:00' } } },
      offers: [{ id: 'menu-1', name: 'Lunch', subcategory: 'restaurant', price: 500 }],
    });
    expect(home.rows.find((row) => row.id === 'specialty:restaurant')).toMatchObject({
      status: 'complete',
      statusLabel: 'Details supplied',
      description:
        '6 answers supplied. These declarations do not activate services or verify permissions.',
    });
    expect(home.profiles[0]?.missingQuestionIds).toEqual([]);
    expect(home.rows.find((row) => row.id === 'hours')).toMatchObject({
      status: 'complete',
      statusLabel: 'Details supplied',
    });
    expect(home.rows.find((row) => row.id === 'offerings')).toMatchObject({
      status: 'provided',
      statusLabel: 'Drafts supplied',
      required: false,
    });
    expect(home.progress).toEqual({ done: 3, total: 4, remaining: 1, percent: 75 });
    expect(home.profiles[0]?.models.map((model) => [model.id, model.active])).toEqual([
      ['ORDER', false],
      ['SPACE_RESERVATION', false],
    ]);
  });

  it('keeps enquiry-only setup free of fabricated hours, preparation and test-order requirements', () => {
    const home = projectOnboardingHome(enquiry);
    expect(home.rows.map((row) => row.id)).toEqual([
      'business',
      'specialty:business_services',
      'offerings',
      'model:business_services',
      'team',
      'documents',
      'payout',
      'launch',
    ]);
    expect(home.rows.find((row) => row.id === 'specialty:business_services')).toMatchObject({
      status: 'complete',
      statusLabel: 'Details supplied',
      required: true,
    });
    expect(home.rows.find((row) => row.id === 'team')).toMatchObject({
      status: 'waiting',
      required: false,
    });
    expect(home.progress).toEqual({ done: 2, total: 3, remaining: 1, percent: 67 });
    expect(home.rows.find((row) => row.id === 'model:business_services')?.description).toBe(
      'Before enabling business services, review offered scope; response ownership and target; customer request fields; quote and approval policy; supplier authority where relevant; commitment model when accepted. No workflow is active.',
    );
    expect(home.profiles[0]?.models.find((model) => model.id === 'APPOINTMENT')).toMatchObject({
      active: false,
    });
    expect(JSON.stringify(home.rows)).not.toMatch(/prep time|test order|test-order|delivery zone/i);
  });

  it('requires actual source operating-hours answers and only offers optional schedule setup on request', () => {
    const banking = projectOnboardingHome({
      ...enquiry,
      subcategories: ['banking'],
      answersBySubcategory: {},
    });
    expect(banking.rows.find((row) => row.id === 'hours')).toMatchObject({
      status: 'missing',
      required: true,
    });
    const scheduled = projectOnboardingHome({ ...enquiry, operations: { bookingEnabled: true } });
    expect(scheduled.rows.find((row) => row.id === 'hours')).toMatchObject({
      status: 'missing',
      required: false,
      description:
        'Scheduling was requested. Define actual offering schedules before accepting bookings.',
    });
    const badHours = projectOnboardingHome({
      ...restaurant,
      operations: { hours: { Monday: { open: true, from: '25:00', to: '17:00' } } },
    });
    expect(badHours.rows.find((row) => row.id === 'hours')).toMatchObject({
      status: 'invalid',
      required: true,
    });
  });

  it('projects unconfigured and foreign activity choices without creating unrelated tasks', () => {
    const empty = projectOnboardingHome({});
    expect(empty.businessName).toBe('Your business');
    expect(empty.rows.map((row) => [row.id, row.status])).toEqual([
      ['business', 'missing'],
      ['activities', 'missing'],
      ['documents', 'waiting'],
      ['payout', 'waiting'],
      ['launch', 'waiting'],
    ]);
    expect(empty.progress).toEqual({ done: 0, total: 3, remaining: 3, percent: 0 });
    const foreign = projectOnboardingHome({
      business,
      categoryId: 'restaurants_food',
      subcategories: ['banking'],
    });
    expect(foreign.subcategoryIds).toEqual([]);
    expect(foreign.rows.find((row) => row.id === 'activities')).toMatchObject({
      status: 'invalid',
      description: 'Subcategory banking does not belong to category restaurants_food.',
    });
    expect(foreign.progress).toEqual({ done: 1, total: 3, remaining: 2, percent: 33 });
  });

  it('keeps hybrid profiles and their prospective candidate models scoped independently', () => {
    const home = projectOnboardingHome({
      business,
      categoryId: 'adults_only',
      subcategories: ['adult_products', 'adult_wellness'],
      answersBySubcategory: {
        adult_products: {
          Q_PACKAGING_STYLE: 'discreet',
          Q_AGE_GATE_METHOD: 'both',
          Q_SIGNATURE_REQUIRED: false,
          Q_MIN_ORDER: 'none',
        },
        adult_wellness: { Q_PACKAGING_STYLE: 'discreet' },
      },
    });
    expect(
      home.rows.filter((row) => row.id.startsWith('specialty:')).map((row) => [row.id, row.status]),
    ).toEqual([
      ['specialty:adult_products', 'complete'],
      ['specialty:adult_wellness', 'missing'],
    ]);
    expect(
      home.profiles.map((profile) => [profile.subcategoryId, profile.missingQuestionIds]),
    ).toEqual([
      ['adult_products', []],
      ['adult_wellness', ['Q_AGE_GATE_METHOD', 'Q_HOME_SERVICE']],
    ]);
    expect(
      home.profiles.map((profile) => profile.models.map((model) => [model.id, model.active])),
    ).toEqual([
      [['ORDER', false]],
      [
        ['APPOINTMENT', false],
        ['FIELD_VISIT', false],
        ['ORDER', false],
      ],
    ]);
    expect(home.rows.find((row) => row.id === 'team')).toMatchObject({
      status: 'waiting',
      required: false,
    });
  });

  it('keeps partial or invalid answers visible instead of calling a profile complete', () => {
    const home = projectOnboardingHome({
      ...restaurant,
      answersBySubcategory: { restaurant: { Q_TABLE_SERVICE: false, Q_AVG_PREP_TIME: '15' } },
    });
    expect(home.rows.find((row) => row.id === 'specialty:restaurant')).toMatchObject({
      status: 'invalid',
      description: '1 supplied answer needs correction. 1 answer supplied.',
    });
    expect(home.profiles[0]?.invalidQuestionIds).toEqual(['Q_AVG_PREP_TIME']);
    expect(home.progress).toEqual({ done: 1, total: 4, remaining: 3, percent: 25 });
  });

  it('keeps locally selected evidence, uploaded evidence and payout declarations short of completion', () => {
    const capture: OnboardingHomeCapture = {
      ...enquiry,
      payout: { method: 'mobile_money', holderName: 'Amina Otieno', mobileNumber: '0712345678' },
    };
    const local = projectOnboardingHome(capture, {
      evidence: [{ name: 'certificate.pdf', size: 120, type: 'application/pdf' }],
    });
    expect(
      local.rows
        .filter((row) => ['documents', 'payout', 'launch'].includes(row.id))
        .map((row) => [row.id, row.status, row.required]),
    ).toEqual([
      ['documents', 'provided', false],
      ['payout', 'provided', false],
      ['launch', 'waiting', true],
    ]);
    expect(local.rows.find((row) => row.id === 'documents')?.statusLabel).toBe('Selected locally');
    const pending = projectOnboardingHome(capture, {
      evidence: [{ name: 'certificate.pdf', status: 'uploaded' }],
    });
    expect(pending.rows.find((row) => row.id === 'documents')).toMatchObject({
      status: 'waiting',
      statusLabel: 'Pending review',
    });
    expect(pending.progress).toEqual({ done: 2, total: 3, remaining: 1, percent: 67 });
    const defaults = projectOnboardingHome({
      ...enquiry,
      payout: { method: 'mobile_money', mobileProvider: 'M-Pesa' },
    });
    expect(defaults.rows.find((row) => row.id === 'payout')).toMatchObject({
      status: 'waiting',
      required: false,
    });
  });

  it('does not infer a team or completion from multiple declared branches', () => {
    const many = projectOnboardingHome({ ...enquiry, business: { ...business, branchCount: 12 } });
    expect(many.rows.find((row) => row.id === 'team')).toMatchObject({
      status: 'waiting',
      required: false,
    });
    const restaurantMany = projectOnboardingHome({
      ...restaurant,
      business: { ...business, branchCount: 12 },
    });
    expect(restaurantMany.rows.map((row) => row.id)).toEqual([
      'business',
      'specialty:restaurant',
      'offerings',
      'hours',
      'model:restaurant',
      'documents',
      'payout',
      'launch',
    ]);
  });

  it('projects all 128 registry profiles with valid registered IDs and no active workflow or completed launch', () => {
    expect(registry.profiles).toHaveLength(128);
    for (const profile of registry.profiles) {
      const home = projectOnboardingHome({
        business,
        categoryId: profile.categoryId,
        subcategories: [profile.subcategoryId],
      });
      expect(home.subcategoryIds).toEqual([profile.subcategoryId]);
      expect(home.registryRevision).toBe(registry.revision);
      expect(home.profiles[0]?.questions.map((question) => question.questionId)).toEqual(
        profile.sourceQuestionIds,
      );
      expect(home.profiles[0]?.models.map((model) => model.id)).toEqual(profile.candidateModelIds);
      expect(home.profiles[0]?.models.every((model) => model.active === false)).toBe(true);
      expect(home.rows.find((row) => row.id === 'launch')).toMatchObject({
        status: 'waiting',
        required: true,
        editorStep: null,
      });
      expect(home.progress.percent).toBeLessThan(100);
      expect(new Set(home.rows.map((row) => row.id)).size).toBe(home.rows.length);
      expect(
        home.rows
          .filter((row) => ['team', 'documents', 'payout'].includes(row.id))
          .every((row) => !row.required && row.status !== 'complete'),
      ).toBe(true);
    }
  });
});
