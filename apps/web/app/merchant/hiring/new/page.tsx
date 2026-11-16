import Link from 'next/link';

import { Panel } from '@/components/merchant/bits';
import { Board, PageHead, merchantContext } from '@/components/merchant/frame';
import { VacancyForm } from '@/components/merchant/hiring/vacancy-form';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Post a job' };
export const dynamic = 'force-dynamic';

export default async function NewJobPage() {
  const { m, live } = await merchantContext();
  if (!m) return null;

  const supabase = createClient();
  const [{ data: cities }, { data: merchant }, jobs] = await Promise.all([
    supabase.from('city').select('id, name').in('status', ['live', 'soft_launch']).order('sort'),
    supabase.from('merchant').select('city_id').eq('id', m.merchant_id).maybeSingle(),
    /* Whether hiring exists yet: the site can deploy before its migration runs. */
    supabase
      .from('vacancy')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', m.merchant_id),
  ]);

  return (
    <Board>
      <PageHead
        title="Post a job"
        lead="Say what the job is, where and what it pays. Publish puts it on NexG Careers; a draft stays here until you do."
        actions={
          <Link
            href="/merchant/hiring"
            className="text-muted text-[0.8125rem] font-bold hover:underline"
          >
            Back to Hiring
          </Link>
        }
      />
      {jobs.error ? (
        <p role="alert" className="text-danger text-sm font-semibold">
          Hiring is not switched on yet. Try again later.
        </p>
      ) : (
        <div className="max-w-3xl">
          <Panel title="The job">
            <VacancyForm
              cities={(cities as { id: string; name: string }[] | null) ?? []}
              defaultCityId={(merchant as { city_id: string | null } | null)?.city_id ?? null}
              live={live}
            />
          </Panel>
        </div>
      )}
    </Board>
  );
}
