import { Card } from '@nexg/ui';
import Link from 'next/link';

import { Avatar, Chip, DASH, EmptyRow, kes, num, Pill, plural, Tile, when } from './shared';

/**
 * Listings & stay requests.
 *
 * Two halves of one job: what a guest can see, and what a guest has
 * asked for. The matching between them is a person's judgement, which
 * is why the request panel shows the reason somebody gave rather than
 * a score.
 */

export interface PropertyRow {
  id: string;
  slug: string;
  name: string;
  kind: string;
  area: string | null;
  city_name: string | null;
  host_id: string;
  host_name: string | null;
  host_status: string;
  listed: boolean;
  listed_at: string | null;
  summary: string | null;
  amenities: string[];
  photo_count: number;
  units: number;
  units_listed: number;
  from_rate_kes: number | null;
  /** Why it is not on the website. Worked out in the view. */
  blocked_reason: string | null;
}

export interface StayRequestRow {
  id: string;
  reference: string;
  requester_name: string | null;
  phone_masked: string | null;
  requester_email: string | null;
  city_name: string | null;
  areas: string[];
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  guests: number | null;
  bedrooms_needed: number | null;
  budget_per_night_kes: number | null;
  purpose: string | null;
  must_haves: string[];
  notes: string | null;
  status: string;
  source: string;
  created_at: string;
  sent_at: string | null;
  outcome_note: string | null;
  assigned_to_name: string | null;
  options: number;
  age_hours: number;
}

export interface MatchRow {
  id: string;
  request_id: string;
  rank: number;
  why: string | null;
  quoted_nightly_kes: number | null;
  sent_at: string | null;
  guest_response: string | null;
  unit: { label_public: string | null; name: string } | null;
}

const STATUS_TONE: Record<string, string> = {
  new: 'bg-gold-soft text-gold-text',
  reviewing: 'bg-warning-bg text-warning',
  matched: 'bg-warning-bg text-warning',
  sent: 'bg-success-bg text-success',
  won: 'bg-success-bg text-success',
  lost: 'bg-bg text-muted',
  closed: 'bg-bg text-muted-light',
};

const PURPOSE_LABEL: Record<string, string> = {
  business: 'Work trip',
  leisure: 'Holiday',
  family: 'Family',
  relocation: 'Relocating',
  crew: 'Team or crew',
  event: 'Event',
  other: 'Other',
};

