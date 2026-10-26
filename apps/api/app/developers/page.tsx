import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/session';
import { listDeveloperMerchants } from '@/lib/merchants';

import { DeveloperConsole } from './developer-console';

/**
 * The developer console: issue an API key.
 *
 * The page is a server component so that it can read the session and
 * the merchant list on the server, and hand both to a client form. A
 * form that received the merchant list as a prop cannot be tricked into
 * showing a merchant the person does not belong to, because the list
 * was built under the person's own row-level security.
 */
export const metadata: Metadata = {
  title: 'Developer console',
  description: 'Issue an API key for the NexG API.',
};

export const dynamic = 'force-dynamic';

export default async function DevelopersPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in?next=/developers');
  }

  const merchants = await listDeveloperMerchants(supabase);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Developer console</h1>
        <p className="text-ink/70">
          Issue a key for the NexG API. The key is shown once and cannot be
          recovered, so copy it before you close this page.
        </p>
      </header>

      <DeveloperConsole merchants={merchants} email={user.email ?? null} />

      <p className="mt-8 text-xs text-ink/50">
        Not ready to wire an integration yet?{' '}
        <Link href="/docs" className="underline">
          Read the reference
        </Link>
        .
      </p>
    </main>
  );
}