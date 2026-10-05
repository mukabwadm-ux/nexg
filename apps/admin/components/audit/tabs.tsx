import { Card } from '@nexg/ui';
import Link from 'next/link';
import * as React from 'react';

import {
  actOnAlert,
  approveRetention,
  closeBreakGlass,
  freezePack,
  openBreakGlass,
  placeLegalHold,
  releaseLegalHold,
  reviewBreakGlass,
  reviewEvent,
  sharePack,
  verifyChain,
} from '@/app/audit/actions';

import {
  AlertControls,
  BreakGlassActions,
  BreakGlassForm,
  HoldRelease,
  LegalHoldForm,
  PackActions,
  RetentionApprove,
  ReviewControls,
  VerifyChainButton,
} from './actions-ui';
import {
  type ActivityRow,
  type AlertRow,
  type BreakGlassRow,
  DASH,
  type DataAccessRow,
  Diff,
  Empty,
  type ExportRow,
  Hash,
  type HealthRow,
  type HoldRow,
  MODULE_LABEL,
  type ModuleRow,
  type MoneyRow,
  type PackRow,
  Pill,
  PURPOSE_LABEL,
  REVIEW_LABEL,
  REVIEW_TONE,
  type RetentionRow,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  type SignInRow,
  Tile,
  fullStamp,
  kes,
  num,
  stamp,
} from './shared';

/**
 * The five tabs.
 *
 * Each one is a reading of the same chained events. Nothing here
 * computes a figure the database did not record — where an amount or
 * a period is missing, the cell says [—] and the row says why, rather
 * than showing a zero that reads like a fact.
 */

// ══════════════════════════════════════════ the banner above them all

/**
 * If the chain is broken, nothing else on any tab means anything, so
 * it is said once, loudly, above all of them.
 */
export function ChainBanner({ health }: { health: HealthRow }) {
  if (health.chain_ok === false) {
    return (
      <div className="bg-danger-bg border-danger mt-4 rounded-xl border-2 p-4">
        <p className="text-danger text-[0.875rem] font-extrabold">
          The audit chain did not verify.
        </p>
        <p className="text-danger mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">
          First bad event: #{health.chain_first_bad_id ?? DASH}. {health.chain_detail}
        </p>
        <p className="text-danger mt-2 text-[0.8125rem] font-extrabold">
          Take a snapshot of the database before you do anything else, then call the DPO. Do not
          freeze or share an evidence pack until this is resolved.
        </p>
      </div>
    );
  }

  if (health.chain_ok === null || health.chain_check_overdue) {
    return (
      <div className="bg-warning-bg border-warning mt-4 rounded-xl border p-4">
        <p className="text-warning text-[0.8125rem] font-extrabold">
          {health.chain_ok === null
            ? 'The chain has never been verified on this database.'
            : `The chain was last verified ${stamp(health.chain_checked_at)} — more than two days ago.`}
        </p>
        <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold">
          Nothing is known to be wrong. Verification is what makes that a statement rather than an
          assumption.
        </p>
        <div className="mt-3">
          <VerifyChainButton onVerify={verifyChain} />
        </div>
      </div>
    );
  }

  return null;
}

// ═══════════════════════════════════════════════════ J1 · Activity