export function ListingsTab({
  properties,
  requests,
  matches,
  filter,
  selected,
}: {
  properties: PropertyRow[];
  requests: StayRequestRow[];
  matches: MatchRow[];
  filter: string;
  selected: string | null;
}) {
  const live = properties.filter((p) => p.listed && !p.blocked_reason);
  const blocked = properties.filter((p) => p.blocked_reason);
  const open = requests.filter((r) => ['new', 'reviewing', 'matched', 'sent'].includes(r.status));
  const unanswered = requests.filter((r) => r.status === 'new');

  const visible = requests.filter((r) => {
    switch (filter) {
      case 'new':
        return r.status === 'new';
      case 'open':
        return ['new', 'reviewing', 'matched', 'sent'].includes(r.status);
      case 'won':
        return r.status === 'won';
      case 'lost':
        return r.status === 'lost';
      default:
        return true;
    }
  });

  const chosen = selected ? requests.find((r) => r.id === selected) : undefined;
  const href = (f: string, s?: string | null) => {
    const p = new URLSearchParams({ tab: 'listings' });
    if (f !== 'all') p.set('filter', f);
    const sel = s === undefined ? selected : s;
    if (sel) p.set('selected', sel);
    return `/hotels?${p.toString()}`;
  };

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Live on the website" value={num(live.length)}>
          {plural(
            live.reduce((s, p) => s + p.units_listed, 0),
            'unit',
          )}{' '}
          bookable
        </Tile>
        <Tile
          label="Ready but not showing"
          value={num(blocked.length)}
          tone={blocked.length > 0 ? 'warning' : undefined}
        >
          photos, listing or a live unit outstanding
        </Tile>
        <Tile
          label="Requests waiting"
          value={num(unanswered.length)}
          tone={unanswered.some((r) => r.age_hours > 24) ? 'danger' : undefined}
        >
          {unanswered.length > 0
            ? `oldest ${Math.max(...unanswered.map((r) => r.age_hours))} h`
            : 'nothing unanswered'}
        </Tile>
        <Tile label="Open requests" value={num(open.length)}>
          matched or sent, awaiting an answer
        </Tile>
      </div>

      {/* ───────────────────────────────── what guests can see */}
      <Card className="mt-6 overflow-x-auto p-0">
        <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-[0.9375rem] font-extrabold">Properties</h2>
          <p className="text-muted-light text-[0.6875rem] font-semibold">
            A property shows to guests only when it is listed, its host is live and it has a live
            listed unit — all three, checked in the view
          </p>
        </div>
        <table className="w-full min-w-[42rem] text-left">
          <thead>
            <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3">Host</th>
              <th className="px-4 py-3">Units</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">Photos</th>
              <th className="px-4 py-3">On the site</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => (
              <tr key={p.id} className="border-border hover:bg-bg border-b last:border-b-0">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={p.name} square />
                    <span className="min-w-0">
                      <span className="block text-[0.8125rem] font-extrabold">{p.name}</span>
                      <span className="text-muted-light block text-[0.6875rem] font-semibold">
                        {p.kind.replace(/_/g, ' ')} · {p.area ?? p.city_name ?? DASH}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                  {p.host_name ?? DASH}
                </td>
                <td className="px-4 py-3 text-[0.8125rem] font-bold">
                  {p.units_listed}
                  <span className="text-muted-light font-semibold"> of {p.units}</span>
                </td>
                <td className="px-4 py-3 text-[0.8125rem] font-extrabold">
                  {p.from_rate_kes === null ? 'On request' : kes(p.from_rate_kes)}
                </td>
                <td
                  className={`px-4 py-3 text-[0.8125rem] font-bold ${
                    p.photo_count === 0 ? 'text-warning' : ''
                  }`}
                >
                  {p.photo_count}
                </td>
                <td className="px-4 py-3">
                  {p.blocked_reason ? (
                    <Pill tone="bg-warning-bg text-warning">{p.blocked_reason}</Pill>
                  ) : (
                    <Pill tone="bg-success-bg text-success">LIVE</Pill>
                  )}
                </td>
              </tr>
            ))}
            {properties.length === 0 && (
              <EmptyRow colSpan={6}>
                No properties yet. One is created when a host groups their units into a building.
              </EmptyRow>
            )}
          </tbody>
        </table>
      </Card>

      {/* ──────────────────────────────────── what guests asked */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {[
          ['all', 'All'],
          ['new', `New ${unanswered.length}`],
          ['open', 'Open'],
          ['won', 'Won'],
          ['lost', 'Lost'],
        ].map(([k, label]) => (
          <Chip key={k} on={filter === k} href={href(k!)}>
            {label}
          </Chip>
        ))}
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Ref</th>
                <th className="px-4 py-3">Who · when</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Budget</th>
                <th className="px-4 py-3">Options</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  className={`border-border hover:bg-bg border-b last:border-b-0 ${
                    selected === r.id ? 'bg-bg ring-gold ring-1 ring-inset' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={href(filter, r.id)}
                      className="text-[0.75rem] font-extrabold hover:underline"
                    >
                      {r.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block text-[0.8125rem] font-extrabold">
                      {r.requester_name ?? '[Requester]'}
                    </span>
                    <span className="text-muted-light block text-[0.6875rem] font-semibold">
                      {r.check_in
                        ? `${new Date(r.check_in).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })}${r.nights ? ` · ${plural(r.nights, 'night')}` : ''}`
                        : 'dates open'}
                      {r.areas.length > 0 && ` · ${r.areas.join(', ')}`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">
                    {num(r.guests)}
                    <span className="text-muted-light font-semibold">
                      {r.bedrooms_needed !== null && ` · ${r.bedrooms_needed} bed`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">
                    {r.budget_per_night_kes === null ? 'Open' : kes(r.budget_per_night_kes)}
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{r.options}</td>
                  <td className="px-4 py-3">
                    <Pill tone={STATUS_TONE[r.status]}>
                      {r.status.toUpperCase()}
                      {r.status === 'new' && r.age_hours > 24 && ` · ${r.age_hours} H`}
                    </Pill>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <EmptyRow colSpan={6}>
                  No requests here. They arrive from the form on the stays page.
                </EmptyRow>
              )}
            </tbody>
          </table>
        </Card>

        {chosen ? (
          <RequestPanel
            request={chosen}
            matches={matches.filter((m) => m.request_id === chosen.id)}
          />
        ) : (
          <Card className="p-5">
            <p className="text-muted text-sm font-semibold">
              Pick a request to see what they asked for.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}

function RequestPanel({ request, matches }: { request: StayRequestRow; matches: MatchRow[] }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[1.0625rem] font-extrabold">{request.reference}</span>
          <Pill tone={STATUS_TONE[request.status]}>{request.status.toUpperCase()}</Pill>
        </p>
        <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
          {request.requester_name ?? '[Requester]'} ·{' '}
          {request.phone_masked ?? request.requester_email ?? DASH} · asked{' '}
          {when(request.created_at)}
          {request.assigned_to_name && ` · ${request.assigned_to_name}`}
        </p>

        <dl className="border-border mt-4 space-y-2 border-t pt-4 text-[0.75rem] font-semibold">
          <Row
            label="Dates"
            value={
              request.check_in
                ? `${fmt(request.check_in)} → ${fmt(request.check_out)}${
                    request.nights ? ` · ${plural(request.nights, 'night')}` : ''
                  }`
                : 'Open'
            }
          />
          <Row
            label="Party"
            value={`${request.guests ?? DASH} guest${request.guests === 1 ? '' : 's'}${
              request.bedrooms_needed !== null ? ` · ${request.bedrooms_needed} bedrooms` : ''
            }`}
          />
          <Row label="Areas" value={request.areas.join(', ') || 'Open'} />
          <Row
            label="For"
            value={request.purpose ? (PURPOSE_LABEL[request.purpose] ?? request.purpose) : DASH}
          />
          <Row
            label="Up to"
            value={
              request.budget_per_night_kes === null
                ? 'Not said'
                : `${kes(request.budget_per_night_kes)} / night`
            }
          />
        </dl>

        {request.must_haves.length > 0 && (
          <>
            <p className="text-muted-light mt-4 text-[0.625rem] font-extrabold uppercase tracking-wide">
              Would be wrong without
            </p>
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {request.must_haves.map((m) => (
                <span
                  key={m}
                  className="border-border-strong rounded-full border px-2 py-0.5 text-[0.625rem] font-bold"
                >
                  {m}
                </span>
              ))}
            </p>
          </>
        )}

        {request.notes && (
          <>
            <p className="text-muted-light mt-4 text-[0.625rem] font-extrabold uppercase tracking-wide">
              In their words
            </p>
            <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.7]">
              {request.notes}
            </p>
          </>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="text-[0.9375rem] font-extrabold">What we proposed</p>
          <span className="text-muted-light text-[0.625rem] font-extrabold">
            {matches.length} option{matches.length === 1 ? '' : 's'}
          </span>
        </div>
        <ul className="divide-border divide-y">
          {matches.map((m) => (
            <li key={m.id} className="px-4 py-3">
              <p className="flex items-center justify-between gap-2">
                <span className="text-[0.8125rem] font-extrabold">
                  {m.rank}. {m.unit?.label_public ?? m.unit?.name ?? DASH}
                </span>
                <span className="text-[0.8125rem] font-extrabold">
                  {m.quoted_nightly_kes === null ? 'On request' : kes(m.quoted_nightly_kes)}
                </span>
              </p>
              {/* The reason, not a score. The judgement is the product. */}
              {m.why && (
                <p className="text-muted mt-1 text-[0.6875rem] font-semibold leading-relaxed">
                  {m.why}
                </p>
              )}
              {m.guest_response && (
                <p className="text-muted-light mt-1 text-[0.625rem] font-extrabold uppercase">
                  Guest: {m.guest_response}
                </p>
              )}
            </li>
          ))}
          {matches.length === 0 && (
            <li className="text-muted px-4 py-6 text-center text-[0.75rem] font-semibold">
              Nothing proposed yet.
            </li>
          )}
        </ul>
      </Card>

      {request.outcome_note && (
        <Card className="p-5">
          <p className="text-[0.8125rem] font-extrabold">Outcome</p>
          <p className="text-muted mt-1.5 text-[0.75rem] font-semibold leading-[1.7]">
            {request.outcome_note}
          </p>
        </Card>
      )}
    </div>
  );
}

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : DASH;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className="text-right font-extrabold">{value}</dd>
    </div>
  );
}
