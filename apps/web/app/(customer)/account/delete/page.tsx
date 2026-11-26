import { Button } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { DeleteAccountForm } from '@/components/account/delete-account';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import {
  DELETED_WITH_THE_ACCOUNT,
  DELETION_REQUEST_MAILTO,
  KEPT_AFTER_DELETION,
  PRIVACY_EMAIL,
} from '@/content/account-deletion';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Delete your account',
  description:
    'How to delete your NexG account, and what is deleted and kept. NexG is run by NexGenius Concierge Limited.',
};
export const dynamic = 'force-dynamic';

const SIGN_IN = `/sign-in?next=${encodeURIComponent('/account/delete')}`;
const card = 'border-border bg-surface mt-4 rounded-2xl border p-4 sm:p-5';
const heading = 'text-lg font-extrabold tracking-tight';
const text = 'mt-2 text-sm font-semibold leading-relaxed';

interface Eligibility {
  eligible: boolean;
  blockers: Record<string, string>;
}

type Rpc = (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 list-disc pl-5 text-sm font-semibold leading-relaxed">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Where a customer asks for their NexG account to be deleted without the app
 * (Google Play's account deletion link). Signed out, it says how; signed in,
 * it deletes, with the same database call the app makes.
 */
export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams?: { deleted?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const account = user && !user.is_anonymous ? user : null;

  let eligibility: Eligibility | null = null;
  if (account) {
    const { data, error } = await (supabase.rpc.bind(supabase) as unknown as Rpc)(
      'rpc_my_account_deletion',
    );
    if (!error) eligibility = data as Eligibility;
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-[44rem] px-4 pb-16 pt-8 sm:px-8">
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em]">
          Delete your NexG account
        </h1>
        <p className={text}>
          This is for accounts on the NexG app and nexgapp.com, run by NexGenius Concierge Limited.
          Deleting your account is permanent.
        </p>

        {searchParams?.deleted && !account && (
          <p role="status" className={`${card} text-sm font-extrabold`}>
            Your account has been deleted.
          </p>
        )}

        <section aria-labelledby="delete-now" className={card}>
          <h2 id="delete-now" className={heading}>
            Delete it now
          </h2>
          {!account ? (
            <>
              <ol className="mt-2 list-decimal pl-5 text-sm font-semibold leading-relaxed">
                <li>Sign in with the account you want to delete.</li>
                <li>Come back to this page, which opens after you sign in.</li>
                <li>Tick the box and choose Delete my account.</li>
              </ol>
              <Button variant="gold" asChild className="mt-3">
                <Link href={SIGN_IN}>Sign in to delete your account</Link>
              </Button>
              <p className={text}>You can also delete your account inside the NexG app.</p>
            </>
          ) : (
            <>
              <p className={text}>Signed in as {account.email || account.phone}.</p>
              {!eligibility ? (
                <p role="alert" className={text}>
                  We could not check your account just now. Refresh the page, or email us below.
                </p>
              ) : eligibility.eligible ? (
                <DeleteAccountForm />
              ) : (
                <>
                  <p className={text}>Your account can’t be deleted yet:</p>
                  <List items={Object.values(eligibility.blockers)} />
                </>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="ask-us" className={card}>
          <h2 id="ask-us" className={heading}>
            Or ask us to delete it
          </h2>
          <p className={text}>
            If you can’t sign in here, write to our Data Protection Officer at{' '}
            <a href={DELETION_REQUEST_MAILTO} className="font-extrabold underline">
              {PRIVACY_EMAIL}
            </a>{' '}
            from the email address on your account, with the subject “Delete my NexG account”. If
            your account uses only a phone number, include that number. We check the account is
            yours before we delete it.
          </p>
        </section>

        <section aria-labelledby="what-goes" className={card}>
          <h2 id="what-goes" className={heading}>
            What is deleted
          </h2>
          <List items={DELETED_WITH_THE_ACCOUNT} />
        </section>

        <section aria-labelledby="what-stays" className={card}>
          <h2 id="what-stays" className={heading}>
            What we keep, and for how long
          </h2>
          <List items={KEPT_AFTER_DELETION} />
          <p className={text}>
            Order records are kept for up to 7 years after you close your account, for tax. See our{' '}
            <Link href="/legal/privacy" className="font-extrabold underline">
              Privacy Policy
            </Link>
            .
          </p>
          <p className={text}>
            An order, booking, stay, payment, refund or dispute that is still open has to finish
            first. If the same sign-in is used for a business, rider, host or staff account, email
            us to close it.
          </p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
