import Link from 'next/link';

import { AuthPanel } from '@/components/auth/auth-panel';
import { AuthShell } from '@/components/auth/auth-shell';
import { SocialSignIn } from '@/components/auth/social-sign-in';
import { safeNext, type Portal } from '@/lib/auth-portals';

export type SignInSearchParams = {
  tab?: string;
  next?: string;
  email?: string;
  setup?: string;
  reason?: string;
  error?: string;
};

const REASONS: Record<string, string> = {
  'workspace-session': 'Your session ended. Sign in again to continue.',
  session_expired: 'Your session ended. Sign in again to continue.',
  'workspace-access': 'This account cannot open that workspace. Sign in with the right account.',
  oauth: 'We could not finish signing you in with that provider. Try again, or use your email.',
};

/** One sign-in page per portal, all built the same way. */
export function PortalSignInPage({
  portal,
  searchParams,
}: {
  portal: Portal;
  searchParams?: SignInSearchParams;
}) {
  const next = safeNext(searchParams?.next);
  const setupEmail =
    searchParams?.setup === 'sent' &&
    searchParams.email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(searchParams.email)
      ? searchParams.email
      : undefined;
  const notice =
    REASONS[searchParams?.reason ?? ''] ??
    (searchParams?.error === 'oauth' ? REASONS['oauth'] : undefined);
  return (
    <AuthShell portal={portal}>
      <AuthPanel
        portal={portal}
        initialTab={searchParams?.tab === 'create' ? 'create' : 'signin'}
        next={next}
        emailOtpEnabled={process.env.MERCHANT_EMAIL_OTP_ENABLED !== 'false'}
        initialEmail={setupEmail}
        setupEmail={setupEmail}
        notice={notice}
        social={portal === 'customer' ? <SocialSignIn next={next} /> : undefined}
      />
      {portal === 'merchant' && process.env.NODE_ENV === 'development' ? (
        <div className="w-full max-w-md px-1 text-center">
          <Link
            href="/merchant-preview/dashboard"
            className="border-border-strong bg-surface text-ink hover:bg-bg block rounded-xl border px-5 py-3.5 text-[0.875rem] font-extrabold transition-colors"
          >
            Explore with sample data
          </Link>
          <p className="text-muted-light mt-2 text-[0.75rem] font-semibold">
            The merchant portal with sample data. No account needed. Development only.
          </p>
        </div>
      ) : null}
    </AuthShell>
  );
}