export function ActivityTab({
  health,
  events,
  modules,
  selected,
  filter,
  moduleFilter,
}: {
  health: HealthRow;
  events: ActivityRow[];
  modules: ModuleRow[];
  selected: ActivityRow | null;
  filter: string;
  moduleFilter: string | null;
}) {
  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Events recorded"
          value={num(health.events_total)}
          hint="Since the log opened"
        />
        <Tile label="In the last day" value={num(health.events_today)} />
        <Tile
          label="Waiting on a person"
          value={num(health.needs_review)}
          tone={health.needs_review > 0 ? 'warning' : undefined}
          hint="Reveals, adjustments and anything unregistered"
        />
        <Tile
          label="Open alerts"
          value={num(health.alerts_open)}
          tone={health.alerts_open > 0 ? 'danger' : 'success'}
        />
      </div>

      <ChainBanner health={health} />

      <FilterBar
        tab="activity"
        current={filter}
        options={[
          { key: 'all', label: 'Everything' },
          { key: 'needs_review', label: `Needs review (${health.needs_review})` },
          { key: 'high', label: 'High severity' },
          { key: 'two_person', label: 'Two-person actions' },
          { key: 'unregistered', label: `Unregistered (${health.unregistered_events})` },
        ]}
      />

      {modules.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <ModuleChip tab="activity" filter={filter} value={null} active={!moduleFilter}>
            All modules
          </ModuleChip>
          {modules.map((m) => (
            <ModuleChip
              key={m.module}
              tab="activity"
              filter={filter}
              value={m.module}
              active={moduleFilter === m.module}
            >
              {MODULE_LABEL[m.module] ?? m.module} · {num(m.events)}
            </ModuleChip>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        <Card className="overflow-hidden p-0">
          {events.length === 0 ? (
            <div className="p-8">
              <p className="text-muted text-center text-[0.875rem] font-semibold">
                Nothing matches that filter. Every state change in the system is written here, so an
                empty list means the filter, not the log.
              </p>
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {events.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/audit?tab=activity&filter=${filter}${
                      moduleFilter ? `&module=${moduleFilter}` : ''
                    }&event=${e.id}`}
                    className={`hover:bg-bg/60 block px-4 py-3 transition-colors ${
                      selected?.id === e.id ? 'bg-gold-soft/40' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-light w-[4.5rem] shrink-0 text-[0.6875rem] font-bold tabular-nums">
                        {e.ago}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-bold">
                        {e.sentence}
                      </span>
                      {e.severity !== 'info' && (
                        <Pill tone={SEVERITY_TONE[e.severity]}>{SEVERITY_LABEL[e.severity]}</Pill>
                      )}
                      {e.review_state === 'needs_review' && (
                        <Pill tone={REVIEW_TONE.needs_review}>REVIEW</Pill>
                      )}
                      {e.unregistered && <Pill tone="bg-danger-bg text-danger">UNREGISTERED</Pill>}
                    </div>
                    <p className="text-muted-light mt-1 pl-[5.3rem] text-[0.6875rem] font-semibold">
                      {MODULE_LABEL[e.module] ?? e.module}
                      {e.city_name ? ` · ${e.city_name}` : ''}
                      {e.changed_fields > 0
                        ? ` · ${e.changed_fields} field${e.changed_fields === 1 ? '' : 's'} changed`
                        : ''}
                      {e.needs_two_people && !e.approver_label ? ' · no second person' : ''}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <EventPanel event={selected} />
      </div>
    </>
  );
}

function EventPanel({ event }: { event: ActivityRow | null }) {
  if (!event) {
    return (
      <Card className="p-6">
        <p className="text-muted text-[0.8125rem] font-semibold leading-[1.8]">
          Pick an event to see what changed, who approved it, and the hash it carries.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={SEVERITY_TONE[event.severity]}>{SEVERITY_LABEL[event.severity]}</Pill>
        {event.touches_pii && <Pill tone="bg-info-bg text-info">PERSONAL DATA</Pill>}
        {event.is_money && <Pill tone="bg-gold-soft text-gold-text">MONEY</Pill>}
        {event.review_state !== 'none' && (
          <Pill tone={REVIEW_TONE[event.review_state]}>{REVIEW_LABEL[event.review_state]}</Pill>
        )}
      </div>

      <h2 className="mt-3 text-[1.0625rem] font-extrabold leading-tight">{event.action_label}</h2>
      <p className="text-muted-light mt-1 font-mono text-[0.6875rem] font-semibold">
        {event.action} · event #{event.id} · v{event.hash_version}
      </p>

      <dl className="border-border mt-4 space-y-2 border-t pt-4 text-[0.8125rem]">
        <Row label="When" value={fullStamp(event.at)} />
        <Row label="Who" value={event.actor_label} />
        {event.actor_role && <Row label="Acting as" value={event.actor_role} />}
        {event.on_behalf_of && <Row label="On behalf of" value={event.on_behalf_of} />}
        <Row label="Module" value={MODULE_LABEL[event.module] ?? event.module} />
        {event.target_label && <Row label="What" value={event.target_label} />}
        {event.city_name && <Row label="City" value={event.city_name} />}
        <Row
          label="Second person"
          value={
            event.needs_two_people
              ? (event.approver_label ?? 'NOT RECORDED')
              : 'Not required for this action'
          }
        />
      </dl>

      {event.reason && (
        <div className="bg-bg mt-4 rounded-lg p-3">
          <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
            Reason given
          </p>
          <p className="mt-1 text-[0.8125rem] font-semibold leading-[1.7]">{event.reason}</p>
        </div>
      )}

      <div className="mt-4">
        <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
          What changed
        </p>
        <div className="mt-1.5">
          <Diff diff={event.diff} />
        </div>
      </div>

      {Object.keys(event.context ?? {}).length > 0 && (
        <div className="mt-4">
          <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
            Where from
          </p>
          <p className="text-muted mt-1 text-[0.75rem] font-semibold">
            {[
              event.context.surface,
              event.context.device_label,
              event.context.ip_country,
              event.context.auth_method,
            ]
              .filter(Boolean)
              .join(' · ') || DASH}
          </p>
        </div>
      )}

      <div className="border-border mt-4 border-t pt-3">
        <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
          Chain
        </p>
        <p className="mt-1.5">
          <Hash value={event.hash} />
        </p>
        <p className="text-muted-light mt-1.5 text-[0.6875rem] font-semibold leading-[1.6]">
          Each event hashes its own contents together with the one before it, so changing this row
          would break every row after it.
        </p>
      </div>

      {event.reviewed_at && (
        <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold">
          Reviewed by {event.reviewed_by_name ?? DASH} on {stamp(event.reviewed_at)}
          {event.review_note ? ` — ${event.review_note}` : ''}
        </p>
      )}

      <ReviewControls eventId={event.id} state={event.review_state} onReview={reviewEvent} />
    </Card>
  );
}

// ══════════════════════════════════════════ J2 · Sign-ins & security

export function SignInsTab({
  health,
  signIns,
  alerts,
  breakGlass,
}: {
  health: HealthRow;
  signIns: SignInRow[];
  alerts: AlertRow[];
  breakGlass: BreakGlassRow[];
}) {
  const live = signIns.filter((s) => s.session_live).length;
  const failures = signIns.filter((s) => !s.succeeded).length;

  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Live sessions" value={num(live)} hint="Signed in and not ended" />
        <Tile
          label="Refused attempts"
          value={num(failures)}
          tone={failures > 0 ? 'warning' : undefined}
          hint="In the window shown"
        />
        <Tile
          label="Break-glass open"
          value={num(breakGlass.filter((b) => b.open_now).length)}
          tone={breakGlass.some((b) => b.open_now) ? 'warning' : undefined}
        />
        <Tile
          label="Expired, not closed"
          value={num(health.break_glass_expired_unclosed)}
          tone={health.break_glass_expired_unclosed > 0 ? 'danger' : 'success'}
        />
      </div>

      <Section title="Open alerts" sub="Standing questions asked of the event stream.">
        {alerts.length === 0 ? (
          <Empty>
            Nothing is firing. Eight rules watch for repeated sign-in failures, sign-ins from a new
            country, bulk reveals of personal details, exports outside working hours, cash adjusted
            by hand, a broken chain, break-glass access, and actions nobody registered.
          </Empty>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {alerts.map((a) => (
              <Card key={a.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={SEVERITY_TONE[a.severity]}>{SEVERITY_LABEL[a.severity]}</Pill>
                  {a.stale && <Pill tone="bg-danger-bg text-danger">UNTOUCHED 24H</Pill>}
                  {a.state === 'acknowledged' && <Pill tone="bg-info-bg text-info">ON IT</Pill>}
                  <span className="text-muted-light ml-auto text-[0.6875rem] font-bold">
                    {a.ago}
                  </span>
                </div>
                <p className="mt-2 text-[0.875rem] font-extrabold">{a.title}</p>
                <p className="text-muted mt-1 text-[0.8125rem] font-semibold">{a.summary}</p>
                {a.actor_label && (
                  <p className="text-muted-light mt-1 text-[0.75rem] font-semibold">
                    {a.actor_label}
                    {a.city_name ? ` · ${a.city_name}` : ''}
                  </p>
                )}
                {a.next_step && (
                  <p className="bg-bg text-muted mt-2.5 rounded-lg p-2.5 text-[0.75rem] font-semibold leading-[1.7]">
                    {a.next_step}
                  </p>
                )}
                <AlertControls alertId={a.id} state={a.state} onAct={actOnAlert} />
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title="Sign-ins" sub="Every attempt, successful or not.">
        {signIns.length === 0 ? (
          <Empty>
            No sign-ins recorded. The console writes one on every authentication once
            `rpc_sign_in_record` is wired into the sign-in route — until then this tab shows
            nothing, which is a gap rather than a quiet week.
          </Empty>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[46rem] text-left text-[0.8125rem]">
              <thead className="bg-bg text-muted-light">
                <tr>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>Outcome</Th>
                  <Th>From</Th>
                  <Th>Device</Th>
                  <Th>Session</Th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {signIns.map((s) => (
                  <tr key={s.id} className={s.flag ? 'bg-warning-bg/30' : ''}>
                    <Td>
                      <span className="text-muted-light text-[0.6875rem] font-bold">{s.ago}</span>
                    </Td>
                    <Td>
                      {/* Email first: unique by constraint, and what
                          the invitation went to. The name underneath
                          because the two together read better than
                          either alone. */}
                      <span className="font-bold">{s.who}</span>
                      {s.who_name && (
                        <span className="text-muted-light block text-[0.6875rem] font-semibold">
                          {s.who_name}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Pill
                          tone={
                            s.succeeded ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
                          }
                        >
                          {s.succeeded ? 'IN' : 'REFUSED'}
                        </Pill>
                        {s.flag && <Pill tone="bg-warning-bg text-warning">{s.flag}</Pill>}
                        {s.recent_failures > 2 && (
                          <span className="text-danger text-[0.6875rem] font-extrabold">
                            {s.recent_failures} in 10 min
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <span className="text-muted font-mono text-[0.6875rem]">
                        {s.ip_masked ?? DASH}
                      </span>
                      {s.ip_country && (
                        <span className="text-muted-light ml-1.5 text-[0.6875rem] font-bold">
                          {s.ip_country}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-muted text-[0.75rem] font-semibold">
                        {s.device_label ?? DASH}
                      </span>
                    </Td>
                    <Td>
                      {s.session_live ? (
                        <Pill tone="bg-success-bg text-success">LIVE</Pill>
                      ) : (
                        <span className="text-muted-light text-[0.6875rem] font-semibold">
                          {s.ended_reason ?? DASH}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      <Section
        title="Break-glass"
        sub="Emergency access, with the emergency written down first and reviewed by somebody else afterwards."
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
          <div className="space-y-3">
            {breakGlass.length === 0 ? (
              <Empty>
                Nobody has opened break-glass access. That is the number you want. When somebody
                does, it appears here with the reason, a hard expiry, and a count of everything they
                did inside the window.
              </Empty>
            ) : (
              breakGlass.map((b) => (
                <Card key={b.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {b.open_now && <Pill tone="bg-warning-bg text-warning">OPEN NOW</Pill>}
                    {b.expired_unclosed && (
                      <Pill tone="bg-danger-bg text-danger">EXPIRED, NOT CLOSED</Pill>
                    )}
                    {!b.reviewed_at && !b.open_now && (
                      <Pill tone="bg-warning-bg text-warning">UNREVIEWED</Pill>
                    )}
                    {b.review_outcome && (
                      <Pill
                        tone={
                          b.review_outcome === 'justified'
                            ? 'bg-success-bg text-success'
                            : 'bg-danger-bg text-danger'
                        }
                      >
                        {b.review_outcome.toUpperCase()}
                      </Pill>
                    )}
                    <span className="text-muted-light ml-auto text-[0.6875rem] font-bold">
                      {b.ago}
                    </span>
                  </div>
                  <p className="mt-2 text-[0.875rem] font-extrabold">{b.who ?? DASH}</p>
                  {b.who_name && (
                    <p className="text-muted-light text-[0.6875rem] font-semibold">{b.who_name}</p>
                  )}
                  <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
                    {b.reason}
                  </p>
                  <p className="text-muted-light mt-1.5 text-[0.6875rem] font-semibold">
                    {b.scope === 'everything' ? 'Everything' : (b.module_key ?? b.city_name)} ·
                    expires {stamp(b.expires_at)} · {num(b.events_during)} actions inside the window
                  </p>
                  <BreakGlassActions
                    id={b.id}
                    openNow={b.open_now}
                    needsReview={!b.reviewed_at && !b.open_now}
                    onClose={closeBreakGlass}
                    onReview={reviewBreakGlass}
                  />
                </Card>
              ))
            )}
          </div>
          <BreakGlassForm onOpen={openBreakGlass} />
        </div>
      </Section>
    </>
  );
}

// ═══════════════════════════════════════════════ J3 · Money trail

export function MoneyTab({ rows }: { rows: MoneyRow[] }) {
  const missing = rows.filter((r) => r.missing_second_person).length;
  const unrecorded = rows.filter((r) => r.amount_not_recorded).length;

  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Money events" value={num(rows.length)} hint="In the window shown" />
        <Tile
          label="Missing a second person"
          value={num(missing)}
          tone={missing > 0 ? 'danger' : 'success'}
          hint="Two people were required and one is recorded"
        />
        <Tile
          label="No amount recorded"
          value={num(unrecorded)}
          hint="The event happened; the figure was not captured"
        />
        <Tile
          label="Reconciled against orders"
          value={DASH}
          hint="The orders domain is not built"
        />
      </div>

      <div className="bg-info-bg mt-4 rounded-xl p-4">
        <p className="text-info text-[0.8125rem] font-semibold leading-[1.7]">
          This tab shows what the events recorded, in order. It does not reconcile: the other side
          of each figure lives in the orders domain, which is not built. A total here would be half
          a sum, so there is no total.
        </p>
      </div>

      <Section title="The trail" sub="">
        {rows.length === 0 ? (
          <Empty>
            No money has moved through an audited path yet. Settlements, cash adjustments, folio
            postings, refunds and rate-card publications all land here the moment they happen.
          </Empty>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[52rem] text-left text-[0.8125rem]">
              <thead className="bg-bg text-muted-light">
                <tr>
                  <Th>When</Th>
                  <Th>What</Th>
                  <Th>Who</Th>
                  <Th>Second person</Th>
                  <Th>Amount</Th>
                  <Th>Reference</Th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className={r.missing_second_person ? 'bg-danger-bg/30' : ''}>
                    <Td>
                      <span className="text-muted-light text-[0.6875rem] font-bold">{r.ago}</span>
                    </Td>
                    <Td>
                      <span className="font-bold">{r.action_label}</span>
                      {r.target_label && (
                        <span className="text-muted-light block text-[0.6875rem] font-semibold">
                          {r.target_label}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-muted text-[0.75rem] font-semibold">
                        {r.actor_label}
                      </span>
                    </Td>
                    <Td>
                      {!r.needs_two_people ? (
                        <span className="text-muted-light text-[0.6875rem] font-semibold">
                          not required
                        </span>
                      ) : r.approver_label ? (
                        <span className="text-[0.75rem] font-semibold">{r.approver_label}</span>
                      ) : (
                        <Pill tone="bg-danger-bg text-danger">NOT RECORDED</Pill>
                      )}
                    </Td>
                    <Td>
                      {r.amount_not_recorded ? (
                        <span className="text-muted-light text-[0.75rem] font-semibold">
                          {DASH}
                        </span>
                      ) : (
                        <span className="font-extrabold tabular-nums">{kes(r.amount_cents)}</span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-muted-light font-mono text-[0.6875rem]">
                        {r.order_reference ?? DASH}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>
    </>
  );
}

// ═══════════════════════════════════════════════ J4 · Data access

export function DataAccessTab({
  rows,
  exports: exportRows,
}: {
  rows: DataAccessRow[];
  exports: ExportRow[];
}) {
  const noReason = rows.filter((r) => r.no_reason_given).length;
  const outsideHours = exportRows.filter((x) => x.outside_hours).length;

  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Times data was revealed" value={num(rows.length)} />
        <Tile
          label="Without a reason"
          value={num(noReason)}
          tone={noReason > 0 ? 'warning' : 'success'}
          hint="Not forbidden, but somebody explains it afterwards"
        />
        <Tile label="Exports" value={num(exportRows.length)} />
        <Tile
          label="Exports outside hours"
          value={num(outsideHours)}
          tone={outsideHours > 0 ? 'warning' : undefined}
          hint="22:00–06:00 Nairobi"
        />
      </div>

      <Section
        title="Who looked at whose details"
        sub="The value itself is never in the log. Only that somebody looked, and why."
      >
        {rows.length === 0 ? (
          <Empty>
            Nobody has revealed a phone number, opened a document, viewed a live location or read a
            CV. Each of those is recorded the moment it happens, with the reason given at the time.
          </Empty>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[50rem] text-left text-[0.8125rem]">
              <thead className="bg-bg text-muted-light">
                <tr>
                  <Th>When</Th>
                  <Th>Who looked</Th>
                  <Th>At what</Th>
                  <Th>Subject</Th>
                  <Th>Reason</Th>
                  <Th>In the hour</Th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className={r.no_reason_given ? 'bg-warning-bg/30' : ''}>
                    <Td>
                      <span className="text-muted-light text-[0.6875rem] font-bold">{r.ago}</span>
                    </Td>
                    <Td>
                      <span className="font-bold">{r.actor_label}</span>
                      {r.actor_role && (
                        <span className="text-muted-light block text-[0.6875rem] font-semibold">
                          {r.actor_role}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-[0.75rem] font-semibold">{r.action_label}</span>
                      {r.pii_fields?.length > 0 && (
                        <span className="text-muted-light block text-[0.625rem] font-bold">
                          {r.pii_fields.join(', ')}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-muted text-[0.75rem] font-semibold">
                        {r.subject_label ?? DASH}
                      </span>
                    </Td>
                    <Td>
                      {r.no_reason_given ? (
                        <Pill tone="bg-warning-bg text-warning">NONE GIVEN</Pill>
                      ) : (
                        <span className="text-muted text-[0.75rem] font-semibold">{r.reason}</span>
                      )}
                    </Td>
                    <Td>
                      <span
                        className={`text-[0.75rem] font-extrabold tabular-nums ${
                          r.reveals_in_the_hour > 20 ? 'text-danger' : 'text-muted-light'
                        }`}
                      >
                        {num(r.reveals_in_the_hour)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      <Section title="Exports" sub="Everything that left the system, with the reason given.">
        {exportRows.length === 0 ? (
          <Empty>
            Nothing has been exported. Any surface that produces a file calls `rpc_record_export`
            first, which refuses without a stated reason — so an empty list here means no files, not
            unrecorded ones.
          </Empty>
        ) : (
          <div className="space-y-2">
            {exportRows.map((x) => (
              <Card key={x.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.875rem] font-extrabold">{x.what}</span>
                  {x.contains_pii && <Pill tone="bg-info-bg text-info">PERSONAL DATA</Pill>}
                  {x.outside_hours && <Pill tone="bg-warning-bg text-warning">OUTSIDE HOURS</Pill>}
                  <span className="text-muted-light ml-auto text-[0.6875rem] font-bold">
                    {x.ago}
                  </span>
                </div>
                <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
                  {x.who} · {num(x.row_count)} rows · {x.format?.toUpperCase() ?? DASH}
                </p>
                <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">
                  {x.reason}
                </p>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// ════════════════════════════════════════ J5 · Evidence & retention

export function EvidenceTab({
  health,
  packs,
  holds,
  retention,
}: {
  health: HealthRow;
  packs: PackRow[];
  holds: HoldRow[];
  retention: RetentionRow[];
}) {
  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Chain"
          value={health.chain_ok === null ? DASH : health.chain_ok ? 'Verified' : 'BROKEN'}
          tone={health.chain_ok === false ? 'danger' : health.chain_ok ? 'success' : 'warning'}
          hint={
            health.chain_checked_at
              ? `${num(health.chain_events_checked)} events, ${stamp(health.chain_checked_at)}`
              : 'Never verified on this database'
          }
        />
        <Tile label="Evidence packs" value={num(packs.length)} />
        <Tile
          label="Legal holds"
          value={num(health.holds_active)}
          tone={health.holds_active > 0 ? 'warning' : undefined}
          hint="Deletion is suspended for these subjects"
        />
        <Tile
          label="Retention rules unset"
          value={num(health.retention_rules_unset)}
          tone={health.retention_rules_unset > 0 ? 'danger' : 'success'}
          hint="A rule with no period deletes nothing"
        />
      </div>

      <ChainBanner health={health} />

      <Section
        title="Retention"
        sub="How long each kind of record is kept, the legal basis, and whether the job is actually running."
      >
        {retention.length === 0 ? (
          <Empty>No retention rules are defined.</Empty>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[52rem] text-left text-[0.8125rem]">
              <thead className="bg-bg text-muted-light">
                <tr>
                  <Th>Record</Th>
                  <Th>Kept for</Th>
                  <Th>Basis</Th>
                  <Th>Then</Th>
                  <Th>Last run</Th>
                  <Th>Approved</Th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {retention.map((r) => (
                  <tr key={r.key} className={r.period_not_set ? 'bg-danger-bg/30' : ''}>
                    <Td>
                      <span className="font-bold">{r.subject}</span>
                      {r.description && (
                        <span className="text-muted-light block text-[0.6875rem] font-semibold">
                          {r.description}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {r.period_not_set ? (
                        <Pill tone="bg-danger-bg text-danger">NOT SET</Pill>
                      ) : (
                        <span className="font-extrabold">{r.retain_for_label}</span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-muted text-[0.75rem] font-semibold">{r.basis}</span>
                    </Td>
                    <Td>
                      <span className="text-[0.75rem] font-semibold">
                        {r.anonymise ? 'Anonymised' : 'Deleted'}
                      </span>
                    </Td>
                    <Td>
                      {r.not_running ? (
                        <Pill tone="bg-warning-bg text-warning">NOT RUNNING</Pill>
                      ) : (
                        <span className="text-muted text-[0.75rem] font-semibold">
                          {stamp(r.last_run_at)} · {num(r.last_run_rows)} rows
                          {r.last_run_held ? `, ${r.last_run_held} held` : ''}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {r.not_approved ? (
                        <div className="flex items-center gap-2">
                          <Pill tone="bg-warning-bg text-warning">
                            {r.approved_by_name ? 'ONE OF TWO' : 'NOT APPROVED'}
                          </Pill>
                          <RetentionApprove rowKey={r.key} onApprove={approveRetention} />
                        </div>
                      ) : (
                        <span className="text-muted-light text-[0.6875rem] font-semibold">
                          {r.approved_by_name} + {r.second_approver_name}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      <Section
        title="Legal holds"
        sub="The one thing that outranks a retention rule. Placed by one person, released by another."
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
          <div className="space-y-3">
            {holds.length === 0 ? (
              <Empty>
                No holds are in place, so every retention rule runs as written. A hold stops
                deletion for one subject — a rider, a guest, a candidate — or for everything, until
                somebody other than the person who placed it releases it with a reason.
              </Empty>
            ) : (
              holds.map((h) => (
                <Card key={h.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[0.75rem] font-extrabold">{h.reference}</span>
                    <Pill tone={h.active ? 'bg-warning-bg text-warning' : 'bg-bg text-muted-light'}>
                      {h.active ? 'ACTIVE' : 'RELEASED'}
                    </Pill>
                    {h.packs > 0 && <Pill tone="bg-info-bg text-info">{h.packs} PACKS</Pill>}
                  </div>
                  <p className="mt-2 text-[0.875rem] font-extrabold">{h.title}</p>
                  <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
                    {h.reason}
                  </p>
                  <p className="text-muted-light mt-1.5 text-[0.6875rem] font-semibold">
                    {h.subject_type}
                    {h.city_name ? ` · ${h.city_name}` : ''} · instructed by {h.instructed_by} ·
                    placed by {h.placed_by_name ?? DASH} on {stamp(h.placed_at)}
                  </p>
                  {h.released_at ? (
                    <p className="text-muted-light mt-1.5 text-[0.6875rem] font-semibold">
                      Released by {h.released_by_name ?? DASH} on {stamp(h.released_at)} —{' '}
                      {h.release_reason}
                    </p>
                  ) : (
                    <HoldRelease id={h.id} onRelease={releaseLegalHold} />
                  )}
                </Card>
              ))
            )}
          </div>
          <LegalHoldForm onPlace={placeLegalHold} />
        </div>
      </Section>

      <Section
        title="Evidence packs"
        sub="A frozen, hashed answer to a question somebody outside asked."
      >
        {packs.length === 0 ? (
          <Empty>
            No packs have been built. A pack records the question, the filter that answered it, the
            events as they stood at that moment, and a digest — so a second person running the same
            filter can prove the log did not move in between.
          </Empty>
        ) : (
          <div className="space-y-3">
            {packs.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[0.75rem] font-extrabold">{p.reference}</span>
                  <Pill
                    tone={
                      p.state === 'shared'
                        ? 'bg-info-bg text-info'
                        : p.state === 'frozen'
                          ? 'bg-success-bg text-success'
                          : 'bg-bg text-muted'
                    }
                  >
                    {p.state.toUpperCase()}
                  </Pill>
                  <Pill tone="bg-bg text-muted">{PURPOSE_LABEL[p.purpose] ?? p.purpose}</Pill>
                  {p.state !== 'draft' && !p.still_matches_the_log && (
                    <Pill tone="bg-danger-bg text-danger">NO LONGER MATCHES THE LOG</Pill>
                  )}
                  {p.chain_ok === false && (
                    <Pill tone="bg-danger-bg text-danger">CHAIN WAS BROKEN</Pill>
                  )}
                </div>
                <p className="mt-2 text-[0.875rem] font-extrabold">{p.title}</p>
                <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
                  {p.reason}
                </p>
                <p className="text-muted-light mt-1.5 text-[0.6875rem] font-semibold">
                  For {p.requested_by} · {num(p.event_count)} events · created by{' '}
                  {p.created_by_name ?? DASH} on {stamp(p.created_at)}
                  {p.shared_with ? ` · shared with ${p.shared_with}` : ''}
                </p>
                {p.content_hash_short && (
                  <p className="mt-2">
                    <Hash value={p.content_hash_hex} label={p.content_hash_short} />
                    <span className="text-muted-light ml-2 text-[0.6875rem] font-semibold">
                      read these twelve characters aloud to confirm two copies match
                    </span>
                  </p>
                )}
                <div className="mt-3">
                  <PackActions
                    id={p.id}
                    state={p.state}
                    onFreeze={freezePack}
                    onShare={sharePack}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

// ─────────────────────────────────────────────────────────── helpers

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-[1.0625rem] font-extrabold tracking-tight">{title}</h2>
      {sub && (
        <p className="text-muted mt-1 max-w-[52rem] text-[0.8125rem] font-semibold leading-[1.7]">
          {sub}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function FilterBar({
  tab,
  current,
  options,
}: {
  tab: string;
  current: string;
  options: { key: string; label: string }[];
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Link
          key={o.key}
          href={`/audit?tab=${tab}&filter=${o.key}`}
          className={`rounded-full px-3 py-1.5 text-[0.75rem] font-extrabold transition-colors ${
            current === o.key ? 'bg-ink text-white' : 'bg-bg text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

function ModuleChip({
  tab,
  filter,
  value,
  active,
  children,
}: {
  tab: string;
  filter: string;
  value: string | null;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/audit?tab=${tab}&filter=${filter}${value ? `&module=${value}` : ''}`}
      className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-bold transition-colors ${
        active ? 'bg-gold-soft text-gold-text' : 'bg-bg text-muted-light hover:text-ink'
      }`}
    >
      {children}
    </Link>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted shrink-0 font-semibold">{label}</dt>
      <dd className="text-right font-bold">{value}</dd>
    </div>
  );
}
