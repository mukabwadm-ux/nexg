import { ArrowRight, Check, GraduationCap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

/** The dark card that sends a business to post a job. */
export function EmployerCard() {
  return (
    <section className="bg-night relative isolate overflow-hidden rounded-2xl p-5 text-white">
      <Image
        src="/images/categories/concierge.jpg"
        alt=""
        fill
        sizes="(min-width: 1280px) 22rem, 100vw"
        className="-z-10 object-cover opacity-45"
      />
      <div
        aria-hidden="true"
        className="from-night via-night/90 absolute inset-0 -z-10 bg-gradient-to-r to-transparent"
      />
      <h2 className="max-w-[13rem] text-[1.25rem] font-extrabold leading-tight tracking-tight">
        Are you an employer?
      </h2>
      <p className="mt-2 max-w-[15rem] text-[0.8125rem] font-semibold leading-[1.6] text-white/75">
        Find and hire people for your hotel, restaurant, property or business, from your NexG
        dashboard.
      </p>
      <Link
        href="/careers/employers"
        className="bg-gold text-ink hover:bg-gold/90 mt-4 inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[0.875rem] font-extrabold transition-colors"
      >
        Post a job
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </section>
  );
}

const WHY = [
  'Jobs from verified businesses only',
  'Full-time, part-time, gig and internships',
  'Apply in minutes with your CV',
  'Hear back at every step',
];

/** Why look for work here. Each line is something the board does today. */
export function WhyCareers() {
  return (
    <section className="border-border bg-surface rounded-2xl border p-5">
      <h2 className="text-[1.0625rem] font-extrabold">Why NexG Careers?</h2>
      <ul className="mt-3 space-y-2.5">
        {WHY.map((line) => (
          <li key={line} className="flex items-start gap-2.5 text-[0.8125rem] font-semibold">
            <Check
              aria-hidden="true"
              strokeWidth={3}
              className="text-gold-text mt-0.5 h-4 w-4 shrink-0"
            />
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The band about internships and trainee roles. */
export function TrainingBanner() {
  return (
    <section className="border-border bg-gold-soft relative overflow-hidden rounded-2xl border">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <span className="bg-surface text-gold-text flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl">
            <GraduationCap aria-hidden="true" strokeWidth={1.75} className="h-8 w-8" />
          </span>
          <div>
            <h2 className="text-[1.25rem] font-extrabold tracking-tight sm:text-[1.375rem]">
              Grow your career with NexG
            </h2>
            <p className="text-muted mt-0.5 text-[0.875rem] font-semibold">
              Internships and trainee roles with businesses on NexG, where real work is the
              training.
            </p>
          </div>
        </div>
        <Link
          href="/careers/jobs?type=internship"
          className="border-ink text-ink hover:bg-ink inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start rounded-lg border-2 px-5 text-[0.875rem] font-extrabold transition-colors hover:text-white sm:self-auto"
        >
          Explore internships
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
