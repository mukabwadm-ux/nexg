'use client';

import * as React from 'react';

import { createReferralLink } from '@/app/host/actions';

import { Said, Submit, useAction } from './form';

/**
 * The referral link, and making one.
 *
 * The code is built from the host's name so it can be read
 * down a phone, which is how most of these actually get passed
 * on. Issuing is idempotent — pressing it twice returns the
 * same code, because a code that changed on a second click
 * would break the link somebody had already sent to three
 * people.
 */
export function ReferralLink({ hostId, code }: { hostId: string; code: string | null }) {
  const { pending, outcome, run } = useAction();
  const [copied, setCopied] = React.useState(false);
  const [issued, setIssued] = React.useState<string | null>(null);

  const live = issued ?? code;
  const url = live ? `https://nexgapp.com/hosts?ref=${live}` : null;

  const copy = () => {
    if (!url) return;
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      })
      /* Clipboard access is refused in some embedded browsers.
         Saying so beats a button that silently does nothing. */
      .catch(() => setCopied(false));
  };

  const share = () => {
    if (!url) return;
    const text = `I use NexG for deliveries to my guests — food, groceries, pharmacy, straight to the unit. If you host too, this is my link: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <section className="bg-ink rounded-xl p-5 text-white">
      <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
        Your link
      </h2>

      {url ? (
        <>
          <p className="mt-2 break-all font-mono text-[0.875rem] font-extrabold">{url}</p>
          <p className="mt-2.5 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
            Code <span className="font-extrabold text-white">{live}</span> — short enough to read
            out, and it never changes.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="rounded-lg bg-white px-4 py-2 text-[0.8125rem] font-extrabold text-black"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={share}
              className="rounded-lg bg-white/10 px-4 py-2 text-[0.8125rem] font-extrabold text-white"
            >
              Share on WhatsApp
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-[0.8125rem] font-semibold leading-[1.65] text-white/60">
            You do not have a code yet. Creating one takes a second and it is yours for good —
            every host who signs up through it is tracked back to you, and the reward is credited
            when their first unit takes an order.
          </p>
          <div className="mt-4">
            <Submit
              type="button"
              pending={pending}
              onClick={() =>
                run(
                  () => createReferralLink(hostId),
                  (o) => {
                    const c = o.data?.code;
                    if (typeof c === 'string') setIssued(c);
                  },
                )
              }
            >
              Create my referral link
            </Submit>
          </div>
          <div className="mt-3">
            <Said outcome={outcome} />
          </div>
        </>
      )}
    </section>
  );
}
