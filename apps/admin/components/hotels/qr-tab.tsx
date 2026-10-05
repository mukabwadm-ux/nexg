import { Card } from '@nexg/ui';
import Link from 'next/link';
import * as React from 'react';

import {
  generateCard,
  refreshReports,
  replaceCard,
  testScan,
  voidCard,
} from '@/app/hotels/qr-actions';

import { CardActions, GenerateCard, RefreshReports } from './qr-controls';
import { PLACEMENT_LABEL } from './qr-shared';

const DASH = '[—]';

const n = (v: number | null | undefined) =>
  v === null || v === undefined ? DASH : Number(v).toLocaleString('en-KE');

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? DASH : `${Number(v).toFixed(1)}%`;

const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Nairobi',
      })
    : DASH;

const OUTCOME_TONE: Record<string, string> = {
  landed: 'bg-bg text-muted',
  browsed: 'bg-info-bg text-info',
  cart: 'bg-warning-bg text-warning',
  ordered: 'bg-success-bg text-success',
  bounced: 'bg-bg text-muted-light',
  voided: 'bg-danger-bg text-danger',
  paused_unit: 'bg-warning-bg text-warning',
  blocked: 'bg-danger-bg text-danger',
};

const FINDING_LABEL: Record<string, string> = {
  never_scanned: 'Never scanned',
  old_card_still_scanned: 'Old card still out there',
  scanned_never_ordered: 'Scanned, never ordered',
  scanned_from_far_away: 'Photographed and shared',
};

export interface QrSummary {
  scans_7d: number;
  sessions_7d: number;
  orders_30d: number;
  conversion_30d: number | null;
  never_scanned: number;
  old_cards_scanned: number;
  cards_live: number;
  misses_7d: number;
  scans_in_overflow: number;
  share_of_all_orders: number | null;
}

export interface QrCardRow {
  qr_id: string;
  code: string;
  label: string | null;
  placement: string;
  host_id: string | null;
  hotel_id: string | null;
  state: string;
  sent_at: string | null;
  placed_confirmed_at: string | null;
  first_scanned_at: string | null;
  last_scanned_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  scans_lifetime: number;
  orders_lifetime: number;
  scans_30d: number;
  sessions_30d: number;
  orders_30d: number;
  scans_7d: number;
  conversion_30d: number | null;
  categories: string[] | null;
  gmv_30d: number | null;
}

export interface QrScanRow {
  id: number;
  scanned_at: string;
  code: string;
  label: string | null;
  placement: string;
  host_name: string | null;
  hotel_name: string | null;
  city_name: string | null;
  session_hash: string;
  returning_session: boolean;
  device: string;
  os: string;
  ip_country: string | null;
  referrer_kind: string;
  geo_band: string | null;
  outcome: string;
  browsed_category: string | null;
  order_refs: string[];
  orders: number;
  is_bot: boolean;
  is_test: boolean;
}

export interface QrHealthRow {
  qr_id: string;
  code: string;
  label: string | null;
  placement: string;
  finding: string | null;
  what_to_do: string | null;
  scans: number;
  orders: number;
}

/**
 * Console → Hotels & Airbnb → QR & attribution.
 *
 * The question this screen exists to answer is not "how many scans"
 * — it is "which card, in which spot, actually turns into an order".
 * Everything is grouped by placement for that reason, and a card
 * nobody has scanned shows a blank conversion rather than 0%,
 * because those two things mean completely different things to the
 * host you are about to ring.
 */
