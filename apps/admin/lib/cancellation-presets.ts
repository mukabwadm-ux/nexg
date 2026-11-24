/*
 * The preset cancellation policies hosts choose from (flexible, moderate,
 * strict), as rpc_cancellation_presets answers them
 * (20270315000100_host_subaccounts_and_commission.sql). NexG edits them; a
 * second person approves; stays already booked keep the tiers they were
 * booked with.
 */

export interface PresetTier {
  days_before: number;
  refund_pct: number;
}

export interface CancellationPreset {
  preset: 'flexible' | 'moderate' | 'strict';
  tiers: PresetTier[];
  text: string;
  approvedAt: string | null;
  pending: {
    id: string;
    tiers: PresetTier[];
    text: string;
    reason: string | null;
    requestedAt: string;
    requestedByName: string | null;
    mine: boolean;
  } | null;
}

export interface CancellationPresets {
  canRequest: boolean;
  canDecide: boolean;
  presets: CancellationPreset[];
}

export const PRESET_NAMES = ['flexible', 'moderate', 'strict'] as const;
export const MAX_TIERS = 5;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function tiersOf(v: unknown): PresetTier[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((t) => {
    if (!isObj(t)) return [];
    const days = Number(t.days_before);
    const back = Number(t.refund_pct);
    return Number.isInteger(days) && Number.isInteger(back)
      ? [{ days_before: days, refund_pct: back }]
      : [];
  });
}

/** rpc_cancellation_presets, or null when it errored or answered something else. */
export function toCancellationPresets(data: unknown): CancellationPresets | null {
  if (!isObj(data)) return null;
  const presets = (Array.isArray(data.presets) ? data.presets : []).flatMap(
    (p): CancellationPreset[] => {
      if (!isObj(p)) return [];
      const name = PRESET_NAMES.find((n) => n === p.preset);
      if (!name) return [];
      const pend = isObj(p.pending) ? p.pending : null;
      const pendId = pend ? str(pend.id) : null;
      return [
        {
          preset: name,
          tiers: tiersOf(p.tiers),
          text: str(p.text) ?? '',
          approvedAt: str(p.approvedAt),
          pending:
            pend && pendId
              ? {
                  id: pendId,
                  tiers: tiersOf(pend.tiers),
                  text: str(pend.text) ?? '',
                  reason: str(pend.reason),
                  requestedAt: str(pend.requestedAt) ?? '',
                  requestedByName: str(pend.requestedByName),
                  mine: pend.mine === true,
                }
              : null,
        },
      ];
    },
  );
  return {
    canRequest: data.canRequest === true,
    canDecide: data.canDecide === true,
    presets,
  };
}

/**
 * The rows typed on the screen, checked as the database will check them:
 * one to five steps, whole days 0 to 365 each different, 0 to 100% back,
 * never more back for cancelling later, and a 0-day step so every day up to
 * check-in has an answer. Returned most days first.
 */
export function checkTiers(
  rows: { days: string; pct: string }[],
): { ok: true; tiers: PresetTier[] } | { ok: false; message: string } {
  if (rows.length < 1 || rows.length > MAX_TIERS) {
    return { ok: false, message: 'A policy has one to five steps.' };
  }
  const tiers: PresetTier[] = [];
  for (const r of rows) {
    const days = r.days.trim();
    const back = r.pct.trim().replace(/%$/, '').trim();
    if (!/^\d{1,3}$/.test(days) || !/^\d{1,3}$/.test(back)) {
      return {
        ok: false,
        message: 'Each step needs whole days before check-in and a percent back.',
      };
    }
    const d = Number(days);
    const p = Number(back);
    if (d > 365 || p > 100) {
      return { ok: false, message: 'Days go up to 365 and the percent up to 100.' };
    }
    tiers.push({ days_before: d, refund_pct: p });
  }
  tiers.sort((a, b) => b.days_before - a.days_before);
  for (let i = 1; i < tiers.length; i++) {
    if (
      tiers[i]!.days_before === tiers[i - 1]!.days_before ||
      tiers[i]!.refund_pct > tiers[i - 1]!.refund_pct
    ) {
      return {
        ok: false,
        message:
          'Each step needs its own number of days, and never more back for cancelling later.',
      };
    }
  }
  if (tiers[tiers.length - 1]!.days_before !== 0) {
    return {
      ok: false,
      message: 'The last step is 0 days before check-in, so every day has an answer.',
    };
  }
  return { ok: true, tiers };
}
