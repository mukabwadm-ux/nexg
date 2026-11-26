/**
 * A guest's rating of their stay (26 Nov 2026): one overall rating and six optional categories,
 * written through rpc_stay_review_submit and read back through rpc_stay_review_mine. Both check
 * the stay is the signed-in guest's own NexG booking; this file only shapes the form.
 */

export const STAY_REVIEW_CATEGORIES = [
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'location', label: 'Location' },
  { key: 'service', label: 'Service' },
  { key: 'facilities', label: 'Facilities' },
  { key: 'security', label: 'Security' },
  { key: 'value', label: 'Value for money' },
] as const;

export type StayReviewCategory = (typeof STAY_REVIEW_CATEGORIES)[number]['key'];

export const STAY_REVIEW_TEXT_MAX = 2000;

export interface MyStayReview {
  stay_id: string;
  check_in: string;
  check_out: string;
  status: string;
  property_name: string | null;
  unit_label: string | null;
  can_rate: boolean;
  review:
    | ({
        rating: number;
        text: string | null;
        answered_at: string;
        edited_at: string | null;
        editable_until: string;
        public: boolean;
        staff_reply: string | null;
      } & Partial<Record<StayReviewCategory, number | null>>)
    | null;
}

export type StayReviewInput = { rating: number; text: string | null } & Partial<
  Record<StayReviewCategory, number>
>;

const star = (v: FormDataEntryValue | null) => {
  const n = typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

/** The form's fields as the RPC's review object, or what the guest must fix. */
export function reviewFromForm(
  form: FormData,
): { ok: true; review: StayReviewInput } | { ok: false; message: string } {
  const rating = star(form.get('rating'));
  if (rating === null) return { ok: false, message: 'Choose an overall rating from 1 to 5 stars.' };
  const text = String(form.get('text') ?? '').trim();
  if (text.length > STAY_REVIEW_TEXT_MAX)
    return { ok: false, message: 'Keep your review to 2,000 characters.' };
  const review: StayReviewInput = { rating, text: text || null };
  for (const c of STAY_REVIEW_CATEGORIES) {
    const v = star(form.get(c.key));
    if (v !== null) review[c.key] = v;
  }
  return { ok: true, review };
}

/** The guest's NexG stays with their reviews, newest first; a non-array reads as none. */
export function asMyStayReviews(data: unknown): MyStayReview[] {
  return Array.isArray(data) ? (data as MyStayReview[]) : [];
}
