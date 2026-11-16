import { describe, expect, it } from 'vitest';

import {
  NO_FILTERS,
  boardCities,
  facetCounts,
  filterJobs,
  filtersQuery,
  formatPay,
  jobHref,
  jobPlace,
  postedAgo,
  readFilters,
  type BoardJob,
} from './board';

function job(overrides: Partial<BoardJob>): BoardJob {
  return {
    kind: 'vacancy',
    id: 'v1',
    slug: null,
    title: 'Waiter',
    employer_name: 'Alpha Kitchen',
    employer_photo: null,
    category: 'food_beverage',
    job_type: 'part_time',
    city_id: 'c1',
    city_name: 'Nairobi',
    city_slug: 'nairobi',
    area: 'Westlands',
    salary_min: null,
    salary_max: null,
    salary_period: null,
    currency: 'KES',
    openings: 1,
    posted_at: '2026-11-10T08:00:00Z',
    closes_on: null,
    ...overrides,
  };
}

describe('formatPay', () => {
  it('prints a range with its period', () => {
    expect(formatPay(job({ salary_min: 60000, salary_max: 85000, salary_period: 'month' }))).toBe(
      'KES 60,000 – 85,000 / month',
    );
  });

  it('prints one end alone as from or up to', () => {
    expect(formatPay(job({ salary_min: 15000, salary_period: 'month' }))).toBe(
      'From KES 15,000 / month',
    );
    expect(formatPay(job({ salary_max: 1500, salary_period: 'shift' }))).toBe(
      'Up to KES 1,500 / shift',
    );
  });

  it('prints a single figure once', () => {
    expect(formatPay(job({ salary_min: 2000, salary_max: 2000, salary_period: 'day' }))).toBe(
      'KES 2,000 / day',
    );
  });

  it('says nothing when the job does not', () => {
    expect(formatPay(job({}))).toBeNull();
  });

  it('leaves the period out for NexG roles, which have none', () => {
    expect(formatPay(job({ kind: 'nexg', salary_min: 90000, salary_max: 120000 }))).toBe(
      'KES 90,000 – 120,000',
    );
  });
});

describe('where a job is', () => {
  it('opens a business job on its own page and a NexG role on the hiring page', () => {
    expect(jobHref(job({ id: 'abc' }))).toBe('/careers/jobs/abc');
    expect(jobHref(job({ kind: 'nexg', id: 'x', slug: 'concierge-agent' }))).toBe(
      '/careers/concierge-agent',
    );
  });

  it('names the area and the city, without saying the city twice', () => {
    expect(jobPlace(job({}))).toBe('Westlands, Nairobi');
    expect(jobPlace(job({ area: 'Nairobi or Remote (EAT)' }))).toBe('Nairobi or Remote (EAT)');
    expect(jobPlace(job({ area: null }))).toBe('Nairobi');
    expect(jobPlace(job({ area: null, city_name: null }))).toBeNull();
  });

  it('says how long ago a job went up', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    expect(postedAgo('2026-11-16T08:00:00Z', now)).toBe('Today');
    expect(postedAgo('2026-11-15T08:00:00Z', now)).toBe('Yesterday');
    expect(postedAgo('2026-11-11T08:00:00Z', now)).toBe('5 days ago');
    expect(postedAgo('2026-10-26T08:00:00Z', now)).toBe('3 weeks ago');
    expect(postedAgo(null, now)).toBeNull();
  });
});

describe('filters', () => {
  it('reads repeated and comma-separated values, and drops what it does not know', () => {
    const filters = readFilters({
      q: '  chef ',
      type: ['gig', 'temporary,full_time', 'bogus'],
      city: 'Nairobi',
      category: 'cleaning,nonsense',
    });
    expect(filters).toEqual({
      q: 'chef',
      types: ['gig', 'temporary', 'full_time'],
      cities: ['nairobi'],
      categories: ['cleaning'],
    });
  });

  it('writes filters back as an address that reads the same', () => {
    const filters = readFilters({ q: 'barista', type: ['gig', 'temporary'], city: 'mombasa' });
    expect(filtersQuery(filters)).toBe('?q=barista&type=gig&type=temporary&city=mombasa');
    expect(readFilters(Object.fromEntries(new URLSearchParams('q=barista&city=mombasa')))).toEqual({
      ...NO_FILTERS,
      q: 'barista',
      cities: ['mombasa'],
    });
    expect(filtersQuery(NO_FILTERS)).toBe('');
  });

  const jobs = [
    job({ id: 'a', title: 'Line cook', job_type: 'full_time', posted_at: '2026-11-01T00:00:00Z' }),
    job({
      id: 'b',
      title: 'Room attendant',
      category: 'cleaning',
      job_type: 'part_time',
      city_slug: 'mombasa',
      city_name: 'Mombasa',
      area: 'Nyali',
      posted_at: '2026-11-12T00:00:00Z',
    }),
    job({ id: 'c', title: 'Event waiter', job_type: 'gig', posted_at: '2026-11-08T00:00:00Z' }),
  ];

  it('keeps the jobs every filter allows, newest first', () => {
    expect(filterJobs(jobs, NO_FILTERS).map((j) => j.id)).toEqual(['b', 'c', 'a']);
    expect(
      filterJobs(jobs, { ...NO_FILTERS, types: ['gig', 'full_time'] }).map((j) => j.id),
    ).toEqual(['c', 'a']);
    expect(filterJobs(jobs, { ...NO_FILTERS, cities: ['mombasa'] }).map((j) => j.id)).toEqual([
      'b',
    ]);
  });

  it('matches every word of a search across title, business and place', () => {
    expect(filterJobs(jobs, { ...NO_FILTERS, q: 'alpha cook' }).map((j) => j.id)).toEqual(['a']);
    expect(filterJobs(jobs, { ...NO_FILTERS, q: 'westlands' })).toHaveLength(2);
    expect(filterJobs(jobs, { ...NO_FILTERS, q: 'pilot' })).toHaveLength(0);
  });

  it('counts each option with the other filters applied, not its own', () => {
    const facets = facetCounts(jobs, { ...NO_FILTERS, types: ['gig'], cities: ['nairobi'] });
    expect(facets.types).toEqual({ full_time: 1, gig: 1 });
    expect(facets.cities).toEqual({ nairobi: 1 });
    expect(facets.categories).toEqual({ food_beverage: 1 });
  });

  it('offers the cities NexG works in and any other a job names', () => {
    expect(
      boardCities(
        [job({ city_slug: 'kampala', city_name: 'Kampala' })],
        [{ slug: 'nairobi', name: 'Nairobi' }],
      ),
    ).toEqual([
      { slug: 'nairobi', name: 'Nairobi' },
      { slug: 'kampala', name: 'Kampala' },
    ]);
  });
});
