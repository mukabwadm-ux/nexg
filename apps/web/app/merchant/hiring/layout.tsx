import { Briefcase } from 'lucide-react';

import { Board, PageHead } from '@/components/merchant/frame';

export const metadata = { title: 'Hiring' };

/**
 * Hiring is switched off for merchants for now: every /merchant/hiring page
 * (the list, a new job, a job's applicants) shows this instead of its own
 * content. The pages and their data are untouched, so turning Hiring back on
 * is deleting this file. Jobs already on NexG Careers stay as they are.
 */
export default function HiringComingSoon() {
  return (
    <Board>
      <PageHead title="Hiring" />
      <div className="border-border bg-surface flex flex-col items-start gap-3 rounded-xl border p-6 sm:p-8">
        <span
          aria-hidden="true"
          className="bg-gold-soft text-gold-text flex h-11 w-11 items-center justify-center rounded-xl"
        >
          <Briefcase className="h-5 w-5" />
        </span>
        <span className="bg-gold text-ink rounded-full px-2.5 py-0.5 text-[0.6875rem] font-extrabold uppercase tracking-[0.08em]">
          Coming soon
        </span>
        <h2 className="text-lg font-extrabold tracking-tight">Hire through NexG, coming soon</h2>
        <p className="text-muted max-w-xl text-[0.875rem] font-semibold leading-[1.7]">
          Soon you will be able to post jobs on NexG Careers and choose who to hire, right from your
          workspace. We will let you know when it opens.
        </p>
      </div>
    </Board>
  );
}
