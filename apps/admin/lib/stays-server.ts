import 'server-only';

import { periodFrom, type Period } from './portal';
import { requireModule, requireStaff, type StaffContext } from './staff';
import { isMissingFunction, uuidOrNull } from './stays-module';
import { createClient } from './supabase/server';

export interface StaysContext {
  staff: StaffContext;
  period: Period;
  city: string | null;
  cities: { id: string; name: string }[];
  /** Calls a Stays reader; its functions are newer than the generated types. */
  read: (fn: string, args: Record<string, unknown>) => Promise<Read>;
  db: ReturnType<typeof createClient>;
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

/** What every Stays screen starts with: who is asking, the period, the city. */
export async function staysContext(searchParams?: {
  from?: string;
  to?: string;
  city?: string;
}): Promise<StaysContext> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
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
  const city = uuidOrNull(searchParams?.city);
  const untyped = db as unknown as Untyped;
  return {
    staff,
    period: periodFrom(searchParams),
    city: cities.some((c) => c.id === city) ? city : null,
    cities,
    db,
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
