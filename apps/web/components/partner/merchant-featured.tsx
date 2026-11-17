'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { requestFeatured, withdrawFeatured, type Outcome } from '@/app/merchant/actions';
import { saveFeaturedCard, withdrawFeaturedCard } from '@/app/merchant/promo-media-actions';
import type { CardMedia } from '@/components/home/featured-merchants';
import {
  BLURB_MAX,
  CardFields,
  bannedIn,
  useMediaSend,
  type SavedCard,
} from '@/components/merchant/promotions/creative-composer';
import {
  FeaturedCardPreview,
  PreviewDialog,
  type CardSubject,
} from '@/components/merchant/promotions/creative-preview';
import { removeMedia, releasePicked, type PickedMedia } from '@/lib/promo-media-client';

import { DASH, Panel, Pill, day, kesWhole } from './bits';

export interface Placement {
  id: string;
  kind: string;
  category: string | null;
  position: number;
  label: string;
  description: string | null;
  city_id: string;
  price_kes?: number | null;
  priceUnavailable?: boolean;
}

/** A product the merchant can promote in a Best sellers slot. */
export interface PromotableProduct {
  id: string;
  name: string;
  price_kes: number;
}

export interface Booking {
  id: string;
  placement_kind: string;
  status: string;
  wanted_start: string | null;
  weeks: number | null;
  quoted_price: number | null;
  requested_at: string;
  start_date: string | null;
  end_date: string | null;
}

const KIND: Record<string, string> = {
  homepage: 'Top of the homepage',
  category_top: 'Top of your category',
  popular_request: 'Best sellers on the homepage',
};

export function featuredPlacementLabel(kind: string) {
  return KIND[kind] ?? kind.replaceAll('_', ' ');
}

const TONE: Record<string, string> = {
  live: 'bg-success-bg text-success',
  booked: 'bg-success-bg text-success',
  quoted: 'bg-gold-soft text-gold-text',
  requested: 'bg-info-bg text-info',
  waitlisted: 'bg-info-bg text-info',
  declined: 'bg-danger-bg text-danger',
  cancelled: 'bg-bg text-muted-light',
  ended: 'bg-bg text-muted-light',
  expired: 'bg-bg text-muted-light',
};

const CARD_STATE: Record<SavedCard['status'], { label: string; tone: string }> = {
  draft: { label: 'NOT SENT', tone: 'bg-bg text-muted' },
  pending_review: { label: 'IN REVIEW', tone: 'bg-info-bg text-info' },
  approved: { label: 'APPROVED', tone: 'bg-success-bg text-success' },
  rejected: { label: 'NOT APPROVED', tone: 'bg-danger-bg text-danger' },
};

/** What the preview shows for a picked file, a saved one, or neither (the cover photo). */
function previewMedia(
  picked: PickedMedia | null,
  saved: SavedCard['media'] | null,
): CardMedia | null {
  if (picked) {
    return picked.kind === 'video'
      ? { kind: 'video', src: picked.url, poster: picked.poster?.url ?? null }
      : { kind: 'image', src: picked.url };
  }
  if (saved) return { kind: saved.kind, src: saved.src, poster: saved.poster ?? null };
  return null;
}

