'use client';

import { ArrowRight } from 'lucide-react';
import * as React from 'react';

import { replyToRiderOps } from '@/app/(customer)/rider/actions';

import { ring } from './ui';

/** The reply line under the rider ops thread. */
export function ReplyBox() {
  const [body, setBody] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<{ ok: boolean; message?: string } | null>(null);

  return (
    <form
      className="mt-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setSaid(null);
        const result = await replyToRiderOps(body);
        setBusy(false);
        setSaid(result.ok ? { ok: true, message: 'Sent to rider ops.' } : result);
        if (result.ok) setBody('');
      }}
    >
      <div className="flex items-center gap-2 rounded-2xl border border-[#e3e7f0] bg-white p-1.5 pl-4 focus-within:border-[#fdd128] focus-within:ring-2 focus-within:ring-[#fdd128]/40">
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={1000}
          placeholder="Type a message…"
          aria-label="Message to rider ops"
          className="h-10 min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none"
        />
        <button
          type="submit"
          disabled={busy || !body.trim()}
          aria-label="Send"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fdd128] text-[color:var(--rider-ink)] disabled:opacity-50 ${ring}`}
        >
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {said?.message ? (
        <p
          role={said.ok ? 'status' : 'alert'}
          className={`mt-2 text-[12.5px] font-bold ${said.ok ? 'text-green-700' : 'text-red-700'}`}
        >
          {said.message}
        </p>
      ) : null}
    </form>
  );
}
