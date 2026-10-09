import type { Metadata } from 'next';

import { HostThemeFrame, type Theme } from '@/components/host/theme';
import { requireHost } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: { default: 'Your properties', template: '%s · NexG Host' },
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export interface HostHome {
  host_id: string;
  display_name: string;
  contact_name: string | null;
  kind: string;
  status: string;
  verification_code: string | null;
  submitted_at: string | null;
  went_live_at: string | null;
  city_name: string | null;
  properties: number;
  units_total: number;
  units_live: number;
  units_setting_up: number;
  qr_placed: number;
  scans_7d: number;
  orders_today: number;
  order_units_today: number;
}

export interface SetupProgress {
  host_id: string;
  display_name: string;
  status: string;
  verification_code: string | null;
  verification_method: string | null;
  submitted_at: string | null;
  step_about: boolean;
  step_unit: boolean;
  step_handoff: boolean;
  step_packages: boolean;
  step_verify: boolean;
  done_count: number;
  of_count: number;
  next_step: number | null;
  is_live: boolean;
}

export interface Attention {
  host_id: string;
  sort: number;
  kind: string;
  title: string;
  body: string;
  unit_id: string | null;
  unit_name: string | null;
}

/**
 * The host side of the account.
 *
 * The layout does nothing but check who is asking. Each page
 * reads what it draws, because the two home states need almost
 * disjoint sets of data and fetching both in a shared layout
 * would mean every page pays for the half it does not use.
 */
export default async function HostLayout({ children }: { children: React.ReactNode }) {
  await requireHost();
  /* Touch the client here so an expired session is refreshed
     once per navigation rather than per query below. */
  const supabase = createClient();

  /*
   * Read once, in the layout, for every page under it.
   *
   * Settings saved a theme and nothing changed, because nothing
   * ever read it back. Reading it per page would be eighteen
   * queries and eighteen chances for one page to miss it.
   */
  const { data } = await supabase.from('user_theme_v').select('*').maybeSingle();

  return <HostThemeFrame theme={data as Theme | null}>{children}</HostThemeFrame>;
}