export function Featured({
  merchantId,
  status,
  eligibility,
  placements,
  bookings,
  nextMonday,
  products = [],
  showHistory = true,
  subject = null,
  bannedTerms = [],
  card = null,
  approvedCardUp = false,
}: {
  merchantId: string;
  status: string;
  eligibility: Record<string, unknown> | null;
  placements: Placement[];
  bookings: Booking[];
  nextMonday: string;
  /** Available, priced products, for the Best sellers slot. */
  products?: PromotableProduct[];
  showHistory?: boolean;
  /** The merchant as their homepage card shows them, for the preview. */
  subject?: CardSubject | null;
  /** Claims a sponsored card may not make (featured_rule). */
  bannedTerms?: string[];
  /** The newest homepage card sent for the open placement. */
  card?: SavedCard | null;
  /** An approved card stays on the homepage while a newer one is reviewed. */
  approvedCardUp?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<Outcome | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [week, setWeek] = React.useState(nextMonday);
  const [weeks, setWeeks] = React.useState(1);
  const [note, setNote] = React.useState('');
  const [itemId, setItemId] = React.useState(products[0]?.id ?? '');

  /* The homepage card being put together, for a new request or the open one. */
  const [picked, setPicked] = React.useState<PickedMedia | null>(null);
  const [blurb, setBlurb] = React.useState('');
  const [editingCard, setEditingCard] = React.useState(false);
  const [preview, setPreview] = React.useState<{ placement: Placement | null } | null>(null);
  const media = useMediaSend();

  React.useEffect(() => () => releasePicked(picked), [picked]);

  const clearCard = () => {
    releasePicked(picked);
    setPicked(null);
    setBlurb('');
  };

  const run = async (fn: () => Promise<Outcome>) => {
    setBusy(true);
    setSaid(null);
    try {
      const r = await fn();
      setSaid(r);
      if (r.ok) {
        setOpen(null);
        router.refresh();
      }
    } catch {
      setSaid({
        ok: false,
        message:
          'The featured placement request could not be updated. Reload Promotions and try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const openBooking = bookings.find((b) =>
    ['requested', 'quoted', 'waitlisted', 'booked', 'live'].includes(b.status),
  );
  const eligible = Boolean(eligibility?.passed);
  const why = (eligibility?.remedy ?? eligibility?.reason) as string | undefined;
  const cardFilled = Boolean(picked) || blurb.trim().length > 0;
  const blurbBanned = bannedIn(blurb, bannedTerms).length > 0;

  const openPreview = (placement: Placement | null) => {
    media.reset();
    setPreview({ placement });
  };

  async function sendFromPreview() {
    if (!preview) return;
    const placement = preview.placement;
    const outcome = placement
      ? await media.send(merchantId, picked, (ref) =>
          requestFeatured({
            merchantId,
            placementId: placement.id,
            weekStart: week,
            weeks,
            note,
            card: { media: ref, blurb },
          }),
        )
      : openBooking
        ? await media.send(
            merchantId,
            picked,
            (ref) => saveFeaturedCard({ bookingId: openBooking.id, media: ref, blurb }),
            /* A changed line with no new file keeps the current media. */
            card?.media && !picked
              ? { kind: card.media.kind, path: card.media.path, posterPath: card.media.posterPath }
              : null,
          )
        : null;
    if (!outcome?.ok) return;
    setPreview(null);
    setSaid(outcome);
    clearCard();
    setEditingCard(false);
    setOpen(null);
    router.refresh();
  }

  async function takeDown(bookingId: string) {
    if (!window.confirm('Take your card down? Your slot will show your business photo and name.'))
      return;
    await run(async () => {
      const outcome = await withdrawFeaturedCard(bookingId);
      const freed = (outcome.data?.freed as string[] | undefined) ?? [];
      if (outcome.ok && freed.length) void removeMedia(freed);
      return outcome;
    });
  }

  const previewSubject = subject ?? null;

  return (
    <div className="space-y-5">
      {said && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-[0.8125rem] font-bold ${
            said.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {said.message}
        </p>
      )}

      {status !== 'live' ? (
        <Panel title="Not yet">
          <p className="text-muted text-[0.8125rem] font-semibold">
            Featured slots are for businesses that are live and trading. Yours is {status}. Finish
            that first and this opens by itself.
          </p>
        </Panel>
      ) : openBooking ? (
        <Panel title="You have a request with us">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[0.9375rem] font-extrabold">
              {featuredPlacementLabel(openBooking.placement_kind)}
            </p>
            <Pill tone={TONE[openBooking.status]}>{openBooking.status.toUpperCase()}</Pill>
          </div>
          <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
            Week of {day(openBooking.wanted_start)} · {openBooking.weeks}{' '}
            {openBooking.weeks === 1 ? 'week' : 'weeks'} ·{' '}
            {openBooking.quoted_price === null
              ? `${DASH} a week, somebody will call you with the price`
              : `${kesWhole(openBooking.quoted_price)} a week`}
          </p>
          <p className="text-muted-light mt-1 text-[0.75rem] font-semibold">
            Nothing is charged until somebody has spoken to you and you have paid. We do not take
            card details on this page.
          </p>
          {['requested', 'quoted', 'waitlisted'].includes(openBooking.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => withdrawFeatured(openBooking.id))}
              className="mt-3 text-[0.75rem] font-extrabold underline underline-offset-4 disabled:opacity-40"
            >
              {busy ? 'Withdrawing…' : 'Withdraw this request'}
            </button>
          )}

          {openBooking.placement_kind === 'homepage' && (
            <section
              className="border-border mt-4 border-t pt-4"
              aria-labelledby="featured-card-title"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="featured-card-title" className="text-[0.875rem] font-extrabold">
                  Your homepage card
                </h3>
                {card && (
                  <Pill tone={CARD_STATE[card.status].tone}>{CARD_STATE[card.status].label}</Pill>
                )}
              </div>
              <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
                {!card
                  ? 'Your card shows your business photo and name. Add your own image or video to stand out.'
                  : card.status === 'pending_review'
                    ? approvedCardUp
                      ? 'Your new card is with NexG for review. Your approved card stays up until then.'
                      : 'With NexG for review. Until it is approved, your card shows your business photo and name.'
                    : card.status === 'approved'
                      ? 'Approved. It shows whenever your slot is live.'
                      : card.status === 'rejected'
                        ? `Not approved: ${card.rejectionReason ?? 'see your messages'}. Change it and send it again.`
                        : 'Not sent yet.'}
              </p>
              {card?.blurb && (
                <p className="text-muted-light mt-1 text-[0.75rem] font-semibold">
                  Line: “{card.blurb}”
                </p>
              )}

              {editingCard ? (
                <div className="bg-bg mt-3 space-y-3 rounded-xl p-3">
                  <CardFields
                    id="featured-card-edit"
                    picked={picked}
                    onPick={setPicked}
                    blurb={blurb}
                    onBlurb={setBlurb}
                    saved={card?.media ?? null}
                    bannedTerms={bannedTerms}
                    disabled={media.busy}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-40"
                      disabled={
                        media.busy ||
                        blurbBanned ||
                        (!picked && !blurb.trim() && !card?.media) ||
                        !previewSubject
                      }
                      onClick={() => openPreview(null)}
                    >
                      Preview and send
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-2 text-[0.8125rem] font-extrabold underline underline-offset-4"
                      onClick={() => {
                        clearCard();
                        setEditingCard(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    className="bg-ink rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white disabled:opacity-40"
                    onClick={() => {
                      clearCard();
                      setBlurb(card?.blurb ?? '');
                      setEditingCard(true);
                    }}
                  >
                    {card ? 'Change your card' : 'Add your own image or video'}
                  </button>
                  {card && card.status !== 'rejected' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void takeDown(openBooking.id)}
                      className="text-[0.75rem] font-extrabold underline underline-offset-4 disabled:opacity-40"
                    >
                      Take your card down
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
        </Panel>
      ) : !eligible ? (
        <Panel title="Not eligible yet">
          <p className="text-muted text-[0.8125rem] font-semibold">
            {why ??
              'Your account does not meet the bar for a paid placement at the moment. A green health band for a run of weeks is the usual way in.'}
          </p>
          <p className="text-muted-light mt-2 text-[0.75rem] font-semibold">
            A guest has to be able to trust a sponsored card.
          </p>
        </Panel>
      ) : (
        <Panel title="Slots in your city" note={`${placements.length} available`}>
          {placements.length === 0 ? (
            <p className="text-muted text-[0.8125rem] font-semibold">
              No placements are set up in your city yet.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {placements.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[0.9375rem] font-extrabold">
                        {p.label || featuredPlacementLabel(p.kind)}
                      </p>
                      {p.description && (
                        <p className="text-muted text-[0.8125rem] font-semibold">{p.description}</p>
                      )}
                      <p className="text-muted-light mt-0.5 text-[0.8125rem] font-semibold">
                        {p.priceUnavailable ? (
                          'Price could not be checked. NexG will confirm your quote.'
                        ) : p.price_kes === null || p.price_kes === undefined ? (
                          <>
                            <strong className="text-ink">{DASH}</strong> a week · no rate published
                            for your city yet, so somebody will quote you
                          </>
                        ) : (
                          <>
                            <strong className="text-ink">{kesWhole(p.price_kes)}</strong> a week
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        clearCard();
                        setOpen(open === p.id ? null : p.id);
                      }}
                      className="bg-ink shrink-0 rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white"
                    >
                      Ask for it
                    </button>
                  </div>

                  {open === p.id && (
                    <div className="bg-bg mt-3 space-y-2 rounded-xl p-3">
                      <div className="flex flex-wrap gap-2">
                        <label className="block">
                          <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
                            Starting the week of
                          </span>
                          <input
                            type="date"
                            value={week}
                            min={nextMonday}
                            onChange={(e) => setWeek(e.target.value)}
                            className="border-border-strong mt-1 block rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
                            For how long
                          </span>
                          <select
                            value={weeks}
                            onChange={(e) => setWeeks(Number(e.target.value))}
                            className="border-border-strong mt-1 block rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
                          >
                            {[1, 2, 4, 8, 12].map((w) => (
                              <option key={w} value={w}>
                                {w} {w === 1 ? 'week' : 'weeks'}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p className="text-muted text-[0.75rem] font-semibold">
                        Slots run Monday to Sunday, so the date has to be a Monday.
                        {p.price_kes != null && (
                          <>
                            {' '}
                            That would be{' '}
                            <strong className="text-ink">{kesWhole(p.price_kes * weeks)}</strong> in
                            all.
                          </>
                        )}
                      </p>
                      {p.kind === 'popular_request' && (
                        <label className="block">
                          <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
                            Product to promote
                          </span>
                          {products.length === 0 ? (
                            <span className="text-muted mt-1 block text-[0.75rem] font-semibold">
                              Add a priced, available product to your catalogue first.
                            </span>
                          ) : (
                            <select
                              value={itemId}
                              onChange={(e) => setItemId(e.target.value)}
                              className="border-border-strong mt-1 block w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
                            >
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} · {kesWhole(product.price_kes)}
                                </option>
                              ))}
                            </select>
                          )}
                          <span className="text-muted-light mt-1 block text-[0.6875rem] font-semibold">
                            It leads the Best sellers row on the homepage, marked Sponsored, and
                            opens straight to the product so guests can add it and check out.
                          </span>
                        </label>
                      )}
                      {p.kind === 'homepage' ? (
                        <div className="border-border space-y-2 border-t pt-3">
                          <p className="text-[0.8125rem] font-extrabold">Your homepage card</p>
                          <CardFields
                            id={`featured-card-${p.id}`}
                            picked={picked}
                            onPick={setPicked}
                            blurb={blurb}
                            onBlurb={setBlurb}
                            bannedTerms={bannedTerms}
                            disabled={busy || media.busy}
                          />
                          <p className="text-muted-light text-[0.6875rem] font-semibold">
                            NexG reviews your card before it goes on the homepage. Until then, and
                            if you send none, the card shows your business photo and name.
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-light text-[0.6875rem] font-semibold">
                          {p.kind === 'popular_request'
                            ? 'This slot shows your product’s own photo, so there is no card to design.'
                            : 'This slot puts your store first in its category as it already looks, so there is no card to design.'}
                        </p>
                      )}
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Anything we should know (optional)"
                        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
                      />
                      <div className="flex flex-wrap gap-2">
                        {p.kind === 'homepage' && cardFilled ? (
                          /* A card is sent only from its preview. */
                          <button
                            type="button"
                            disabled={busy || media.busy || blurbBanned || !previewSubject}
                            onClick={() => openPreview(p)}
                            className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-40"
                          >
                            Preview and send
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busy || (p.kind === 'popular_request' && !itemId)}
                              onClick={() =>
                                run(() =>
                                  requestFeatured({
                                    merchantId,
                                    placementId: p.id,
                                    weekStart: week,
                                    weeks,
                                    note,
                                    itemId: p.kind === 'popular_request' ? itemId : undefined,
                                  }),
                                )
                              }
                              className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-40"
                            >
                              {busy ? 'Asking…' : 'Ask for this slot'}
                            </button>
                            {p.kind === 'homepage' && previewSubject && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => openPreview(p)}
                                className="rounded-lg px-3 py-2 text-[0.8125rem] font-extrabold underline underline-offset-4"
                              >
                                Preview your card
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {showHistory && bookings.length > 0 && (
        <Panel title="Everything you have asked for">
          <ul className="divide-border divide-y">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-baseline justify-between gap-2 py-2">
                <span className="text-[0.8125rem] font-semibold">
                  {featuredPlacementLabel(b.placement_kind)} · week of{' '}
                  {day(b.wanted_start ?? b.start_date)}
                </span>
                <Pill tone={TONE[b.status]}>{b.status.toUpperCase()}</Pill>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {previewSubject && (
        <PreviewDialog
          open={preview !== null}
          title="Your homepage card"
          intro="This is the card guests see in Featured Merchants on the NexG homepage, on a phone and on a computer, while your slot is live. The video plays muted and on a loop."
          notes={[
            'NexG reviews your card before it goes on the homepage, and tells you in your messages either way.',
            preview?.placement
              ? 'Sending asks for the slot and sends the card together. Nothing is charged until somebody has spoken to you and you have paid.'
              : 'Until the new card is approved, your slot keeps what it shows now.',
            `Your line can be up to ${BLURB_MAX} characters and cannot claim to be the best, the cheapest or similar.`,
          ]}
          busy={media.busy}
          progress={media.progress}
          status={media.status}
          error={media.error}
          submitLabel={preview?.placement ? 'Send request and card' : 'Send card for review'}
          onSubmit={() => void sendFromPreview()}
          onClose={() => setPreview(null)}
        >
          <FeaturedCardPreview
            subject={previewSubject}
            media={previewMedia(picked, preview?.placement ? null : (card?.media ?? null))}
            blurb={blurb.trim() || null}
          />
        </PreviewDialog>
      )}
    </div>
  );
}
