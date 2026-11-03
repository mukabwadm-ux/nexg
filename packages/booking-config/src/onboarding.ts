import { evaluatePredicate } from './predicates';
import { questions, registry, validateSchema } from './registry';
import type { BookingModel, JSONSchema, ProfileDefinition, QuestionDefinition } from './types';

export type OnboardingCategory = {
  id: string;
  name: string;
  subcategories: { id: string; name: string }[];
};
export type OnboardingProfile = {
  categoryId: string;
  subcategoryId: string;
  name: string;
  defaultModelId: BookingModel;
  candidateModelIds: BookingModel[];
  sourceQuestionIds: string[];
  specialtyNeeds: string;
};
export type OnboardingQuestion = {
  id: string;
  key: string;
  label: string;
  schema: JSONSchema;
  canonicalTarget: string;
  subcategoryIds: string[];
};
export type OnboardingSelection = {
  revision: string;
  issues: string[];
  profiles: OnboardingProfile[];
  questions: OnboardingQuestion[];
};
export type OnboardingAnswers = Record<string, Record<string, unknown>>;
export type OnboardingAuthentication = { otpVerified: boolean; signedIn: boolean };
export type OnboardingAssessment = {
  id: string;
  subcategoryId: string;
  questionId: string;
  label: string;
  state: 'missing' | 'invalid' | 'provided' | 'optional' | 'inactive';
  required: boolean;
  messages: string[];
};

const profiles = new Map(registry.profiles.map((profile) => [profile.subcategoryId, profile]));

/** The compiled merchant registry owns category names and subcategory membership. */
export function listOnboardingCategories(): OnboardingCategory[] {
  const categories = new Map<string, OnboardingCategory>();
  for (const profile of registry.profiles) {
    let category = categories.get(profile.categoryId);
    if (!category) {
      category = { id: profile.categoryId, name: profile.categoryName, subcategories: [] };
      categories.set(category.id, category);
    }
    category.subcategories.push({ id: profile.subcategoryId, name: profile.name });
  }
  return [...categories.values()];
}

export function resolveOnboardingSelection(
  categoryId: string,
  subcategoryIds: readonly string[],
): OnboardingSelection {
  const result: OnboardingSelection = {
    revision: registry.revision,
    issues: [],
    profiles: [],
    questions: [],
  };
  if (!registry.profiles.some((profile) => profile.categoryId === categoryId)) {
    result.issues.push(
      categoryId ? `Unknown merchant category: ${categoryId}.` : 'Choose a merchant category.',
    );
    return result;
  }
  if (subcategoryIds.length === 0) result.issues.push('Choose at least one subcategory.');
  const selectedQuestions = new Map<string, OnboardingQuestion>();
  for (const subcategoryId of new Set(subcategoryIds)) {
    const profile = profiles.get(subcategoryId);
    if (!profile || profile.categoryId !== categoryId) {
      result.issues.push(`Subcategory ${subcategoryId} does not belong to category ${categoryId}.`);
      continue;
    }
    result.profiles.push({
      categoryId: profile.categoryId,
      subcategoryId: profile.subcategoryId,
      name: profile.name,
      defaultModelId: profile.defaultModelId,
      candidateModelIds: [...profile.candidateModelIds],
      sourceQuestionIds: [...profile.sourceQuestionIds],
      specialtyNeeds: profile.specialtyNeeds,
    });
    for (const questionId of profile.sourceQuestionIds) {
      const question = questions.get(questionId);
      if (!question) {
        result.issues.push(`Question ${questionId} is not registered for ${subcategoryId}.`);
        continue;
      }
      const selected = selectedQuestions.get(question.id);
      if (selected) selected.subcategoryIds.push(subcategoryId);
      else
        selectedQuestions.set(question.id, {
          id: question.id,
          key: question.key,
          label: question.label,
          schema: structuredClone(question.schema),
          canonicalTarget: question.canonicalTarget,
          subcategoryIds: [subcategoryId],
        });
    }
  }
  result.questions = [...selectedQuestions.values()];
  return result;
}

