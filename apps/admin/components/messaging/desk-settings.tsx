import * as React from 'react';

import { DASH } from '@/components/live/shared';

/**
 * Canned replies, and the desk's own settings.
 *
 * Two screens that share a theme: these are rows that have been
 * deciding things since the system went up, and until now
 * nobody could look at them. A routing rule that silently never
 * matches, a canned reply that exists only in English, somebody
 * marked available who last pinged ninety minutes ago — each
 * one changes what a guest experiences, and none of them were
 * visible anywhere.
 */

export interface CannedRow {
  key: string;
  title: string;
  body_by_lang: Record<string, string>;
  audience: string | null;
  topic: string | null;
  action_key: string | null;
  owner_team: string | null;
  needs_approval: boolean;
  approved_by_email: string | null;
  approved_at: string | null;
  usage_count: number;
  last_used_at: string | null;
  languages: string[] | null;
  blocked: boolean;
}

export interface RoutingRow {
  id: string;
  priority: number;
  label: string;
  conditions: Record<string, unknown>;
  owner_team: string | null;
  priority_out: string | null;
  first_response_sla_s: number | null;
  resolution_sla_min: number | null;
  auto_link: boolean | null;
  enabled: boolean;
  team_volume_30d: number;
}

export interface RosterRow {
  staff_user_id: string;
  display_name: string | null;
  email: string;
  state: string;
  on_shift_until: string | null;
  capacity: number;
  active_count: number;
  last_seen_at: string | null;
  device: string | null;
  presence_stale: boolean;
  headroom: number;
}

function stamp(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Nairobi',
      })
    : DASH;
}

