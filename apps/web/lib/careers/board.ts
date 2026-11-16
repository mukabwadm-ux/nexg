/**
 * The jobs board on /careers: what a job looks like to the pages, and the
 * search, filter and pay helpers they share.
 *
 * Rows come from `careers_board_v`, which holds two kinds of job: those the
 * businesses on NexG post (kind `vacancy`, page /careers/jobs/[id]) and
 * NexG's own roles from the hiring system (kind `nexg`, page /careers/[slug]).
 * Filtering happens here rather than in the query: the board is a few hundred
 * rows at most, and the counts beside every filter need all of them anyway.
 */

export type JobType = 'full_time' | 'part_time' | 'temporary' | 'gig' | 'internship';

export type JobCategory =
  | 'hospitality'
  | 'food_beverage'
  | 'property'
  | 'tourism_travel'
  | 'logistics'
  | 'maintenance'
  | 'cleaning'
  | 'office_admin'
  | 'retail'
  | 'beauty_wellness'
  | 'other';

export type PayPeriod = 'hour' | 'day' | 'shift' | 'week' | 'month';

/** One row of `careers_board_v`. */
export interface BoardJob {
  kind: 'vacancy' | 'nexg';
  id: string;
  slug: string | null;
  title: string;
  employer_name: string;
  employer_photo: string | null;
  category: JobCategory | null;
  job_type: JobType | null;
  city_id: string | null;
  city_name: string | null;
  city_slug: string | null;
  area: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: PayPeriod | null;
  currency: string | null;
  openings: number | null;
  posted_at: string | null;
  closes_on: string | null;
}

export const JOB_TYPES: { key: JobType; label: string }[] = [
  { key: 'full_time', label: 'Full-time' },
  { key: 'part_time', label: 'Part-time' },
  { key: 'temporary', label: 'Temporary' },
  { key: 'gig', label: 'Freelance / Gig' },
  { key: 'internship', label: 'Internship' },
];

export const CATEGORIES: { key: JobCategory; label: string }[] = [
  { key: 'hospitality', label: 'Hospitality & Hotels' },
  { key: 'food_beverage', label: 'Food & Beverage' },
  { key: 'property', label: 'Property Management' },
  { key: 'tourism_travel', label: 'Tourism & Travel' },
  { key: 'logistics', label: 'Logistics & Operations' },
  { key: 'maintenance', label: 'Maintenance & Technical' },
  { key: 'cleaning', label: 'Cleaning & Housekeeping' },
  { key: 'office_admin', label: 'Office & Admin' },
  { key: 'retail', label: 'Retail & Sales' },
  { key: 'beauty_wellness', label: 'Beauty & Wellness' },
  { key: 'other', label: 'Other roles' },
];

export const PAY_PERIODS: { key: PayPeriod; label: string }[] = [
  { key: 'hour', label: 'Per hour' },
  { key: 'day', label: 'Per day' },
  { key: 'shift', label: 'Per shift' },
  { key: 'week', label: 'Per week' },
  { key: 'month', label: 'Per month' },
];

/** "Gig & On-Demand": short-term work of any kind. */
export const GIG_TYPES: JobType[] = ['gig', 'temporary'];

/** "Training & Growth": where a career starts. */
export const TRAINING_TYPES: JobType[] = ['internship'];

export const jobTypeLabel = (type: string | null): string | null =>
  JOB_TYPES.find((t) => t.key === type)?.label ?? null;

export const categoryLabel = (category: string | null): string | null =>
  CATEGORIES.find((c) => c.key === category)?.label ?? null;

/** Where a job's own page is. */
export function jobHref(job: Pick<BoardJob, 'kind' | 'id' | 'slug'>): string {
  return job.kind === 'nexg' && job.slug ? `/careers/${job.slug}` : `/careers/jobs/${job.id}`;
}

/** "Westlands, Nairobi", or whichever of the two is known. */
export function jobPlace(job: Pick<BoardJob, 'area' | 'city_name'>): string | null {
  const parts = [job.area, job.city_name].filter(Boolean) as string[];
  /* NexG's own roles say "Nairobi or Remote" in the area, city and all. */
  if (parts.length === 2 && parts[0]!.toLowerCase().includes(parts[1]!.toLowerCase())) {
    return parts[0]!;
  }
  return parts.length ? parts.join(', ') : null;
}

const amount = (value: number) => value.toLocaleString('en-KE');

/**
 * The pay as the board prints it: "KES 60,000 – 85,000 / month",
 * "From KES 15,000 / month", "Up to KES 1,500 / shift". Null when the job
 * does not say, so the card leaves the line out rather than guess.
 */
export function formatPay(
  job: Pick<BoardJob, 'salary_min' | 'salary_max' | 'salary_period' | 'currency'>,
): string | null {
  const { salary_min: min, salary_max: max } = job;
  if (min == null && max == null) return null;
  const currency = job.currency ?? 'KES';
  let text: string;
  if (min != null && max != null) {
    text =
      min === max ? `${currency} ${amount(min)}` : `${currency} ${amount(min)} – ${amount(max)}`;
  } else if (min != null) {
    text = `From ${currency} ${amount(min)}`;
  } else {
    text = `Up to ${currency} ${amount(max!)}`;
  }
  return job.salary_period ? `${text} / ${job.salary_period}` : text;
}

