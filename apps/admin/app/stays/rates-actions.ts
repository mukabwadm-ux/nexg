'use server';

import { revalidatePath } from 'next/cache';

import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

import type { Outcome } from './actions';

/*
 * Weekend, seasonal and long-stay rates (20270332000100). Each button goes
 * through an RPC that checks the caller works in hospitality, holds the
 * rules and writes the audit event in the same transaction.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Untyped = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function call(fn: string, args: Record<string, unknown>, done: string): Promise<Outcome> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  const db = createClient() as unknown as Untyped;
  const { error } = await db.rpc(fn, args);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/stays', 'layout');
  return { ok: true, message: done };
}

/** Empty is null; otherwise a whole number, or NaN when it is not one. */
function whole(value: string): number | null {
  const clean = value.replace(/[,\s%]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isInteger(n) ? n : Number.NaN;
}

/** A unit's weekend rate and long-stay discounts; empty clears each. */
export async function setRateRules(input: {
  unitId: string;
  weekend: string;
  weekly: string;
  monthly: string;
}): Promise<Outcome> {
  if (!UUID.test(input.unitId)) return { ok: false, message: 'Pick a unit.' };
  const weekend = whole(input.weekend);
  const weekly = whole(input.weekly);
  const monthly = whole(input.monthly);
  if ([weekend, weekly, monthly].some((v) => v != null && Number.isNaN(v)))
    return {
      ok: false,
      message: 'Type whole numbers: shillings for the rate, percent for discounts.',
    };
  return call(
    'rpc_console_unit_rate_rules_set',
    {
      p_unit_id: input.unitId,
      p_weekend_rate_kes: weekend,
      p_weekly_discount_pct: weekly,
      p_monthly_discount_pct: monthly,
    },
    'Rate rules saved.',
  );
}

/** Add a season (no id) or change one. */
export async function saveSeason(input: {
  id?: string;
  name: string;
  startsOn: string;
  endsOn: string;
  adjustPct: string;
  scope: string;
  scopeId: string;
}): Promise<Outcome> {
  if (!input.name.trim()) return { ok: false, message: 'Give the season a name.' };
  if (!DAY.test(input.startsOn) || !DAY.test(input.endsOn))
    return { ok: false, message: 'Pick the first and last night.' };
  const pct = whole(input.adjustPct.replace(/^\+/, ''));
  if (pct == null || Number.isNaN(pct))
    return { ok: false, message: 'Type the change as a whole percent, e.g. 20 or -15.' };
  if (!['everywhere', 'city', 'property', 'unit'].includes(input.scope))
    return { ok: false, message: 'Choose what the season applies to.' };
  if (input.scope !== 'everywhere' && !UUID.test(input.scopeId))
    return { ok: false, message: 'Choose the city, building or unit.' };
  return call(
    'rpc_console_stays_season_save',
    {
      p: {
        id: input.id && UUID.test(input.id) ? input.id : null,
        name: input.name.trim(),
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        adjust_pct: pct,
        scope: input.scope,
        scope_id: input.scope === 'everywhere' ? null : input.scopeId,
      },
    },
    input.id ? 'Season updated.' : 'Season added.',
  );
}

export async function endSeason(seasonId: string): Promise<Outcome> {
  if (!UUID.test(seasonId)) return { ok: false, message: 'The season is invalid.' };
  return call('rpc_console_stays_season_end', { p_season_id: seasonId }, 'Season ended.');
}
