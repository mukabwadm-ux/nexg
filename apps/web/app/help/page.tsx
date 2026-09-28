import { Card } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Help',
  description: 'Reach the NexG concierge, rider or merchant team.',
};

/*
 * No phone number or email is printed here. Ground rule 3 covers invented
 * business details as much as invented figures, and a support line that does
 * not ring is worse than none. The routes that do exist are linked instead.
 */
const ROUTES = [
  {
    title: 'You are a guest',
    body: 'Tell the concierge what you need from the homepage and they answer with the plan, the price and the timing before anything is bought.',
    href: '/',
    cta: 'Ask the concierge',
  },
  {
    title: 'You ride with us',
    body: 'Applications, documents and what happens after you apply are all on the riders page.',
    href: '/riders',
    cta: 'Rider information',
  },
  {
    title: 'You run a business',
    body: 'Listing, what we ask for and how settlement works are on the merchants page.',
    href: '/merchants',
    cta: 'Merchant information',
  },
] as const;

export default function HelpPage() {
  return (
    <>
      <SiteHeader action={{ label: 'Sign in', href: '/sign-in' }} />

      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-8">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Help</h1>
        <p className="text-muted mt-4 text-[1.0625rem] font-semibold leading-[1.7]">
          Tell us which of these you are and we will point you at the right place.
        </p>

        <ul className="mt-8 space-y-4">
          {ROUTES.map((route) => (
            <li key={route.href}>
              <Card className="p-6">
                <h2 className="text-lg font-extrabold tracking-tight">{route.title}</h2>
                <p className="text-muted mt-2 text-[0.9375rem] font-semibold leading-[1.7]">
                  {route.body}
                </p>
                <Link
                  href={route.href}
                  className="mt-3 inline-block text-sm font-bold underline underline-offset-4"
                >
                  {route.cta}
                </Link>
              </Card>
            </li>
          ))}
        </ul>

        <Card tone="muted" className="mt-8 p-5">
          <p className="text-muted text-sm leading-[1.7]">
            A published support line and email address arrive with the concierge desk. Until they
            are live we would rather link you to something that works than print a number nobody
            answers.
          </p>
        </Card>
      </main>

      <SiteFooter />
    </>
  );
}
