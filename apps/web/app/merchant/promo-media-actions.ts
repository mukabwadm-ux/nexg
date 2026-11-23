'use server';

import { revalidatePath } from 'next/cache';

import { merchantActionClient, requireMerchantActionObject } from '@/lib/merchant-action-access';
import { mediaPayload, type PromoMediaRef } from '@/lib/promo-media';
import { checkMerchantMedia } from '@/lib/promo-media-server';

import type { Outcome } from './actions';

/**
 * A merchant's own image or video, after the fact: a new homepage card for a
 * placement already asked for, a picture for a promotion already running,
 * and taking either down.
 *
 * The files are uploaded from the browser first (lib/promo-media-client).
 * These actions check that what arrived is what it claims to be, then hand
 * the paths to RPCs that check ownership, type and size again, send the
 * media for review and audit the change. Each outcome carries `freed`: files
 * the change left unused, which the browser deletes.
 */

const PATHS = ['/merchant', '/merchant/promotions'];

function settle(data: unknown, error: { message: string } | null): Outcome {
  if (error) return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
  for (const path of PATHS) revalidatePath(path);
  const reply = (data ?? {}) as Record<string, unknown>;
  return {
    ok: reply.ok !== false,
    message: reply.message as string | undefined,
    data: reply,
  };
}

/** Send a new card (media, line, or both) for a homepage placement. */
export async function saveFeaturedCard(input: {
  bookingId: string;
  media: PromoMediaRef | null;
  blurb: string;
}): Promise<Outcome> {
  const { client, merchantId } = await merchantActionClient();
  await requireMerchantActionObject(client, 'featured_booking', input.bookingId, merchantId);
  const refused = await checkMerchantMedia(client, merchantId, input.media);
  if (refused) return { ok: false, message: refused };
  const { data, error } = await client.rpc(
    'rpc_merchant_featured_card_save' as never,
    {
      p_booking_id: input.bookingId,
      p_media: mediaPayload(input.media),
      p_blurb: input.blurb.trim() || null,
    } as never,
  );
  return settle(data, error as { message: string } | null);
}

/** Take the card down: the slot shows the merchant's own photo and name. */
export async function withdrawFeaturedCard(bookingId: string): Promise<Outcome> {
  const { client, merchantId } = await merchantActionClient();
  await requireMerchantActionObject(client, 'featured_booking', bookingId, merchantId);
  const { data, error } = await client.rpc(
    'rpc_merchant_featured_card_withdraw' as never,
    { p_booking_id: bookingId } as never,
  );
  return settle(data, error as { message: string } | null);
}

/** Give a running or scheduled promotion a picture or video, for review. */
export async function savePromotionMedia(input: {
  promotionId: string;
  media: PromoMediaRef;
}): Promise<Outcome> {
  const { client, merchantId } = await merchantActionClient();
  await requireMerchantActionObject(client, 'merchant_promotion', input.promotionId, merchantId);
  const refused = await checkMerchantMedia(client, merchantId, input.media);
  if (refused) return { ok: false, message: refused };
  const { data, error } = await client.rpc(
    'rpc_merchant_promotion_media_save' as never,
    { p_promotion_id: input.promotionId, p_media: mediaPayload(input.media) } as never,
  );
  return settle(data, error as { message: string } | null);
}

/** Take a promotion's picture or video down, approved or waiting. */
export async function withdrawPromotionMedia(promotionId: string): Promise<Outcome> {
  const { client, merchantId } = await merchantActionClient();
  await requireMerchantActionObject(client, 'merchant_promotion', promotionId, merchantId);
  const { data, error } = await client.rpc(
    'rpc_merchant_promotion_media_withdraw' as never,
    { p_promotion_id: promotionId } as never,
  );
  return settle(data, error as { message: string } | null);
}
