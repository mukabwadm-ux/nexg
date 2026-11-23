import type { Metadata } from 'next';

import { SignInForm } from './sign-in-form';

/**
 * Sign in to the developer console.
 *
 * A developer who cannot sign in cannot issue a key, and a developer
 * who cannot issue a key cannot use the API. This page is therefore not
 * an extra -- it is the first step of the quickstart.
 */
export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to the NexG developer console to issue an API key.',
};

export default function SignInPage({
  searchParams,
}: {
  searchParams?: { next?: string; reason?: string };
}) {
  const next =
    searchParams?.next && /^\/(?!\/)/.test(searchParams.next) ? searchParams.next : undefined;

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      {searchParams?.reason === 'idle' ? (
        <p
          role="status"
          className="border-ink/10 bg-ink/5 text-ink/80 mb-6 rounded-lg border px-4 py-3 text-sm"
        >
          You were signed out because the console was left idle. Sign in again to carry on.
        </p>
      ) : null}
      <SignInForm next={next} />
    </main>
  );
}
