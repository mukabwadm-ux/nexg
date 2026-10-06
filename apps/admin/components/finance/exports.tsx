'use client';

import { Download, Loader2 } from 'lucide-react';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

import { SectionTitle, stamp } from './shared';

/**
 * Exports.
 *
 * An export is a disclosure. Somebody takes a copy of the books
 * out of the system, and from that moment the system cannot say
 * who holds it or what they did with it. So this screen does two
 * things that a plain download button would not: it records the
 * export before handing over a single row, and it shows the log
 * of every export anyone has taken underneath.
 *
 * The log is visible rather than buried in the audit trail
 * because the deterrent only works if people know it is there.
 */

export interface ExportLogRow {
  id: string;
  kind: string;
  from_date: string;
  to_date: string;
  row_count: number;
  taken_at: string;
  taken_by_email: string | null;
}

const KINDS = [
  {
    key: 'ledger',
    label: 'Ledger entries',
    note: 'Every debit and credit, with its transaction, account and order.',
  },
  {
    key: 'settlement',
    label: 'Settlement lines',
    note: 'What each partner was paid, by run.',
  },
  {
    key: 'revenue',
    label: 'Revenue by fee',
    note: 'Daily totals per fee account, per city.',
  },
  {
    key: 'invoices',
    label: 'Invoices',
    note: 'Hosts, hotels and merchants, with ageing.',
  },
] as const;

/**
 * RFC 4180 quoting.
 *
 * Every field is quoted rather than only the ones that need it.
 * Conditional quoting is where a memo containing a comma turns
 * one column into two, and a ledger export silently gaining a
 * column is the kind of error that is found in a spreadsheet
 * three weeks later.
 */
function toCsv(rows: Record<string, unknown>[]): string {
  const first = rows[0];
  if (!first) return '';
  const headers = Object.keys(first);
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '""';
    return `"${String(v).replace(/"/g, '""')}"`;
  };
  return [
    headers.map(cell).join(','),
    ...rows.map((r) => headers.map((h) => cell(r[h])).join(',')),
  ].join('\r\n');
}

export function Exports({ log, defaultFrom, defaultTo }: {
  log: ExportLogRow[];
  defaultFrom: string;
  defaultTo: string;
}) {
  const [kind, setKind] = React.useState<string>('ledger');
  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc('rpc_fin_export', {
      p_kind: kind,
      p_from: from,
      p_to: to,
    });

    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return;
    }

    const result = data as { count: number; rows: Record<string, unknown>[] };

    if (result.count === 0) {
      /*
       * No file for an empty result. A CSV with only headers
       * looks like a successful export of a period in which
       * nothing happened, and that is indistinguishable from an
       * export that silently filtered everything out.
       */
      setMessage(
        `Nothing to export: no ${kind} rows between ${from} and ${to}. No file was downloaded, and the attempt is in the log below.`,
      );
      setBusy(false);
      return;
    }

    const csv = toCsv(result.rows);
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexg-${kind}-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    setMessage(`${result.count.toLocaleString()} rows downloaded. The export is recorded below.`);
    setBusy(false);
  }

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle note="Every export is recorded before the rows are handed over, with who took it and how many.">
          Take a copy
        </SectionTitle>

        <div className="border-border bg-surface rounded-xl border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {KINDS.map((k) => (
              <label
                key={k.key}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                  kind === k.key
                    ? 'border-ink bg-bg'
                    : 'border-border hover:border-border-strong'
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={k.key}
                  checked={kind === k.key}
                  onChange={() => setKind(k.key)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-[0.8125rem] font-extrabold">{k.label}</span>
                  <span className="text-muted-light block text-[0.6875rem] font-semibold">
                    {k.note}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-[0.6875rem] font-extrabold tracking-wide uppercase">
              <span className="text-muted-light block">From</span>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="border-border-strong bg-surface mt-1 rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold normal-case tracking-normal"
              />
            </label>
            <label className="text-[0.6875rem] font-extrabold tracking-wide uppercase">
              <span className="text-muted-light block">To</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="border-border-strong bg-surface mt-1 rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold normal-case tracking-normal"
              />
            </label>
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy}
              className="bg-ink flex items-center gap-2 rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {busy ? 'Preparing…' : 'Export'}
            </button>
          </div>

          <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold">
            A single export covers at most 92 days. Longer ranges are refused rather than
            truncated — a truncated export looks exactly like a complete one.
          </p>

          {error ? (
            <p className="border-danger/40 bg-danger/5 text-danger mt-3 rounded-lg border px-3 py-2 text-[0.75rem] font-extrabold">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="border-border bg-bg text-muted mt-3 rounded-lg border px-3 py-2 text-[0.75rem] font-semibold">
              {message}
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <SectionTitle note="Visible rather than buried in the audit trail. The deterrent only works if people know it is here.">
          Who has taken a copy
        </SectionTitle>

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Who</th>
                <th className="px-4 py-2">What</th>
                <th className="px-4 py-2">Range</th>
                <th className="px-4 py-2 text-right">Rows</th>
              </tr>
            </thead>
            <tbody>
              {log.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
                      Nobody has exported anything yet.
                    </p>
                  </td>
                </tr>
              ) : (
                log.map((l) => (
                  <tr
                    key={l.id}
                    className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                  >
                    <td className="px-4 py-2.5">{stamp(l.taken_at)}</td>
                    <td className="px-4 py-2.5 font-extrabold">
                      {l.taken_by_email ?? 'staff record removed'}
                    </td>
                    <td className="text-muted px-4 py-2.5">{l.kind}</td>
                    <td className="text-muted px-4 py-2.5 text-[0.75rem]">
                      {l.from_date} to {l.to_date}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {l.row_count.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
