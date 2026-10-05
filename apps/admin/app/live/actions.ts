'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * The dispatcher's interventions.
 *
 * Thin, like every other actions file here. Which riders may be
 * overridden, what a boost costs, whether a cancellation needs a
 * second person — all of it lives in the RPCs, because the same
 * rules have to hold whether the call came from this console, from
 * a cron, or from the rider app accepting an offer.
 *
 * The error path matters more than usual on this screen. A
 * dispatcher at 20:45 has about three seconds to read why something
 * was refused, so the RPC's sentence is passed through intact
 * rather than replaced with "Something went wrong".
 */

export interface Outcome {
  ok: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

function fail(error: { message: string } | null): Outcome | null {
  if (!error) return null;
  return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
}

/*
 * The generated database types name every RPC, and this file is a
 * list of them. Passing the name through as a parameter loses that,
 * so each wrapper below names its own and this one takes the result.
 */
async function call(
  run: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  paths: string[],
): Promise<Outcome> {
  const { data, error } = await run;
  const bad = fail(error);
  if (bad) return bad;
  for (const p of paths) revalidatePath(p);
  const r = (data ?? {}) as Record<string, unknown>;
  return { ok: r.ok !== false, message: r.message as string | undefined, data: r };
}

const LIVE = ['/live', '/orders'];

export async function boostAndRetry(jobId: string, boostCents: number | null): Promise<Outcome> {
  return call(
    createClient().rpc('rpc_dispatch_boost_retry', {
      p_job_id: jobId,
      p_boost_cents: boostCents ?? undefined,
    }),
    LIVE,
  );
}

export async function previewWiden(jobId: string, radiusKm: number): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_dispatch_widen_preview', {
    p_job_id: jobId,
    p_radius_km: radiusKm,
  });
  const bad = fail(error);
  if (bad) return bad;
  const r = (data ?? {}) as Record<string, unknown>;
  return { ok: true, message: r.message as string | undefined, data: r };
}

export async function widenRadius(jobId: string, radiusKm: number): Promise<Outcome> {
  return call(
    createClient().rpc('rpc_dispatch_widen_radius', { p_job_id: jobId, p_radius_km: radiusKm }),
    LIVE,
  );
}

export async function assignManually(
  jobId: string,
  riderId: string,
  reason: string,
): Promise<Outcome> {
  return call(
    createClient().rpc('rpc_dispatch_assign_manual', {
      p_job_id: jobId,
      p_rider_id: riderId,
      p_reason: reason,
    }),
    LIVE,
  );
}

export async function tellGuestDelay(
  orderId: string,
  minutes: number,
  note: string,
): Promise<Outcome> {
  return call(
    createClient().rpc('rpc_dispatch_tell_guest_delay', {
      p_order_id: orderId,
      p_minutes: minutes,
      p_note: note || undefined,
    }),
    LIVE,
  );
}

export async function previewCancel(orderId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_dispatch_cancel_preview', {
    p_order_id: orderId,
  });
  const bad = fail(error);
  if (bad) return bad;
  return { ok: true, data: (data ?? {}) as Record<string, unknown> };
}

export async function cancelOrder(
  orderId: string,
  reasonCode: string,
  note: string,
): Promise<Outcome> {
  return call(
    createClient().rpc('rpc_dispatch_cancel', {
      p_order_id: orderId,
      p_reason_code: reasonCode,
      p_note: note || undefined,
    }),
    LIVE,
  );
}

export async function previewReassign(orderId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_dispatch_reassign_preview', {
    p_order_id: orderId,
  });
  const bad = fail(error);
  if (bad) return bad;
  return { ok: true, data: (data ?? {}) as Record<string, unknown> };
}

export async function reassignRider(
  orderId: string,
  riderId: string,
  reason: string,
): Promise<Outcome> {
  return call(
    createClient().rpc('rpc_dispatch_reassign', {
      p_order_id: orderId,
      p_rider_id: riderId,
      p_reason: reason,
    }),
    LIVE,
  );
}

export async function forceStack(jobId: string, riderId: string, reason: string): Promise<Outcome> {
  return call(
    createClient().rpc('rpc_dispatch_force_stack', {
      p_job_id: jobId,
      p_rider_id: riderId,
      p_reason: reason,
    }),
    LIVE,
  );
}

export async function pauseZone(
  zoneId: string,
  reason: string,
  until: string | null,
): Promise<Outcome> {
  return call(
    createClient().rpc('rpc_zone_pause', {
      p_zone_id: zoneId,
      p_reason: reason,
      p_until: until ?? undefined,
    }),
    LIVE,
  );
}

export async function resumeZone(zoneId: string, note: string): Promise<Outcome> {
  return call(
    createClient().rpc('rpc_zone_resume', { p_zone_id: zoneId, p_note: note || undefined }),
    LIVE,
  );
}

export async function loadReplay(jobId: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_dispatch_replay', { p_job_id: jobId });
  const bad = fail(error);
  if (bad) return bad;
  const r = (data ?? {}) as Record<string, unknown>;
  return { ok: true, message: r.message as string | undefined, data: r };
}

/** The nearest-riders panel, refreshed on its own rather than with the page. */
export async function nearestRiders(jobId: string, limit = 8): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_nearest_free', {
    p_job_id: jobId,
    p_limit: limit,
  });
  const bad = fail(error);
  if (bad) return bad;
  return { ok: true, data: { riders: data ?? [] } };
}
