'use client';

import { Button, Card, useToast } from '@nexg/ui';
import * as React from 'react';

import {
  confirmSlot,
  requestDeletion,
  respondToOffer,
  setTalentPool,
  withdrawApplication,
} from '@/app/careers/status/[token]/actions';

/**
 * Everything a candidate can actually do from their own page.
 *
 * No sign-in, so every action goes through an RPC that re-checks the
 * token server-side. The page having rendered is not authorisation
 * for anything.
 */
export function StatusActions({
  token,
  stage,
  interview,
  talentPool,
  hasOffer,
}: {
  token: string;
  stage: string;
  interview: {
    id: string;
    status: string;
    slots: string[];
    scheduled_at: string | null;
    meet_link: string | null;
  } | null;
  talentPool: boolean;
  hasOffer: boolean;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();
  const [pool, setPool] = React.useState(talentPool);
  const [gone, setGone] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState<string | null>(
    interview?.scheduled_at ?? null,
  );

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      toast({ title: r.ok ? 'Done' : 'That did not work', description: r.message });
      if (r.ok) after?.();
    });

  const ended = ['rejected', 'withdrawn', 'hired'].includes(stage);

  return (
    <>
      {/* Pick a time. */}
      {interview && interview.status === 'proposed' && !confirmed && (
        <Card className="mt-4 p-5 sm:p-7">
          <p className="text-[0.9375rem] font-extrabold">Pick a time</p>
          <p className="text-muted mt-1.5 text-[0.75rem] font-semibold">
            Whichever suits you. You can ask us to move it later.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {interview.slots.map((slot) => (
              <button
                key={slot}
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => confirmSlot(token, interview.id, slot),
                    () => setConfirmed(slot),
                  )
                }
                className="border-border-strong hover:border-ink rounded-lg border bg-white px-3 py-2 text-[0.8125rem] font-bold transition-colors disabled:opacity-50"
              >
                {new Date(slot).toLocaleString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </button>
            ))}
          </div>
        </Card>
      )}

      {confirmed && (
        <Card className="mt-4 p-5">
          <p className="text-[0.8125rem] font-extrabold">
            Booked ·{' '}
            {new Date(confirmed).toLocaleString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          {interview?.meet_link && (
            <a
              href={interview.meet_link}
              className="text-gold-text mt-1.5 inline-block text-[0.75rem] font-extrabold hover:underline"
            >
              Join link
            </a>
          )}
        </Card>
      )}

      {/* Answer the offer. */}
      {hasOffer && (
        <Card className="mt-4 p-5 sm:p-7">
          <p className="text-[0.9375rem] font-extrabold">Your answer</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() => run(() => respondToOffer(token, true, null))}
            >
              Accept
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() => respondToOffer(token, false, 'Declined from the status page'))
              }
            >
              Decline
            </Button>
          </div>
          <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold">
            Rather talk it through first? Reply to the offer email.
          </p>
        </Card>
      )}

      {/* Talent pool, and the two things that end it. */}
      <Card className="mt-4 p-5 sm:p-7">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={pool}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              setPool(next);
              run(() => setTalentPool(token, next));
            }}
            className="accent-gold mt-0.5 h-4 w-4"
          />
          <span className="text-[0.8125rem] font-semibold">
            Keep my details for twelve months in case something closer comes up.
          </span>
        </label>

        <div className="border-border mt-4 flex flex-wrap gap-2 border-t pt-4">
          {!ended && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => withdrawApplication(token, null), () => setGone(true))
              }
              className="border-border-strong hover:border-ink rounded-lg border bg-white px-3 py-2 text-[0.75rem] font-bold transition-colors disabled:opacity-50"
            >
              Withdraw my application
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => requestDeletion(token))}
            className="text-muted hover:text-ink rounded-lg px-3 py-2 text-[0.75rem] font-bold underline transition-colors disabled:opacity-50"
          >
            Request deletion
          </button>
        </div>

        {gone && (
          <p className="text-muted mt-3 text-[0.75rem] font-semibold">
            Withdrawn. Refresh to see the updated status.
          </p>
        )}
      </Card>
    </>
  );
}
