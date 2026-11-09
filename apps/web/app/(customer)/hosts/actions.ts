'use server';

import { createClient } from '@/lib/supabase/server';

export interface HostApplyResult {
  ok: boolean;
  message: string;
  hostId?: string;
  /** The desk's reference for this application, e.g. NX-T-1042. */
  ticketReference?: string;
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
}

/**
 * The landing-page form.
 *
 * Runs on the visitor's own session, which the form has already turned into
 * a verified login (email code), so `rpc_host_apply` makes them the owner of
 * the host it creates, under the email they verified. The RPC is
 * also where the rules live: the host lands as `applied`, the first unit is
 * created, the desk ticket and audit events are written in one transaction.
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

  const { data, error } = await supabase.rpc('rpc_host_apply', {
    p_payload: {
      contact_name: input.contact_name,
      display_name: input.display_name,
      phone: input.phone,
      /* No email: rpc_host_apply uses the email this login verified. */
      listing_link: input.listing_link,
      address: input.address,
      units_band: input.units_band,
      handoff: input.handoff ?? null,
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

  const result = data as { ok: boolean; host_id: string; ticket_reference?: string } | null;
  return {
    ok: true,
    message: 'Application received.',
    ...(result?.host_id ? { hostId: result.host_id } : {}),
    ...(result?.ticket_reference ? { ticketReference: result.ticket_reference } : {}),
  };
}
