import { ArrowRight, BadgeCheck, ClipboardList, Megaphone, UserCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { CareersNav } from '@/components/careers/careers-nav';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Hire on NexG',
  description:
    'Post jobs from your NexG business account, review applications and CVs, invite people to interview and hire.',
};

const STEPS = [
  {
    Icon: Megaphone,
    title: 'Post the job',
    body: 'Open Hiring in your NexG dashboard and say what the job is, where, the type and the pay. It goes on the board the moment you publish.',
  },
  {
    Icon: ClipboardList,
    title: 'Read the applications',
    body: 'Each one arrives with the applicant’s note, contact details and CV, and you get a bell and an email when it does.',
  },
  {
    Icon: UserCheck,
    title: 'Shortlist, interview, hire',
    body: 'Move people on with a tap and a message. They hear at every step, so nobody is left wondering.',
  },
];

/**
 * For businesses: how hiring on NexG works, and the two ways in, depending
 * on whether they already have a NexG account.
 */
export default function EmployersPage() {
  return (
    <>
      <SiteHeader action={{ label: 'Post a job', href: '/merchant/hiring' }} />
      <CareersNav active="employers" />

      <main>
        <section className="band-surface border-border border-b">
          <div className="mx-auto grid max-w-[120rem] gap-8 px-4 pb-12 pt-10 sm:px-[30px] lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center lg:pb-16 lg:pt-14">
            <div>
              <p className="text-gold-text text-[0.6875rem] font-extrabold uppercase tracking-[0.16em]">
                For employers
              </p>
              <h1 className="mt-3 text-[2.25rem]/[1.08] font-extrabold tracking-tight sm:text-[3rem]/[1.05]">
                Hire the people your guests will meet.
              </h1>
              <p className="text-muted mt-4 max-w-xl text-[1.0625rem] font-semibold leading-[1.65]">
                Post jobs from the NexG account you already run your business on. Only businesses
                NexG has checked can publish, so the people applying can trust what they read.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/merchant/hiring"
                  className="bg-gold text-ink hover:bg-gold/90 inline-flex h-12 items-center gap-2 rounded-lg px-6 text-[0.9375rem] font-extrabold transition-colors"
                >
                  Post a job
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <Link
                  href="/merchants"
                  className="text-ink inline-flex h-12 items-center rounded-lg border-2 border-current px-6 text-[0.9375rem] font-extrabold transition-colors hover:opacity-80"
                >
                  Register your business
                </Link>
              </div>
              <p className="text-muted-light mt-3 text-[0.8125rem] font-semibold">
                Already on NexG? Post a job signs you in to your dashboard. Hosts, property managers
                and hotels post from{' '}
                <Link href="/host?open=hiring" className="text-ink font-bold hover:underline">
                  Hiring in the host workspace
                </Link>
                .
              </p>
            </div>

            <div className="relative h-72 overflow-hidden rounded-2xl sm:h-96 lg:h-[26rem]">
              <Image
                src="/images/merchant-page/bartender.jpg"
                alt="A smiling bartender taking a card payment at the bar"
                fill
                sizes="(min-width: 1024px) 28rem, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[120rem] px-4 py-12 sm:px-[30px]">
          <h2 className="text-[1.625rem] font-extrabold tracking-tight">How hiring works</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {STEPS.map(({ Icon, title, body }, index) => (
              <li key={title} className="border-border bg-surface rounded-2xl border p-5">
                <span className="flex items-center gap-3">
                  <span className="bg-gold text-ink flex h-10 w-10 items-center justify-center rounded-xl">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="text-muted-light text-[0.75rem] font-extrabold">
                    Step {index + 1}
                  </span>
                </span>
                <h3 className="mt-4 text-[1.0625rem] font-extrabold">{title}</h3>
                <p className="text-muted mt-1.5 text-[0.875rem] font-semibold leading-[1.65]">
                  {body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-[120rem] px-4 pb-16 sm:px-[30px]">
          <div className="bg-night grid gap-6 rounded-2xl p-6 text-white sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="flex items-start gap-4">
              <BadgeCheck aria-hidden="true" className="text-gold mt-1 h-7 w-7 shrink-0" />
              <div>
                <h2 className="text-[1.375rem] font-extrabold tracking-tight">
                  Only verified businesses publish
                </h2>
                <p className="mt-2 max-w-2xl text-[0.9375rem] font-semibold leading-[1.65] text-white/70">
                  A business publishes jobs once NexG has checked its documents and put it live. A
                  new business can write its jobs while it waits, and publish them the day it goes
                  live.
                </p>
              </div>
            </div>
            <Link
              href="/merchants"
              className="bg-gold text-ink hover:bg-gold/90 inline-flex h-12 items-center justify-center rounded-lg px-6 text-[0.9375rem] font-extrabold transition-colors"
            >
              Register your business
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
