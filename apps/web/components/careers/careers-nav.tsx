import Link from 'next/link';

import { CareersAccountLinks } from './careers-account-links';

export type CareersSection = 'find' | 'employers' | 'gig' | 'training';

const LINKS: { key: CareersSection; label: string; href: string }[] = [
  { key: 'find', label: 'Find Jobs', href: '/careers/jobs' },
  { key: 'employers', label: 'For Employers', href: '/careers/employers' },
  { key: 'gig', label: 'Gig & On-Demand', href: '/careers/jobs?type=gig&type=temporary' },
  { key: 'training', label: 'Training & Growth', href: '/careers/jobs?type=internship' },
];

/**
 * The careers bar, under the site header on every /careers page.
 *
 * The site header stays on top, as on every public page: it carries the
 * account, the bell and the menu. This bar is what makes the section feel
 * like one place: its name, its four doors, and signing in to apply.
 */
export function CareersNav({ active }: { active?: CareersSection }) {
  return (
    <nav aria-label="Careers" className="border-border band-surface border-b">
      <div className="mx-auto flex max-w-[120rem] flex-wrap items-center gap-x-6 px-4 sm:px-[30px] md:flex-nowrap">
        <Link
          href="/careers"
          className="flex h-14 shrink-0 items-center gap-2.5 rounded-md text-[1.0625rem] tracking-tight"
        >
          <span className="font-extrabold">NexG</span>
          <span aria-hidden="true" className="bg-gold h-5 w-0.5 rounded-full" />
          <span className="font-bold">Careers</span>
        </Link>

        <div className="order-3 -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 [scrollbar-width:none] md:order-none md:mx-0 md:w-auto md:flex-1 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
          <ul className="flex items-center gap-1 md:justify-center lg:gap-3">
            {LINKS.map((link) => {
              const current = link.key === active;
              return (
                <li key={link.key}>
                  <Link
                    href={link.href}
                    aria-current={current ? 'page' : undefined}
                    className={`relative flex h-12 items-center whitespace-nowrap px-3 text-[0.875rem] font-bold transition-colors md:h-14 ${
                      current ? 'text-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {link.label}
                    {current ? (
                      <span
                        aria-hidden="true"
                        className="bg-gold absolute inset-x-3 bottom-0 h-[3px] rounded-t-full"
                      />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="ml-auto flex h-14 items-center gap-2 md:ml-0">
          <CareersAccountLinks />
        </div>
      </div>
    </nav>
  );
}
