import { unstable_cache } from 'next/cache';

import { createPublicClient } from '@/lib/supabase/public';

import type { BoardJob, JobType } from './board';

export interface BoardCity {
  slug: string;
  name: string;
}

/** What `careers_jobs_v` returns: NexG's own open roles. */
interface NexgRole {
  slug: string | null;
  title: string | null;
  location_label: string | null;
  contract: string | null;
  city_id: string | null;
  city_name: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  posted_at: string | null;
  is_general: boolean | null;
}

const CONTRACT_TYPE: Record<string, JobType> = {
  full_time: 'full_time',
  part_time: 'part_time',
  contract_6mo: 'temporary',
  internship: 'internship',
};

/** Tag dropped by every write that changes what the board shows. */
export const CAREERS_BOARD_TAG = 'careers-board';

/**
 * Every job on the board, and the cities NexG works in.
 *
 * The same for everybody, so it is cached: for five minutes at most, and
 * dropped at once when a business opens, edits or closes a job (the Hiring
 * actions revalidate `CAREERS_BOARD_TAG`). `unstable_cache` with a revalidate
 * is also what keeps supabase-js's plain fetches out of the Data Cache's
 * forever (see `lib/supabase/public.ts`).
 */
export const loadBoard = unstable_cache(
  async (): Promise<{ jobs: BoardJob[]; cities: BoardCity[] }> => {
    const supabase = createPublicClient();
    const [board, cityRows] = await Promise.all([
      supabase
        .from('careers_board_v')
        .select('*')
        .order('posted_at', { ascending: false })
        .limit(500),
      supabase
        .from('city')
        .select('slug, name')
        .in('status', ['live', 'soft_launch'])
        .order('sort'),
    ]);

    const cities = ((cityRows.data as BoardCity[] | null) ?? []).filter((c) => c.slug && c.name);

    if (!board.error) {
      return { jobs: (board.data as BoardJob[] | null) ?? [], cities };
    }

    /*
     * The board's view arrives with a migration that is run by hand, and the
     * site can deploy first. Until then the page lists NexG's own roles, as
     * it always has, rather than failing.
     */
    const { data } = await supabase
      .from('careers_jobs_v')
      .select(
        'slug, title, location_label, contract, city_id, city_name, salary_min, salary_max, salary_currency, posted_at, is_general',
      )
      .order('posted_at', { ascending: false });
    const jobs = ((data as NexgRole[] | null) ?? [])
      .filter((r): r is NexgRole & { slug: string; title: string } =>
        Boolean(r.slug && r.title && !r.is_general),
      )
      .map(
        (r): BoardJob => ({
          kind: 'nexg',
          id: r.slug,
          slug: r.slug,
          title: r.title,
          employer_name: 'NexG',
          employer_photo: null,
          category: null,
          job_type: r.contract ? (CONTRACT_TYPE[r.contract] ?? null) : null,
          city_id: r.city_id,
          city_name: r.city_name,
          city_slug: cities.find((c) => c.name === r.city_name)?.slug ?? null,
          area: r.location_label,
          salary_min: r.salary_min,
          salary_max: r.salary_max,
          salary_period: null,
          currency: r.salary_currency,
          openings: null,
          posted_at: r.posted_at,
          closes_on: null,
        }),
      );
    return { jobs, cities };
  },
  [CAREERS_BOARD_TAG],
  { revalidate: 300, tags: [CAREERS_BOARD_TAG] },
);