export function QrTab({
  summary,
  cards,
  scans,
  health,
  properties,
  webOrigin,
  filter,
}: {
  summary: QrSummary | null;
  cards: QrCardRow[];
  scans: QrScanRow[];
  health: QrHealthRow[];
  properties: { id: string; label: string; kind: 'unit' | 'hotel_room' | 'hotel_area' }[];
  webOrigin: string;
  filter: string;
}) {
  const s = summary;

  /* Placement, side by side — the comparison the tab is for. */
  const byPlacement = new Map<string, { scans: number; orders: number; cards: number }>();
  for (const c of cards) {
    if (c.voided_at) continue;
    const row = byPlacement.get(c.placement) ?? { scans: 0, orders: 0, cards: 0 };
    row.scans += c.scans_30d ?? 0;
    row.orders += c.orders_30d ?? 0;
    row.cards += 1;
    byPlacement.set(c.placement, row);
  }
  const placements = [...byPlacement.entries()].sort((a, b) => b[1].scans - a[1].scans);

  const shown = cards.filter((c) =>
    filter === 'live'
      ? !c.voided_at
      : filter === 'never_scanned'
        ? c.scans_lifetime === 0
        : filter === 'voided'
          ? !!c.voided_at
          : true,
  );

  return (
    <>
      {/*
        Where cards point. Worth saying out loud on this screen,
        because a card encoding a domain that does not reach this
        app fails in the one way nothing catches: the phone opens
        something, no scan is recorded, no error is raised anywhere,
        and the console is indistinguishable from a card nobody
        picked up.
      */}
      <div className="bg-bg mt-5 rounded-xl p-3">
        <p className="text-muted text-[0.75rem] font-semibold leading-[1.7]">
          Cards generated now encode{' '}
          <span className="font-mono font-extrabold">{webOrigin}/q/&#123;code&#125;</span>. Scan one
          and check it lands here before printing any quantity — a printed card cannot be
          repointed.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Scans · 7 days" value={n(s?.scans_7d)} hint={`${n(s?.sessions_7d)} different phones`} />
        <Tile
          label="Scan → order · 30 days"
          value={pct(s?.conversion_30d)}
          hint={`${n(s?.orders_30d)} orders came from a card`}
        />
        <Tile
          label="Share of all orders"
          value={s?.share_of_all_orders === null || s?.share_of_all_orders === undefined ? DASH : pct(s.share_of_all_orders)}
          hint="Needs the orders domain, which is not built"
        />
        <Tile
          label="Cards needing a nudge"
          value={n((s?.never_scanned ?? 0) + (s?.old_cards_scanned ?? 0))}
          tone={(s?.never_scanned ?? 0) + (s?.old_cards_scanned ?? 0) > 0 ? 'warning' : 'success'}
          hint={`${n(s?.never_scanned)} never scanned · ${n(s?.old_cards_scanned)} replaced but still in use`}
        />
      </div>

      {(s?.scans_in_overflow ?? 0) > 0 && (
        <div className="bg-warning-bg border-warning mt-4 rounded-xl border p-4">
          <p className="text-warning text-[0.8125rem] font-extrabold">
            {n(s?.scans_in_overflow)} scans landed in the overflow partition.
          </p>
          <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
            That means a scan arrived outside every monthly partition — the partition cron has not
            run, or a clock is wrong. The scans are safe; the reports will under-count until it is
            sorted.
          </p>
        </div>
      )}

      {/* ─────────────────────────────── placement, compared */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[1.0625rem] font-extrabold tracking-tight">Where the card goes</h2>
            <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
              The same flat with a card on the counter and a card on the fridge will not convert
              the same. This is the number to quote a host.
            </p>
          </div>
          <RefreshReports onRefresh={refreshReports} />
        </div>

        {placements.length === 0 ? (
          <Empty>
            No cards have been made yet. Generate one on the right — the code is created here, and
            a host never types it.
          </Empty>
        ) : (
          <Card className="mt-3 overflow-x-auto p-0">
            <table className="w-full min-w-[34rem] text-left text-[0.8125rem]">
              <thead className="bg-bg text-muted-light">
                <tr>
                  <Th>Spot</Th>
                  <Th>Cards</Th>
                  <Th>Scans · 30 d</Th>
                  <Th>Orders</Th>
                  <Th>Converts at</Th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {placements.map(([placement, row]) => (
                  <tr key={placement}>
                    <Td>
                      <span className="font-bold">{PLACEMENT_LABEL[placement] ?? placement}</span>
                    </Td>
                    <Td>{n(row.cards)}</Td>
                    <Td>{n(row.scans)}</Td>
                    <Td>{n(row.orders)}</Td>
                    <Td>
                      {row.scans === 0 ? (
                        <span className="text-muted-light text-[0.75rem] font-semibold">
                          not scanned yet
                        </span>
                      ) : (
                        <span className="font-extrabold">
                          {pct((row.orders / row.scans) * 100)}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div>
          {/* ───────────────────────────────── the cards */}
          <h2 className="text-[1.0625rem] font-extrabold tracking-tight">Cards</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[
              { key: 'live', label: 'Live' },
              { key: 'never_scanned', label: 'Never scanned' },
              { key: 'voided', label: 'Replaced' },
              { key: 'all', label: 'All' },
            ].map((o) => (
              <Link
                key={o.key}
                href={`/hotels?tab=qr&filter=${o.key}`}
                className={`rounded-full px-3 py-1.5 text-[0.75rem] font-extrabold transition-colors ${
                  filter === o.key ? 'bg-ink text-white' : 'bg-bg text-muted hover:text-ink'
                }`}
              >
                {o.label}
              </Link>
            ))}
          </div>

          <div className="mt-3 space-y-3">
            {shown.length === 0 ? (
              <Empty>Nothing matches that filter.</Empty>
            ) : (
              shown.map((c) => (
                <Card key={c.qr_id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[0.8125rem] font-extrabold">{c.code}</span>
                    <Pill>{PLACEMENT_LABEL[c.placement] ?? c.placement}</Pill>
                    {c.voided_at ? (
                      <Pill tone="bg-danger-bg text-danger">REPLACED</Pill>
                    ) : c.placed_confirmed_at ? (
                      <Pill tone="bg-success-bg text-success">IN PLACE</Pill>
                    ) : c.sent_at ? (
                      <Pill tone="bg-warning-bg text-warning">SENT, NOT PLACED</Pill>
                    ) : (
                      <Pill tone="bg-bg text-muted">NOT SENT</Pill>
                    )}
                    <span className="text-muted-light ml-auto text-[0.6875rem] font-bold">
                      last scan {when(c.last_scanned_at)}
                    </span>
                  </div>

                  <p className="mt-1.5 text-[0.9375rem] font-extrabold">{c.label ?? DASH}</p>
                  {/*
                    The URL the card actually encodes. Shown because
                    a card pointing at the wrong origin fails
                    silently — the phone opens something, nothing is
                    recorded, and the console looks identical to a
                    card nobody scanned.
                  */}
                  <p className="text-muted-light mt-0.5 break-all font-mono text-[0.625rem] font-semibold">
                    {webOrigin}/q/{c.code}
                  </p>

                  <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {/*
                      Lifetime first, and from the card's own counter
                      rather than the daily roll-up: the roll-up
                      rebuilds hourly, so a scan from two minutes ago
                      reads as zero there — which is exactly what
                      somebody checking a card they just scanned sees.
                    */}
                    <Stat
                      label="Scans"
                      value={n(c.scans_lifetime)}
                      hint={`${n(c.scans_30d)} in the last 30 days`}
                    />
                    <Stat label="Phones · 30 d" value={n(c.sessions_30d)} />
                    <Stat label="Orders" value={n(c.orders_lifetime)} />
                    <Stat
                      label="Converts at"
                      value={c.conversion_30d === null ? DASH : pct(c.conversion_30d)}
                      hint={c.conversion_30d === null ? 'nobody has scanned it' : undefined}
                    />
                  </dl>

                  {c.categories && c.categories.length > 0 && (
                    <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">
                      Guests looked for: {c.categories.filter(Boolean).join(', ')}
                    </p>
                  )}

                  {c.void_reason && (
                    <p className="text-muted mt-2 text-[0.75rem] font-semibold">
                      Replaced: {c.void_reason}
                    </p>
                  )}

                  <CardActions
                    qrId={c.qr_id}
                    code={c.code}
                    voided={!!c.voided_at}
                    webOrigin={webOrigin}
                    onReplace={replaceCard}
                    onVoid={voidCard}
                    onTest={testScan}
                  />
                </Card>
              ))
            )}
          </div>

          {/* ──────────────────────────────── the scan log */}
          <h2 className="mt-8 text-[1.0625rem] font-extrabold tracking-tight">Scan log</h2>
          <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
            The session is a hash, the device is a family, the location is a band. None of it
            identifies anybody, and none of it reaches the host.
          </p>

          {scans.length === 0 ? (
            <Empty>No scans yet.</Empty>
          ) : (
            <Card className="mt-3 overflow-x-auto p-0">
              <table className="w-full min-w-[48rem] text-left text-[0.8125rem]">
                <thead className="bg-bg text-muted-light">
                  <tr>
                    <Th>When</Th>
                    <Th>Property</Th>
                    <Th>Session</Th>
                    <Th>Device</Th>
                    <Th>Outcome</Th>
                    <Th>Order</Th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {scans.map((row) => (
                    <tr key={row.id} className={row.is_test || row.is_bot ? 'opacity-60' : ''}>
                      <Td>
                        <span className="text-muted-light text-[0.6875rem] font-bold">
                          {when(row.scanned_at)}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-bold">{row.label ?? row.code}</span>
                        <span className="text-muted-light block text-[0.625rem] font-bold uppercase tracking-[0.1em]">
                          {PLACEMENT_LABEL[row.placement] ?? row.placement}
                          {row.host_name ? ` · ${row.host_name}` : ''}
                          {row.hotel_name ? ` · ${row.hotel_name}` : ''}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-muted font-mono text-[0.6875rem]">
                          {row.session_hash}
                        </span>
                        {row.returning_session && (
                          <span className="text-muted-light block text-[0.625rem] font-bold">
                            returning
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span className="text-muted text-[0.75rem] font-semibold">
                          {row.device}
                          {row.os ? ` · ${row.os}` : ''}
                        </span>
                        <span className="text-muted-light block text-[0.625rem] font-semibold">
                          {row.referrer_kind === 'camera' ? 'camera' : row.referrer_kind}
                          {row.ip_country ? ` · ${row.ip_country}` : ''}
                          {row.geo_band ? ` · ${row.geo_band.replace('_', ' ')}` : ''}
                        </span>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Pill tone={OUTCOME_TONE[row.outcome]}>{row.outcome.toUpperCase()}</Pill>
                          {row.is_test && <Pill tone="bg-info-bg text-info">TEST</Pill>}
                          {row.is_bot && <Pill tone="bg-danger-bg text-danger">BOT</Pill>}
                        </div>
                        {row.browsed_category && (
                          <span className="text-muted-light block text-[0.625rem] font-semibold">
                            wanted {row.browsed_category}
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span className="text-muted font-mono text-[0.6875rem]">
                          {row.order_refs?.length ? row.order_refs.join(', ') : DASH}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        {/* ───────────────────────────────── the right rail */}
        <div className="space-y-4">
          <GenerateCard properties={properties} onGenerate={generateCard} />

          <Card className="p-5">
            <h3 className="text-[0.875rem] font-extrabold">Needs a nudge</h3>
            {health.length === 0 ? (
              <p className="text-muted mt-2 text-[0.8125rem] font-semibold leading-[1.7]">
                Every card is behaving. Nothing sent and unscanned, nothing replaced and still in
                use.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {health.map((h) => (
                  <li key={h.qr_id} className="border-border border-t pt-3 first:border-0 first:pt-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[0.75rem] font-extrabold">{h.code}</span>
                      <Pill tone="bg-warning-bg text-warning">
                        {FINDING_LABEL[h.finding ?? ''] ?? h.finding}
                      </Pill>
                    </div>
                    <p className="text-muted-light mt-1 text-[0.6875rem] font-bold">
                      {h.label} · {PLACEMENT_LABEL[h.placement] ?? h.placement}
                    </p>
                    <p className="text-muted mt-1.5 text-[0.75rem] font-semibold leading-[1.7]">
                      {h.what_to_do}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-[0.875rem] font-extrabold">What a scan records</h3>
            <ul className="text-muted mt-2 space-y-1.5 text-[0.75rem] font-semibold leading-[1.7]">
              <li>A first-party session cookie, so a returning phone is recognisable.</li>
              <li>The browser and OS family — never the full user agent.</li>
              <li>A country from the edge. The address itself is never stored.</li>
              <li>A distance band, and only if the guest granted location at checkout.</li>
            </ul>
            <p className="text-muted-light mt-3 text-[0.75rem] font-semibold leading-[1.7]">
              Raw scans are deleted after twelve months and only the daily totals are kept. Hosts
              and hotels see counts and categories — never a session, a device or a band.
            </p>
            {(s?.misses_7d ?? 0) > 0 && (
              <p className="text-muted-light mt-3 text-[0.75rem] font-semibold">
                {n(s?.misses_7d)} attempts on codes that do not exist in the last week. Worth a
                look only if it climbs.
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/* ──────────────────────────────────────────────────── bits */

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'warning' | 'success' | 'danger';
}) {
  return (
    <Card className="p-4">
      <p className="text-muted-light text-[0.5625rem] font-extrabold uppercase leading-tight tracking-[0.12em]">
        {label}
      </p>
      <p
        className={`mt-2 text-[1.75rem] font-extrabold leading-tight tracking-tight ${
          tone === 'danger'
            ? 'text-danger'
            : tone === 'warning'
              ? 'text-warning'
              : tone === 'success'
                ? 'text-success'
                : ''
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold leading-snug">{hint}</p>
      )}
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
        {label}
      </dt>
      <dd className="mt-0.5 text-[1rem] font-extrabold">{value}</dd>
      {hint && <p className="text-muted-light text-[0.625rem] font-semibold">{hint}</p>}
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold ${
        tone ?? 'bg-bg text-muted'
      }`}
    >
      {children}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="px-4 py-2.5 text-[0.625rem] font-extrabold uppercase tracking-[0.1em]"
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mt-3 p-8 text-center">
      <p className="text-muted mx-auto max-w-[32rem] text-[0.875rem] font-semibold leading-[1.8]">
        {children}
      </p>
    </Card>
  );
}
