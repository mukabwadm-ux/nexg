'use client';

import { ImagePlus, Pause, Play, Plus, Square } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { savePromotion, setPromotionStatus, type Outcome } from '@/app/merchant/actions';
import { savePromotionMedia, withdrawPromotionMedia } from '@/app/merchant/promo-media-actions';
import type { CardMedia } from '@/components/home/featured-merchants';
import { promotionBenefit as benefitWords, type PromoMediaRef } from '@/lib/promo-media';
import { removeMedia, releasePicked, type PickedMedia } from '@/lib/promo-media-client';

import { useMediaSend } from './creative-composer';
import {
  PreviewDialog,
  PromotionBannerPreview,
  type BannerWords,
  type StoreSubject,
} from './creative-preview';
import { MediaPicker, type SavedMedia } from './media-picker';

export interface PromotionRow {
  id: string;
  name: string;
  kind: 'percent' | 'amount';
  value: number;
  catalogue_item_id: string | null;
  starts_at: string;
  ends_at: string | null;
  status: 'active' | 'paused' | 'ended';
}

export interface PromotableItem {
  id: string;
  name: string;
  price_kes: number;
}

/** A promotion's own picture or video, as the server describes it. */
export interface PromotionMedia {
  status: 'pending_review' | 'approved' | 'rejected';
  rejectionReason: string | null;
  /** An approved picture is still on the store while a newer one is reviewed. */
  approvedUp: boolean;
  media: (SavedMedia & PromoMediaRef) | null;
}

const kes = (value: number) => 'KES ' + value.toLocaleString('en-KE');

/* datetime-local wants local time without a zone; the database wants a zone. */
function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}
function when(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}

/** What the promotion does, in the words a guest would read. */
export function promotionBenefit(row: Pick<PromotionRow, 'kind' | 'value'>) {
  return row.kind === 'percent' ? `${row.value}% off` : `${kes(row.value)} off`;
}

function stateOf(row: PromotionRow, now: number) {
  if (row.status === 'ended' || (row.ends_at && Date.parse(row.ends_at) <= now)) return 'Ended';
  if (row.status === 'paused') return 'Paused';
  if (Date.parse(row.starts_at) > now) return 'Scheduled';
  return 'Running';
}

const TONE: Record<string, string> = {
  Running: 'bg-success-bg text-success',
  Scheduled: 'bg-info-bg text-info',
  Paused: 'bg-gold-soft text-gold-text',
  Ended: 'bg-bg text-muted',
};

const MEDIA_STATE: Record<PromotionMedia['status'], { label: string; tone: string }> = {
  pending_review: { label: 'Picture in review', tone: 'bg-info-bg text-info' },
  approved: { label: 'Picture on your store', tone: 'bg-success-bg text-success' },
  rejected: { label: 'Picture not approved', tone: 'bg-danger-bg text-danger' },
};

const EMPTY = {
  promotionId: null as string | null,
  name: '',
  kind: 'percent' as 'percent' | 'amount',
  value: '10',
  itemId: '',
  startsAt: '',
  endsAt: '',
};

function asCardMedia(picked: PickedMedia | null, saved: SavedMedia | null): CardMedia | null {
  if (picked) {
    return picked.kind === 'video'
      ? { kind: 'video', src: picked.url, poster: picked.poster?.url ?? null }
      : { kind: 'image', src: picked.url };
  }
  return saved ? { kind: saved.kind, src: saved.src, poster: saved.poster ?? null } : null;
}

/**
 * Create, change, pause, resume and end promotions. A running promotion
 * lowers the price at checkout: the same database function prices the basket
 * and the order.
 *
 * A promotion can also carry the merchant's own picture or video. Once NexG
 * approves it, it shows as a banner at the top of their store in Discovery
 * while the promotion runs. It is sent only from its preview.
 */
