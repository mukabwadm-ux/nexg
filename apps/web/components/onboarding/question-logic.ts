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

export function needsRiderPickup(answers: Record<string, string | string[]>): boolean {
  return conditionMatches(
    {
      any: [
        { answer: 'fulfillment_methods', includes: 'delivery' },
        { answer: 'collection', equals: 'rider_collects' },
        { answer: 'collection', equals: 'either' },
      ],
    },
    answers,
  );
}

export function questionIsVisible(
  question: Question,
  step: 2 | 4 | 5 | 6,
  answers: Record<string, string | string[]>,
): boolean {
  return (question.step ?? 2) === step && conditionMatches(question.when, answers);
}

export function questionHasAnswer(
  question: Question,
  answers: Record<string, string | string[]>,
): boolean {
  if (question.required === false) return true;
  const answer = answers[question.key];
  return Array.isArray(answer)
    ? answer.length > 0
    : typeof answer === 'string' && answer.trim() !== '';
}
