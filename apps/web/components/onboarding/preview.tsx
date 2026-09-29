'use client';

import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

import { ReadyRing } from './shell-frame';
import { useOnboarding } from './store';
import { READINESS_CHECKS, type BadgeRule } from './types';

/**
 * "How guests will see you", and how close they are to being seen.
 *
 * Everything here is derived from what the merchant has already typed. It
 * invents nothing: no rating, no delivery time before a pin has been judged
 * against a zone, no price where a price has not been set. Where a value is
 * not known yet it shows the placeholder the rest of the site uses, because
 * a plausible-looking guess on a preview of their own listing is the one
 * place a merchant would never think to check it.
 */

interface PreviewBranch {
  address_text: string | null;
  zone: { name: string; eta_min: number; eta_max: number } | null;
}

interface PreviewItem {
  id: string;
  name: string;
  price_kes: number | null;
}

export function LivePreview() {
  const { draft, readiness, categories } = useOnboarding();
  const [branch, setBranch] = React.useState<PreviewBranch | null>(null);
  const [items, setItems] = React.useState<PreviewItem[]>([]);

  const draftId = draft?.id ?? null;
  const locationDone = readiness?.location ?? false;
  const itemsDone = readiness?.first_items ?? false;

  React.useEffect(() => {
    if (!draftId) return;
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      const [{ data: b }, { data: i }] = await Promise.all([
        supabase
          .from('merchant_branch')
          .select('address_text, zone:zone_id (name, eta_min, eta_max)')
          .eq('merchant_id', draftId)
          .eq('is_primary', true)
          .maybeSingle(),
        supabase
          .from('catalogue_item')
          .select('id, name, price_kes')
          .eq('merchant_id', draftId)
          .order('sort')
          .limit(3),
      ]);
      if (cancelled) return;
      setBranch((b as PreviewBranch | null) ?? null);
      setItems((i as PreviewItem[] | null) ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [draftId, locationDone, itemsDone]);

  if (!draft) return null;

  const config = categories.find((c) => c.category === draft.category);
  const name = draft.trading_name?.trim() || '[Your business name]';

  /* The first answer worth showing after the category — the cuisine, the
     service, the thing that makes the listing recognisable. */
  const firstAnswer = config?.questions
    .map((q) => {
      const value = draft.answers?.[q.key];
      const picked = Array.isArray(value) ? value[0] : value;
      return q.options?.find((o) => o.value === picked)?.label;
    })
    .find(Boolean);

  const area = branch?.zone?.name ?? null;
  const eta = branch?.zone
    ? config?.eta_style === 'turnaround'
      ? etaTurnaround(draft.answers?.['turnaround'])
      : `${branch.zone.eta_min}–${branch.zone.eta_max} min`
    : null;

  const meta = [
    config?.label,
    firstAnswer,
    area ? `${area}, Nairobi` : null,
    /* "Delivers in [—] min" until the pin has landed in a zone. Never a
       guess: this number is a promise made to a guest. */
    config?.eta_style === 'turnaround'
      ? `Delivers back ${eta ?? '[—]'}`
      : `Delivers in ${eta ?? '[—]'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const badges = collectBadges(draft.answers ?? {}, config?.badge_rules ?? {});
  if (draft.has_own_riders) badges.push({ text: 'OWN RIDERS', tone: 'neutral' });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-gold-text text-xs font-extrabold uppercase tracking-[0.14em]">
          How guests will see you
        </h2>
        <p className="text-muted-light text-[0.6875rem] font-semibold">updates as you go</p>
      </div>

      {/* ------------------------------------------------------ the card */}
      <div className="border-border bg-surface overflow-hidden rounded-2xl border">
        <div className="bg-bg relative h-[7.5rem] w-full">
          {draft.cover_photo_path ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={draft.cover_photo_path} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              aria-hidden="true"
              className="text-muted-light flex h-full w-full items-center justify-center text-[0.625rem] font-extrabold uppercase tracking-[0.2em]"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(135deg, rgb(var(--border-rgb)) 0 8px, rgb(var(--bg-rgb)) 8px 16px)',
              }}
            >
              <span className="bg-bg/90 rounded px-2 py-1">Your cover photo</span>
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-[1.0625rem] font-extrabold leading-tight">{name}</p>
            <StatusPill draft={draft} hasHours={!!draft.hours_pattern} />
          </div>

          <p className="text-muted mt-1.5 text-[0.8125rem] leading-[1.55]">{meta}</p>

          {badges.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <li
                  key={b.text}
                  className={`rounded-md px-2 py-1 text-[0.625rem] font-extrabold tracking-wide ${
                    b.tone === 'success'
                      ? 'bg-success-bg text-success'
                      : 'bg-bg text-muted border-border border'
                  }`}
                >
                  {b.text}
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <ul className="border-border mt-3 border-t">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="border-border flex items-center justify-between gap-3 border-b py-2.5 text-[0.8125rem] last:border-b-0"
                >
                  <span className="min-w-0 truncate font-semibold">{item.name}</span>
                  <span className="text-muted shrink-0 font-semibold">
                    {item.price_kes === null ? 'KES [—]' : `KES ${group(item.price_kes)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ReadyRing
        heading="Ready to go live"
        pct={readiness?.pct ?? 0}
        checks={READINESS_CHECKS}
        state={readiness as unknown as Record<string, unknown> | null}
      />
    </div>
  );
}

function StatusPill({
  draft,
  hasHours,
}: {
  draft: { submitted_at: string | null; waitlisted_at: string | null };
  hasHours: boolean;
}) {
  if (draft.waitlisted_at) {
    return <Pill tone="warning">Outside zone · waitlist</Pill>;
  }
  if (draft.submitted_at) {
    return <Pill tone="warning">Not public yet</Pill>;
  }
  if (!hasHours) {
    return <Pill tone="muted">Opens [—]</Pill>;
  }
  return <Pill tone="success">Open now</Pill>;
}

function Pill({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'muted';
  children: React.ReactNode;
}) {
  const tones = {
    success: 'bg-success-bg text-success',
    warning: 'bg-warning-bg text-warning',
    muted: 'bg-bg text-muted border-border border',
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[0.6875rem] font-extrabold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function collectBadges(
  answers: Record<string, string | string[]>,
  rules: Record<string, Record<string, BadgeRule>>,
): BadgeRule[] {
  const out: BadgeRule[] = [];
  const seen = new Set<string>();

  for (const [key, byValue] of Object.entries(rules)) {
    const answer = answers[key];
    const values = Array.isArray(answer) ? answer : answer ? [answer] : [];
    for (const value of values) {
      const badge = byValue[value];
      if (badge && !seen.has(badge.text)) {
        seen.add(badge.text);
        out.push(badge);
      }
    }
  }
  return out;
}

function etaTurnaround(answer: string | string[] | undefined): string | null {
  const value = Array.isArray(answer) ? answer[0] : answer;
  switch (value) {
    case 'same_day':
      return 'same day';
    case 'next_day':
      return 'next day';
    case '48h':
      return 'in 48 hours';
    case '3_plus':
      return 'in 3 days';
    default:
      return null;
  }
}

/* Grouped by hand rather than with toLocaleString: Node and the browser do
   not always carry the same ICU data, and a differing separator is a
   hydration mismatch. */
function group(kes: number): string {
  return String(kes).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
