'use server';

import { createPublicClient } from '@/lib/supabase/public';

export interface HostApplyResult {
  ok: boolean;
  message: string;
  hostId?: string;
}

export interface HostApplyInput {
  contact_name: string;
  display_name: string;
  phone: string;
  email: string | null;
  listing_link: string | null;
  address: string;
  units_band: string;
  handoff: string | null;
}

/**
 * The landing-page form.
 *
 * Goes through `rpc_host_apply` rather than an insert: the RPC is
 * where the rules live — the host lands as `applied` and not live, the
 * first unit is created in `setting_up`, the acknowledgement is queued
 * and the audit event is written in the same transaction. An insert
 * from here would pass RLS and skip all of it.
 */
export async function applyAsHost(input: HostApplyInput): Promise<HostApplyResult> {
  if (!input.phone?.trim()) {
    return { ok: false, message: 'We need a phone number to reach you about your guests.' };
  }

  const supabase = createPublicClient();

  const { data, error } = await supabase.rpc('rpc_host_apply', {
    p_payload: {
      contact_name: input.contact_name,
      display_name: input.display_name,
      phone: input.phone,
      email: input.email,
      listing_link: input.listing_link,
      address: input.address,
      units_band: input.units_band,
      handoff: input.handoff,
      kind:
        input.units_band === '1'
          ? 'single_unit'
          : input.units_band === '20_plus'
            ? 'property_manager'
            : 'multi_unit',
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const result = data as { ok: boolean; host_id: string } | null;
  return { ok: true, message: 'Thanks — we will verify your listing.', hostId: result?.host_id };
}
