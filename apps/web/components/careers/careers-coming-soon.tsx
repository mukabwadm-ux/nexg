import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

/** What /careers shows while the public job board is off (lib/careers/open.ts). */
export function CareersComingSoon() {
  return (
    <>
      <SiteHeader />

      <main>
        <section className="band-surface relative overflow-hidden">
          <div className="mx-auto max-w-[120rem] lg:min-h-[31rem]">
            <div className="relative z-10 px-4 pb-10 pt-10 sm:px-[30px] lg:w-1/2 lg:pb-28 lg:pt-20">
              <p className="bg-gold/15 text-gold-text inline-flex h-8 items-center rounded-full px-3.5 text-[0.8125rem] font-extrabold uppercase tracking-[0.08em]">
                Coming soon
              </p>
              <h1 className="mt-5 text-[2.5rem]/[1.05] font-extrabold tracking-tight sm:text-[3.25rem]/[1.04] xl:text-[3.75rem]/[1.03]">
                Careers <span className="text-gold-text">— coming soon.</span>
              </h1>
              <p className="text-muted mt-5 max-w-[30rem] text-[1.0625rem] font-semibold leading-[1.65]">
                NexG will post job openings here soon. Check back to see what&rsquo;s open.
              </p>
              <div className="mt-7">
                <Link
                  href="/"
                  className="bg-gold text-ink hover:bg-gold/90 inline-flex h-12 items-center gap-2.5 rounded-lg px-6 text-[0.9375rem] font-extrabold transition-colors"
                >
                  <ArrowLeft aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" />
                  Back to home
                </Link>
              </div>
            </div>

            {/* The photograph, behind a gold curve on wide screens. */}
            <div className="relative mx-4 mb-10 h-64 overflow-hidden rounded-2xl sm:mx-[30px] sm:h-80 lg:absolute lg:inset-y-0 lg:right-0 lg:mx-0 lg:mb-0 lg:h-auto lg:w-1/2 lg:overflow-visible lg:rounded-none">
              <div
                aria-hidden="true"
                className="bg-gold absolute inset-0 hidden [clip-path:ellipse(100%_140%_at_100%_50%)] lg:block"
              />
              <div className="absolute inset-0 lg:left-3 lg:[clip-path:ellipse(100%_140%_at_100%_50%)]">
                <Image
                  src="/images/merchant-page/barista.jpg"
                  alt="A smiling barista in an apron, arms folded, behind a café counter"
                  fill
                  priority
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover object-[60%_30%]"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
