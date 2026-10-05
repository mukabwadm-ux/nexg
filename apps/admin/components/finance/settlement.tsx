import Link from 'next/link';
import * as React from 'react';

import { Empty, SectionTitle, kesMoney, money, shortDate, signedMoney, stamp } from '@/components/finance/shared';
import { DASH, Pill } from '@/components/live/shared';

export type RunRow = {
  id: string;
  reference: string;
  city: string | null;
  period_start: string;
  period_end: string;
  pay_date: string | null;
  state: string;
  line_count: number;
  checks: { label: string; ok: boolean; detail?: string }[];
  checks_pass: boolean;
  approval_still_valid: boolean;
  approved_1_email: string | null;
  approved_1_at: string | null;
  approved_2_email: string | null;
  approved_2_at: string | null;
  hash: string | null;
  totals: Record<string, number> | null;
  built_at: string | null;
};

export type LineRow = {
  id: string;
  party_type: string;
  party_label: string | null;
  rail: string | null;
  destination_masked: string | null;
  gross_cents: number;
  adjustment_cents: number;
  net_cents: number;
  state: string;
  hold_reason: string | null;
  entries_claimed: number | null;
  recomputed_cents: number;
  verifies: boolean;
};

/*
 * The states, in the words the run itself uses. Nothing here
 * invents a friendlier name for a state the database records
 * differently — when somebody reads "approved_1" in a log and
 * "Awaiting the second signature" on a screen, they have to work
 * out that those are the same thing.
 */
const RUN_STATE: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-bg text-muted' },
  built: { label: 'Built · needs checking', tone: 'bg-bg text-muted' },
  checked: { label: 'Checked · needs a first signature', tone: 'bg-warn/15 text-warn' },
  approved_1: { label: 'One signature · needs a second', tone: 'bg-warn/15 text-warn' },
  approved_2: { label: 'Both signatures · files not generated', tone: 'bg-warn/15 text-warn' },
  files_generated: { label: 'Files generated', tone: 'bg-success/15 text-success' },
  sending: { label: 'Sending', tone: 'bg-success/15 text-success' },
  sent: { label: 'Sent', tone: 'bg-success/15 text-success' },
  reconciled: { label: 'Reconciled', tone: 'bg-success/15 text-success' },
  closed: { label: 'Closed', tone: 'bg-success/15 text-success' },
  cancelled: { label: 'Cancelled', tone: 'bg-danger text-white' },
};

const LINE_STATE: Record<string, { label: string; tone: string }> = {
  ready: { label: 'Ready', tone: 'bg-bg text-muted' },
  cash_netted: { label: 'Cash netted', tone: 'bg-bg text-muted' },
  held_suspended: { label: 'Held · suspended', tone: 'bg-danger text-white' },
  held_kyc: { label: 'Held · KYC', tone: 'bg-danger text-white' },
  name_mismatch: { label: 'Held · name mismatch', tone: 'bg-danger text-white' },
  below_minimum_rolled: { label: 'Rolled to next week', tone: 'bg-bg text-muted' },
  mismatch: { label: 'Mismatch', tone: 'bg-danger text-white' },
  approved: { label: 'Approved', tone: 'bg-success/15 text-success' },
  queued: { label: 'Queued', tone: 'bg-warn/15 text-warn' },
  sent: { label: 'Sent', tone: 'bg-success/15 text-success' },
};

/**
 * Money → Finance → Weekly settlement.
 *
 * The screen is built around the fact that a payout run is
 * irreversible once it leaves. So it leads with the six checks
 * and whether they pass, shows both signatures and whether the
 * run has been altered since they were given, and marks every
 * line that does not re-sum to the ledger entries it claims.
 *
 * Nothing here can move the run along. The transitions are a
 * database function with a table of allowed moves behind it, and
 * the buttons for them belong in a later pass; showing a control
 * that is not wired is worse than showing none, because somebody
 * will plan around it.
 */
