import 'server-only';

import { HostWorkspaceError, type HostWorkspaceAccess } from './access';

/*
 * Hiring in the host workspace: the jobs a host posts on NexG Careers, and
 * those of any hotel the signed-in person is an admin of (hotel people reach
 * NexG through this workspace). Everything is read with the person's own
 * session, so row-level security decides what they see; the shapes below
 * are what hosts-workspace/src/hiring.ts expects.
 */

export interface HiringEmployer {
  kind: 'host' | 'hotel';
  id: string;
  name: string;
  verified: boolean;
  cityId: string | null;
}

export interface HiringJob {
  id: string;
  employerKind: 'host' | 'hotel';
  employerId: string;
  employerName: string;
  title: string;
  category: string;
  jobType: string;
  status: 'draft' | 'open' | 'closed';
  cityId: string;
  area: string | null;
  openings: number;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: string | null;
  description: string;
  requirements: string | null;
  closesOn: string | null;
  postedAt: string | null;
  createdAt: string;
  takenDownReason: string | null;
  applicants: number;
  applicantsNew: number;
}

export interface HiringApplicant {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  note: string | null;
  cvName: string | null;
  status: string;
  employerNote: string | null;
  interviewAt: string | null;
  createdAt: string;
}

export interface HiringOverview {
  employers: HiringEmployer[];
  jobs: HiringJob[];
  cities: { id: string; name: string; timezone: string }[];
}

export interface HiringDetail {
  job: HiringJob;
  applicants: HiringApplicant[];
  timeZone: string;
}

interface VacancyRow {
  id: string;
  host_id: string | null;
  hotel_id: string | null;
  title: string;
  category: string;
  job_type: string;
  status: 'draft' | 'open' | 'closed';
  city_id: string;
  area: string | null;
  openings: number;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  description: string;
  requirements: string | null;
  closes_on: string | null;
  posted_at: string | null;
  created_at: string;
  taken_down_at?: string | null;
  taken_down_reason?: string | null;
}

/** Only an account-wide owner or manager hires; staff limited to some units do not. */
function requireHiring(access: HostWorkspaceAccess) {
  if (access.unitScope) {
    throw new HostWorkspaceError(403, 'Hiring is for the people who run the whole host account.');
  }
}

/** The host itself, and every hotel this person is an admin of. */
export async function readEmployers(access: HostWorkspaceAccess): Promise<HiringEmployer[]> {
  requireHiring(access);
  const [hostRes, adminRes] = await Promise.all([
    access.db
      .from('host')
      .select('id, display_name, status, city_id')
      .eq('id', access.hostId)
      .maybeSingle(),
    access.db
      .from('hotel_user')
      .select('hotel_id')
      .eq('user_id', access.userId)
      .eq('role', 'admin'),
  ]);
  if (hostRes.error || adminRes.error) {
    throw new HostWorkspaceError(503, 'Your businesses could not be loaded.');
  }
  const host = hostRes.data as {
    id: string;
    display_name: string | null;
    status: string;
    city_id: string | null;
  } | null;
  const hotelIds = ((adminRes.data as { hotel_id: string }[] | null) ?? []).map((r) => r.hotel_id);
  const hotelsRes = hotelIds.length
    ? await access.db
        .from('hotel')
        .select('id, name, status, city_id')
        .in('id', hotelIds)
        .order('name')
    : { data: [], error: null };
  if (hotelsRes.error) throw new HostWorkspaceError(503, 'Your hotels could not be loaded.');

  return [
    ...(host
      ? [
          {
            kind: 'host' as const,
            id: host.id,
            name: host.display_name?.trim() || access.name,
            verified: host.status === 'live',
            cityId: host.city_id,
          },
        ]
      : []),
    ...(
      (hotelsRes.data as { id: string; name: string; status: string; city_id: string | null }[]) ??
      []
    ).map((h) => ({
      kind: 'hotel' as const,
      id: h.id,
      name: h.name,
      verified: h.status === 'partner',
      cityId: h.city_id,
    })),
  ];
}

function toJob(
  row: VacancyRow,
  employers: HiringEmployer[],
  counts: Map<string, { all: number; fresh: number }>,
): HiringJob {
  const kind = row.host_id ? ('host' as const) : ('hotel' as const);
  const employerId = (row.host_id ?? row.hotel_id)!;
  const tally = counts.get(row.id) ?? { all: 0, fresh: 0 };
  return {
    id: row.id,
    employerKind: kind,
    employerId,
    employerName: employers.find((e) => e.kind === kind && e.id === employerId)?.name ?? '',
    title: row.title,
    category: row.category,
    jobType: row.job_type,
    status: row.status,
    cityId: row.city_id,
    area: row.area,
    openings: row.openings,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryPeriod: row.salary_period,
    description: row.description,
    requirements: row.requirements,
    closesOn: row.closes_on,
    postedAt: row.posted_at,
    createdAt: row.created_at,
    takenDownReason: row.taken_down_at ? (row.taken_down_reason ?? '') : null,
    applicants: tally.all,
    applicantsNew: tally.fresh,
  };
}

