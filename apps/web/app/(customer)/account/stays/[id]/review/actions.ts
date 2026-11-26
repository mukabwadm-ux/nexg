'use server';

import { revalidatePath } from 'next/cache';

import { reviewFromForm } from '@/lib/stay-review';
import { createClient } from '@/lib/supabase/server';

export interface ReviewResult {
  ok: boolean;
  message: string;
}

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Save the signed-in guest's rating of one stay. rpc_stay_review_submit checks the stay is
 * theirs, that they have checked out, and the 14-day window to change it; its messages are
 * written for the guest, so they are shown as they come.
 */
export async function submitStayReview(
  stayId: string,
  _prev: ReviewResult | null,
  form: FormData,
): Promise<ReviewResult> {
  if (!/^[0-9a-f-]{36}$/i.test(stayId)) return { ok: false, message: 'That stay is not there.' };
  const parsed = reviewFromForm(form);
  if (!parsed.ok) return parsed;

  const supabase = createClient();
  const { data, error } = await (supabase.rpc as unknown as Rpc)('rpc_stay_review_submit', {
    p_stay_id: stayId,
    p_review: parsed.review,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath('/account');
  revalidatePath(`/account/stays/${stayId}/review`);
  const moderation = (data as { moderation?: string } | null)?.moderation;
  return {
    ok: true,
    message:
      moderation === 'under_review'
        ? 'Thank you. We are sorry it fell short; the NexG team will read your review and may be in touch.'
        : 'Thank you for rating your stay.',
  };
}
