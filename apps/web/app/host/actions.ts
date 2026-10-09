'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * What a host can do from their own portal.
 *
 * Every one of these is an RPC that re-checks membership, because
 * a server action is still just an HTTP endpoint and this file is
 * not the security boundary — the database is. Nothing here reads
 * a host id and trusts it.
 *
 * The messages come back from Postgres verbatim. They were written
 * to be read by a host on a phone, so re-wording them here would
 * mean maintaining the same sentence twice and eventually showing
 * two different ones for the same refusal.
 */

export interface Outcome {
  ok: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

const ALL = [
  '/host',
  '/host/properties',
  '/host/units',
  '/host/qr',
  '/host/bookings',
  '/host/requests',
  '/host/packages',
  '/host/refer',
  '/host/settings',
  '/host/operations',
  '/host/analytics',
  '/host/earnings',
];

function unwrap(
  data: unknown,
  error: { message: string } | null,
  paths: string[] = [],
  okMessage?: string,
): Outcome {
  if (error) {
    /* Postgres prefixes its own context; the host wants the
       sentence, not the function that raised it. */
    return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
  }
  for (const p of paths) revalidatePath(p);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    ok: r.ok !== false,
    message: (r.note as string | undefined) ?? (r.message as string | undefined) ?? okMessage,
    data: r,
  };
}

// ─────────────────────────────────────────────────── properties

export async function saveProperty(input: {
  hostId: string;
  propertyId?: string | null;
  name: string;
  kind: string;
  area: string;
  floors: string;
  summary: string;
  checkInFrom: string;
  checkOutBy: string;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_property_upsert', {
    p_host_id: input.hostId,
    p_property_id: input.propertyId ?? undefined,
    p_property: {
      name: input.name,
      kind: input.kind,
      area: input.area,
      floors: input.floors,
      summary: input.summary,
      check_in_from: input.checkInFrom,
      check_out_by: input.checkOutBy,
    } as never,
  });
  return unwrap(data, error, ALL, input.propertyId ? 'Saved.' : 'Property added.');
}

export async function setPropertyPhotos(
  propertyId: string,
  photos: { path: string; alt?: string; cover?: boolean }[],
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_property_photos_set', {
    p_property_id: propertyId,
    p_photos: photos as never,
  });
  return unwrap(data, error, ALL, 'Photos updated.');
}

export async function deleteProperty(propertyId: string, confirmName: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_property_delete', {
    p_property_id: propertyId,
    p_confirm_name: confirmName,
  });
  return unwrap(data, error, ALL);
}

// ──────────────────────────────────────────────────────── units

export async function saveUnit(input: {
  hostId: string;
  unitId?: string | null;
  propertyId?: string | null;
  name: string;
  labelPublic: string;
  floor: string;
  handoff: string;
  handoffNote: string;
  caretakerName: string;
  addressLine: string;
  bedrooms: string;
  maxGuests: string;
}): Promise<Outcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_unit_upsert_guarded', {
    p_host_id: input.hostId,
    p_unit_id: input.unitId ?? undefined,
    p_unit: {
      name: input.name,
      label_public: input.labelPublic,
      floor: input.floor,
      handoff: input.handoff,
      handoff_note: input.handoffNote,
      caretaker_name: input.caretakerName,
      address_line: input.addressLine,
    } as never,
  });

  /*
   * Property, bedrooms and guests are not parameters of
   * `rpc_unit_upsert` — it predates units belonging to a
   * property — so they are written after, scoped by host_id so
   * RLS still answers. Folding them into the RPC is the right
   * fix and is its own change; doing it here quietly would mean
   * two places that know how to write a unit.
   */
  const row = data as { id?: string } | null;
  if (!error && row?.id) {
    const patch: Record<string, unknown> = {};
    if (input.propertyId) patch.property_id = input.propertyId;
    if (input.bedrooms) patch.bedrooms = Number(input.bedrooms);
    if (input.maxGuests) patch.max_guests = Number(input.maxGuests);
    if (Object.keys(patch).length > 0) {
      await supabase.from('unit').update(patch).eq('id', row.id).eq('host_id', input.hostId);
    }
  }

  return unwrap(data, error, ALL, input.unitId ? 'Saved.' : 'Unit added.');
}

export async function setUnitPhotos(
  unitId: string,
  photos: { path: string; alt?: string; cover?: boolean }[],
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_unit_photos_set', {
    p_unit_id: unitId,
    p_photos: photos as never,
  });
  return unwrap(data, error, ALL, 'Photos updated.');
}

// ────────────────────────────────────────────────────── QR cards

/**
 * Generate one card for one spot.
 *
 * The RPC refuses a second live card in the same spot, and that
 * refusal is the useful one: two codes on one bedside table
 * split the attribution between them and neither number is then
 * worth reading.
 */
export async function generateCard(unitId: string, spot: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_qr_generate', {
    p_owner_type: 'unit',
    p_owner_id: unitId,
    p_placement: spot as never,
  });
  return unwrap(data, error, ALL, 'Card generated. Print it and mark it placed once it is in the room.');
}

export async function markCardPlaced(qrId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_qr_mark_placed', {
    p_qr_id: qrId,
    p_photo_path: undefined,
  });
  return unwrap(data, error, ALL, 'Marked as placed.');
}

export async function replaceCard(qrId: string, reason: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_qr_replace', {
    p_qr_id: qrId,
    p_reason: reason || 'Replaced by the host',
  });
  return unwrap(data, error, ALL, 'New card issued. The old one now tells a guest it is retired.');
}

