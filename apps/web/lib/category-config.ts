import type { Database, Json } from '@nexg/db';

import type {
  BadgeRule,
  CatalogueExample,
  CategoryConfig,
  CategorySubcategory,
  Question,
  QuestionCondition,
  QuestionOption,
} from '@/components/onboarding/types';

type CategoryRow = Database['public']['Tables']['category_config']['Row'];
type JsonRecord = { [key: string]: Json | undefined };

function isRecord(value: Json | undefined): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readOptions(value: Json | undefined, category: string, key: string): QuestionOption[] {
  if (!Array.isArray(value)) return [];
  return value.map((option, index) => {
    if (!isRecord(option) || typeof option.value !== 'string' || typeof option.label !== 'string') {
      throw new Error(
        `Invalid option ${index + 1} in onboarding question "${key}" for ${category}.`,
      );
    }
    return { value: option.value, label: option.label };
  });
}

function readCondition(
  value: Json | undefined,
  category: string,
  key: string,
  depth = 0,
): QuestionCondition | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || depth > 4) {
    throw new Error(`Invalid display condition for onboarding question "${key}" in ${category}.`);
  }

  if (value.any !== undefined || value.all !== undefined) {
    const operator = value.any !== undefined ? 'any' : 'all';
    const expressions = value[operator];
    if (!Array.isArray(expressions) || expressions.length === 0) {
      throw new Error(
        `Invalid ${operator} condition for onboarding question "${key}" in ${category}.`,
      );
    }
    return {
      [operator]: expressions.map((expression) =>
        readCondition(expression, category, key, depth + 1),
      ) as QuestionCondition[],
    };
  }

  if (
    typeof value.answer !== 'string' ||
    (typeof value.equals !== 'string' && typeof value.includes !== 'string') ||
    (value.equals !== undefined && value.includes !== undefined)
  ) {
    throw new Error(`Invalid answer condition for onboarding question "${key}" in ${category}.`);
  }
  return {
    answer: value.answer,
    ...(typeof value.equals === 'string' ? { equals: value.equals } : {}),
    ...(typeof value.includes === 'string' ? { includes: value.includes } : {}),
  };
}

function readQuestions(value: Json, category: string): Question[] {
  if (!Array.isArray(value)) {
    throw new Error(`The onboarding questions for ${category} must be a list.`);
  }
  return value.map((question, index) => {
    if (
      !isRecord(question) ||
      typeof question.key !== 'string' ||
      typeof question.label !== 'string' ||
      (question.type !== 'single' && question.type !== 'multi' && question.type !== 'text')
    ) {
      throw new Error(`Invalid onboarding question ${index + 1} for ${category}.`);
    }
    const options = readOptions(question.options, category, question.key);
    if (question.type !== 'text' && options.length === 0) {
      throw new Error(`Onboarding question "${question.key}" for ${category} has no options.`);
    }
    if (
      question.step !== undefined &&
      question.step !== 2 &&
      question.step !== 4 &&
      question.step !== 5 &&
      question.step !== 6
    ) {
      throw new Error(`Invalid onboarding step for question "${question.key}" in ${category}.`);
    }
    if (question.required !== undefined && typeof question.required !== 'boolean') {
      throw new Error(
        `Invalid required flag for onboarding question "${question.key}" in ${category}.`,
      );
    }
    return {
      key: question.key,
      label: question.label,
      type: question.type,
      options,
      ...(typeof question.hint === 'string' ? { hint: question.hint } : {}),
      ...(question.step === 2 || question.step === 4 || question.step === 5 || question.step === 6
        ? { step: question.step }
        : {}),
      ...(typeof question.required === 'boolean' ? { required: question.required } : {}),
      ...(question.when !== undefined
        ? { when: readCondition(question.when, category, question.key) }
        : {}),
      ...(question.prepTimeWhen !== undefined
        ? { prepTimeWhen: readCondition(question.prepTimeWhen, category, question.key) }
        : {}),
    };
  });
}

function readExample(value: Json | undefined): CatalogueExample | undefined {
  if (!isRecord(value)) return undefined;
  const { name, description, pricePlaceholder, photoHint } = value;
  if (
    typeof name !== 'string' ||
    typeof description !== 'string' ||
    typeof pricePlaceholder !== 'string' ||
    typeof photoHint !== 'string'
  ) {
    return undefined;
  }
  return { name, description, pricePlaceholder, photoHint };
}

