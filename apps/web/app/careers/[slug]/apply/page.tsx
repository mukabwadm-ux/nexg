import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ApplyForm, type Question } from '@/components/careers/apply-form';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = { title: 'Apply' };
export const dynamic = 'force-dynamic';

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { src?: string };
}) {
  const supabase = createPublicClient();

  const { data: job } = await supabase
    .from('careers_job_v')
    .select('slug, title, team_name, location_label, questions')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!job || !job.slug || !job.title) notFound();

  /*
   * The retention period is a setting, not a constant. The sentence a
   * candidate consents to has to match what the nightly job actually
   * does, so both read the same row.
   */
  const { data: notice } = await supabase.rpc('rpc_careers_notice', {});
  const retention = (notice as { retention_months?: number } | null)?.retention_months ?? 6;

  return (
    <>
      <SiteHeader
        action={{ label: 'All roles', href: '/careers#roles' }}
        signIn={{ label: 'Back to the role', href: `/careers/${job.slug}` }}
      />

      <main className="mx-auto max-w-[96rem] px-4 pb-16 pt-6 sm:px-8 lg:px-16">
        <Link
          href={`/careers/${job.slug}`}
          className="text-muted hover:text-ink inline-flex items-center gap-1.5 text-[0.75rem] font-bold"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          {job.title}
        </Link>

        <div className="mt-5 grid gap-10 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-14">
          <div className="lg:pt-2">
            <h1 className="text-[1.875rem] font-extrabold leading-tight tracking-[-0.02em]">
              Apply
            </h1>
            <p className="text-muted-light mt-2 text-[0.8125rem] font-semibold">
              {job.title}
              {job.location_label ? ` · ${job.location_label}` : ''}
            </p>
            <p className="text-muted mt-4 max-w-[26rem] text-[0.875rem] font-semibold leading-[1.8]">
              About two minutes. No cover letter — the questions below tell us more than one would,
              and a person reads every answer.
            </p>
            <p className="text-muted-light mt-4 max-w-[26rem] text-[0.75rem] font-semibold leading-[1.8]">
              Questions marked &ldquo;this role needs this&rdquo; are the ones that decide whether
              the job is possible for you. We say which they are rather than leaving you to guess.
            </p>
          </div>

          <ApplyForm
            slug={job.slug}
            jobTitle={job.title}
            questions={(job.questions as unknown as Question[]) ?? []}
            retentionMonths={retention}
            src={searchParams?.src ?? null}
          />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
