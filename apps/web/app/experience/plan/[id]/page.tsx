import type { Metadata } from 'next';

import { PlanPage } from '@/components/experience/plan-page';
import type { PlanView } from '@/components/experience/types';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Your day' };
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc('fn_plan_view', { p_plan_id: params.id });
  const view = (data as PlanView | null) ?? null;

  /*
   * `plan` is null when row-level security hides it — somebody else's
   * day, or a link opened in a browser that never built it. Both are the
   * same answer and neither confirms the day exists.
   */
  if (!view?.plan) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-8">
          <h1 className="text-3xl font-extrabold tracking-tight">We cannot find that day.</h1>
          <p className="text-muted mt-3 text-[0.9375rem] leading-[1.8]">
            A day belongs to the browser that built it. If you started it somewhere else, open it
            from the link we sent you.
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <PlanPage initial={view} />
      <SiteFooter />
    </>
  );
}
