import type { Question, QuestionCondition } from './types';

export function conditionMatches(
  condition: QuestionCondition | undefined,
  answers: Record<string, string | string[]>,
): boolean {
  if (!condition) return true;
  if (condition.any) return condition.any.some((item) => conditionMatches(item, answers));
  if (condition.all) return condition.all.every((item) => conditionMatches(item, answers));
  if (!condition.answer) return false;

  const answer = answers[condition.answer];
  if (condition.includes !== undefined) {
    return Array.isArray(answer)
      ? answer.includes(condition.includes)
      : answer === condition.includes;
  }
  if (condition.equals !== undefined) {
    return Array.isArray(answer) ? answer.includes(condition.equals) : answer === condition.equals;
  }
  return false;
}

export function needsRiderPickup(
  answers: Record<string, string | string[]>,
  fulfillmentHints: readonly string[] = [],
): boolean {
  return (
    fulfillmentHints.some(
      (hint) =>
        hint !== 'ticket_delivery' && (hint.includes('last_mile') || hint.includes('delivery')),
    ) ||
    conditionMatches(
      {
        any: [
          { answer: 'fulfillment_methods', includes: 'delivery' },
          { answer: 'collection', equals: 'rider_collects' },
          { answer: 'collection', equals: 'either' },
        ],
      },
      answers,
    )
  );
}

export function questionIsVisible(
  question: Question,
  step: 2 | 4 | 5 | 6,
  answers: Record<string, string | string[]>,
): boolean {
  return (question.step ?? 2) === step && conditionMatches(question.when, answers);
}

export function deduplicateQuestions(questions: Question[]): Question[] {
  const result: Question[] = [];
  const indexByKey = new Map<string, number>();
  const indexByPrompt = new Map<string, number>();

  for (const question of questions) {
    const normalizedLabel = question.label
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    const promptKey = `${question.type}:${normalizedLabel}`;
    const existingIndex =
      indexByKey.get(question.key) ?? (normalizedLabel ? indexByPrompt.get(promptKey) : undefined);

    if (existingIndex === undefined) {
      const index = result.length;
      result.push({ ...question, answerKeys: [question.key] });
      indexByKey.set(question.key, index);
      if (normalizedLabel) indexByPrompt.set(promptKey, index);
      continue;
    }

    const existing = result[existingIndex];
    if (!existing) continue;

    const answerKeys = [...new Set([...(existing.answerKeys ?? [existing.key]), question.key])];
    const options = new Map((existing.options ?? []).map((option) => [option.value, option]));
    for (const option of question.options ?? []) {
      if (!options.has(option.value)) options.set(option.value, option);
    }

    result[existingIndex] = {
      ...existing,
      answerKeys,
      ...(existing.options || question.options ? { options: [...options.values()] } : {}),
      required: existing.required === false && question.required === false ? false : undefined,
    };
    indexByKey.set(question.key, existingIndex);
    if (normalizedLabel) indexByPrompt.set(promptKey, existingIndex);
  }

  return result;
}

export function questionAnswerValue(
  question: Question,
  answers: Record<string, string | string[]>,
): string | string[] | undefined {
  for (const key of question.answerKeys ?? [question.key]) {
    if (answers[key] !== undefined) return answers[key];
  }
  return undefined;
}

export function questionAnswerPatch(
  question: Question,
  answer: string | string[],
): Record<string, string | string[]> {
  return Object.fromEntries((question.answerKeys ?? [question.key]).map((key) => [key, answer]));
}

export function questionHasAnswer(
  question: Question,
  answers: Record<string, string | string[]>,
): boolean {
  if (question.required === false) return true;
  const answer = questionAnswerValue(question, answers);
  return Array.isArray(answer)
    ? answer.length > 0
    : typeof answer === 'string' && answer.trim() !== '';
}

export function toggleMultiSelection(selected: readonly string[], value: string): string[] {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
}