/** "Today", "Yesterday", "3 days ago", "2 weeks ago". */
export function postedAgo(postedAt: string | null, now: Date = new Date()): string | null {
  if (!postedAt) return null;
  const days = Math.floor((now.getTime() - new Date(postedAt).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

// ───────────────────────────────────────────────────────────── filters

export interface BoardFilters {
  q: string;
  types: JobType[];
  /** City slugs. */
  cities: string[];
  categories: JobCategory[];
}

export const NO_FILTERS: BoardFilters = { q: '', types: [], cities: [], categories: [] };

type SearchParams = Record<string, string | string[] | undefined>;

/* `type=gig&type=temporary` and `type=gig,temporary` both work: the first is
   what a form of checkboxes sends, the second what a link is easier to write. */
function many(params: SearchParams, key: string): string[] {
  const raw = params[key];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return [
    ...new Set(
      values
        .flatMap((v) => v.split(','))
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
}

export function readFilters(params: SearchParams | undefined): BoardFilters {
  const p = params ?? {};
  const q = (Array.isArray(p.q) ? p.q[0] : p.q) ?? '';
  return {
    q: q.trim().slice(0, 100),
    types: many(p, 'type').filter((t): t is JobType => JOB_TYPES.some((x) => x.key === t)),
    cities: many(p, 'city')
      .map((c) => c.toLowerCase())
      .slice(0, 20),
    categories: many(p, 'category').filter((c): c is JobCategory =>
      CATEGORIES.some((x) => x.key === c),
    ),
  };
}

export function hasFilters(filters: BoardFilters): boolean {
  return Boolean(
    filters.q || filters.types.length || filters.cities.length || filters.categories.length,
  );
}

/** The query string for a set of filters: "?q=chef&type=full_time". */
export function filtersQuery(filters: BoardFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  for (const t of filters.types) params.append('type', t);
  for (const c of filters.cities) params.append('city', c);
  for (const c of filters.categories) params.append('category', c);
  const query = params.toString();
  return query ? `?${query}` : '';
}

function matchesText(job: BoardJob, q: string): boolean {
  if (!q) return true;
  const haystack = [
    job.title,
    job.employer_name,
    job.area,
    job.city_name,
    categoryLabel(job.category),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

type Group = 'types' | 'cities' | 'categories';

/* Every filter but one: what the counts beside that one's options are taken
   from, so "Part-time (4)" says what ticking it would show. */
function matches(job: BoardJob, filters: BoardFilters, skip?: Group): boolean {
  if (!matchesText(job, filters.q)) return false;
  if (skip !== 'types' && filters.types.length && !filters.types.includes(job.job_type as JobType))
    return false;
  if (
    skip !== 'cities' &&
    filters.cities.length &&
    !filters.cities.includes((job.city_slug ?? '').toLowerCase())
  )
    return false;
  if (
    skip !== 'categories' &&
    filters.categories.length &&
    !filters.categories.includes(job.category as JobCategory)
  )
    return false;
  return true;
}

/** The jobs a set of filters leaves, newest first. */
export function filterJobs(jobs: BoardJob[], filters: BoardFilters): BoardJob[] {
  return jobs
    .filter((job) => matches(job, filters))
    .sort((a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? ''));
}

/**
 * The cities a job seeker can filter by: those NexG works in, and any other a
 * job on the board names (a NexG role can be in a city still on the way).
 */
export function boardCities(
  jobs: BoardJob[],
  cities: { slug: string; name: string }[],
): { slug: string; name: string }[] {
  const named = new Map(cities.map((c) => [c.slug.toLowerCase(), c.name]));
  for (const job of jobs) {
    const slug = job.city_slug?.toLowerCase();
    if (slug && job.city_name && !named.has(slug)) named.set(slug, job.city_name);
  }
  return [...named].map(([slug, name]) => ({ slug, name }));
}

export interface Facets {
  types: Record<string, number>;
  cities: Record<string, number>;
  categories: Record<string, number>;
}

/** How many jobs each filter option would show, with the other filters applied. */
export function facetCounts(jobs: BoardJob[], filters: BoardFilters): Facets {
  const facets: Facets = { types: {}, cities: {}, categories: {} };
  for (const job of jobs) {
    if (job.job_type && matches(job, filters, 'types')) {
      facets.types[job.job_type] = (facets.types[job.job_type] ?? 0) + 1;
    }
    if (job.city_slug && matches(job, filters, 'cities')) {
      const slug = job.city_slug.toLowerCase();
      facets.cities[slug] = (facets.cities[slug] ?? 0) + 1;
    }
    if (job.category && matches(job, filters, 'categories')) {
      facets.categories[job.category] = (facets.categories[job.category] ?? 0) + 1;
    }
  }
  return facets;
}
