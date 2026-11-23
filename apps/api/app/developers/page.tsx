import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { developerSession, IDLE_SIGN_IN } from '@/lib/developer-session';
import { listConsoleKeys } from '@/lib/keys';
import { createClient } from '@/lib/session';
import { listDeveloperMerchants } from '@/lib/merchants';
import { listTestBookings } from '@/lib/sandbox';
import { listWebhookEndpoints, rpcCaller } from '@/lib/webhooks';

import { ApiKeys } from './api-keys';
import { DeveloperConsole } from './developer-console';
import { SessionKeeper } from './session-keeper';
import { TestBookings } from './test-bookings';
import { Webhooks } from './webhooks';

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
  description: 'Issue an API key for the NexG API, and receive booking events.',
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

  /*
   * Opening the console is activity. A merchant's developer idle past the
   * limit has lapsed: row-level security would already hide their merchants,
   * keys and webhooks, so say so at the sign-in instead of showing an empty
   * console (20270203000500).
   */
  const session = await developerSession(supabase, true);
  if (session.state === 'lapsed') {
    redirect(IDLE_SIGN_IN);
  }

  const merchants = await listDeveloperMerchants(supabase);
  const [keys, webhooks, testBookings, services] = await Promise.all([
    listConsoleKeys(
      supabase,
      user.id,
      merchants.map((m) => m.id),
    ),
    listWebhookEndpoints(rpcCaller(supabase)),
    listTestBookings(rpcCaller(supabase)),
    supabase.from('api_service').select('code, label').eq('active', true).order('label'),
  ]);
  const testEndpoint =
    webhooks.ok && webhooks.endpoints.some((e) => e.environment === 'test' && e.enabled);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <SessionKeeper expiresAt={session.state === 'current' ? session.expiresAt : null} />
      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-extrabold tracking-tight">Developer console</h1>
        <p className="text-ink/70">
          Issue a key for the NexG API. The key is shown once and cannot be recovered, so copy it
          before you close this page.
        </p>
      </header>

      <DeveloperConsole merchants={merchants} email={user.email ?? null} />

      <div className="mt-8">
        <ApiKeys merchants={merchants} initial={keys} />
      </div>

      <div className="mt-8">
        <Webhooks merchants={merchants} initial={webhooks} />
      </div>

      <div className="mt-8">
        <TestBookings
          merchants={merchants}
          services={services.data ?? []}
          initial={testBookings}
          testEndpoint={testEndpoint}
        />
      </div>

      <p className="text-ink/50 mt-8 text-xs">
        Not ready to wire an integration yet?{' '}
        <Link href="/docs" className="underline">
          Read the reference
        </Link>
        .
      </p>
    </main>
  );
}
