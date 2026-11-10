import { SUBCATEGORY_VARIANTS } from '../src/variants';
import { describe, expect, it } from 'vitest';
import {
  assessOnboardingAnswers,
  listOnboardingCategories,
  resolveOnboardingSelection,
} from '@nexg/booking-config/onboarding';
import { registry } from '../src/registry';

const signedIn = { otpVerified: true, signedIn: true };
const capturing = { otpVerified: false, signedIn: false };

describe('compiled onboarding inventory', () => {
  it('exposes all registered input configurations under their existing categories', () => {
    const categories = listOnboardingCategories();
    expect(categories).toHaveLength(21);
    expect(categories.flatMap((category) => category.subcategories)).toHaveLength(
      128 + SUBCATEGORY_VARIANTS.length,
    );
    expect(
      categories.flatMap((category) =>
        category.subcategories.map((subcategory) => ({
          categoryId: category.id,
          categoryName: category.name,
          subcategoryId: subcategory.id,
          name: subcategory.name,
        })),
      ),
    ).toEqual(
      registry.profiles.map((profile) => ({
        categoryId: profile.categoryId,
        categoryName: profile.categoryName,
        subcategoryId: profile.subcategoryId,
        name: profile.name,
      })),
    );
  });

  it.each(registry.profiles)(
    'resolves source inputs for $subcategoryId without setup activation',
    (profile) => {
      const selection = resolveOnboardingSelection(profile.categoryId, [profile.subcategoryId]);
      expect(selection.issues).toEqual([]);
      expect(selection.profiles).toEqual([
        {
          categoryId: profile.categoryId,
          subcategoryId: profile.subcategoryId,
          name: profile.name,
          defaultModelId: profile.defaultModelId,
          candidateModelIds: profile.candidateModelIds,
          sourceQuestionIds: profile.sourceQuestionIds,
          specialtyNeeds: profile.specialtyNeeds,
        },
      ]);
      expect(selection.questions.map((question) => question.id)).toEqual(profile.sourceQuestionIds);
      for (const question of selection.questions) {
        const registered = registry.questions.find((item) => item.id === question.id)!;
        expect(question).toEqual({
          id: registered.id,
          key: registered.key,
          label: registered.label,
          schema: registered.schema,
          canonicalTarget: registered.canonicalTarget,
          subcategoryIds: [profile.subcategoryId],
        });
      }
      const optional = assessOnboardingAnswers(selection, {}, capturing);
      expect(optional.map((answer) => [answer.questionId, answer.state, answer.required])).toEqual(
        profile.sourceQuestionIds.map((id) => [id, 'optional', false]),
      );
    },
  );

  it('deduplicates shared questions while keeping each selected activity scope', () => {
    const selection = resolveOnboardingSelection('adults_only', [
      'adult_products',
      'adult_accessories',
      'adult_products',
    ]);
    expect(selection.profiles.map((profile) => profile.subcategoryId)).toEqual([
      'adult_products',
      'adult_accessories',
    ]);
    expect(
      selection.questions.find((question) => question.id === 'Q_SIGNATURE_REQUIRED'),
    ).toMatchObject({
      id: 'Q_SIGNATURE_REQUIRED',
      schema: { type: 'boolean' },
      subcategoryIds: ['adult_products', 'adult_accessories'],
    });
  });

  it('reports unknown and foreign IDs without exposing their questions', () => {
    const selection = resolveOnboardingSelection('adults_only', [
      'airport_pickup',
      'unknown',
      'adult_products',
    ]);
    expect(selection.issues).toEqual([
      'Subcategory airport_pickup does not belong to category adults_only.',
      'Subcategory unknown does not belong to category adults_only.',
    ]);
    expect(selection.profiles.map((profile) => profile.subcategoryId)).toEqual(['adult_products']);
    expect(resolveOnboardingSelection('unknown', ['adult_products'])).toEqual({
      revision: selection.revision,
      issues: ['Unknown merchant category: unknown.'],
      profiles: [],
      questions: [],
    });
    expect(resolveOnboardingSelection('adults_only', []).issues).toEqual([
      'Choose at least one subcategory.',
    ]);
  });

  it('returns independent copies of category, profile and question metadata', () => {
    const categories = listOnboardingCategories();
    categories[0]!.subcategories[0]!.name = 'Changed locally';
    const selection = resolveOnboardingSelection('adults_only', ['adult_products']);
    selection.profiles[0]!.sourceQuestionIds.length = 0;
    selection.profiles[0]!.candidateModelIds.length = 0;
    selection.questions[0]!.schema.type = 'number';
    expect(listOnboardingCategories()[0]!.subcategories[0]).toEqual({
      id: 'adult_products',
      name: 'Adult Products',
    });
    expect(resolveOnboardingSelection('adults_only', ['adult_products']).profiles[0]).toMatchObject(
      {
        defaultModelId: 'ORDER',
        candidateModelIds: ['ORDER'],
        sourceQuestionIds: [
          'Q_PACKAGING_STYLE',
          'Q_AGE_GATE_METHOD',
          'Q_SIGNATURE_REQUIRED',
          'Q_MIN_ORDER',
        ],
      },
    );
    expect(
      resolveOnboardingSelection('adults_only', ['adult_products']).questions[0]!.schema.type,
    ).toBe('string');
  });
});

