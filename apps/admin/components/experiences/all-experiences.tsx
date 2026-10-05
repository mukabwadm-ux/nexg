'use client';

import { Button, Card, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { askForReview, decideReview, replyToReview } from '@/app/experiences/actions';

import {
  Chip,
  DASH,
  keslabel,
  num,
  Stars,
  StatusPill,
  Tile,
  when,
  type GuestRow,
  type ReviewRow,
  type Stats,
} from './shared';

/**
 * Experiences · all guests (K0).
 *
 * Everyone who built or requested a day, their history, and the review
 * they left — which appears on the front end only after a person has
 * approved it, in the form the guest consented to.
 *
 * Nothing on this screen edits a review. The body and the rating are
 * immutable in the database, so the only two things this can do are
 * publish it or keep it private, and both are logged with a reason.
 */

const FILTERS: { key: string; label: (s: Stats) => string }[] = [
  { key: 'all', label: (s) => `All ${num(s.guests)}` },
  { key: 'needs_review', label: (s) => `Reviews to approve ${s.reviews_to_approve}` },
  { key: 'not_asked', label: () => 'Not asked yet' },
  { key: 'published', label: (s) => `Published ${num(s.published_reviews)}` },
  { key: 'repeat', label: () => 'Repeat' },
  { key: 'not_booked', label: () => 'Not booked' },
];

export function AllExperiences({
  rows,
  stats,
  reviews,
  filter,
  selected,
  canDecide,
}: {
  rows: GuestRow[];
  stats: Stats;
  reviews: Record<string, ReviewRow>;
  filter: string;
  selected: string | null;
  canDecide: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState('');

  const go = (next: { filter?: string; guest?: string | null }) => {
    const params = new URLSearchParams();
    params.set('tab', 'all');
    const f = next.filter ?? filter;
    if (f !== 'all') params.set('filter', f);
    const g = next.guest === undefined ? selected : next.guest;
    if (g) params.set('guest', g);
    router.push(`/experiences?${params.toString()}`);
  };

  const visible = rows.filter((r) => {
    if (!search.trim()) return true;
    const hay = `${r.guest_name ?? ''} ${r.stay_label ?? ''} ${r.guest_phone ?? ''} ${r.last_reference}`;
    return hay.toLowerCase().includes(search.trim().toLowerCase());
  });

  const person = rows.find((r) => r.user_id === selected) ?? null;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Guest, stay, phone…"
            className="border-border-strong bg-surface w-56 rounded-full border px-4 py-2 text-[0.8125rem] font-semibold"
          />
          {FILTERS.map((f) => (
            <Chip key={f.key} on={filter === f.key} onClick={() => go({ filter: f.key })}>
              {f.label(stats)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="Guests with experiences" value={num(stats.guests)}>
          built or requested · all time
        </Tile>
        <Tile label="Completed days" value={num(stats.completed_30d)}>
          30 d · {num(stats.repeat_guests)} repeat guests
        </Tile>
        <Tile
          label="Reviews to approve"
          value={num(stats.reviews_to_approve)}
          tone={stats.reviews_to_approve > 0 ? 'danger' : undefined}
        >
          {stats.oldest_review_days === null
            ? 'nothing waiting'
            : `oldest ${stats.oldest_review_days} d`}
        </Tile>
        <Tile label="Published reviews" value={num(stats.published_reviews)}>
          avg {stats.average_rating === null ? DASH : stats.average_rating} ★ · shown on the front
          end
        </Tile>
        <Tile
          label="Review rate"
          value={stats.review_rate_pct === null ? DASH : `${stats.review_rate_pct}%`}
        >
          of completed days · asked once
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_30rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[48rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Guest · stay</th>
                <th className="px-4 py-3">Last experience</th>
                <th className="px-4 py-3">Days</th>
                <th className="px-4 py-3">Spent</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Review</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const review = (r.review_id ? reviews[r.review_id] : null) ?? null;
                return (
                  <tr
                    key={r.user_id}
                    onClick={() => go({ guest: r.user_id })}
                    className={`border-border hover:bg-bg cursor-pointer border-b last:border-b-0 ${
                      selected === r.user_id ? 'bg-bg ring-gold ring-1 ring-inset' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-[0.8125rem] font-extrabold">
                        {/* The artboard brackets this, and so does the data:
                            somebody who built a day and never sent it has
                            not told us who they are. */}
                        {r.guest_name ?? '[Guest name]'}
                      </p>
                      <p className="text-muted-light text-[0.6875rem] font-semibold">
                        {r.stay_label ?? '[stay]'}
                        {r.city_name ? ` · ${r.city_name}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-[16rem] truncate text-[0.8125rem] font-bold">
                        {r.last_title}
                      </p>
                      <p className="text-muted-light text-[0.6875rem] font-semibold">
                        {r.days} experience{r.days === 1 ? '' : 's'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[0.8125rem] font-bold">{r.days}</td>
                    <td className="px-4 py-3 text-[0.8125rem] font-bold">
                      {r.spent_kes > 0 ? keslabel(r.spent_kes) : `KES ${DASH}`}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.last_status} />
                    </td>
                    <td className="px-4 py-3">
                      <ReviewCell row={r} review={review} />
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-muted px-4 py-10 text-center text-sm font-semibold"
                  >
                    Nobody matches that.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {person ? (
          <GuestPanel
            person={person}
            review={(person.review_id ? reviews[person.review_id] : null) ?? null}
            canDecide={canDecide}
            onClose={() => go({ guest: null })}
          />
        ) : (
          <Card className="p-6">
            <p className="text-muted text-sm font-semibold">
              Pick a guest to see their days and their review.
            </p>
          </Card>
        )}
      </div>

      <p className="text-muted-light mt-4 text-center text-[0.6875rem] font-semibold leading-[1.7]">
        Reviews are asked once, 24 h after a completed day · never edited · approval and the reason
        are logged
      </p>
    </>
  );
}

function ReviewCell({ row, review }: { row: GuestRow; review: ReviewRow | null }) {
  if (!review) {
    if (row.review_asked_at) {
      return (
        <span className="text-muted-light text-[0.6875rem] font-semibold">
          asked · {when(row.review_asked_at)}
        </span>
      );
    }
    return <span className="text-muted-light text-[0.6875rem] font-semibold">no review yet</span>;
  }

  const badge =
    review.status === 'received'
      ? { text: 'REVIEW · NEEDS APPROVAL', className: 'bg-warning-bg text-warning' }
      : review.status === 'approved'
        ? { text: 'PUBLISHED', className: 'bg-success-bg text-success' }
        : { text: 'NOT PUBLISHED', className: 'bg-danger-bg text-danger' };

  return (
    <div>
      <Stars rating={review.rating} />
      <span
        className={`mt-1 block w-fit rounded px-1.5 py-0.5 text-[0.5625rem] font-extrabold ${badge.className}`}
      >
        {badge.text}
      </span>
    </div>
  );
}

function GuestPanel({
  person,
  review,
  canDecide,
  onClose,
}: {
  person: GuestRow;
  review: ReviewRow | null;
  canDecide: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [display, setDisplay] = React.useState<'initial' | 'full_name' | 'anonymous'>(
    review?.consent_display ?? 'initial',
  );

  React.useEffect(() => setDisplay(review?.consent_display ?? 'initial'), [review]);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    toast({
      title: r.ok ? 'Done' : 'Not allowed',
      description: r.message,
      tone: r.ok ? 'success' : 'danger',
    });
    if (r.ok) router.refresh();
  };

  const initials = (person.guest_name ?? 'Guest')
    .replace(/[[\]]/g, '')
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  /* The masked form. A full number is one click away in the workbench,
     where revealing it is an action; a directory should not print it. */
  const maskedPhone = person.guest_phone
    ? `${person.guest_phone.slice(0, 5)}•••••${person.guest_phone.slice(-2)}`
    : DASH;

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="bg-ink text-gold flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-extrabold"
        >
          {initials || '—'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[1.0625rem] font-extrabold">
              {person.guest_name ?? '[Guest name]'}
            </span>
            {person.is_repeat && (
              <span className="bg-gold-soft text-gold-text rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide">
                Repeat · {person.days}
              </span>
            )}
          </p>
          <p className="text-muted mt-0.5 text-[0.6875rem] font-semibold">
            {person.stay_label ?? '[stay]'} · {maskedPhone} · first day {when(person.first_day)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-light hover:text-ink text-lg leading-none"
        >
          ×
        </button>
      </div>

      {/* ───────────────────────────────────────── their experiences */}
      <div className="border-border mt-5 border-t pt-4">
        <p className="text-[0.8125rem] font-extrabold">Their experiences</p>
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => router.push(`/experiences/plans/${person.last_plan_id}`)}
            className="border-border bg-bg hover:border-border-strong w-full rounded-xl border p-3 text-left transition-colors"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-[0.8125rem] font-extrabold">
                  {person.last_title}
                </span>
                <span className="text-muted-light block text-[0.6875rem] font-semibold">
                  {person.last_date
                    ? new Date(person.last_date).toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })
                    : 'no date'}{' '}
                  · {person.last_reference}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[0.8125rem] font-extrabold">
                  {person.spent_kes > 0 ? keslabel(person.spent_kes) : `KES ${DASH}`}
                </span>
                <StatusPill status={person.last_status} />
              </span>
            </span>
          </button>
          {person.days > 1 && (
            <p className="text-muted-light text-[0.6875rem] font-semibold">
              and {person.days - 1} earlier day{person.days - 1 === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────── the review */}
      {review ? (
        <div className="border-border mt-5 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.8125rem] font-extrabold">Review · {person.last_title}</p>
            {review.status === 'received' && (
              <span className="bg-warning-bg text-warning rounded px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase tracking-wide">
                Needs approval
              </span>
            )}
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-2">
            <Stars rating={review.rating} />
            <span className="text-muted-light text-[0.6875rem] font-semibold">
              received {when(review.received_at)} · via {review.channel.replace('_', ' ')} ·{' '}
              {review.word_count} words
            </span>
          </p>

          {/* Verbatim, in a box, because it is theirs and nothing here
              can change a character of it. */}
          <blockquote className="border-border bg-surface mt-3 rounded-xl border p-3.5 text-[0.8125rem] italic leading-[1.8]">
            “{review.body}”
          </blockquote>

          <p className="mt-4 text-[0.75rem] font-extrabold">Show on the front end as</p>
          <div className="mt-2 space-y-1.5">
            {(
              [
                ['initial', 'First name + initial'],
                ['full_name', 'Full name — needs the guest’s explicit consent'],
                ['anonymous', 'Anonymous · “A couple from [country]”'],
              ] as const
            ).map(([key, label]) => {
              /* The one thing on this screen that cannot be taken back.
                 The radio is disabled unless they actually agreed. */
              const blocked = key === 'full_name' && review.consent_display !== 'full_name';
              return (
                <label
                  key={key}
                  className={`flex items-start gap-2 text-[0.75rem] font-semibold ${
                    blocked ? 'text-muted-light' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="display"
                    checked={display === key}
                    disabled={blocked || !canDecide}
                    onChange={() => setDisplay(key)}
                    className="accent-ink mt-0.5"
                  />
                  {label}
                </label>
              );
            })}
          </div>

          <p className="mt-4 text-[0.75rem] font-extrabold">Checks</p>
          <ul className="mt-2 space-y-1.5">
            <Check
              ok={!review.checks.pii_found}
              text={
                review.checks.pii_found
                  ? `Contains ${(review.checks.pii_kinds ?? []).join(', ')} — do not publish as written`
                  : 'No phone numbers, plate numbers or partner staff names in the text'
              }
            />
            <Check
              ok={review.consent_publish}
              text={
                review.consent_publish
                  ? 'Guest consented to publication at the review link'
                  : 'Guest did not consent to publication'
              }
            />
            {review.checks.partner_staff_named && (
              <Check ok={false} text="Names a partner’s staff member — that person did not agree" />
            )}
            {review.checks.negative_mention && (
              <Check
                warn
                text="Mentions something that went wrong — publish as-is; do not edit guest words"
              />
            )}
          </ul>

          {review.status === 'received' && canDecide && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                loading={busy === 'approve'}
                disabled={!review.consent_publish}
                onClick={() =>
                  void run('approve', () => decideReview(review.id, 'approved', null, display))
                }
              >
                Approve &amp; publish
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={busy === 'private'}
                onClick={() => {
                  const reason = window.prompt('Why keep it private? This is logged.');
                  if (!reason) return;
                  void run('private', () => decideReview(review.id, 'kept_private', reason, null));
                }}
              >
                Keep private
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={busy === 'reply'}
                onClick={() => {
                  const body = window.prompt('Reply to the guest. Not published.');
                  if (!body) return;
                  void run('reply', () => replyToReview(review.id, body));
                }}
              >
                Reply to guest
              </Button>
            </div>
          )}

          {review.status !== 'received' && (
            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
              {review.status === 'approved'
                ? 'Published. The words and the rating cannot be changed by anyone.'
                : `Kept private — ${review.decision_reason}`}
            </p>
          )}
        </div>
      ) : (
        <div className="border-border mt-5 border-t pt-4">
          <p className="text-[0.8125rem] font-extrabold">Review</p>
          <p className="text-muted-light mt-2 text-[0.75rem] font-semibold leading-[1.7]">
            {person.review_asked_at
              ? `Asked ${when(person.review_asked_at)}. They have not answered, and we do not ask twice.`
              : person.last_status === 'completed'
                ? 'Not asked yet.'
                : 'Asked after a completed day.'}
          </p>
        </div>
      )}

      <div className="border-border mt-5 flex flex-wrap gap-2 border-t pt-4">
        <Button
          size="sm"
          variant="outline"
          disabled={person.last_status !== 'completed' || person.review_asked_at !== null}
          title={
            person.review_asked_at
              ? 'They have already been asked. Once is the rule.'
              : person.last_status !== 'completed'
                ? 'After the day, not before it.'
                : undefined
          }
          loading={busy === 'ask'}
          onClick={() => void run('ask', () => askForReview(person.last_plan_id))}
        >
          Ask for a review
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push(`/experiences/plans/${person.last_plan_id}`)}
        >
          Open thread
        </Button>
      </div>
    </Card>
  );
}

function Check({ ok, warn, text }: { ok?: boolean; warn?: boolean; text: string }) {
  const colour = warn ? 'bg-warning' : ok ? 'bg-success' : 'bg-danger';
  return (
    <li className="flex items-start gap-2 text-[0.6875rem] font-semibold leading-[1.6]">
      <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${colour}`} />
      {text}
    </li>
  );
}
