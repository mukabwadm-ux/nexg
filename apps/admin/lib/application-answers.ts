import { resolveOnboardingSelection } from '@nexg/booking-config/onboarding';

/**
 * The category questions a new-form merchant answered, read from their
 * application (`merchant_application.payload`), not from `merchant.answers`,
 * which only the old step-by-step form wrote. Labelled from the same registry
 * the sign-up form asks from, one group per chosen specialty.
 */
export type ApplicationAnswerGroup = {
  subcategoryId: string;
  name: string;
  rows: { id: string; label: string; value: string }[];
};

export function applicationAnswerGroups(payload: unknown): ApplicationAnswerGroup[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as {
    categoryId?: unknown;
    subcategories?: unknown;
    answersBySubcategory?: unknown;
  };
  if (typeof p.categoryId !== 'string' || !Array.isArray(p.subcategories)) return [];
  const subcategories = p.subcategories.filter((id): id is string => typeof id === 'string');
  const answers =
    p.answersBySubcategory && typeof p.answersBySubcategory === 'object'
      ? (p.answersBySubcategory as Record<string, Record<string, unknown> | undefined>)
      : {};
  const selection = resolveOnboardingSelection(p.categoryId, subcategories);
  return selection.profiles.map((profile) => ({
    subcategoryId: profile.subcategoryId,
    name: profile.name,
    rows: selection.questions
      .filter((question) => question.subcategoryIds.includes(profile.subcategoryId))
      .map((question) => ({
        id: question.id,
        label: question.label,
        value: describeAnswer(answers[profile.subcategoryId]?.[question.id]),
      })),
  }));
}

export function describeAnswer(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(describeAnswer).join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(text)) {
    const words = text.replace(/_/g, ' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return text;
}