export function Settlement({
  runs,
  run,
  lines,
}: {
  runs: { id: string; reference: string; state: string; period_end: string }[];
  run: RunRow | null;
  lines: LineRow[];
}) {
  if (!run) {
    return (
      <div className="border-border bg-surface rounded-xl border">
        <Empty>
          No settlement run has been built. A run is built over a closed week; until one exists
          there is nothing here to approve — this is not a loading state.
        </Empty>
      </div>
    );
  }

  const st = RUN_STATE[run.state] ?? { label: run.state, tone: 'bg-bg text-muted' };
  const failing = lines.filter((l) => !l.verifies);
  const held = lines.filter((l) => l.state.startsWith('held') || l.state === 'name_mismatch');
  const netTotal = lines.reduce((a, l) => a + Number(l.net_cents), 0);

  return (
    <div className="space-y-6">
      {runs.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/finance?tab=settlement&run=${r.id}`}
              className={`rounded-full px-3 py-1.5 text-[0.75rem] font-extrabold transition-colors ${
                r.id === run.id
                  ? 'bg-ink text-white'
                  : 'border-border-strong bg-surface text-ink hover:border-ink border'
              }`}
            >
              {r.reference}
            </Link>
          ))}
        </div>
      ) : null}

      {/* ───────────────────────────────────────── the run itself */}
      <section className="border-border bg-surface rounded-xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold tracking-tight">{run.reference}</h2>
              <Pill tone={st.tone}>{st.label}</Pill>
            </div>
            <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
              {shortDate(run.period_start)} to {shortDate(run.period_end)}
              {run.city ? ` · ${run.city}` : ' · all cities'} · {run.line_count} lines
              {run.pay_date ? ` · pays ${shortDate(run.pay_date)}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold tracking-tight tabular-nums">
              {kesMoney(netTotal)}
            </p>
            <p className="text-muted-light text-[0.6875rem] font-semibold">net across all lines</p>
          </div>
        </div>

        {/* The two signatures, and whether they still apply. */}
        <div className="border-border mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
          <Signature
            n="First"
            email={run.approved_1_email}
            at={run.approved_1_at}
            valid={run.approval_still_valid}
          />
          <Signature n="Second" email={run.approved_2_email} at={run.approved_2_at} valid />
        </div>

        {!run.approval_still_valid && run.approved_1_email ? (
          <p className="border-danger/40 bg-danger/5 text-danger mt-3 rounded-lg border px-3 py-2 text-[0.75rem] font-extrabold">
            This run has changed since it was approved. The signature was given against a different
            set of lines and no longer counts — it has to be approved again.
          </p>
        ) : null}

        {run.hash ? (
          <p className="text-muted-light mt-3 font-mono text-[0.625rem]">
            hash {run.hash.slice(0, 24)}… · built {stamp(run.built_at)}
          </p>
        ) : null}
      </section>

      {/* ───────────────────────────────────────────── the checks */}
      <section>
        <SectionTitle note="All six have to pass before a signature can be given. A check that cannot run counts as failed.">
          Checks
        </SectionTitle>
        <div className="border-border bg-surface overflow-hidden rounded-xl border">
          {!run.checks || run.checks.length === 0 ? (
            <Empty>
              This run has not been checked yet. An unchecked run is not a passing run — the checks
              have simply not been asked.
            </Empty>
          ) : (
            <ul>
              {run.checks.map((c) => (
                <li
                  key={c.label}
                  className="border-border flex flex-wrap items-start justify-between gap-2 border-b px-4 py-2.5 last:border-0"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                        c.ok ? 'bg-success' : 'bg-danger'
                      }`}
                    />
                    <div>
                      <p className="text-[0.8125rem] font-extrabold">{c.label}</p>
                      {c.detail ? (
                        <p className="text-muted mt-0.5 text-[0.75rem] font-semibold">{c.detail}</p>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className={`text-[0.6875rem] font-extrabold ${
                      c.ok ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {c.ok ? 'Pass' : 'Fail'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ───────────────────────────────────────────── the lines */}
      <section>
        <SectionTitle
          note="Every line re-summed from the ledger entries it claims. A line that does not match is marked and must not be paid."
          right={
            failing.length > 0 ? (
              <span className="text-danger text-[0.75rem] font-extrabold">
                {failing.length} {failing.length === 1 ? 'line does' : 'lines do'} not re-sum
              </span>
            ) : held.length > 0 ? (
              <span className="text-warn text-[0.75rem] font-extrabold">
                {held.length} held back
              </span>
            ) : null
          }
        >
          Lines
        </SectionTitle>

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          {lines.length === 0 ? (
            <Empty>
              This run has no lines. Either nothing was owed for the week, or every payable was
              already claimed by an earlier run.
            </Empty>
          ) : (
            <table className="w-full text-left">
              <thead className="border-border bg-bg border-b">
                <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                  <th className="px-4 py-2">Partner</th>
                  <th className="px-4 py-2">Paying to</th>
                  <th className="px-4 py-2 text-right">Gross</th>
                  <th className="px-4 py-2 text-right">Adjustments</th>
                  <th className="px-4 py-2 text-right">Net</th>
                  <th className="px-4 py-2">State</th>
                  <th className="px-4 py-2 text-right">Re-sums</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const ls = LINE_STATE[l.state] ?? { label: l.state, tone: 'bg-bg text-muted' };
                  return (
                    <tr
                      key={l.id}
                      className={`border-border border-b last:border-0 ${
                        !l.verifies ? 'bg-danger/5' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 text-[0.8125rem] font-semibold">
                        {l.party_label ?? (
                          <span className="text-danger font-extrabold">[name not found]</span>
                        )}
                        <span className="text-muted-light ml-1.5 text-[0.6875rem]">
                          · {l.party_type}
                        </span>
                        {l.hold_reason ? (
                          <p className="text-danger mt-0.5 text-[0.6875rem] font-semibold">
                            {l.hold_reason}
                          </p>
                        ) : null}
                      </td>
                      <td className="text-muted px-4 py-2.5 font-mono text-[0.75rem]">
                        {l.destination_masked ?? DASH}
                        {l.rail ? (
                          <span className="text-muted-light ml-1.5 font-sans text-[0.6875rem] font-semibold">
                            {l.rail}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[0.8125rem] font-semibold tabular-nums">
                        {money(l.gross_cents)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[0.8125rem] font-semibold tabular-nums">
                        {Number(l.adjustment_cents) === 0 ? DASH : signedMoney(l.adjustment_cents)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-[0.8125rem] font-extrabold tabular-nums">
                        {signedMoney(l.net_cents)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Pill tone={ls.tone}>{ls.label}</Pill>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {l.verifies ? (
                          <span className="text-success text-[0.6875rem] font-extrabold">
                            {l.entries_claimed ?? 0} entries
                          </span>
                        ) : (
                          <span className="text-danger text-[0.6875rem] font-extrabold">
                            off by {signedMoney(Number(l.gross_cents) - Number(l.recomputed_cents))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function Signature({
  n,
  email,
  at,
  valid,
}: {
  n: string;
  email: string | null;
  at: string | null;
  valid: boolean;
}) {
  return (
    <div className="border-border bg-bg rounded-lg border p-3">
      <p className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
        {n} approval
      </p>
      {email ? (
        <>
          <p className="mt-0.5 text-[0.8125rem] font-extrabold">{email}</p>
          <p className="text-muted-light text-[0.6875rem] font-semibold">
            {stamp(at)}
            {valid ? '' : ' · no longer valid'}
          </p>
        </>
      ) : (
        <p className="text-muted mt-0.5 text-[0.8125rem] font-semibold">Not given</p>
      )}
    </div>
  );
}
