import { Check } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { Logo } from '@/components/logo';
import type { Portal } from '@/lib/auth-portals';
import { DATA_PROTECTION_POLICY_URL, NEW_TAB } from '@/lib/legal-documents';

const STORY: Record<
  Portal,
  { headline: React.ReactNode; body: string; promises: readonly string[]; back: [string, string] }
> = {
  customer: {
    headline: (
      <>
        One account.
        <br />
        Every door in <span className="text-gold">East Africa.</span>
      </>
    ),
    body: 'Order faster with saved places and one-tap re-orders, book stays, follow every delivery live, and pick up your concierge conversations where you left them.',
    promises: [
      'Saved places and order history',
      'Stays booked and paid with M-Pesa',
      'Live delivery tracking',
    ],
    back: ['/', 'Back to NexG'],
  },
  merchant: {
    headline: (
      <>
        Your business,
        <br />
        <span className="text-gold">open on NexG.</span>
      </>
    ),
    body: 'Orders, catalogue, hours, branches and payouts in one merchant workspace.',
    promises: [
      'Live orders and bookings',
      'Your own prices and catalogue',
      'Payouts and statements',
    ],
    back: ['/merchants', 'Back to NexG Merchants'],
  },
  rider: {
    headline: (
      <>
        Ride with NexG.
        <br />
        <span className="text-gold">Earn on your terms.</span>
      </>
    ),
    body: 'Jobs, shifts, documents and earnings in your rider dashboard.',
    promises: ['Jobs near you', 'Shifts you choose', 'Earnings you can follow'],
    back: ['/riders', 'Back to NexG Riders'],
  },
  host: {
    headline: (
      <>
        Your units,
        <br />
        <span className="text-gold">fully booked.</span>
      </>
    ),
    body: 'Calendar, stays, guests and payouts for every unit in your host workspace.',
    promises: [
      'One calendar, no double bookings',
      'Guest checkout with M-Pesa',
      'QR cards and guest guides',
    ],
    back: ['/hosts', 'Back to NexG Hosts'],
  },
};

/**
 * The frame every sign-in and sign-up page shares: a dark story panel on
 * wide screens (hidden on phones, where it would push the form off the first
 * screen) and the form on the right.
 */
export function AuthShell({ portal, children }: { portal: Portal; children: React.ReactNode }) {
  const story = STORY[portal];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="bg-ink relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <Link href={story.back[0]} className="flex items-center gap-3">
          <Logo className="h-24 w-auto" onDark />
        </Link>

        <div className="max-w-lg">
          <h1 className="text-5xl font-extrabold leading-[1.1] tracking-tight">{story.headline}</h1>
          <p className="mt-6 text-[1.0625rem] font-semibold leading-[1.7] text-white/55">
            {story.body}
          </p>
          <ul className="mt-9 space-y-4">
            {story.promises.map((promise) => (
              <li key={promise} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="bg-gold text-ink flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                >
                  <Check className="h-4 w-4" />
                </span>
                <span className="text-[0.9375rem] font-bold">{promise}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-semibold text-white/35">
          <span>© {new Date().getFullYear()} NexG Concierge</span>
          <span className="flex gap-4">
            <Link href="/legal/terms" className="transition-colors hover:text-white/70">
              Terms
            </Link>
            <Link href="/legal/privacy" className="transition-colors hover:text-white/70">
              Privacy
            </Link>
            <a
              href={DATA_PROTECTION_POLICY_URL}
              {...NEW_TAB}
              className="transition-colors hover:text-white/70"
            >
              Data protection
            </a>
            <Link href="/help" className="transition-colors hover:text-white/70">
              Help
            </Link>
          </span>
        </div>
      </div>

      <div className="flex flex-col px-4 py-6 sm:px-8 lg:py-12">
        <div className="flex items-center justify-between gap-4">
          <Link href={story.back[0]} aria-label="NexG home" className="lg:invisible">
            <Logo className="h-12 w-auto" />
          </Link>
          <Link
            href={story.back[0]}
            className="text-muted hover:text-ink text-sm font-bold transition-colors"
          >
            ← {story.back[1]}
          </Link>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
