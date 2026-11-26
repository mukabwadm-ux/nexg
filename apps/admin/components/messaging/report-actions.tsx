'use client';

import * as React from 'react';

import { resolveChatReport, type ReportResult } from '@/app/messaging/reports/actions';

/** What staff can do with one open chat report. The database refuses anything that does not apply. */
export function ReportActions({
  id,
  canRemoveMessage,
  canRemoveMember,
  isOrganiser,
}: {
  id: string;
  canRemoveMessage: boolean;
  canRemoveMember: boolean;
  isOrganiser: boolean;
}) {
  const [note, setNote] = React.useState('');
  const [removeMessage, setRemoveMessage] = React.useState(false);
  const [removeMember, setRemoveMember] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ReportResult | null>(null);
  const removing = removeMessage || removeMember;

  async function resolve(outcome: 'actioned' | 'dismissed') {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(
        await resolveChatReport({
          id,
          outcome,
          note,
          removeMessage: outcome === 'actioned' && removeMessage,
          removeMember: outcome === 'actioned' && removeMember,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-border space-y-2 border-t pt-3">
      {canRemoveMessage ? (
        <label className="flex items-center gap-2 text-[0.75rem] font-extrabold">
          <input
            type="checkbox"
            checked={removeMessage}
            onChange={(e) => setRemoveMessage(e.target.checked)}
          />
          Remove the message
        </label>
      ) : null}
      {canRemoveMember ? (
        <label className="flex items-center gap-2 text-[0.75rem] font-extrabold">
          <input
            type="checkbox"
            checked={removeMember}
            onChange={(e) => setRemoveMember(e.target.checked)}
          />
          {isOrganiser
            ? 'Remove them from the group (they run it, so the group closes)'
            : 'Remove them from the group'}
        </label>
      ) : null}
      <label className="sr-only" htmlFor={`report-note-${id}`}>
        What you did
      </label>
      <textarea
        id={`report-note-${id}`}
        value={note}
        maxLength={1000}
        rows={2}
        disabled={busy}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What you did, for the record. Needed if nothing is removed here."
        className="border-border focus:border-ink placeholder:text-muted-light bg-surface w-full resize-none rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold outline-none transition-colors disabled:opacity-50"
      />
      {result?.message ? (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={`text-[0.75rem] font-extrabold ${result.ok ? 'text-muted' : 'text-danger'}`}
        >
          {result.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || (!removing && !note.trim())}
          onClick={() => void resolve('actioned')}
          className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-50"
        >
          Resolve
        </button>
        <button
          type="button"
          disabled={busy || removing}
          onClick={() => void resolve('dismissed')}
          className="border-border-strong hover:border-ink rounded-lg border px-4 py-2 text-[0.8125rem] font-extrabold disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
