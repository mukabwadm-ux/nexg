import 'server-only';

import { redirect } from 'next/navigation';

import { isMissingFunction } from './comms';
import { periodFrom, type Period } from './portal';
import { requireStaff, type StaffContext } from './staff';
import { createClient } from './supabase/server';

export interface CommsContext {
  staff: StaffContext;
  period: Period;
  cities: { id: string; name: string }[];
  city: string | null;
  /** Calls a Communications reader; its functions are newer than the generated types. */
  read: (fn: string, args: Record<string, unknown>) => Promise<Read>;
}

export interface Read {
  data: unknown;
  /** The migration is not on this database yet. */
  waiting: boolean;
  error: string | null;
}

type Untyped = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

/**
 * Who may open these screens: anyone the `communications` module reaches,
 * and, until that module is on the database, anyone with full Settings (the
 * screens then say they are waiting for the update).
 */
export function canOpenComms(staff: StaffContext): boolean {
  return staff.modules.some(
    (m) => m.key === 'communications' || (m.key === 'settings' && m.level === 'full'),
  );
}

/** What every Communications screen starts with: who is asking, the period, the cities. */
export async function commsContext(searchParams?: {
  from?: string;
  to?: string;
  city?: string;
}): Promise<CommsContext> {
  const staff = await requireStaff();
  if (!canOpenComms(staff)) redirect('/?denied=communications');
  const db = createClient();
  const { data: cityRows } = await db
    .from('city')
    .select('id, name, status')
    .in('status', ['live', 'soft_launch', 'paused'])
    .order('sort');
  const cities = ((cityRows as { id: string; name: string }[] | null) ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));
  const city =
    searchParams?.city && cities.some((c) => c.id === searchParams.city) ? searchParams.city : null;
  const untyped = db as unknown as Untyped;
  return {
    staff,
    period: periodFrom(searchParams),
    cities,
    city,
    read: async (fn, args) => {
      const { data, error } = await untyped.rpc(fn, args);
      return {
        data,
        waiting: isMissingFunction(error),
        error: error && !isMissingFunction(error) ? error.message : null,
      };
    },
  };
}
