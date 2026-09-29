'use client';

import { Button, Card, Input, useToast } from '@nexg/ui';
import { Bed, Music, PartyPopper, Sparkles, Ticket, UtensilsCrossed } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  applyCuratedDay,
  ensurePlan,
  savePlan,
  sendPlan,
  swapBlock,
  type PlanPatch,
} from '@/app/experience/actions';
import { BudgetCard, DayTimeline } from './day-timeline';
import { keslabel, type EventCard, type MoodChip, type Mood, type PlanView } from './types';
import type { Json } from '@nexg/db';

/**
 * Customize Your Experience — the builder (X2).
 *
 * Tapping, not typing: everything except the last line is a button. Each
 * tap writes the answer and rebuilds the day on the right, which is the
 * whole mechanic — the guest is watching a budget arrange itself rather
 * than filling in a form.
 *
 * Copy is verbatim from the artboard (ground rule 6). Figures that nobody
 * has set render [—] rather than a plausible number (ground rule 3): the
 * median-budget hint below the slider is bracketed because there are no
 * paid days to take a median of, and the concierge's response time is
 * bracketed because no SLA has been agreed with a real desk.
 */

const MOODS: { key: Mood; label: string; blurb: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'wild', label: 'Wild', blurb: 'Game park, giraffes, elephants, Karura', icon: Sparkles },
  { key: 'taste', label: 'Taste', blurb: 'Nyama choma, coastal, street food, fine dining', icon: UtensilsCrossed },
  { key: 'night', label: 'Night', blurb: 'Rooftops, live bands, clubs, a safe ride home', icon: Music },
  { key: 'slow', label: 'Slow', blurb: 'Spa, pool day, coffee farm, a long breakfast', icon: PartyPopper },
  { key: 'stay', label: 'Stay', blurb: 'Airbnb or boutique hotel for the night', icon: Bed },
  { key: 'events', label: 'Events', blurb: 'Marathon, RnB House, rugby, festivals', icon: Ticket },
];

/** The line under each mood's chips, verbatim. */
const MOOD_HINT: Record<Mood, string> = {
  wild: 'Park fees are set by KWS and shown separately — we never mark them up.',
  taste: 'Halal, vegetarian and allergy notes go straight to the kitchen.',
  night: 'Your ride home is always included in a Night block.',
  slow: 'A slow block is the one most people wish they had left room for.',
  stay: 'We hold the room on the same booking as the rest of the day.',
  events:
    'Tickets are sold by the organiser at face value. We hold them, build the evening around doors time, and your ride home waits outside.',
};

/* Where the slider starts, from the artboard. */
const DEFAULT_BUDGET_KES = 40000;

const DURATIONS = [
  { key: 'evening', label: 'An evening' },
  { key: 'day', label: 'A full day' },
  { key: 'weekend', label: 'A weekend' },
  { key: 'dates', label: 'Pick dates' },
];

const PARTIES = [
  { key: 'solo', label: 'Just me' },
  { key: 'couple', label: 'A couple' },
  { key: 'family', label: 'Family' },
  { key: 'group', label: 'Group' },
];

const TRANSPORT = [
  { key: 'driver', label: 'Private car & driver' },
  { key: 'rides', label: 'NexG rides per leg' },
  { key: 'own', label: 'We have a car' },
];