async function readJobs(access: HostWorkspaceAccess, employers: HiringEmployer[]) {
  const hostIds = employers.filter((e) => e.kind === 'host').map((e) => e.id);
  const hotelIds = employers.filter((e) => e.kind === 'hotel').map((e) => e.id);
  const filters = [
    ...(hostIds.length ? [`host_id.in.(${hostIds.join(',')})`] : []),
    ...(hotelIds.length ? [`hotel_id.in.(${hotelIds.join(',')})`] : []),
  ];
  if (!filters.length) return { rows: [] as VacancyRow[], counts: new Map() };

  /* Every column, so this works on either side of the take-down migration. */
  const { data, error } = await access.db
    .from('vacancy')
    .select('*')
    .or(filters.join(','))
    .order('created_at', { ascending: false });
  if (error) throw new HostWorkspaceError(503, 'Hiring is not switched on yet. Try again later.');
  const rows = (data as unknown as VacancyRow[] | null) ?? [];

  const counts = new Map<string, { all: number; fresh: number }>();
  if (rows.length) {
    const { data: apps, error: appsError } = await access.db
      .from('vacancy_application')
      .select('vacancy_id, status')
      .in(
        'vacancy_id',
        rows.map((r) => r.id),
      );
    if (appsError) throw new HostWorkspaceError(503, 'Applicants could not be counted.');
    for (const app of (apps as { vacancy_id: string; status: string }[] | null) ?? []) {
      if (app.status === 'withdrawn') continue;
      const tally = counts.get(app.vacancy_id) ?? { all: 0, fresh: 0 };
      tally.all += 1;
      if (app.status === 'submitted') tally.fresh += 1;
      counts.set(app.vacancy_id, tally);
    }
  }
  return { rows, counts };
}

export async function readHiring(access: HostWorkspaceAccess): Promise<HiringOverview> {
  const employers = await readEmployers(access);
  const [{ rows, counts }, citiesRes] = await Promise.all([
    readJobs(access, employers),
    access.db
      .from('city')
      .select('id, name, timezone')
      .in('status', ['live', 'soft_launch'])
      .order('sort'),
  ]);
  return {
    employers,
    jobs: rows.map((row) => toJob(row, employers, counts)),
    cities: (citiesRes.data as { id: string; name: string; timezone: string }[] | null) ?? [],
  };
}

export async function readHiringJob(
  access: HostWorkspaceAccess,
  jobId: string,
): Promise<HiringDetail> {
  const overview = await readHiring(access);
  const job = overview.jobs.find((j) => j.id === jobId);
  if (!job) throw new HostWorkspaceError(404, 'That job is not one of yours.');

  const { data, error } = await access.db
    .from('vacancy_application')
    .select(
      'id, full_name, email, phone, note, cv_name, status, employer_note, interview_at, created_at',
    )
    .eq('vacancy_id', jobId)
    .order('created_at', { ascending: false });
  if (error) throw new HostWorkspaceError(503, 'The applicants could not be loaded.');

  const order = ['submitted', 'shortlisted', 'interview', 'hired', 'rejected', 'withdrawn'];
  const applicants = (
    (data as
      | {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          note: string | null;
          cv_name: string | null;
          status: string;
          employer_note: string | null;
          interview_at: string | null;
          created_at: string;
        }[]
      | null) ?? []
  )
    .map((a) => ({
      id: a.id,
      fullName: a.full_name,
      email: a.email,
      phone: a.phone,
      note: a.note,
      cvName: a.cv_name,
      status: a.status,
      employerNote: a.employer_note,
      interviewAt: a.interview_at,
      createdAt: a.created_at,
    }))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

  return {
    job,
    applicants,
    timeZone: overview.cities.find((c) => c.id === job.cityId)?.timezone ?? 'Africa/Nairobi',
  };
}

/** Whether this person may act for this employer from the workspace. */
export async function requireEmployer(
  access: HostWorkspaceAccess,
  kind: 'host' | 'hotel',
  id: string,
): Promise<HiringEmployer> {
  const employer = (await readEmployers(access)).find((e) => e.kind === kind && e.id === id);
  if (!employer) throw new HostWorkspaceError(403, 'You do not hire for that business.');
  return employer;
}