function predicateValues(
  profile: ProfileDefinition,
  answers: Record<string, unknown>,
  authenticated: boolean,
): Record<string, unknown> {
  const values: Record<string, unknown> = Object.create(null);
  for (const questionId of profile.sourceQuestionIds) {
    const question = questions.get(questionId);
    const value = answers[questionId];
    if (!question || value === undefined || value === null) continue;
    const result = validateSupplied(question, value);
    if (result.messages.length === 0) values[question.canonicalTarget] = result.value;
  }
  values.selected_category_ids = [profile.categoryId];
  values.selected_subcategory_ids = [profile.subcategoryId];
  values['resolved.candidate_booking_models'] = [...profile.candidateModelIds];
  if (authenticated) values['onboarding.stage'] = 'APPLICABLE_SPECIALTY_SETUP';
  return values;
}

function validateSupplied(
  question: QuestionDefinition,
  input: unknown,
): { value: unknown; messages: string[] } {
  let value = input;
  const mapping = question.normalization?.booleanMapping;
  if (
    question.schema.type === 'boolean' &&
    typeof value === 'string' &&
    mapping &&
    Object.hasOwn(mapping, value)
  )
    value = mapping[value];
  if (question.schema.trim === true && typeof value === 'string') value = value.trim();
  const visited = new Set<object>();
  const hasNonFiniteNumber = (input: unknown): boolean => {
    if (typeof input === 'number') return !Number.isFinite(input);
    if (typeof input !== 'object' || input === null || visited.has(input)) return false;
    visited.add(input);
    return Object.values(input).some(hasNonFiniteNumber);
  };
  const messages = validateSchema(question, value);
  if (hasNonFiniteNumber(value)) messages.push('/ must contain only finite JSON numbers');
  return { value, messages };
}

/** Declared answers describe setup. They do not verify facts or activate candidate workflows. */
export function assessOnboardingAnswers(
  selection: OnboardingSelection,
  answers: OnboardingAnswers,
  authentication: OnboardingAuthentication,
): OnboardingAssessment[] {
  const authenticated = authentication.otpVerified === true && authentication.signedIn === true;
  const assessments: OnboardingAssessment[] = [];
  const seen = new Set<string>();
  for (const selected of selection.profiles) {
    const profile = profiles.get(selected.subcategoryId);
    if (!profile || profile.categoryId !== selected.categoryId || seen.has(profile.subcategoryId))
      continue;
    seen.add(profile.subcategoryId);
    const scopedAnswers = answers[profile.subcategoryId] || {};
    const values = predicateValues(profile, scopedAnswers, authenticated);
    for (const questionId of profile.sourceQuestionIds) {
      const question = questions.get(questionId);
      if (!question) continue;
      const value = scopedAnswers[questionId];
      const supplied = value !== undefined && value !== null;
      const active = evaluatePredicate(question.visibleWhen, values) !== false;
      const messages = active && supplied ? validateSupplied(question, value).messages : [];
      const required =
        authenticated && active && evaluatePredicate(question.requiredWhen, values) === true;
      const state = !active
        ? 'inactive'
        : messages.length
          ? 'invalid'
          : supplied
            ? 'provided'
            : required
              ? 'missing'
              : 'optional';
      assessments.push({
        id: `${profile.subcategoryId}:${questionId}`,
        subcategoryId: profile.subcategoryId,
        questionId,
        label: question.label,
        state,
        required,
        messages:
          state === 'missing' ? [`${question.label} is required to complete setup.`] : messages,
      });
    }
    for (const questionId of Object.keys(scopedAnswers)) {
      if (profile.sourceQuestionIds.includes(questionId)) continue;
      assessments.push({
        id: `${profile.subcategoryId}:${questionId}`,
        subcategoryId: profile.subcategoryId,
        questionId,
        label: questions.get(questionId)?.label || questionId,
        state: 'invalid',
        required: false,
        messages: [`Question ${questionId} is not an input for ${profile.subcategoryId}.`],
      });
    }
  }
  return assessments;
}
