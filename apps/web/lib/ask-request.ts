/**
 * The request on /ask ("Ask a concierge"): what a link may fill in, and the
 * checks and wording the form and its server action share.
 *
 * The categories come from @nexg/contracts on the server
 * (`ask-categories.ts`) and reach the form as props, so the browser does not
 * download the whole taxonomy to fill one dropdown.
 */

/** One option in the form's "Category" dropdown. */
export interface AskCategory {
  id: string;
  name: string;
  /** One line on what the category covers, shown under the dropdown. */
  desc: string;
}

export type AskWhen = 'asap' | 'later';

/** What the server action accepts as a phone number. The form checks it first. */
export const ASK_PHONE_PATTERN = /^[+0-9][0-9 ()-]{6,}$/;

/** Why a WhatsApp number would be refused, in the words the form shows; undefined if it is fine. */
export function askPhoneProblem(raw: string): string | undefined {
  const phone = raw.trim();
  if (phone.length < 7) return 'Enter your WhatsApp number, for example 0712 345 678.';
  if (phone.length > 20 || !ASK_PHONE_PATTERN.test(phone))
    return 'That does not look like a phone number.';
  return undefined;
}

/** "When" as a person reads it: on the form's summary, the sent card and the ticket. */
export function askWhenLabel(when: AskWhen, detail?: string | null): string {
  if (when === 'asap') return 'As soon as possible';
  return detail?.trim() || 'At a time to arrange';
}

/*
 * The chips the form had before the dropdown, which links may still name
 * (/ask?need=Airport%20Transfer), and the category each one meant.
 */
const LEGACY_NEEDS: Readonly<Record<string, string>> = {
  food: 'restaurants_food',
  drinks: 'alcohol_beverages',
  laundry: 'laundry_cleaning',
  'beauty & fashion': 'beauty',
  'airport transfer': 'airport_transfers',
};

/** The longest "Tell us more" the server action takes. */
export const ASK_NOTES_MAX = 600;

export interface AskPrefill {
  category?: string;
  notes?: string;
}

/**
 * What a link into /ask fills in. `?category=` names a category by id or
 * name. The older `?need=` names one too (an old chip, a name or an id), or
 * is a request in the asker's own words, which goes in "Tell us more".
 */
export function askPrefill(
  params: { get(name: string): string | null },
  categories: readonly AskCategory[],
): AskPrefill {
  const find = (key: string | null): string | undefined => {
    const wanted = key?.trim().toLowerCase();
    if (!wanted) return undefined;
    const id = LEGACY_NEEDS[wanted] ?? wanted;
    return categories.find((c) => c.id === id || c.name.toLowerCase() === wanted)?.id;
  };

  const category = find(params.get('category'));
  if (category) return { category };

  const need = params.get('need')?.trim();
  if (!need) return {};
  const named = find(need);
  return named ? { category: named } : { notes: need.slice(0, ASK_NOTES_MAX) };
}

/**
 * The ticket's body: the sentence a desk agent reads first. The same answers
 * also go in the ticket's `details`, one per field.
 */
export function askTicketBody(request: {
  categoryName: string;
  when: AskWhen;
  whenDetail?: string | null | undefined;
  stayingAt: string;
  notes?: string | null | undefined;
}): string {
  const when =
    request.when === 'asap'
      ? 'as soon as possible'
      : request.whenDetail?.trim() || 'at a time to arrange';
  return [
    `${request.categoryName} — ${when}.`,
    `Staying at: ${request.stayingAt}.`,
    request.notes ? `In their words: ${request.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
