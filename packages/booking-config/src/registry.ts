import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import data from './data/registry.generated';
import type { JSONSchema, QuestionDefinition, Registry } from './types';
import {
  VARIANT_BASE_REVISION,
  VARIANT_REGISTRY_REVISION,
  withSubcategoryVariants,
} from './variants';

const snapshot = data as unknown as Registry;
if (snapshot.revision !== VARIANT_BASE_REVISION)
  throw new Error(
    `Subcategory variants extend ${VARIANT_BASE_REVISION}, but the registry is ${snapshot.revision}. Re-check src/data/subcategory-variants.json.`,
  );

/**
 * The audited snapshot plus the subcategory variants (see variants.ts).
 * A variant copies its base profile's model, questions, bindings and rules;
 * rule ids are re-keyed so they stay unique.
 */
export const registry: Registry = {
  ...snapshot,
  revision: VARIANT_REGISTRY_REVISION,
  profiles: withSubcategoryVariants(
    snapshot.profiles,
    (profile) => profile.subcategoryId,
    (base, variant) => ({
      ...structuredClone(base),
      categoryId: variant.categoryId,
      subcategoryId: variant.subcategoryId,
      name: variant.name,
      specialtyNeeds: variant.specialtyNeeds,
      rules: base.rules.map((rule) => ({
        ...structuredClone(rule),
        id: rule.id.replace(`_${base.subcategoryId}_`, `_${variant.subcategoryId}_`),
      })),
    }),
  ),
};
export const questions = new Map(registry.questions.map((question) => [question.id, question]));
export const aliases = new Map(
  registry.aliases.map((alias) => [alias.sourceQuestionId, alias.targetQuestionId]),
);
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});
addFormats(ajv);
ajv.addFormat('iana-time-zone', {
  type: 'string',
  validate: (value: string) => value === 'Africa/Nairobi',
});
const validators = new Map<string, ValidateFunction>();

export function canonicalQuestionId(id: string): string | undefined {
  const target = aliases.get(id) || id;
  return questions.has(target) ? target : undefined;
}
export function questionDefinition(id: string): QuestionDefinition | undefined {
  const canonical = canonicalQuestionId(id);
  return canonical ? questions.get(canonical) : undefined;
}
export function getQuestionSchema(id: string): JSONSchema | undefined {
  const schema = questionDefinition(id)?.schema;
  return schema ? structuredClone(schema) : undefined;
}
export function validateSchema(question: QuestionDefinition, value: unknown): string[] {
  let validator = validators.get(question.id);
  if (!validator) {
    validator = ajv.compile(question.schema);
    validators.set(question.id, validator);
  }
  if (validator(value)) return [];
  return (validator.errors || []).map(
    (error) => `${error.instancePath || '/'} ${error.message || 'is invalid'}`,
  );
}

export function validateQuestionSchemas(): { count: number; errors: string[] } {
  const errors: string[] = [];
  for (const question of questions.values()) {
    try {
      ajv.compile(question.schema);
    } catch (error) {
      errors.push(`${question.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { count: questions.size, errors };
}