export async function voidCard(qrId: string, reason: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_qr_void', {
    p_qr_id: qrId,
    p_reason: reason || 'Voided by the host',
  });
  return unwrap(data, error, ALL, 'Voided. Scans of it are still logged so you can see if it is still out there.');
}

export async function testScan(qrId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_qr_test_scan', { p_qr_id: qrId });
  return unwrap(data, error, ALL, 'Test scan recorded. It is flagged as a test and left out of Analytics.');
}

// ───────────────────────────────────────────────────── bookings

export async function saveBooking(input: {
  hostId: string;
  stayId?: string | null;
  unitId: string;
  guestFirstName: string;
  checkIn: string;
  checkOut: string;
  adults: string;
  children: string;
  source: string;
  phone: string;
  rateKes: string;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_stay_upsert', {
    p_host_id: input.hostId,
    p_stay_id: input.stayId ?? undefined,
    p_stay: {
      unit_id: input.unitId,
      guest_first_name: input.guestFirstName,
      check_in: input.checkIn,
      check_out: input.checkOut,
      party_adults: input.adults,
      party_children: input.children,
      source: input.source,
      phone: input.phone,
      rate_kes: input.rateKes,
    } as never,
  });

  const saved = data as { conflict_flagged?: boolean } | null;
  const out = unwrap(data, error, ALL, 'Booking saved.');
  if (out.ok && saved?.conflict_flagged) {
    out.message =
      'Saved, and flagged: it overlaps another booking in this unit. Both are kept — we do not pick one for you.';
  }
  return out;
}

export async function cancelBooking(stayId: string, reason: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_stay_cancel', {
    p_stay_id: stayId,
    p_reason: reason || undefined,
  });
  return unwrap(data, error, ALL, 'Cancelled.');
}

export async function connectCalendar(input: {
  hostId: string;
  provider: string;
  url: string;
  label: string;
  propertyId: string;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_calendar_connect', {
    p_host_id: input.hostId,
    p_payload: {
      provider: input.provider,
      url: input.url,
      label: input.label,
      property_id: input.propertyId || undefined,
    } as never,
  });
  return unwrap(
    data,
    error,
    ALL,
    'Connected, and waiting for its first sync. Keep entering bookings by hand until it shows as syncing.',
  );
}

export async function removeCalendar(connectionId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_calendar_remove', {
    p_connection_id: connectionId,
  });
  return unwrap(data, error, ALL);
}

// ───────────────────────────────────────────── requests & issues

export async function createRequest(input: {
  hostId: string;
  title: string;
  detail: string;
  kind: string;
  type: string;
  priority: string;
  unitId: string;
  ownerKind: string;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_host_request_create', {
    p_host_id: input.hostId,
    p_payload: {
      title: input.title,
      detail: input.detail,
      kind: input.kind,
      type: input.type,
      priority: input.priority,
      unit_id: input.unitId || undefined,
      owner_kind: input.ownerKind,
    } as never,
  });
  return unwrap(data, error, ALL, 'Raised. The countdown is set by your priority rules.');
}

export async function updateRequest(
  requestId: string,
  status: string,
  note: string,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_host_request_update', {
    p_request_id: requestId,
    p_status: status || undefined,
    p_note: note || undefined,
  });
  return unwrap(data, error, ALL, 'Updated.');
}

export async function escalateRequest(requestId: string, why: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_host_request_escalate', {
    p_request_id: requestId,
    p_why: why,
  });
  return unwrap(data, error, ALL, 'With NexG now, on the fifteen-minute clock.');
}

export async function resolveRequest(requestId: string, outcome: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_host_request_resolve', {
    p_request_id: requestId,
    p_outcome: outcome,
  });
  return unwrap(data, error, ALL, 'Resolved.');
}

// ───────────────────────────────────────────────────── packages

export async function savePackage(input: {
  hostId: string;
  packageId?: string | null;
  name: string;
  description: string;
  price: string;
  leadHours: string;
  items: string[];
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_host_package_upsert', {
    p_host_id: input.hostId,
    p_package_id: input.packageId ?? undefined,
    p_package: {
      name: input.name,
      description: input.description,
      price: input.price,
      lead_hours: input.leadHours,
      items: input.items.filter((i) => i.trim() !== ''),
    } as never,
  });
  return unwrap(data, error, ALL, input.packageId ? 'Saved.' : 'Package added.');
}

export async function archivePackage(packageId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_host_package_archive', {
    p_package_id: packageId,
  });
  return unwrap(data, error, ALL);
}

export async function schedulePackage(input: {
  hostId: string;
  unitId: string;
  packageId: string;
  forCheckinAt: string;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_package_schedule', {
    p_host_id: input.hostId,
    p_unit_id: input.unitId,
    p_package_id: input.packageId,
    p_for_checkin_at: input.forCheckinAt,
  });
  return unwrap(data, error, ALL, 'Scheduled. You are billed only once it is placed in the unit.');
}

// ───────────────────────────────────────────────────── referral

export async function createReferralLink(hostId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_host_referral_link', {
    p_host_id: hostId,
  });
  return unwrap(data, error, ['/host/refer', '/host/earnings'], 'Your link is ready.');
}

// ───────────────────────────────────────────────────── settings

export async function saveSettings(
  hostId: string,
  patch: Record<string, unknown>,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_host_settings_update', {
    p_host_id: hostId,
    p_patch: patch as never,
  });
  return unwrap(data, error, ALL, 'Saved.');
}

export async function saveTheme(theme: {
  theme: string;
  accent?: string;
  sidebar?: string;
  density?: string;
  font_size?: string;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_user_theme_set', {
    p_theme: theme as never,
  });
  return unwrap(data, error, ALL, 'Your theme is saved. It applies to your login only.');
}
