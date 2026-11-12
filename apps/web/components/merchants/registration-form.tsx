import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { ConnectedApplication } from '@/components/onboarding/connected-application';
import { MerchantRegistrationFormFrame } from '@/components/onboarding/merchant-registration-page';
import { loadApplicationView } from '@/lib/merchant-application-load';
import { createClient } from '@/lib/supabase/server';

import { RegistrationSessionStart } from './registration-session-start';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The merchant registration form from /merchants/register, on /merchants.
 * Same form, same saving, same email check before Submit; it only decides
 * what to show from who is reading:
 * - nobody yet: an anonymous session starts once the form is near the screen;
 * - someone with a draft: the draft, to carry on;
 * - someone whose application is in: a way to their workspace instead.
 */
export async function MerchantRegistrationForm() {
  if (process.env.MERCHANT_ONBOARDING_V1_ENABLED === 'false')
    return (
      <Notice
        title="Registration is paused for a moment"
        body="You can still look around the merchant demo while we finish an update."
        href="/merchants/register"
        action="Open the demo"
      />
    );

  const client = createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return <RegistrationSessionStart />;

  const existing = await client.rpc('fn_partner_home');
  const home = existing.data as { kind?: string; id?: string } | null;
  if (existing.error || !home)
    return (
      <Notice
        title="We could not check your saved workspace"
        body="Refresh the page before starting another registration. Nothing you saved has changed."
        href="/merchants/register"
        action="Open registration"
      />
    );

  let saved: Awaited<ReturnType<typeof loadApplicationView>> | undefined;
  if (home.kind === 'merchant') {
    if (home.id && uuid.test(home.id)) {
      try {
        saved = await loadApplicationView(client, home.id, {
          includePayout: !data.user.is_anonymous,
        });
      } catch {
        saved = undefined;
      }
    }
    if (!saved || saved.record.review.state !== 'draft')
      return (
        <Notice
          title="Your business is already registered"
          body="Your application and setup live in your merchant workspace."
          href="/merchant"
          action="Open your workspace"
        />
      );
  }

  return (
    <MerchantRegistrationFormFrame>
      <ConnectedApplication
        key={`${data.user.id}:${saved?.record.merchant_id ?? 'new'}:${saved?.record.revision ?? 0}`}
        actorId={data.user.id}
        anonymousSession={data.user.is_anonymous}
        emailOtpEnabled={process.env.MERCHANT_EMAIL_OTP_ENABLED !== 'false'}
        initialRecord={saved?.record}
        initialPayout={saved?.payout}
        rememberInUrl={false}
        showDemo={false}
      />
    </MerchantRegistrationFormFrame>
  );
}

function Notice({
  title,
  body,
  href,
  action,
}: {
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <div className="border-border bg-surface text-ink rounded-2xl border p-6 shadow-[0_16px_42px_rgb(20_20_20/0.06)] sm:p-8">
      <p className="text-xl font-extrabold tracking-tight">{title}</p>
      <p className="text-muted mt-2 text-[0.9375rem] font-semibold leading-[1.7]">{body}</p>
      <Link
        href={href}
        prefetch={false}
        className="bg-gold text-ink focus-visible:ring-ink mt-6 inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-extrabold hover:bg-[#FEDD5C] focus-visible:outline-none focus-visible:ring-2"
      >
        {action}
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </Link>
    </div>
  );
}
