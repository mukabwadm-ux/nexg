import type { Metadata } from 'next';

import { BrandMark } from '@/components/brand-mark';
import { SignInForm } from '@/components/sign-in-form';

export const metadata: Metadata = { title: 'Staff sign in' };

const ASSURANCES = [
  'Company work accounts only',
  'Access follows your role, not your login',
  'Every sensitive action is logged',
] as const;

export default function SignInPage({
  searchParams,
}: {
  searchParams?: { next?: string; denied?: string };
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* The dark half, as the A0 artboard draws it. */}
      <div className="bg-ink relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark className="h-11 w-auto" onDark />
          <span className="border-gold/40 text-gold rounded-full border px-2.5 py-1 text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
            Admin console
          </span>
        </div>

        <div className="max-w-md">
          <h1 className="text-5xl font-extrabold leading-[1.1] tracking-tight">
            The desk behind <span className="text-gold">every door.</span>
          </h1>
          <p className="mt-5 text-[0.9375rem] font-semibold leading-[1.7] text-white/55">
            Concierge, dispatch, partners, money and people — one console, and you only see the
            parts your role needs.
          </p>

          <ul className="mt-8 space-y-3">
            {ASSURANCES.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="bg-gold text-ink flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                >
                  ✓
                </span>
                <span className="text-[0.8125rem] font-bold">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs font-semibold text-white/35">
          © {new Date().getFullYear()} Nexgenius Concierge Limited · Internal system · Restricted
        </p>
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <SignInForm
          next={searchParams?.next ?? '/'}
          denied={searchParams?.denied === '1'}
          domain={process.env.STAFF_EMAIL_DOMAIN ?? null}
        />
      </div>
    </div>
  );
}
