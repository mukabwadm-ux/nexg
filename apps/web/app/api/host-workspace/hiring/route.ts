import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';

import { CAREERS_BOARD_TAG } from '@/lib/careers/load';
import { zonedToInstant } from '@/lib/careers/zoned';
import {
  HostWorkspaceError,
  hostWorkspaceAccess,
  hostWorkspaceEnabled,
  hostWorkspaceError,
  hostWorkspaceJson,
  requireWorkspaceOrigin,
} from '@/lib/host-workspace/access';
import { readHiring, readHiringJob, requireEmployer } from '@/lib/host-workspace/hiring';

export const dynamic = 'force-dynamic';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
const money = z.number().int().positive().max(100_000_000).nullable();

const actionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('save'),
      employerKind: z.enum(['host', 'hotel']),
      employerId: uuid,
      id: uuid.optional(),
      title: text(120),
      category: text(40),
      jobType: text(40),
      cityId: uuid,
      area: text(80),
      openings: z.number().int().min(1).max(500),
      salaryMin: money,
      salaryMax: money,
      salaryPeriod: text(10),
      description: text(6000),
      requirements: text(4000),
      closesOn: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
      publish: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal('status'), id: uuid, status: z.enum(['open', 'closed']) }).strict(),
  z
    .object({
      action: z.literal('move'),
      jobId: uuid,
      applicationId: uuid,
      status: z.enum(['submitted', 'shortlisted', 'interview', 'hired', 'rejected']),
      message: text(1000),
      interviewLocal: z.string().max(16),
    })
    .strict(),
  z.object({ action: z.literal('cv'), jobId: uuid, applicationId: uuid }).strict(),
]);

/* The board, the job's own page and this workspace all show the job. */
function boardChanged(id: string) {
  revalidateTag(CAREERS_BOARD_TAG);
  revalidatePath('/careers');
  revalidatePath('/careers/jobs');
  revalidatePath(`/careers/jobs/${id}`);
}

export async function GET(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    const access = await hostWorkspaceAccess();
    const job = new URL(request.url).searchParams.get('job');
    if (job === null) return hostWorkspaceJson(await readHiring(access));
    if (!uuid.safeParse(job).success) throw new HostWorkspaceError(400, 'Choose a valid job.');
    return hostWorkspaceJson(await readHiringJob(access, job));
  } catch (error) {
    return hostWorkspaceError(error);
  }
}

export async function POST(request: Request) {
  if (!hostWorkspaceEnabled()) return hostWorkspaceJson({ error: 'Workspace unavailable.' }, 404);
  try {
    requireWorkspaceOrigin(request);
    if (
      !request.headers.get('content-type')?.startsWith('application/json') ||
      Number(request.headers.get('content-length')) > 32_000
    ) {
      throw new HostWorkspaceError(400, 'Check the job and try again.');
    }
    const access = await hostWorkspaceAccess();
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HostWorkspaceError(400, 'Check the job and try again.');
    const action = parsed.data;

    if (action.action === 'save') {
      await requireEmployer(access, action.employerKind, action.employerId);
      const { data, error } = await access.db.rpc('rpc_vacancy_save_for', {
        p_employer: action.employerKind,
        p_employer_id: action.employerId,
        p_vacancy_id: action.id,
        p_title: action.title,
        p_category: action.category,
        p_job_type: action.jobType,
        p_city_id: action.cityId,
        p_description: action.description,
        p_area: action.area || undefined,
        p_openings: action.openings,
        p_salary_min: action.salaryMin ?? undefined,
        p_salary_max: action.salaryMax ?? undefined,
        p_salary_period: action.salaryPeriod || undefined,
        p_requirements: action.requirements || undefined,
        p_closes_on: action.closesOn || undefined,
        p_publish: action.publish,
      });
      if (error) throw new HostWorkspaceError(422, error.message);
      const row = data as unknown as { id: string; status: string };
      boardChanged(row.id);
      return hostWorkspaceJson({
        id: row.id,
        message:
          row.status === 'open'
            ? 'Published. The job is on the board now.'
            : row.status === 'draft'
              ? 'Saved as a draft. Nobody else can see it yet.'
              : 'Saved.',
      });
    }

    if (action.action === 'status') {
      const { jobs } = await readHiring(access);
      if (!jobs.some((j) => j.id === action.id)) {
        throw new HostWorkspaceError(404, 'That job is not one of yours.');
      }
      const { error } = await access.db.rpc('rpc_vacancy_set_status', {
        p_vacancy_id: action.id,
        p_status: action.status,
      });
      if (error) throw new HostWorkspaceError(422, error.message);
      boardChanged(action.id);
      return hostWorkspaceJson({
        message:
          action.status === 'open' ? 'The job is on the board.' : 'Closed. It is off the board.',
      });
    }

    /* Moving an applicant or opening a CV: only for one of this person's jobs. */
    const { job, applicants, timeZone } = await readHiringJob(access, action.jobId);
    if (!applicants.some((a) => a.id === action.applicationId)) {
      throw new HostWorkspaceError(404, 'That application is not for this job.');
    }

    if (action.action === 'move') {
      const interviewAt =
        action.status === 'interview' && action.interviewLocal
          ? zonedToInstant(action.interviewLocal, timeZone)
          : null;
      const { error } = await access.db.rpc('rpc_vacancy_application_update', {
        p_application_id: action.applicationId,
        p_status: action.status,
        p_message: action.message || undefined,
        p_interview_at: interviewAt ?? undefined,
      });
      if (error) throw new HostWorkspaceError(422, error.message);
      return hostWorkspaceJson({ message: 'Saved.', jobId: job.id });
    }

    /* A link to the CV, good for two minutes, saved under the applicant's file name. */
    const { data: app } = await access.db
      .from('vacancy_application')
      .select('cv_path, cv_name')
      .eq('id', action.applicationId)
      .maybeSingle();
    const cv = app as { cv_path: string | null; cv_name: string | null } | null;
    if (!cv?.cv_path) throw new HostWorkspaceError(404, 'There is no CV with this application.');
    const { data: signed, error } = await access.db.storage
      .from('careers-cv')
      .createSignedUrl(cv.cv_path, 120, { download: cv.cv_name ?? true });
    if (error || !signed)
      throw new HostWorkspaceError(503, 'The CV could not be opened. Try again.');
    return hostWorkspaceJson({ url: signed.signedUrl });
  } catch (error) {
    return hostWorkspaceError(error);
  }
}
