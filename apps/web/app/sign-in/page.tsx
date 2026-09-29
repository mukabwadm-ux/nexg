import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthPanel } from '@/components/auth/auth-panel';
import { Logo } from '@/components/logo';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'One NexG account for guests, riders and merchants.',
};

const PROMISES = [
  'Saved hotels, rooms and payment methods',
  'Order history and one-tap re-order',
  'Same login for guests, riders and merchants',
] as const;

export default function SignInPage({ searchParams }: { searchParams?: { tab?: string } }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* The dark half. Hidden on phones, where it would push the form off
          the first screen for no benefit. */}
      <div className="bg-ink relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-3">
          <Logo className="h-10 w-auto" onDark />
          {/* The wordmark says NexG; this says which part of it. */}
          <span className="text-gold/90 text-sm font-extrabold uppercase tracking-[0.18em]">
            Concierge
          </span>
        </Link>

        <div className="max-w-lg">
          <h1 className="text-5xl font-extrabold leading-[1.1] tracking-tight">
            One account.
            <br />
            Every door in <span className="text-gold">East Africa.</span>
          </h1>
          <p className="mt-6 text-[1.0625rem] font-semibold leading-[1.7] text-white/55">
            Order faster with saved hotels and one-tap re-orders, follow every delivery live, and
            pick up your concierge conversations where you left them.
          </p>

          <ul className="mt-9 space-y-4">
            {PROMISES.map((promise) => (
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
            <Link href="/help" className="transition-colors hover:text-white/70">
              Help
            </Link>
          </span>
        </div>
      </div>

      <div className="flex flex-col px-4 py-8 sm:px-8 lg:py-12">
        <div className="flex justify-end">
          <Link href="/" className="text-muted hover:text-ink text-sm font-bold transition-colors">
            ← Back to NexG
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <AuthPanel initialTab={searchParams?.tab === 'create' ? 'create' : 'signin'} />
        </div>
      </div>
    </div>
  );
}
