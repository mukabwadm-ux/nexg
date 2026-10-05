import { Button, Card } from '@nexg/ui';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';

export const dynamic = 'force-dynamic';

const CONTRACT_LABEL: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract_6mo: '6-month contract',
  internship: 'Internship',
};

const WORK_MODE_LABEL: Record<string, string> = {
  on_site: 'On-site',
  on_site_shifts: 'On-site · shifts',
  hybrid: 'Hybrid',
  remote_eat: 'Remote (EAT ±2h)',
};

interface JobRow {
  slug: string | null;
  title: string | null;
  team_name: string | null;
  location_label: string | null;
  work_mode: string | null;
  contract: string | null;
  city_name: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_public: boolean | null;
  description_md: string | null;
  responsibilities_md: string | null;
  requirements_md: string | null;
  nice_to_have_md: string | null;
  benefits_md: string | null;
  work_sample_candidate_md: string | null;
  work_sample_paid: boolean | null;
  work_sample_pay_note: string | null;
  weeks_to_hire: number | null;
  posted_at: string | null;
  hiring_manager_name: string | null;
  is_general: boolean | null;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('careers_job_v')
    .select('title, description_md, location_label')
    .eq('slug', params.slug)
    .maybeSingle();

  if (!data) return { title: 'Role not open' };
  return {
    title: `${data.title} · ${data.location_label ?? 'NexG'}`,
    description: data.description_md?.slice(0, 160) ?? undefined,
  };
}

/**
 * One role.
 *
 * Everything here comes from `careers_job_v`, which returns only open
 * roles — a draft or a closed one renders the "no longer open" state
 * rather than a page somebody could apply through.
 *
 * The salary line says one of two true things: the range, when the
 * hiring manager chose to publish it, or "shared at the intro call"
 * when they did not. It never shows a guess.
 */