export function Builder({
  chips,
  events,
  budgetMin,
  budgetMax,
  medianHint,
  replyMinutes,
  preselectEvent,
  preselectCuratedDay,
}: {
  chips: MoodChip[];
  events: EventCard[];
  budgetMin: number;
  budgetMax: number;
  /** [low, high] of what people actually pay, or null below 20 paid days. */
  medianHint: [number, number] | null;
  replyMinutes: number | null;
  preselectEvent: string | null;
  preselectCuratedDay: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [view, setView] = React.useState<PlanView | null>(null);
  const [planId, setPlanId] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(true);
  const [busyBlock, setBusyBlock] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [askContact, setAskContact] = React.useState(false);

  /* Local state so a tap paints immediately; the server is the truth and
     catches up a beat later. */
  const [duration, setDuration] = React.useState('day');
  const [party, setParty] = React.useState('couple');
  const [size, setSize] = React.useState(2);
  const [budget, setBudget] = React.useState(DEFAULT_BUDGET_KES);
  const [moods, setMoods] = React.useState<Mood[]>([]);
  const [answers, setAnswers] = React.useState<Record<string, Json>>({});
  const [notes, setNotes] = React.useState('');

  const pending = React.useRef<PlanPatch>({});
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * StrictMode mounts, unmounts and remounts this in development, and a
   * ref survives that — so this runs once, which is what matters when
   * the thing it does is create a session.
   *
   * There is deliberately no `live` flag alongside it. The two together
   * deadlocked: the ref stopped the second run, and the first run's
   * cleanup had already set live = false, so nothing ever cleared the
   * loading state and the page sat on "Getting your day ready…" forever.
   */
  const started = React.useRef(false);

  // ── the draft, and the session that owns it ────────────────────────
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const result = await ensurePlan();
      if (result.ok && result.view) {
        setView(result.view);
        setPlanId(result.planId ?? null);
        const p = result.view.plan;
        setDuration(p.duration);
        setParty(p.party_type);
        setSize(p.party_size);
        if (p.budget_kes) setBudget(p.budget_kes);
        setMoods(p.moods ?? []);
        setAnswers((p.answers as Record<string, Json>) ?? {});
        setNotes(p.notes ?? '');

        /*
         * The slider has to start somewhere, and where it starts is a
         * statement: a guest reading "KES 40,000" on the control and
         * "of KES [—]" on the card is being shown two different answers
         * to the same question. So the starting position is written
         * through on first load, and the two agree from the first frame.
         */
        if (p.budget_kes === null) {
          const result2 = await savePlan(result.planId!, { budget_kes: DEFAULT_BUDGET_KES });
          if (result2.ok && result2.view) setView(result2.view);
        }
      } else if (result.message) {
        toast({ title: 'Could not start', description: result.message, tone: 'danger' });
      }
      setStarting(false);
    })();
  }, [toast]);

  /* An event chosen on the events page arrives as a query parameter, and
     should look the same as having tapped it here. */
  React.useEffect(() => {
    if (!planId || !preselectEvent) return;
    const next: Mood[] = moods.includes('events') ? moods : [...moods, 'events'];
    const merged = { ...answers, events: [preselectEvent] };
    setMoods(next);
    setAnswers(merged);
    queue({ moods: next, answers: merged });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, preselectEvent]);

  /* "Make it yours" from a curated day: its blocks are loaded in as a
     starting point, still proposed and still swappable. */
  React.useEffect(() => {
    if (!planId || !preselectCuratedDay) return;
    let live = true;
    (async () => {
      const result = await applyCuratedDay(planId, preselectCuratedDay);
      if (!live) return;
      if (result.ok && result.view) {
        setView(result.view);
        setMoods(result.view.plan.moods ?? []);
        setDuration(result.view.plan.duration);
      } else if (result.message) {
        toast({ title: 'Could not open that day', description: result.message, tone: 'danger' });
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, preselectCuratedDay]);

  /*
   * Debounced, but the day still has to keep up with a finger. 250 ms is
   * the artboard's "rebuilds as you tap" — long enough that dragging the
   * slider is one save, short enough that a tap feels answered.
   */
  function queue(patch: PlanPatch) {
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 250);
  }

  async function flush() {
    if (!planId) return;
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    const result = await savePlan(planId, patch);
    if (result.ok && result.view) setView(result.view);
    else if (result.message)
      toast({ title: 'Could not save', description: result.message, tone: 'danger' });
  }

  /** Send must never outrun the debounce, or the concierge gets the day
      as it was one tap ago. */
  async function flushNow() {
    if (timer.current) clearTimeout(timer.current);
    await flush();
  }

  function toggleMood(mood: Mood) {
    const next = moods.includes(mood) ? moods.filter((m) => m !== mood) : [...moods, mood];
    setMoods(next);
    queue({ moods: next });
  }

  function toggleChip(mood: Mood, id: string) {
    const current = (answers[mood] as string[] | undefined) ?? [];
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
    const merged = { ...answers, [mood]: next };
    setAnswers(merged);
    queue({ answers: merged });
  }

  async function onSwap(blockId: string, componentId: string) {
    if (!planId) return;
    setBusyBlock(blockId);
    const result = await swapBlock(planId, blockId, componentId);
    setBusyBlock(null);
    if (result.ok && result.view) setView(result.view);
    else if (result.message)
      toast({ title: 'Could not swap', description: result.message, tone: 'danger' });
  }

  const partyLabel =
    party === 'solo' ? 'for one' : party === 'couple' ? 'for two' : `for ${size}`;

  const byMood = React.useMemo(() => {
    const map = new Map<Mood, MoodChip[]>();
    for (const chip of chips) {
      const list = map.get(chip.mood) ?? [];
      list.push(chip);
      map.set(chip.mood, list);
    }
    return map;
  }, [chips]);

  if (starting) {
    return (
      <p className="text-muted px-4 py-24 text-center text-sm font-semibold sm:px-8">
        Getting your day ready…
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-[96rem] px-4 py-10 sm:px-8 lg:px-16">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_35rem] lg:items-start">
        {/* ───────────────────────────────────────────────── left */}
        <div className="min-w-0">
          <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
            Build my day
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
            Three taps, then watch your day take shape.
          </h1>
          <p className="text-muted mt-4 max-w-xl text-[0.9375rem] leading-[1.8]">
            Pick how long, how much and who. Then tap the moods you want. The day on the right
            rebuilds itself as you go — swap any piece up or down until it feels right.
          </p>

          {/* three questions */}
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <QuestionCard title="How long?">
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <Chip
                    key={d.key}
                    on={duration === d.key}
                    onClick={() => {
                      setDuration(d.key);
                      queue({ duration: d.key });
                    }}
                  >
                    {d.label}
                  </Chip>
                ))}
              </div>
            </QuestionCard>

            <QuestionCard title="Who is coming?">
              <div className="flex flex-wrap gap-2">
                {PARTIES.map((p) => (
                  <Chip
                    key={p.key}
                    on={party === p.key}
                    onClick={() => {
                      const nextSize = p.key === 'solo' ? 1 : p.key === 'couple' ? 2 : Math.max(size, 3);
                      setParty(p.key);
                      setSize(nextSize);
                      queue({ party_type: p.key, party_size: nextSize });
                    }}
                  >
                    {p.label}
                  </Chip>
                ))}
              </div>
              {(party === 'family' || party === 'group') && (
                <label className="mt-3 flex items-center gap-2">
                  <span className="text-muted-light text-xs font-semibold">How many?</span>
                  <input
                    type="number"
                    min={3}
                    max={40}
                    value={size}
                    onChange={(e) => {
                      const n = Math.max(3, Math.min(40, Number(e.target.value) || 3));
                      setSize(n);
                      queue({ party_size: n });
                    }}
                    className="border-border-strong bg-bg w-20 rounded-lg border px-2 py-1 text-sm font-bold"
                  />
                </label>
              )}
            </QuestionCard>

            <QuestionCard title="Where are you staying?">
              <Input
                id="stay"
                label=""
                placeholder="Hotel, Airbnb or an area"
                defaultValue={view?.plan?.stay_label ?? ''}
                onChange={(e) => queue({ stay_label: e.target.value })}
              />
            </QuestionCard>
          </div>

          {/* budget */}
          <Card className="mt-4 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[0.9375rem] font-extrabold">Your budget for the day</p>
              <p className="text-xl font-extrabold tracking-tight">
                {keslabel(budget)}
                <span className="text-muted-light ml-1 text-xs font-bold">{partyLabel}</span>
              </p>
            </div>
            <input
              type="range"
              aria-label="Your budget for the day"
              min={budgetMin}
              max={budgetMax}
              step={1000}
              value={budget}
              onChange={(e) => {
                const n = Number(e.target.value);
                setBudget(n);
                queue({ budget_kes: n });
              }}
              className="accent-gold mt-4 w-full"
            />
            <div className="text-muted-light mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.6875rem] font-semibold">
              <span>{keslabel(budgetMin)}</span>
              {/*
               * Bracketed until there are enough paid days to take a real
               * median of. A made-up "most couples pick" would be the most
               * persuasive number on the page and the least true.
               */}
              <span>
                Most couples pick{' '}
                {medianHint
                  ? `${keslabel(medianHint[0])}–${keslabel(medianHint[1])}`
                  : 'KES [—]–[—]'}{' '}
                for a full day
              </span>
              <span>{keslabel(budgetMax)}+</span>
            </div>
          </Card>

          {/* moods */}
          <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[0.9375rem] font-extrabold">
              What is the mood?{' '}
              <span className="text-muted-light text-xs font-semibold">tap all that apply</span>
            </p>
            <p className="text-gold-text text-xs font-extrabold">{moods.length} selected</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {MOODS.map((mood) => {
              const on = moods.includes(mood.key);
              const Icon = mood.icon;
              return (
                <button
                  key={mood.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleMood(mood.key)}
                  className={`rounded-2xl border p-3.5 text-left transition-colors ${
                    on
                      ? 'border-ink bg-ink text-white'
                      : 'border-border bg-surface hover:border-border-strong'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      on ? 'bg-gold text-ink' : 'bg-bg text-ink'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="mt-3 block text-[0.9375rem] font-extrabold">{mood.label}</span>
                  <span
                    className={`mt-1 block text-[0.6875rem] font-semibold leading-snug ${
                      on ? 'text-white/60' : 'text-muted-light'
                    }`}
                  >
                    {mood.blurb}
                  </span>
                </button>
              );
            })}
          </div>

          {/* because you chose … */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {moods.map((mood) => (
              <BecauseCard key={mood} mood={mood} label={MOODS.find((m) => m.key === mood)!.label}>
                <div className="flex flex-wrap gap-2">
                  {mood === 'events'
                    ? events.slice(0, 3).map((event) => (
                        <Chip
                          key={event.id}
                          on={((answers.events as string[]) ?? []).includes(event.id)}
                          onClick={() => toggleChip('events', event.id)}
                        >
                          {event.name} ·{' '}
                          {new Date(event.starts_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </Chip>
                      ))
                    : (byMood.get(mood) ?? []).map((chip) => (
                        <Chip
                          key={chip.id}
                          on={((answers[mood] as string[]) ?? []).includes(chip.id)}
                          onClick={() => toggleChip(mood, chip.id)}
                        >
                          {chip.title}
                        </Chip>
                      ))}
                  {mood !== 'events' && (byMood.get(mood) ?? []).length === 0 && (
                    <p className="text-muted-light text-xs font-semibold">
                      Nothing listed here yet — tell your concierge and they will find it.
                    </p>
                  )}
                </div>
                <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
                  {MOOD_HINT[mood]}
                </p>
              </BecauseCard>
            ))}
          </div>

          {/* getting around */}
          <BecauseCard className="mt-4" mood="slow" label="" title="Getting around">
            <div className="flex flex-wrap gap-2">
              {TRANSPORT.map((t) => (
                <Chip
                  key={t.key}
                  on={answers.transport === t.key}
                  onClick={() => {
                    const merged = { ...answers, transport: t.key };
                    setAnswers(merged);
                    queue({ answers: merged });
                  }}
                >
                  {t.label}
                </Chip>
              ))}
            </div>
            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
              A driver for the day usually costs less than four separate rides.
            </p>
          </BecauseCard>

          {/* the one free-text line */}
          <Card className="mt-4 p-5">
            <p className="text-[0.9375rem] font-extrabold">Anything else?</p>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                queue({ notes: e.target.value });
              }}
              placeholder="e.g. it is her birthday · we do not eat pork · we want to be back by midnight"
              className="border-border-strong bg-bg mt-3 w-full rounded-xl border px-3 py-2.5 text-[0.875rem] font-semibold"
            />
            <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">
              One line is enough. Your concierge reads every word.
            </p>
          </Card>
        </div>

        {/* ──────────────────────────────────────────────── right */}
        <div data-day-column className="lg:sticky lg:top-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[0.5625rem] font-extrabold uppercase tracking-[0.18em]">
              Your day
              {view?.plan?.date
                ? ` · ${new Date(view.plan.date).toLocaleDateString('en-GB', { weekday: 'long' })}`
                : ''}
            </p>
            <p className="text-muted-light text-[0.625rem] font-semibold">rebuilds as you tap</p>
          </div>

          {view && <BudgetCard view={view} />}

          <div className="mt-3">
            {view && (
              <DayTimeline
                view={view}
                partyLabel={partyLabel}
                onSwap={onSwap}
                busy={busyBlock}
              />
            )}
          </div>

          <Button
            className="mt-4 w-full"
            size="lg"
            loading={sending}
            /*
             * The same rule rpc_send_plan applies: a day of nothing but a
             * free afternoon is not a day. Without this the button is
             * live against an empty catalogue and the guest taps it to be
             * told no — which is how production looks right now, before
             * any partner is signed.
             */
            disabled={!view || view.blocks.filter((b) => b.kind !== 'free').length === 0}
            onClick={async () => {
              await flushNow();
              setAskContact(true);
            }}
          >
            Send my day to a concierge →
          </Button>

          <p className="text-muted-light mt-3 text-center text-[0.6875rem] font-semibold leading-[1.7]">
            A concierge confirms every booking and the final price within{' '}
            {replyMinutes ?? '[—]'} minutes. You pay once, after you approve. Park fees and
            anything paid on the day are listed separately.
          </p>
        </div>
      </div>

      {askContact && planId && (
        <ContactDialog
          onClose={() => setAskContact(false)}
          busy={sending}
          onSend={async (name, phone) => {
            setSending(true);
            const result = await sendPlan(planId, name, phone);
            setSending(false);
            if (!result.ok) {
              toast({ title: 'Not sent', description: result.message, tone: 'danger' });
              return;
            }
            router.push(`/experience/plan/${planId}`);
          }}
        />
      )}
    </main>
  );
}

function QuestionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <p className="text-[0.9375rem] font-extrabold">{title}</p>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function BecauseCard({
  mood,
  label,
  title,
  className,
  children,
}: {
  mood: Mood;
  label: string;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`p-5 ${className ?? ''}`} key={mood}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[0.9375rem] font-extrabold">{title ?? `Because you chose ${label}`}</p>
        <span className="bg-gold-soft text-gold-text rounded-full px-2 py-1 text-[0.5625rem] font-extrabold uppercase tracking-wide">
          Because of your answer
        </span>
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`rounded-full px-3.5 py-2 text-[0.8125rem] font-extrabold transition-colors ${
        on
          ? 'bg-ink text-gold'
          : 'border-border-strong bg-surface text-ink hover:border-ink border'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The one thing the builder asks them to type.
 *
 * A phone number, because a concierge has to be able to reach them and
 * the whole promise is that a person confirms every booking. The build
 * prompt specifies an OTP here; no SMS provider is wired to this project,
 * so the number is taken and used rather than verified, and the copy does
 * not claim otherwise.
 */
function ContactDialog({
  onClose,
  onSend,
  busy,
}: {
  onClose: () => void;
  onSend: (name: string, phone: string) => void;
  busy: boolean;
}) {
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="bg-ink/40 absolute inset-0"
      />
      <div className="border-border bg-surface relative w-full max-w-md rounded-2xl border p-6">
        <h2 className="text-xl font-extrabold tracking-tight">Where do we reach you?</h2>
        <p className="text-muted mt-2 text-[0.875rem] leading-[1.8]">
          A concierge reads your day, calls the places on it, and comes back with a price you can
          approve or change. Nothing is booked and nothing is charged before that.
        </p>

        <div className="mt-4 grid gap-3">
          <Input
            id="guest_name"
            label="Your name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            id="guest_phone"
            label="Phone"
            type="tel"
            placeholder="+254 7…"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button loading={busy} disabled={!phone.trim()} onClick={() => onSend(name, phone)}>
            Send it
          </Button>
          <Button variant="outline" onClick={onClose}>
            Not yet
          </Button>
        </div>
      </div>
    </div>
  );
}
