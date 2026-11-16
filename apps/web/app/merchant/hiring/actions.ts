'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { CAREERS_BOARD_TAG } from '@/lib/careers/load';
import { zonedToInstant } from '@/lib/careers/zoned';
import { merchantActionClient } from '@/lib/merchant-action-access';

/**
 * Hiring, from the business's own dashboard.
 *
 * Every one of these is an RPC that checks again that the caller hires for
 * this business (owner or manager, signed in for real): a server action is
 * still an HTTP endpoint, and the database is the boundary.
 */

export interface HiringOutcome {
  ok: boolean;
  message?: string;
  id?: string;
}

export interface VacancyInput {
  id?: string;
  title: string;
  category: string;
  jobType: string;
  cityId: string;
  area: string;
  openings: number;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: string;
  description: string;
  requirements: string;
  closesOn: string;
}

/* The board, the job's own page and the Hiring pages all show the job. */
function jobChanged(id?: string) {
  revalidateTag(CAREERS_BOARD_TAG);
  revalidatePath('/careers');
  revalidatePath('/careers/jobs');
  revalidatePath('/merchant/hiring');
  if (id) {
    revalidatePath(`/careers/jobs/${id}`);
    revalidatePath(`/merchant/hiring/${id}`);
  }
}

export async function saveVacancy(input: VacancyInput, publish: boolean): Promise<HiringOutcome> {
  const { client, merchantId } = await merchantActionClient();
  const { data, error } = await client.rpc('rpc_vacancy_save', {
    p_merchant_id: merchantId,
    p_vacancy_id: input.id || undefined,
    p_title: input.title,
    p_category: input.category,
    p_job_type: input.jobType,
    p_city_id: input.cityId,
    p_description: input.description,
    p_area: input.area || undefined,
    p_openings: input.openings,
    p_salary_min: input.salaryMin ?? undefined,
    p_salary_max: input.salaryMax ?? undefined,
    p_salary_period: input.salaryPeriod || undefined,
    p_requirements: input.requirements || undefined,
    p_closes_on: input.closesOn || undefined,
    p_publish: publish,
  });
  if (error) return { ok: false, message: error.message };

  const row = data as unknown as { id: string; status: string };
  jobChanged(row.id);
  return {
    ok: true,
    id: row.id,
    message:
      row.status === 'open'
        ? 'Published. The job is on the board now.'
        : row.status === 'draft'
          ? 'Saved as a draft. Nobody else can see it yet.'
          : 'Saved.',
  };
}

export async function setVacancyStatus(
  vacancyId: string,
  status: 'open' | 'closed',
): Promise<HiringOutcome> {
  const { client } = await merchantActionClient();
  const { error } = await client.rpc('rpc_vacancy_set_status', {
    p_vacancy_id: vacancyId,
    p_status: status,
  });
  if (error) return { ok: false, message: error.message };
  jobChanged(vacancyId);
  return {
    ok: true,
    message: status === 'open' ? 'The job is on the board.' : 'Closed. It is off the board.',
  };
}

export async function moveApplicant(input: {
  applicationId: string;
  vacancyId: string;
  status: 'submitted' | 'shortlisted' | 'interview' | 'hired' | 'rejected';
  message: string;
  interviewLocal?: string;
  timeZone: string;
}): Promise<HiringOutcome> {
  const { client } = await merchantActionClient();
  const interviewAt =
    input.status === 'interview' && input.interviewLocal
      ? zonedToInstant(input.interviewLocal, input.timeZone)
      : null;
  const { error } = await client.rpc('rpc_vacancy_application_update', {
    p_application_id: input.applicationId,
    p_status: input.status,
    p_message: input.message || undefined,
    p_interview_at: interviewAt ?? undefined,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/merchant/hiring/${input.vacancyId}`);
  revalidatePath('/merchant/hiring');
  return { ok: true };
}

/** A link to the applicant's CV, good for two minutes, saved under the name they gave it. */
export async function cvLink(applicationId: string): Promise<HiringOutcome & { url?: string }> {
  const { client } = await merchantActionClient();
  const { data } = await client
    .from('vacancy_application')
    .select('cv_path, cv_name')
    .eq('id', applicationId)
    .maybeSingle();
  const application = data as { cv_path: string | null; cv_name: string | null } | null;
  if (!application?.cv_path) {
    return { ok: false, message: 'There is no CV with this application.' };
  }
  const { data: signed, error } = await client.storage
    .from('careers-cv')
    .createSignedUrl(application.cv_path, 120, { download: application.cv_name ?? true });
  if (error || !signed) return { ok: false, message: 'The CV could not be opened. Try again.' };
  return { ok: true, url: signed.signedUrl };
}
