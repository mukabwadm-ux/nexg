'use client';

import * as React from 'react';

import type { Outcome } from '@/app/merchant/actions';
import type { PromoMediaRef } from '@/lib/promo-media';
import { removeMedia, uploadPicked, type PickedMedia } from '@/lib/promo-media-client';

import { MediaPicker, type SavedMedia } from './media-picker';

/** The longest line a featured card takes (featured_rule creative.max_blurb_chars). */
export const BLURB_MAX = 60;

/** The claims a sponsored card may not make, found in a line, for saying so before it is sent. */
export function bannedIn(line: string, terms: readonly string[]): string[] {
  const lower = line.toLowerCase();
  return terms.filter((term) => term && lower.includes(term.toLowerCase()));
}

/** A card already saved for a placement, as the server describes it. */
export interface SavedCard {
  creativeId: string;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected';
  blurb: string | null;
  rejectionReason: string | null;
  media: (SavedMedia & PromoMediaRef) | null;
}

/** The homepage card's own fields: the media and the line under the name. */
export function CardFields({
  id,
  picked,
  onPick,
  blurb,
  onBlurb,
  saved,
  bannedTerms,
  disabled,
}: {
  id: string;
  picked: PickedMedia | null;
  onPick: (media: PickedMedia | null) => void;
  blurb: string;
  onBlurb: (value: string) => void;
  saved?: SavedMedia | null;
  bannedTerms: readonly string[];
  disabled?: boolean;
}) {
  const banned = bannedIn(blurb, bannedTerms);
  return (
    <div className="grid gap-3">
      <MediaPicker
        id={`${id}-media`}
        label="Your own image or video (optional)"
        hint="It fills the card, under the Sponsored label. 15:14, about 1200 × 1120, fits best."
        picked={picked}
        saved={saved}
        disabled={disabled}
        onPick={onPick}
      />
      <label className="grid gap-1">
        <span className="text-[0.8125rem] font-bold">Line under your name (optional)</span>
        <input
          value={blurb}
          maxLength={BLURB_MAX}
          disabled={disabled}
          placeholder="Charcoal grill · open till late"
          aria-describedby={`${id}-blurb-help`}
          onChange={(event) => onBlurb(event.target.value)}
          className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
        />
        <span
          id={`${id}-blurb-help`}
          className={`text-[0.6875rem] font-semibold ${banned.length ? 'text-danger' : 'text-muted-light'}`}
        >
          {banned.length
            ? `A sponsored card cannot say: ${banned.join(', ')}. Describe what you offer instead.`
            : `${blurb.length}/${BLURB_MAX}. Without one, the card shows your category and area.`}
        </span>
      </label>
    </div>
  );
}

/**
 * Sending media with a save: upload the chosen file (and a video's still),
 * then run the save with their paths. A refused save deletes what it
 * uploaded; a successful one deletes the files it left unused (`freed`).
 */
export function useMediaSend() {
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const reset = React.useCallback(() => {
    setBusy(false);
    setProgress(null);
    setStatus(null);
    setError(null);
  }, []);

  const send = React.useCallback(
    async (
      merchantId: string,
      picked: PickedMedia | null,
      save: (media: PromoMediaRef | null) => Promise<Outcome>,
      keep: PromoMediaRef | null = null,
    ): Promise<Outcome> => {
      setBusy(true);
      setError(null);
      let uploaded: PromoMediaRef | null = null;
      try {
        if (picked) {
          setStatus(picked.kind === 'video' ? 'Uploading your video…' : 'Uploading your image…');
          setProgress(0);
          uploaded = await uploadPicked(merchantId, picked, setProgress);
        }
        setProgress(null);
        setStatus('Checking and saving…');
        const outcome = await save(uploaded ?? keep);
        if (!outcome.ok) {
          if (uploaded) await removeMedia([uploaded.path, uploaded.posterPath]);
          setError(outcome.message ?? 'That did not save. Try again.');
          setStatus(null);
          return outcome;
        }
        const freed = (outcome.data?.freed as string[] | undefined) ?? [];
        if (freed.length) void removeMedia(freed);
        setStatus(outcome.message ?? 'Sent.');
        return outcome;
      } catch (caught) {
        if (uploaded) await removeMedia([uploaded.path, uploaded.posterPath]);
        const message =
          caught instanceof Error && caught.message
            ? caught.message
            : 'That did not send. Check your connection and try again.';
        setError(message);
        setStatus(null);
        setProgress(null);
        return { ok: false, message };
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { busy, progress, status, error, send, reset };
}
