import { MapPin } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import {
  formatPay,
  jobHref,
  jobPlace,
  jobTypeLabel,
  postedAgo,
  type BoardJob,
} from '@/lib/careers/board';

import { categoryIcon } from './category-icon';
import { SaveJobButton } from './save-job-button';

/**
 * One job on the board: who, what, where, the type and the pay.
 *
 * The whole card opens the job; the bookmark and Apply now sit above that
 * link so each does its own thing. A line the job does not give (no pay
 * said, no place) is left out rather than filled with a guess.
 */
export function JobCard({ job, now }: { job: BoardJob; now?: Date }) {
  const href = jobHref(job);
  const pay = formatPay(job);
  const place = jobPlace(job);
  const type = jobTypeLabel(job.job_type);
  const posted = postedAgo(job.posted_at, now);
  const Icon = categoryIcon(job.category);

  return (
    <article className="border-border bg-surface hover:border-border-strong group relative flex gap-3.5 rounded-2xl border p-3 transition-colors sm:gap-4 sm:p-3.5">
      <div className="bg-gold-soft relative flex h-[5.5rem] w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl sm:h-24 sm:w-32">
        {job.employer_photo ? (
          <Image
            src={job.employer_photo}
            alt=""
            fill
            sizes="128px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          /* No photograph: the trade's mark, not a stock picture of somebody
             else's business. */
          <Icon aria-hidden="true" strokeWidth={1.75} className="text-gold-text h-9 w-9" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
        <div className="min-w-0">
          <h3 className="text-[0.9375rem] font-extrabold leading-snug">
            <Link
              href={href}
              className="after:absolute after:inset-0 after:rounded-2xl after:content-['']"
            >
              {job.title}
            </Link>
          </h3>
          <p className="text-muted mt-0.5 truncate text-[0.8125rem] font-semibold">
            {job.employer_name}
          </p>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.75rem] font-semibold">
          {type ? (
            <span className="bg-gold-soft text-gold-text rounded-md px-2 py-0.5 font-extrabold">
              {type}
            </span>
          ) : null}
          {place ? (
            <span className="text-muted flex min-w-0 items-center gap-1">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{place}</span>
            </span>
          ) : null}
          {pay ? <span className="text-ink font-bold">{pay}</span> : null}
          {posted ? <span className="text-muted-light">{posted}</span> : null}
        </div>
      </div>

      {/* The bookmark on top and Apply now below it, both above the card's link. */}
      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        {job.kind === 'vacancy' ? (
          <SaveJobButton
            vacancyId={job.id}
            title={job.title}
            className="relative z-10 -mr-1 -mt-1"
          />
        ) : (
          <span aria-hidden="true" className="h-9" />
        )}
        <Link
          href={`${href}#apply`}
          className="border-gold text-ink hover:bg-gold relative z-10 hidden h-9 items-center rounded-lg border-2 px-4 text-[0.8125rem] font-extrabold transition-colors sm:inline-flex"
        >
          Apply now
        </Link>
      </div>
    </article>
  );
}
