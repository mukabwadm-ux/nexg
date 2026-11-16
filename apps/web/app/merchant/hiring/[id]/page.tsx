import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Panel } from '@/components/merchant/bits';
import { Board, PageHead, merchantContext } from '@/components/merchant/frame';
import { ApplicantCard, type Applicant } from '@/components/merchant/hiring/applicant-card';
import { VacancyForm, type VacancyDraft } from '@/components/merchant/hiring/vacancy-form';
import { VacancyStatusButton } from '@/components/merchant/hiring/vacancy-status-button';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Job' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORDER = ['submitted', 'shortlisted', 'interview', 'hired', 'rejected', 'withdrawn'];

/** One job: who applied and where each of them stands, and the job itself to edit. */
export default async function HiringJobPage({ params }: { params: { id: string } }) {
  const { m, live } = await merchantContext();
  if (!m) return null;
  if (!UUID.test(params.id)) notFound();

  const supabase = createClient();
  const [{ data: job }, { data: applicants }, { data: cities }] = await Promise.all([
    /* Every column, so the page works on either side of the take-down
       migration (20261225000100), which added taken_down_*. */
    supabase
      .from('vacancy')
      .select('*')
      .eq('id', params.id)
      .eq('merchant_id', m.merchant_id)
      .maybeSingle(),
    supabase
      .from('vacancy_application')
      .select(
        'id, vacancy_id, full_name, email, phone, note, cv_name, status, employer_note, interview_at, created_at',
      )
      .eq('vacancy_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('city')
      .select('id, name, timezone')
      .in('status', ['live', 'soft_launch'])
      .order('sort'),
  ]);
  if (!job) notFound();

  const vacancy = job as VacancyDraft;
  const cityRows = (cities as { id: string; name: string; timezone: string }[] | null) ?? [];
  const timeZone = cityRows.find((c) => c.id === vacancy.city_id)?.timezone ?? 'Africa/Nairobi';
  const people = ((applicants as Applicant[] | null) ?? []).sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status),
  );
  const active = people.filter((p) => p.status !== 'withdrawn').length;

  const takenDown = Boolean(vacancy.taken_down_at);
  const lead = takenDown
    ? 'NexG took this job down. It is off the board until NexG lifts that.'
    : vacancy.status === 'open'
      ? 'On the NexG Careers board now.'
      : vacancy.status === 'draft'
        ? 'A draft. Nobody else can see it until you publish it.'
        : 'Closed. It is off the board, and the people who applied keep their applications.';

  return (
    <Board>
      <PageHead
        title={vacancy.title}
        lead={lead}
        actions={
          <span className="flex flex-wrap items-start gap-2">
            {vacancy.status === 'open' ? (
              <Link
                href={`/careers/jobs/${vacancy.id}`}
                className="border-border-strong inline-flex h-10 items-center rounded-lg border px-4 text-[0.8125rem] font-bold"
              >
                See it on the board
              </Link>
            ) : null}
            <VacancyStatusButton
              vacancyId={vacancy.id}
              status={vacancy.status}
              live={live && !takenDown}
            />
          </span>
        }
      />

      {takenDown ? (
        <p
          role="alert"
          className="border-danger/30 bg-danger-bg text-danger rounded-xl border px-4 py-3 text-[0.8125rem] font-bold leading-[1.6]"
        >
          NexG took this job down and gave this reason. &ldquo;{vacancy.taken_down_reason}&rdquo;
          You can still read and answer the people who applied. To put the job back up, contact NexG
          support.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <Panel title={active === 1 ? '1 applicant' : `${active} applicants`}>
          {people.length === 0 ? (
            <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
              {vacancy.status === 'open'
                ? 'Nobody has applied yet. You get a bell and an email when somebody does.'
                : 'Applicants appear here once the job is on the board.'}
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {people.map((person) => (
                <ApplicantCard key={person.id} applicant={person} timeZone={timeZone} />
              ))}
            </ul>
          )}
          <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
            CVs are shared with your business only, while the application stands and for 180 days
            after the job closes. Use them for this hiring and nothing else.
          </p>
        </Panel>

        <Panel title="The job">
          <VacancyForm
            cities={cityRows.map(({ id, name }) => ({ id, name }))}
            defaultCityId={vacancy.city_id}
            live={live && !takenDown}
            vacancy={vacancy}
          />
        </Panel>
      </div>
    </Board>
  );
}