function sla(seconds: number | null): string {
  if (seconds === null) return DASH;
  const s = Number(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

/* ══════════════════════════════════════════ Canned replies */

export function CannedReplies({ rows }: { rows: CannedRow[] }) {
  const blocked = rows.filter((r) => r.blocked);
  const monolingual = rows.filter((r) => (r.languages?.length ?? 0) < 2);
  const unused = rows.filter((r) => Number(r.usage_count) === 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Replies" value={rows.length} note="Typed once, sent many times" />
        <Stat
          label="Waiting on approval"
          value={blocked.length}
          note={blocked.length > 0 ? 'Cannot be sent until approved' : 'None held up'}
          warn={blocked.length > 0}
        />
        <Stat
          label="One language only"
          value={monolingual.length}
          note="Half the guests cannot read these"
          warn={monolingual.length > 0}
        />
      </div>

      {blocked.length > 0 ? (
        <p className="border-warn/40 bg-warn/5 text-warn rounded-lg border px-3 py-2 text-[0.75rem] font-extrabold">
          {blocked.length} repl{blocked.length === 1 ? 'y needs' : 'ies need'} approval before
          anyone can send {blocked.length === 1 ? 'it' : 'them'}. An agent who picks one gets
          nothing, with no explanation.
        </p>
      ) : null}

      <div className="border-border bg-surface overflow-x-auto rounded-xl border">
        <table className="w-full text-left">
          <thead className="border-border bg-bg border-b">
            <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
              <th className="px-4 py-2">Shortcut</th>
              <th className="px-4 py-2">What it says</th>
              <th className="px-4 py-2">For</th>
              <th className="px-4 py-2">Languages</th>
              <th className="px-4 py-2 text-right">Used</th>
              <th className="px-4 py-2">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
                    No canned replies yet.
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.key}
                  className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                    r.blocked ? 'bg-warn/5' : ''
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <code className="bg-bg rounded px-1.5 py-0.5 font-mono text-[0.75rem] font-extrabold">
                      {r.key}
                    </code>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="block font-extrabold">{r.title}</span>
                    <span className="text-muted-light line-clamp-2 block text-[0.6875rem]">
                      {r.body_by_lang?.en ?? Object.values(r.body_by_lang ?? {})[0] ?? ''}
                    </span>
                  </td>
                  <td className="text-muted px-4 py-2.5 text-[0.75rem]">
                    {r.audience ?? DASH}
                    {r.topic ? (
                      <span className="text-muted-light block text-[0.625rem]">{r.topic}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {(r.languages ?? []).map((l) => (
                      <span
                        key={l}
                        className="bg-bg text-muted mr-1 rounded px-1.5 py-0.5 text-[0.625rem] font-extrabold uppercase"
                      >
                        {l}
                      </span>
                    ))}
                    {(r.languages?.length ?? 0) < 2 ? (
                      <span className="text-warn block text-[0.625rem] font-extrabold">
                        one language only
                      </span>
                    ) : null}
                  </td>
                  <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                    {r.usage_count}
                    {r.last_used_at ? (
                      <span className="text-muted-light block text-[0.625rem]">
                        {stamp(r.last_used_at)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.blocked ? (
                      <span className="bg-warn/10 text-warn rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                        needs approval
                      </span>
                    ) : r.needs_approval ? (
                      <span className="bg-success/10 text-success rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                        approved
                      </span>
                    ) : (
                      <span className="text-muted-light text-[0.6875rem] font-semibold">
                        no approval needed
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {unused.length > 0 ? (
        <p className="text-muted-light text-[0.6875rem] font-semibold">
          {unused.length} of these have never been used. Either nobody knows they exist or they do
          not say what people need to say.
        </p>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════ Settings */

export function DeskSettings({
  rules,
  roster,
}: {
  rules: RoutingRow[];
  roster: RosterRow[];
}) {
  const disabled = rules.filter((r) => !r.enabled);
  const stale = roster.filter((r) => r.presence_stale && r.state !== 'off');
  const available = roster.filter((r) => r.state === 'available' && !r.presence_stale);
  const headroom = available.reduce((a, r) => a + Number(r.headroom), 0);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-[0.9375rem] font-extrabold tracking-tight">Who is on the desk</h2>
        <p className="text-muted-light mb-3 text-xs font-semibold">
          Capacity is what routing believes. Somebody shown available who last pinged an hour ago
          is not available, and routing to them is how a conversation sits unanswered while the
          board says it was assigned.
        </p>

        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Stat label="Available now" value={available.length} note="Pinged in the last 15 min" />
          <Stat
            label="Free slots"
            value={headroom}
            note={headroom === 0 ? 'The desk is full' : 'Across everyone available'}
            warn={headroom === 0 && available.length > 0}
          />
          <Stat
            label="Stale presence"
            value={stale.length}
            note="Shown on, not actually seen"
            warn={stale.length > 0}
          />
        </div>

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">Who</th>
                <th className="px-4 py-2">State</th>
                <th className="px-4 py-2 text-right">Handling</th>
                <th className="px-4 py-2 text-right">Capacity</th>
                <th className="px-4 py-2">On shift until</th>
                <th className="px-4 py-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
                      Nobody has signed on to the desk. Conversations will arrive and sit
                      unassigned.
                    </p>
                  </td>
                </tr>
              ) : (
                roster.map((r) => (
                  <tr
                    key={r.staff_user_id}
                    className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                      r.presence_stale && r.state !== 'off' ? 'bg-warn/5' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <span className="block font-extrabold">{r.display_name ?? r.email}</span>
                      <span className="text-muted-light block text-[0.625rem]">{r.email}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                          r.state === 'available'
                            ? 'bg-success/10 text-success'
                            : r.state === 'busy'
                              ? 'bg-warn/10 text-warn'
                              : 'bg-bg text-muted'
                        }`}
                      >
                        {r.state}
                      </span>
                      {r.presence_stale && r.state !== 'off' ? (
                        <span className="text-warn mt-0.5 block text-[0.625rem] font-extrabold">
                          not seen in 15 min
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.active_count}</td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {r.capacity}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-[0.75rem]">
                      {stamp(r.on_shift_until)}
                    </td>
                    <td className="text-muted-light px-4 py-2.5 text-[0.75rem]">
                      {stamp(r.last_seen_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-[0.9375rem] font-extrabold tracking-tight">Routing rules</h2>
        <p className="text-muted-light mb-3 text-xs font-semibold">
          Checked in order, first match wins. A rule below one that always matches never runs, and
          nothing warns you.
        </p>

        {disabled.length > 0 ? (
          <p className="border-border bg-bg text-muted mb-3 rounded-lg border px-3 py-2 text-[0.75rem] font-semibold">
            {disabled.length} rule{disabled.length === 1 ? ' is' : 's are'} switched off. They are
            shown so that a gap in routing has somewhere to be explained.
          </p>
        ) : null}

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Rule</th>
                <th className="px-4 py-2">Matches</th>
                <th className="px-4 py-2">Goes to</th>
                <th className="px-4 py-2 text-right">First reply</th>
                <th className="px-4 py-2 text-right">Resolve</th>
                <th className="px-4 py-2 text-right">Team, 30d</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
                      No routing rules. Everything lands unassigned.
                    </p>
                  </td>
                </tr>
              ) : (
                rules.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                      r.enabled ? '' : 'opacity-50'
                    }`}
                  >
                    <td className="text-muted-light px-4 py-2.5 tabular-nums">{r.priority}</td>
                    <td className="px-4 py-2.5">
                      <span className="block font-extrabold">{r.label}</span>
                      {!r.enabled ? (
                        <span className="text-muted-light block text-[0.625rem] font-extrabold uppercase">
                          off
                        </span>
                      ) : null}
                    </td>
                    <td className="text-muted-light px-4 py-2.5 font-mono text-[0.625rem]">
                      {JSON.stringify(r.conditions)}
                    </td>
                    <td className="text-muted px-4 py-2.5">
                      {r.owner_team ?? DASH}
                      {r.priority_out ? (
                        <span className="text-muted-light block text-[0.625rem]">
                          at {r.priority_out}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {sla(r.first_response_sla_s)}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {r.resolution_sla_min === null ? DASH : `${r.resolution_sla_min}m`}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {r.team_volume_30d}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">
          Rules are read-only here. Changing one changes where every future conversation goes, so
          it belongs behind the same approval as the rest of Settings rather than behind a button
          on a console tab.
        </p>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  warn,
}: {
  label: string;
  value: number;
  note: string;
  warn?: boolean;
}) {
  return (
    <div className="border-border bg-surface rounded-xl border p-4">
      <p className="text-muted-light text-[0.6875rem] font-extrabold tracking-wide uppercase">
        {label}
      </p>
      <p
        className={`mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums ${
          warn ? 'text-warn' : ''
        }`}
      >
        {value}
      </p>
      <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">{note}</p>
    </div>
  );
}