export function PromotionManager({
  promotions,
  items,
  merchantId,
  store,
  media = {},
}: {
  promotions: PromotionRow[] | null;
  items: PromotableItem[];
  merchantId?: string;
  store?: StoreSubject;
  media?: Record<string, PromotionMedia>;
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<typeof EMPTY | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<Outcome | null>(null);
  /* A picture being chosen: for the form (draft) or for one promotion in the list. */
  const [picked, setPicked] = React.useState<PickedMedia | null>(null);
  const [pictureFor, setPictureFor] = React.useState<string | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const sending = useMediaSend();
  const now = Date.now();
  const itemName = (id: string | null) =>
    id ? (items.find((item) => item.id === id)?.name ?? 'An item') : 'Everything in your catalogue';

  React.useEffect(() => () => releasePicked(picked), [picked]);

  const canPicture = Boolean(merchantId && store);
  const selected = draft?.itemId ? items.find((item) => item.id === draft.itemId) : undefined;
  const previewPrice =
    selected && draft
      ? Math.max(
          1,
          draft.kind === 'percent'
            ? Math.floor((selected.price_kes * (100 - Number(draft.value || 0))) / 100)
            : selected.price_kes - Number(draft.value || 0),
        )
      : null;

  function clearPicture() {
    releasePicked(picked);
    setPicked(null);
    setPictureFor(null);
  }

  async function run(fn: () => Promise<Outcome>) {
    setBusy(true);
    setSaid(null);
    try {
      const outcome = await fn();
      setSaid(outcome);
      if (outcome.ok) {
        setDraft(null);
        router.refresh();
      }
    } catch {
      setSaid({ ok: false, message: 'That did not save. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  }

  const draftInput = (mediaRef?: PromoMediaRef | null) =>
    draft
      ? {
          promotionId: draft.promotionId,
          name: draft.name,
          kind: draft.kind,
          value: Number(draft.value),
          itemId: draft.itemId || null,
          startsAt: fromLocalInput(draft.startsAt),
          endsAt: fromLocalInput(draft.endsAt),
          ...(mediaRef ? { media: mediaRef } : {}),
        }
      : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    /* With a picture chosen, the promotion is published from the preview. */
    if (picked && !pictureFor && canPicture) {
      sending.reset();
      setPreviewing(true);
      return;
    }
    const input = draftInput();
    if (input) void run(() => savePromotion(input));
  }

  /* The promotion the preview is about: the form being filled, or a listed one. */
  const listed = pictureFor ? promotions?.find((row) => row.id === pictureFor) : undefined;
  const banner: BannerWords | null = listed
    ? {
        name: listed.name,
        benefit: benefitWords(listed.kind, listed.value),
        scope: listed.catalogue_item_id
          ? `On ${itemName(listed.catalogue_item_id)}`
          : 'On everything',
        endsAt: listed.ends_at,
      }
    : draft
      ? {
          name: draft.name.trim() || 'Your promotion',
          benefit: benefitWords(draft.kind, Number(draft.value) || 0),
          scope: draft.itemId ? `On ${itemName(draft.itemId)}` : 'On everything',
          endsAt: fromLocalInput(draft.endsAt),
        }
      : null;
  const previewMedia = asCardMedia(picked, null);

  async function publish() {
    if (!merchantId) return;
    const outcome = pictureFor
      ? await sending.send(merchantId, picked, (ref) =>
          ref
            ? savePromotionMedia({ promotionId: pictureFor, media: ref })
            : Promise.resolve({ ok: false, message: 'Choose an image or a video first.' }),
        )
      : await sending.send(merchantId, picked, (ref) => {
          const input = draftInput(ref);
          return input
            ? savePromotion(input)
            : Promise.resolve({ ok: false, message: 'The promotion form closed. Open it again.' });
        });
    if (!outcome.ok) return;
    setPreviewing(false);
    setSaid(outcome);
    clearPicture();
    setDraft(null);
    router.refresh();
  }

  async function takeDown(promotionId: string) {
    if (!window.confirm('Take this picture down? Your store will stop showing it.')) return;
    await run(async () => {
      const outcome = await withdrawPromotionMedia(promotionId);
      const freed = (outcome.data?.freed as string[] | undefined) ?? [];
      if (outcome.ok && freed.length) void removeMedia(freed);
      return outcome;
    });
  }

  const pictureHint =
    'Once NexG approves it, it shows as a banner at the top of your store in Discovery while the promotion runs. 16:9, about 1600 × 900, fits best.';

  return (
    <section className="pm-panel" id="your-promotions" aria-labelledby="your-promotions-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="your-promotions-title">Your promotions</h2>
          <p className="pm-lead">
            Discounts on one item or your whole catalogue, taken off at checkout. Add your own
            picture or video and, once NexG approves it, it runs as a banner on your store.
          </p>
        </div>
        {!draft && (
          <button
            type="button"
            className="pm-button pm-primary"
            onClick={() => {
              setSaid(null);
              clearPicture();
              setDraft({ ...EMPTY });
            }}
          >
            <Plus size={16} aria-hidden /> Create promotion
          </button>
        )}
      </div>

      {said && (
        <p
          role="status"
          className={`mt-3 rounded-lg px-3 py-2 text-[0.8125rem] font-bold ${
            said.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {said.message}
        </p>
      )}

      {draft && (
        <form onSubmit={submit} className="pm-fields mt-4" aria-label="Promotion details">
          <label>
            Promotion name
            <input
              required
              maxLength={80}
              placeholder="Weekend special"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Applies to
            <select
              value={draft.itemId}
              onChange={(e) => setDraft({ ...draft, itemId: e.target.value })}
            >
              <option value="">Everything in your catalogue</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {kes(item.price_kes)}
                </option>
              ))}
            </select>
          </label>
          <div className="pm-two">
            <label>
              Discount
              <select
                value={draft.kind}
                onChange={(e) =>
                  setDraft({ ...draft, kind: e.target.value as 'percent' | 'amount' })
                }
              >
                <option value="percent">Percentage off</option>
                <option value="amount">Amount off (KES)</option>
              </select>
            </label>
            <label>
              {draft.kind === 'percent' ? 'Percent off (1–90)' : 'KES off'}
              <input
                required
                type="number"
                inputMode="numeric"
                min={1}
                max={draft.kind === 'percent' ? 90 : undefined}
                step={1}
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              />
            </label>
          </div>
          <div className="pm-two">
            <label>
              Starts
              <input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
              />
              <span className="pm-muted text-[0.75rem]">Leave empty to start now.</span>
            </label>
            <label>
              Ends
              <input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
              />
              <span className="pm-muted text-[0.75rem]">Leave empty to run until you end it.</span>
            </label>
          </div>
          {selected && previewPrice !== null && (
            <p className="pm-note">
              {selected.name}: <s>{kes(selected.price_kes)}</s> <strong>{kes(previewPrice)}</strong>{' '}
              while it runs.
            </p>
          )}
          {canPicture && (
            <MediaPicker
              id="promotion-media"
              label={
                draft.promotionId
                  ? 'A new picture or video for your store (optional)'
                  : 'Picture or video for your store (optional)'
              }
              hint={pictureHint}
              picked={pictureFor ? null : picked}
              disabled={busy || sending.busy}
              onPick={(media) => {
                setPictureFor(null);
                setPicked(media);
              }}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="pm-button pm-primary" disabled={busy || sending.busy}>
              {busy
                ? 'Saving…'
                : picked && !pictureFor && canPicture
                  ? 'Preview and publish'
                  : draft.promotionId
                    ? 'Save changes'
                    : 'Start promotion'}
            </button>
            <button
              type="button"
              className="pm-button"
              disabled={busy || sending.busy}
              onClick={() => {
                clearPicture();
                setDraft(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {promotions === null ? (
        <div className="pm-empty" role="alert">
          <strong>Promotions could not be loaded</strong>
          <p>Reload the page to try again.</p>
        </div>
      ) : promotions.length === 0 ? (
        !draft && (
          <div className="pm-empty">
            <strong>No promotions yet</strong>
            <p>Create one to put a discount on an item or your whole catalogue.</p>
          </div>
        )
      ) : (
        <ul className="divide-border mt-4 divide-y">
          {promotions.map((row) => {
            const state = stateOf(row, now);
            const picture = media[row.id];
            return (
              <li key={row.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-extrabold">
                      {row.name}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${TONE[state]}`}
                      >
                        {state}
                      </span>
                      {picture && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${MEDIA_STATE[picture.status].tone}`}
                        >
                          {MEDIA_STATE[picture.status].label}
                        </span>
                      )}
                    </p>
                    <p className="pm-muted text-[0.8125rem]">
                      {promotionBenefit(row)} · {itemName(row.catalogue_item_id)} · from{' '}
                      {when(row.starts_at)}
                      {row.ends_at ? ` to ${when(row.ends_at)}` : ', no end date'}
                    </p>
                    {picture?.status === 'rejected' && (
                      <p className="text-danger text-[0.8125rem] font-semibold">
                        Not approved: {picture.rejectionReason ?? 'see your messages'}. Choose
                        another picture and send it again.
                      </p>
                    )}
                    {picture?.status === 'pending_review' && picture.approvedUp && (
                      <p className="pm-muted text-[0.8125rem]">
                        Your approved picture stays on your store until NexG approves the new one.
                      </p>
                    )}
                  </div>
                  {state !== 'Ended' && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="pm-button"
                        disabled={busy}
                        onClick={() => {
                          clearPicture();
                          setDraft({
                            promotionId: row.id,
                            name: row.name,
                            kind: row.kind,
                            value: String(row.value),
                            itemId: row.catalogue_item_id ?? '',
                            startsAt: toLocalInput(row.starts_at),
                            endsAt: toLocalInput(row.ends_at),
                          });
                        }}
                      >
                        Edit
                      </button>
                      {canPicture && (
                        <button
                          type="button"
                          className="pm-button"
                          disabled={busy || sending.busy}
                          aria-expanded={pictureFor === row.id}
                          onClick={() => {
                            releasePicked(picked);
                            setPicked(null);
                            setPictureFor(pictureFor === row.id ? null : row.id);
                          }}
                        >
                          <ImagePlus size={14} aria-hidden />{' '}
                          {picture ? 'Change picture' : 'Add picture'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="pm-button"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            setPromotionStatus(
                              row.id,
                              row.status === 'paused' ? 'active' : 'paused',
                            ),
                          )
                        }
                      >
                        {row.status === 'paused' ? (
                          <>
                            <Play size={14} aria-hidden /> Resume
                          </>
                        ) : (
                          <>
                            <Pause size={14} aria-hidden /> Pause
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="pm-button"
                        disabled={busy}
                        onClick={() => void run(() => setPromotionStatus(row.id, 'ended'))}
                      >
                        <Square size={14} aria-hidden /> End
                      </button>
                    </div>
                  )}
                </div>
                {pictureFor === row.id && (
                  <div className="mt-3 grid gap-2 rounded-lg bg-[#faf8f3] p-3">
                    <MediaPicker
                      id={`promotion-media-${row.id}`}
                      label={
                        picture ? 'A new picture or video' : 'A picture or video for this promotion'
                      }
                      hint={pictureHint}
                      picked={picked}
                      saved={picture?.media ?? null}
                      disabled={busy || sending.busy}
                      onPick={setPicked}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="pm-button pm-primary"
                        disabled={!picked || busy || sending.busy}
                        onClick={() => {
                          sending.reset();
                          setPreviewing(true);
                        }}
                      >
                        Preview and send
                      </button>
                      {picture && picture.status !== 'rejected' && (
                        <button
                          type="button"
                          className="pm-button"
                          disabled={busy || sending.busy}
                          onClick={() => void takeDown(row.id)}
                        >
                          Take picture down
                        </button>
                      )}
                      <button type="button" className="pm-button" onClick={clearPicture}>
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {store && banner && previewMedia && (
        <PreviewDialog
          open={previewing}
          title="Your promotion on your store"
          intro="This is the banner guests see at the top of your store in Discovery, on a phone and on a computer, while the promotion runs. The video plays muted and on a loop."
          notes={[
            'NexG reviews the picture or video before guests see it, and tells you in your messages either way.',
            pictureFor
              ? 'Until the new one is approved, your store keeps what it shows now.'
              : 'The discount itself starts as you set it, picture or not: it is taken off at checkout.',
          ]}
          busy={sending.busy}
          progress={sending.progress}
          status={sending.status}
          error={sending.error}
          submitLabel={
            pictureFor
              ? 'Send for review'
              : draft?.promotionId
                ? 'Save and send'
                : 'Publish promotion'
          }
          onSubmit={() => void publish()}
          onClose={() => setPreviewing(false)}
        >
          <PromotionBannerPreview store={store} banner={banner} media={previewMedia} />
        </PreviewDialog>
      )}
    </section>
  );
}