export default async function JobPage({ params }: { params: { slug: string } }) {
  const supabase = createPublicClient();

  const [{ data: job }, { data: others }] = await Promise.all([
    supabase.from('careers_job_v').select('*').eq('slug', params.slug).maybeSingle(),
    supabase
      .from('careers_jobs_v')
      .select('slug, title, team_name, location_label')
      .neq('slug', params.slug)
      .limit(4),
  ]);

  if (!job) {
    /* Open roles only, so a closed one lands here rather than 404ing
       — somebody followed a link that was good last week. */
    return (
      <>
        <SiteHeader action={{ label: 'See open roles', href: '/careers#roles' }} />
        <main className="mx-auto max-w-[96rem] px-4 py-16 sm:px-8 lg:px-16">
          <h1 className="text-[2rem] font-extrabold tracking-tight">
            This role is no longer open.
          </h1>
          <p className="text-muted mt-3 max-w-[36rem] text-[0.9375rem] font-semibold leading-[1.8]">
            It has either been filled or paused. Here is what is open now — or send an open
            application and we will keep it for six months.
          </p>
          <ul className="border-border mt-7 max-w-[44rem] divide-y rounded-2xl border bg-white">
            {(
              (others as
                | {
                    slug: string;
                    title: string;
                    team_name: string | null;
                    location_label: string | null;
                  }[]
                | null) ?? []
            ).map((o) => (
              <li key={o.slug}>
                <Link
                  href={`/careers/${o.slug}`}
                  className="hover:bg-bg flex items-center justify-between gap-3 px-5 py-4"
                >
                  <span>
                    <span className="block text-[0.9375rem] font-extrabold">{o.title}</span>
                    <span className="text-muted-light block text-[0.75rem] font-semibold">
                      {[o.team_name, o.location_label].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" className="text-muted h-4 w-4" />
                </Link>
              </li>
            ))}
          </ul>
        </main>
        <SiteFooter />
      </>
    );
  }

  const j = job as JobRow;

  return (
    <>
      <SiteHeader
        action={{ label: 'Apply · 2 minutes', href: `/careers/${j.slug}/apply` }}
        signIn={{ label: 'All roles', href: '/careers#roles' }}
      />

      <main className="mx-auto max-w-[96rem] px-4 pb-16 pt-6 sm:px-8 lg:px-16">
        <Link
          href="/careers#roles"
          className="text-muted hover:text-ink inline-flex items-center gap-1.5 text-[0.75rem] font-bold"
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Careers {j.team_name ? `· ${j.team_name}` : ''}
        </Link>

        <div className="mt-5 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-14">
          <div>
            <h1 className="text-[2rem] font-extrabold leading-tight tracking-[-0.02em] sm:text-[2.75rem]">
              {j.title}
            </h1>

            <p className="text-muted-light mt-3 text-[0.8125rem] font-semibold">
              {[
                j.location_label,
                j.work_mode ? WORK_MODE_LABEL[j.work_mode] : null,
                j.contract ? CONTRACT_LABEL[j.contract] : null,
                j.posted_at
                  ? `posted ${new Date(j.posted_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>

            <p className="mt-2 text-[0.8125rem] font-bold">
              {/* One of two true things. Never a guess. */}
              {j.salary_public && j.salary_min !== null
                ? `Salary ${j.salary_currency} ${j.salary_min.toLocaleString('en-KE')}–${(
                    j.salary_max ?? j.salary_min
                  ).toLocaleString('en-KE')}`
                : 'Salary shared at the intro call'}
            </p>

            <Section title="About the role" body={j.description_md} />
            <Section title="What you'll own" body={j.responsibilities_md} />
            <Section title="What we're looking for" body={j.requirements_md} />
            <Section title="Nice to have" body={j.nice_to_have_md} />

            {j.work_sample_candidate_md && (
              <>
                <h2 className="mt-9 text-[1.25rem] font-extrabold tracking-[-0.01em]">
                  The work sample
                </h2>
                <p className="text-muted mt-2 max-w-[42rem] whitespace-pre-line text-[0.875rem] font-semibold leading-[1.9]">
                  {j.work_sample_candidate_md}
                </p>
                {j.work_sample_paid && (
                  <p className="text-gold-text mt-2 text-[0.8125rem] font-extrabold">
                    {j.work_sample_pay_note ?? 'Paid for anything over two hours'}
                  </p>
                )}
              </>
            )}

            {/* The promise, computed from this job's own targets. */}
            <h2 className="mt-9 text-[1.25rem] font-extrabold tracking-[-0.01em]">How we hire</h2>
            <p className="text-muted-light mt-1.5 text-[0.8125rem] font-semibold">
              Five steps, about {j.weeks_to_hire ?? 2} {j.weeks_to_hire === 1 ? 'week' : 'weeks'}.
            </p>
            <ol className="mt-4 grid max-w-[42rem] gap-2 sm:grid-cols-2">
              {[
                ['Apply', '2 minutes · no cover letter'],
                ['Intro call', '30 minutes'],
                ['Work sample', '2–4 hours · paid over two'],
                ['Team conversation', '45 minutes'],
                ['Offer', 'within a week'],
              ].map(([step, note], i) => (
                <li key={step} className="border-border flex gap-2.5 rounded-xl border p-3">
                  <span
                    aria-hidden="true"
                    className="bg-ink flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-extrabold text-white"
                  >
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-[0.8125rem] font-extrabold">{step}</span>
                    <span className="text-muted-light block text-[0.6875rem] font-semibold">
                      {note}
                    </span>
                  </span>
                </li>
              ))}
            </ol>

            <p className="text-muted mt-5 max-w-[42rem] text-[0.8125rem] font-semibold leading-[1.8]">
              We tell you where you stand after every step. If it&rsquo;s a no, you&rsquo;ll hear it
              from a person, with a reason.
            </p>

            <Section title="What you get" body={j.benefits_md} />
          </div>

          <div className="lg:sticky lg:top-24">
            <Card className="p-5">
              <Button asChild className="w-full">
                <Link href={`/careers/${j.slug}/apply`}>
                  Apply · 2 minutes <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </Button>
              <p className="text-muted-light mt-3 text-center text-[0.6875rem] font-semibold">
                No cover letter. A person reads it.
              </p>

              {j.hiring_manager_name && (
                <div className="border-border mt-5 border-t pt-4">
                  <p className="text-[0.8125rem] font-extrabold">Who you would work with</p>
                  <p className="text-muted mt-1.5 text-[0.75rem] font-semibold leading-relaxed">
                    {j.hiring_manager_name.split(' ')[0]} leads {j.team_name ?? 'this team'} and
                    reads every application for this role.
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <>
      <h2 className="mt-9 text-[1.25rem] font-extrabold tracking-[-0.01em]">{title}</h2>
      <p className="text-muted mt-2 max-w-[42rem] whitespace-pre-line text-[0.875rem] font-semibold leading-[1.9]">
        {body}
      </p>
    </>
  );
}
