'use client';

import { Button } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { BecauseTag, Chip } from '@/components/onboarding/controls';
import { ContinueButton, FooterNote } from '@/components/onboarding/shell-frame';
import { createClient } from '@/lib/supabase/client';

import { RiderShell } from './rider-shell';
import { useRiderOnboarding } from './store';
import { KIT, SHIFTS } from './types';

const MAX_AREAS = 5;

/**
 * Step 3 — where they know and when they ride.
 *
 * Requests are matched by distance, not by this list, so the hint says so.
 * What the list actually buys a rider is an easy first week: we start them
 * where the streets are familiar, which is the difference between a good
 * first evening and quitting on day three.
 */
export function RiderAreasStep() {
  const router = useRouter();
  const { draft, patch, areas: fromServer, cities, flushNow } = useRiderOnboarding();

  /*
   * Fetched here as well as in the layout. The layout reads the database,
   * which lags the client store by one debounce, so a rider who picked their
   * city on the previous screen can arrive before the row knows about it.
   * The client store always knows.
   */
  const [available, setAvailable] = React.useState<string[]>(fromServer);
  const cityId = draft?.city_id ?? null;

  React.useEffect(() => {
    if (!cityId) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('zone_bounds')
        .select('name')
        .eq('city_id', cityId)
        .order('name');
      if (!cancelled && data) setAvailable((data as { name: string }[]).map((z) => z.name));
    })();
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  const city = cities.find((c) => c.id === draft?.city_id)?.name ?? 'the city';
  const picked = draft?.areas ?? [];
  const shifts = draft?.shifts ?? [];
  const kit = draft?.kit_has ?? [];
  const anywhere = `Anywhere in ${city}`;

  const toggleArea = (area: string) => {
    if (area === anywhere) {
      /* "Anywhere" is not one more area — it replaces the list, because a
         rider who will go anywhere has not narrowed anything. */
      patch({ areas: picked.includes(anywhere) ? [] : [anywhere] }, 3);
      return;
    }
    const without = picked.filter((a) => a !== anywhere);
    if (without.includes(area)) {
      patch({ areas: without.filter((a) => a !== area) }, 3);
    } else if (without.length < MAX_AREAS) {
      patch({ areas: [...without, area] }, 3);
    }
  };

  const atLimit = picked.length >= MAX_AREAS && !picked.includes(anywhere);
  const ready = picked.length > 0 && shifts.length > 0;

  return (
    <RiderShell
      step={3}
      eyebrow="Where & when"
      title="Where do you know best?"
      intro="We send you requests near where you are, but we start you in the areas you know so the first week is easy."
      footer={
        <>
          <Button variant="outline" size="lg" onClick={() => router.push('/riders/apply/ride')}>
            Back
          </Button>
          <ContinueButton
            disabled={!ready}
            onClick={async () => {
              await flushNow();
              router.push('/riders/apply/documents');
            }}
          >
            Continue
          </ContinueButton>
          {!ready && <FooterNote>Pick at least one area and one time</FooterNote>}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border-border bg-surface rounded-2xl border p-5">
          <h3 className="text-[0.9375rem] font-extrabold">Areas you know well · up to five</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {available.map((area) => (
              <Chip
                key={area}
                selected={picked.includes(area)}
                disabled={atLimit && !picked.includes(area)}
                onClick={() => toggleArea(area)}
              >
                {area}
              </Chip>
            ))}
            <Chip selected={picked.includes(anywhere)} onClick={() => toggleArea(anywhere)}>
              {anywhere}
            </Chip>
          </div>
          <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
            {atLimit
              ? 'That is five — unpick one to swap it.'
              : 'We start you in these so the first week is easy. Requests are matched by distance, so being nearby matters more than the list.'}
          </p>
        </div>

        <div className="border-border bg-surface rounded-2xl border p-5">
          <h3 className="text-[0.9375rem] font-extrabold">When do you usually ride?</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {SHIFTS.map((s) => (
              <Chip
                key={s.value}
                selected={shifts.includes(s.value)}
                onClick={() =>
                  patch(
                    {
                      shifts: shifts.includes(s.value)
                        ? shifts.filter((x) => x !== s.value)
                        : [...shifts, s.value],
                    },
                    3,
                  )
                }
              >
                {s.label}
              </Chip>
            ))}
          </div>
          <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
            Late nights and weekends are when guests order most, and late orders pay a night bonus.
            No minimum hours, ever.
          </p>
        </div>

        <div className="border-border bg-surface rounded-2xl border p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[0.9375rem] font-extrabold">Cash on delivery</h3>
            <BecauseTag />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip selected={draft?.cash_ok === true} onClick={() => patch({ cash_ok: true }, 3)}>
              Happy to carry cash
            </Chip>
            <Chip selected={draft?.cash_ok === false} onClick={() => patch({ cash_ok: false }, 3)}>
              M-Pesa orders only
            </Chip>
          </div>
          <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
            Some guests pay cash at the door. You hold it until Thursday cut-off, up to a cap, and
            it is netted from your Friday payout. You can switch this off any time.
          </p>
        </div>

        <div className="border-border bg-surface rounded-2xl border p-5">
          <h3 className="text-[0.9375rem] font-extrabold">Kit you already have</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {KIT.map((k) => (
              <Chip
                key={k.value}
                selected={kit.includes(k.value)}
                onClick={() =>
                  patch(
                    {
                      kit_has: kit.includes(k.value)
                        ? kit.filter((x) => x !== k.value)
                        : [...kit.filter((x) => x !== 'none'), k.value],
                    },
                    3,
                  )
                }
              >
                {k.label}
              </Chip>
            ))}
            <Chip selected={kit.length === 0} onClick={() => patch({ kit_has: [] }, 3)}>
              None yet
            </Chip>
          </div>
          <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
            Missing items come in the NexG kit at onboarding — yours to keep while you ride with us.
          </p>
        </div>
      </div>

      <div className="border-border bg-surface mt-4 rounded-2xl border p-5">
        <h3 className="text-[0.9375rem] font-extrabold">Anything we should know?</h3>
        <textarea
          rows={2}
          defaultValue={draft?.notes ?? ''}
          onBlur={(event) => patch({ notes: event.target.value }, 3)}
          placeholder="e.g. I also ride for another app on weekdays · I prefer hotel pickups"
          className="border-border-strong bg-bg focus-visible:ring-gold mt-4 w-full rounded-xl border px-3 py-2.5 text-[0.875rem] font-semibold focus:outline-none focus-visible:ring-2"
        />
        <p className="text-muted-light mt-2 text-xs font-semibold">Optional. One line is enough.</p>
      </div>
    </RiderShell>
  );
}