describe('stage-aware onboarding assessment', () => {
  it.each([
    { otpVerified: false, signedIn: false, state: 'optional', required: false },
    { otpVerified: true, signedIn: false, state: 'optional', required: false },
    { otpVerified: false, signedIn: true, state: 'optional', required: false },
    { otpVerified: true, signedIn: true, state: 'missing', required: true },
  ])('gates required setup with OTP=$otpVerified and signed-in=$signedIn', (authentication) => {
    const selection = resolveOnboardingSelection('adults_only', ['adult_products']);
    const assessment = assessOnboardingAnswers(selection, {}, authentication);
    expect(assessment.find((answer) => answer.questionId === 'Q_SIGNATURE_REQUIRED')).toMatchObject(
      {
        id: 'adult_products:Q_SIGNATURE_REQUIRED',
        state: authentication.state,
        required: authentication.required,
      },
    );
  });

  it('keeps unanswered values unknown while accepting typed false and zero', () => {
    const selection = resolveOnboardingSelection('restaurants_food', ['restaurant']);
    const answers = {
      restaurant: {
        Q_AVG_PREP_TIME: 0,
        Q_HAS_PHYSICAL_SEATING: false,
        Q_TABLE_SERVICE: null,
        Q_RESERVATION_SYSTEM: undefined,
      },
    };
    const assessment = assessOnboardingAnswers(selection, answers, signedIn);
    expect(
      assessment
        .filter((answer) => Object.hasOwn(answers.restaurant, answer.questionId))
        .map((answer) => [answer.questionId, answer.state, answer.required]),
    ).toEqual([
      ['Q_TABLE_SERVICE', 'missing', true],
      ['Q_AVG_PREP_TIME', 'provided', true],
      ['Q_HAS_PHYSICAL_SEATING', 'provided', true],
      ['Q_RESERVATION_SYSTEM', 'missing', true],
    ]);
    expect(answers.restaurant.Q_AVG_PREP_TIME).toBe(0);
    expect(answers.restaurant.Q_HAS_PHYSICAL_SEATING).toBe(false);
  });

  it.each(['0', '', -1, NaN, Infinity, false])(
    'validates supplied numeric input %s before authentication without making it required',
    (value) => {
      const selection = resolveOnboardingSelection('restaurants_food', ['restaurant']);
      const assessment = assessOnboardingAnswers(
        selection,
        { restaurant: { Q_AVG_PREP_TIME: value } },
        capturing,
      );
      const answer = assessment.find((item) => item.questionId === 'Q_AVG_PREP_TIME')!;
      expect(answer).toMatchObject({ state: 'invalid', required: false });
      expect(answer.messages.length).toBeGreaterThan(0);
    },
  );

  it('validates enum and boolean declarations without coercion or inferred verification', () => {
    const selection = resolveOnboardingSelection('adults_only', ['adult_products']);
    const assessment = assessOnboardingAnswers(
      selection,
      { adult_products: { Q_PACKAGING_STYLE: 'unknown', Q_SIGNATURE_REQUIRED: 'false' } },
      capturing,
    );
    expect(
      assessment
        .filter((answer) =>
          ['Q_PACKAGING_STYLE', 'Q_SIGNATURE_REQUIRED'].includes(answer.questionId),
        )
        .map((answer) => [answer.questionId, answer.state, answer.required]),
    ).toEqual([
      ['Q_PACKAGING_STYLE', 'invalid', false],
      ['Q_SIGNATURE_REQUIRED', 'invalid', false],
    ]);
    const provided = assessOnboardingAnswers(
      selection,
      { adult_products: { Q_SIGNATURE_REQUIRED: false } },
      signedIn,
    ).find((answer) => answer.questionId === 'Q_SIGNATURE_REQUIRED');
    expect(provided).toMatchObject({ state: 'provided', required: true, messages: [] });
  });

  it('uses the recorded boolean mapping without rewriting the captured declaration', () => {
    const answers = { adult_products: { Q_SIGNATURE_REQUIRED: 'no' } };
    const assessment = assessOnboardingAnswers(
      resolveOnboardingSelection('adults_only', ['adult_products']),
      answers,
      signedIn,
    );
    expect(assessment.find((answer) => answer.questionId === 'Q_SIGNATURE_REQUIRED')).toMatchObject(
      {
        state: 'provided',
        required: true,
        messages: [],
      },
    );
    expect(answers.adult_products.Q_SIGNATURE_REQUIRED).toBe('no');
  });

  it('honors the schema trim annotation without changing captured text', () => {
    const selection = resolveOnboardingSelection('vehicle_services', ['battery_service']);
    const blank = assessOnboardingAnswers(
      selection,
      { battery_service: { Q_BATTERY_BRANDS_TEXT: '   ' } },
      capturing,
    );
    expect(blank.find((answer) => answer.questionId === 'Q_BATTERY_BRANDS_TEXT')).toMatchObject({
      state: 'invalid',
      required: false,
    });
    const answers = { battery_service: { Q_BATTERY_BRANDS_TEXT: ' Exide ' } };
    const provided = assessOnboardingAnswers(selection, answers, signedIn);
    expect(provided.find((answer) => answer.questionId === 'Q_BATTERY_BRANDS_TEXT')).toMatchObject({
      state: 'provided',
      required: true,
      messages: [],
    });
    expect(answers.battery_service.Q_BATTERY_BRANDS_TEXT).toBe(' Exide ');
  });

  it('uses each source schema for zero bounds, empty choices and symbolic ranges', () => {
    const capacity = assessOnboardingAnswers(
      resolveOnboardingSelection('restaurants_food', ['cloud_kitchen']),
      { cloud_kitchen: { Q_NUMBER_OF_BRANDS: 0 } },
      capturing,
    );
    expect(capacity.find((answer) => answer.questionId === 'Q_NUMBER_OF_BRANDS')).toMatchObject({
      state: 'invalid',
      required: false,
    });
    const choices = assessOnboardingAnswers(
      resolveOnboardingSelection('vehicle_services', ['vehicle_assistance']),
      { vehicle_assistance: { Q_ASSISTANCE_SERVICES: [] } },
      capturing,
    );
    expect(choices.find((answer) => answer.questionId === 'Q_ASSISTANCE_SERVICES')).toMatchObject({
      state: 'invalid',
      required: false,
    });
    const fleet = assessOnboardingAnswers(
      resolveOnboardingSelection('airport_transfers', ['airport_pickup']),
      { airport_pickup: { Q_FLEET_SIZE: '1_2' } },
      signedIn,
    );
    expect(fleet.find((answer) => answer.questionId === 'Q_FLEET_SIZE')).toMatchObject({
      state: 'provided',
      required: true,
      messages: [],
    });
  });

  it('keeps unresolved booking predicates optional even after sign-in', () => {
    const selection = resolveOnboardingSelection('beauty', ['makeup']);
    const assessment = assessOnboardingAnswers(selection, {}, signedIn);
    expect(assessment.find((answer) => answer.questionId === 'Q_BOOKING_REQUIRED')).toMatchObject({
      state: 'optional',
      required: false,
      messages: [],
    });
    expect(assessment.find((answer) => answer.questionId === 'Q_HOME_SERVICE')).toMatchObject({
      state: 'missing',
      required: true,
    });
  });

  it('does not reuse declarations between activities or assess cached unselected activities', () => {
    const selection = resolveOnboardingSelection('adults_only', [
      'adult_products',
      'adult_accessories',
    ]);
    const answers = {
      adult_products: { Q_SIGNATURE_REQUIRED: false },
      airport_pickup: { Q_AVAILABLE_24HR: 'invalid cached value' },
    };
    const assessment = assessOnboardingAnswers(selection, answers, signedIn);
    expect(
      assessment
        .filter((answer) => answer.questionId === 'Q_SIGNATURE_REQUIRED')
        .map((answer) => [answer.subcategoryId, answer.state]),
    ).toEqual([
      ['adult_products', 'provided'],
      ['adult_accessories', 'missing'],
    ]);
    expect([...new Set(assessment.map((answer) => answer.subcategoryId))]).toEqual([
      'adult_products',
      'adult_accessories',
    ]);
  });

  it('keeps malformed hidden declarations inactive and restores validation when they become visible', () => {
    const question = registry.questions.find((item) => item.id === 'Q_SIGNATURE_REQUIRED')!;
    const originalVisibility = question.visibleWhen;
    // This fixture exercises conditional visibility without adding another production rule.
    question.visibleWhen = {
      path: 'fulfillment.setup.packaging_style',
      op: 'eq',
      value: 'branded',
    };
    try {
      const selection = resolveOnboardingSelection('adults_only', ['adult_products']);
      const answers = {
        adult_products: { Q_PACKAGING_STYLE: 'branded', Q_SIGNATURE_REQUIRED: 'invalid raw value' },
      };
      const active = assessOnboardingAnswers(selection, answers, capturing);
      expect(active.find((answer) => answer.questionId === 'Q_SIGNATURE_REQUIRED')).toMatchObject({
        state: 'invalid',
        required: false,
      });

      answers.adult_products.Q_PACKAGING_STYLE = 'discreet';
      const inactive = assessOnboardingAnswers(selection, answers, capturing);
      expect(inactive.find((answer) => answer.questionId === 'Q_SIGNATURE_REQUIRED')).toMatchObject(
        {
          state: 'inactive',
          required: false,
          messages: [],
        },
      );
      expect(inactive.filter((answer) => answer.state === 'invalid')).toEqual([]);
      expect(answers.adult_products.Q_SIGNATURE_REQUIRED).toBe('invalid raw value');

      answers.adult_products.Q_PACKAGING_STYLE = 'branded';
      const visibleAgain = assessOnboardingAnswers(selection, answers, capturing);
      expect(
        visibleAgain.find((answer) => answer.questionId === 'Q_SIGNATURE_REQUIRED'),
      ).toMatchObject({
        state: 'invalid',
        required: false,
      });
    } finally {
      question.visibleWhen = originalVisibility;
    }
  });

  it('checks compiled category ownership when a selection profile is forged', () => {
    const selection = resolveOnboardingSelection('adults_only', ['adult_products']);
    const answers = { adult_products: { Q_SIGNATURE_REQUIRED: false } };
    expect(
      assessOnboardingAnswers(selection, answers, capturing).find(
        (answer) => answer.questionId === 'Q_SIGNATURE_REQUIRED',
      ),
    ).toMatchObject({ state: 'provided', required: false });
    selection.profiles[0]!.categoryId = 'airport_transfers';
    expect(assessOnboardingAnswers(selection, answers, capturing)).toEqual([]);
  });

  it('rejects foreign questions within a selected activity using the registered schema', () => {
    const selection = resolveOnboardingSelection('adults_only', ['adult_products']);
    selection.questions.find((question) => question.id === 'Q_SIGNATURE_REQUIRED')!.schema.type =
      'string';
    const assessment = assessOnboardingAnswers(
      selection,
      { adult_products: { Q_SIGNATURE_REQUIRED: false, Q_AVG_PREP_TIME: 10, UNKNOWN: true } },
      capturing,
    );
    expect(assessment.find((answer) => answer.questionId === 'Q_SIGNATURE_REQUIRED')).toMatchObject(
      {
        state: 'provided',
        required: false,
      },
    );
    expect(assessment.filter((answer) => answer.state === 'invalid')).toMatchObject([
      { questionId: 'Q_AVG_PREP_TIME', required: false },
      { questionId: 'UNKNOWN', required: false },
    ]);
  });
});
