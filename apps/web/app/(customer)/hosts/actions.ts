'use server';

import { copyAirbnbCoverPhoto, fetchAirbnbListing } from '@/lib/airbnb-import';
import type { AirbnbListing } from '@/lib/airbnb-listing';
import { createClient } from '@/lib/supabase/server';

export interface HostApplyResult {
  ok: boolean;
  message: string;
  hostId?: string;
  /** The desk's reference for this application, e.g. NX-T-1042. */
  ticketReference?: string;
  /** What came over from Airbnb, so the done screen can say so. */
  imported?: { property: boolean; photo: boolean };
}

export interface HostApplyInput {
  contact_name: string;
  display_name: string;
  phone: string;
  listing_link: string | null;
  address: string;
  units_band: string;
  /** Optional: hosts set the rider hand-off rule per unit in the workspace. */
  handoff?: string | null;
  /** The applicant confirmed the Airbnb listing card on the form. */
  import_listing?: boolean;
  /** …and agreed that NexG may copy its cover photo. */
  photo_consent?: boolean;
}

/**
 * The landing-page form.
 *
 * Runs on the visitor's own session, which the form has already turned into
 * a verified login (email code), so `rpc_host_apply` makes them the owner of
 * the host it creates, under the email they verified. The RPC is
 * also where the rules live: the host lands as `applied`, the first unit is
 * created, the desk ticket and audit events are written in one transaction.
 *
 * When the applicant confirmed their Airbnb listing, it is read again here,
 * server-side (never taken from the browser), and the first property and
 * unit are created from it. Any failure in the import is dropped quietly:
 * the application itself never fails because Airbnb did not answer.
 */
export async function applyAsHost(input: HostApplyInput): Promise<HostApplyResult> {
  if (!input.phone?.trim()) {
    return { ok: false, message: 'We need a phone number to reach you about your guests.' };
  }

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, message: 'Your session expired. Reload the page and try again.' };
  }

  let listing: AirbnbListing | null = null;
  if (input.import_listing && input.listing_link) {
    listing = await fetchAirbnbListing(input.listing_link).catch(() => null);
  }

  const { data, error } = await supabase.rpc('rpc_host_apply', {
    p_payload: {
      contact_name: input.contact_name,
      display_name: input.display_name,
      phone: input.phone,
      /* No email: rpc_host_apply uses the email this login verified. */
      listing_link: listing?.url ?? input.listing_link,
      address: input.address,
      units_band: input.units_band,
      handoff: input.handoff ?? null,
      kind:
        input.units_band === '1'
          ? 'single_unit'
          : input.units_band === '20_plus'
            ? 'property_manager'
            : 'multi_unit',
      ...(listing
        ? {
            listing: {
              airbnb_id: listing.id,
              name: listing.name,
              kind: listing.kind,
              bedrooms: listing.bedrooms,
              bathrooms: listing.bathrooms,
              max_guests: listing.maxGuests,
            },
          }
        : {}),
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const result = data as {
    ok: boolean;
    host_id: string;
    unit_id?: string;
    property_id?: string | null;
    ticket_reference?: string;
  } | null;

  /* The cover photo, copied into NexG's own storage with the applicant's
     consent. Best effort: a failure only means they add photos later. */
  let photo = false;
  if (listing?.photoUrl && input.photo_consent && result?.host_id && result.unit_id) {
    try {
      const path = await copyAirbnbCoverPhoto(
        supabase,
        result.host_id,
        result.unit_id,
        listing.photoUrl,
      );
      const rpc = supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ error: unknown }>;
      const { error: photoError } = await rpc.call(supabase, 'rpc_host_listing_photo_set', {
        p_host_id: result.host_id,
        p_unit_id: result.unit_id,
        p_path: path,
        p_alt: listing.name,
      });
      photo = !photoError;
    } catch {
      photo = false;
    }
  }

  return {
    ok: true,
    message: 'Application received.',
    ...(result?.host_id ? { hostId: result.host_id } : {}),
    ...(result?.ticket_reference ? { ticketReference: result.ticket_reference } : {}),
    imported: { property: Boolean(listing && result?.property_id), photo },
  };
}
