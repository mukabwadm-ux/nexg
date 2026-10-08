import { FileText, Monitor, Phone } from 'lucide-react';
import Link from 'next/link';

import { DASH } from '@/components/host/bits';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Verify & go live' };
export const dynamic = 'force-dynamic';

/**
 * Proving the listing is yours.
 *
 * Three methods because hosts differ in what they are willing
 * to do. Editing a live listing to paste a code is free and
 * most hosts will; a Superhost mid-season will not touch a
 * listing that is converting, and for them a screenshot or a
 * five-minute call is the difference between verifying and
 * giving up.
 *
 * Only a person at NexG can move a host to live. That is
 * deliberate: the whole value of verification is that it was
 * not self-service.
 */
export default async function HostVerifyPage() {
  const { home, live, nav, progress } = await hostContext();
  if (!home || !progress) return null;

  const submitted = progress.step_verify;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/verify"
      title={live ? 'You are verified' : 'Verify & go live'}
      lead={
        live
          ? 'Your listing was checked and your account is live. Units go live individually once each has its five things done.'
          : 'One of three ways, whichever suits your listing. We check within about one working day.'
      }
      headlineValue={live ? 'Live' : submitted ? 'Pending' : 'Step 5'}
      headlineNote={
        live ? 'Verified by NexG' : submitted ? 'With us for review' : 'Choose a method below'
      }
    >
      {live ? (
        <div className="border-success/40 bg-success/5 rounded-xl border p-5">
          <p className="text-success text-[0.9375rem] font-extrabold">
            Verified{home.went_live_at ? ` on ${new Date(home.went_live_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Africa/Nairobi' })}` : ''}.
          </p>
          <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
            Nothing further is needed here. If you add a property that is not obviously part of
            the same account, we may ask once more.
          </p>
        </div>
      ) : (
        <>
          {submitted ? (
            <div className="border-gold/40 bg-gold-soft rounded-xl border p-5">
              <p className="text-gold-text text-[0.9375rem] font-extrabold">
                Submitted. We are checking.
              </p>
              <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
                Usually within one working day. You will get a message either way — including if
                we cannot find the code, which is the common reason this takes a second go.
              </p>
            </div>
          ) : null}

          <section className="border-border bg-surface rounded-xl border p-5">
            <div className="flex items-start gap-3">
              <span className="bg-bg text-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[0.9375rem] font-extrabold tracking-tight">
                  Paste a code into your listing
                </h2>
                <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
                  Add this to the end of your listing description and leave it for 24 hours. We
                  check the page, confirm it is yours, and you can take it out again.
                </p>
                <p className="border-border bg-bg mt-3 inline-block rounded-lg border px-4 py-2.5 font-mono text-[1.125rem] font-extrabold tracking-wider">
                  {home.verification_code ?? DASH}
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <section className="border-border bg-surface rounded-xl border p-5">
              <span className="bg-bg text-muted flex h-9 w-9 items-center justify-center rounded-lg">
                <Monitor className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 className="mt-3 text-[0.9375rem] font-extrabold tracking-tight">
                Send a screenshot instead
              </h2>
              <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
                Your host dashboard showing the listing. Covers the case where you would rather
                not edit a listing that is converting well.
              </p>
            </section>

            <section className="border-border bg-surface rounded-xl border p-5">
              <span className="bg-bg text-muted flex h-9 w-9 items-center justify-center rounded-lg">
                <Phone className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 className="mt-3 text-[0.9375rem] font-extrabold tracking-tight">
                Or a five-minute call
              </h2>
              <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
                Someone from partnerships calls, you open your host dashboard while on the phone,
                and it is done on the call.
              </p>
            </section>
          </div>

          <div className="border-border bg-surface rounded-xl border p-5">
            <h2 className="text-[0.9375rem] font-extrabold tracking-tight">Submitting</h2>
            <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
              The submit action and the screenshot upload are the next piece of this build. Until
              then, send the desk your code or your screenshot from Get Help and they will put it
              through — the same queue, the same working day.
            </p>
            <Link
              href="/host/support"
              className="bg-ink mt-3 inline-block rounded-lg px-4 py-2.5 text-[0.8125rem] font-extrabold text-white"
            >
              Send it to host ops →
            </Link>
          </div>
        </>
      )}
    </HostSection>
  );
}
