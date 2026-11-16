import Link from 'next/link';

import { CareersNav } from '@/components/careers/careers-nav';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

/** A job that closed, was taken down, or never existed. */
export default function JobNotFound() {
  return (
    <>
      <SiteHeader action={{ label: 'Find jobs', href: '/careers/jobs' }} />
      <CareersNav active="find" />
      <main className="mx-auto max-w-[120rem] px-4 py-20 text-center sm:px-[30px]">
        <h1 className="text-[1.75rem] font-extrabold tracking-tight">This job is no longer open</h1>
        <p className="text-muted mx-auto mt-2 max-w-md text-[0.9375rem] font-semibold leading-[1.65]">
          The business has closed it, or the link is wrong. If you applied, your application is
          still in your account.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/careers/jobs"
            className="bg-gold text-ink inline-flex h-11 items-center rounded-lg px-5 text-[0.9375rem] font-extrabold"
          >
            See open jobs
          </Link>
          <Link
            href="/account?tab=applications"
            className="border-border-strong inline-flex h-11 items-center rounded-lg border px-5 text-[0.9375rem] font-bold"
          >
            My applications
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