function readWorkflow(
  value: Json | undefined,
  category: string,
  subcategory: string,
): CategorySubcategory['workflow'] {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    (value.status !== 'designed' && value.status !== 'live') ||
    !Array.isArray(value.groups)
  ) {
    throw new Error(`Invalid workflow for ${category}/${subcategory}.`);
  }
  const groups = value.groups.map((group) => {
    if (!isRecord(group) || typeof group.title !== 'string' || !Array.isArray(group.steps)) {
      throw new Error(`Invalid workflow group for ${category}/${subcategory}.`);
    }
    const steps = group.steps.filter((step): step is string => typeof step === 'string');
    if (steps.length !== group.steps.length) {
      throw new Error(`Invalid workflow steps for ${category}/${subcategory}.`);
    }
    return { title: group.title, steps };
  });
  return {
    status: value.status,
    groups,
    ...(typeof value.policyNote === 'string' ? { policyNote: value.policyNote } : {}),
  };
}

function readSubcategories(value: Json, category: string): CategorySubcategory[] {
  if (!Array.isArray(value)) {
    throw new Error(`The subcategories for ${category} must be a list.`);
  }
  return value.map((subcategory, index) => {
    if (
      !isRecord(subcategory) ||
      typeof subcategory.id !== 'string' ||
      typeof subcategory.name !== 'string'
    ) {
      throw new Error(`Invalid subcategory ${index + 1} for ${category}.`);
    }
    const rawFields = subcategory.fields ?? [];
    if (!Array.isArray(rawFields)) {
      throw new Error(`Invalid setup fields for ${category}/${subcategory.id}.`);
    }
    const fields = rawFields.filter((field): field is string => typeof field === 'string');
    if (fields.length !== rawFields.length) {
      throw new Error(`Invalid setup fields for ${category}/${subcategory.id}.`);
    }
    const questions =
      subcategory.questions === undefined
        ? undefined
        : readQuestions(subcategory.questions, `${category}/${subcategory.id}`);
    return {
      id: subcategory.id,
      name: subcategory.name,
      ...(typeof subcategory.icon === 'string' ? { icon: subcategory.icon } : {}),
      ...(typeof subcategory.fulfillmentHint === 'string'
        ? { fulfillmentHint: subcategory.fulfillmentHint }
        : {}),
      ...(typeof subcategory.workflowHint === 'string'
        ? { workflowHint: subcategory.workflowHint }
        : {}),
      fields,
      ...(typeof subcategory.suggestedItemCount === 'number'
        ? { suggestedItemCount: subcategory.suggestedItemCount }
        : {}),
      ...(typeof subcategory.defaultWorkflow === 'string'
        ? { defaultWorkflow: subcategory.defaultWorkflow }
        : {}),
      ...(readExample(subcategory.catalogueExample)
        ? { catalogueExample: readExample(subcategory.catalogueExample) }
        : {}),
      ...(questions ? { questions } : {}),
      ...(subcategory.workflow !== undefined
        ? { workflow: readWorkflow(subcategory.workflow, category, subcategory.id) }
        : {}),
    };
  });
}

function readBadgeRules(value: Json): Record<string, Record<string, BadgeRule>> {
  if (!isRecord(value)) return {};
  const rules: Record<string, Record<string, BadgeRule>> = {};
  for (const [key, choices] of Object.entries(value)) {
    if (!isRecord(choices)) continue;
    const parsed: Record<string, BadgeRule> = {};
    for (const [choice, raw] of Object.entries(choices)) {
      if (
        isRecord(raw) &&
        typeof raw.text === 'string' &&
        (raw.tone === 'success' || raw.tone === 'neutral')
      ) {
        parsed[choice] = { text: raw.text, tone: raw.tone };
      }
    }
    rules[key] = parsed;
  }
  return rules;
}

export function categoryConfigFromRow(row: CategoryRow, imageUrl: string | null): CategoryConfig {
  if (row.card_kind !== 'menu' && row.card_kind !== 'services' && row.card_kind !== 'products') {
    throw new Error(`Invalid catalogue style for category "${row.category}".`);
  }
  if (row.eta_style !== 'minutes' && row.eta_style !== 'turnaround') {
    throw new Error(`Invalid timing style for category "${row.category}".`);
  }

  return {
    category: row.category,
    label: row.label,
    icon: row.icon,
    color: row.color ?? undefined,
    bg: row.bg ?? undefined,
    description: row.description ?? undefined,
    card_kind: row.card_kind,
    eta_style: row.eta_style,
    prep_time_required: row.prep_time_required,
    catalogue_example: readExample(row.catalogue_example),
    image_path: row.image_path,
    image_url: imageUrl,
    is_active: row.is_active,
    questions: readQuestions(row.questions, row.category),
    subcategories: readSubcategories(row.subcategories, row.category),
    badge_rules: readBadgeRules(row.badge_rules),
    featured_eligible: row.featured_eligible,
    requires_ops_mapping: row.requires_ops_mapping,
    sort: row.sort,
  };
}
