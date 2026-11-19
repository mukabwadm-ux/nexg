'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  acceptAgreement,
  cancelEarlyPayout,
  commitShift,
  createTicket,
  releaseShift,
  replyTicket,
  requestEarlyPayout,
  startPhoneChange,
  verifyPhoneChange,
  type Outcome,
} from '@/app/(customer)/rider/actions';

/**
 * The rider's buttons, grouped where the thing they act on already is:
 * a ticket's reply under the ticket, a shift's release on the shift, the
 * early payout on Earnings, a phone change on Profile. No new pages.
 */

const input =
  'border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold';
const primary =
  'bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-40';
const quiet =
  'border-border-strong rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40';

function Said({ said }: { said: Outcome | null }) {
  if (!said?.message) return null;
  return (
    <p
      role="status"
      className={`rounded-lg px-3 py-2 text-[0.8125rem] font-bold ${
        said.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
      }`}
    >
      {said.message}
    </p>
  );
}

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<Outcome | null>(null);
  const run = async (fn: () => Promise<Outcome>, refresh = true) => {
    setBusy(true);
    setSaid(null);
    const r = await fn();
    setSaid(r);
    setBusy(false);
    if (r.ok && refresh) router.refresh();
    return r;
  };
  return { busy, said, run, setSaid };
}

// ─────────────────────────────────────────────── support

export function NewTicket() {
  const { busy, said, run } = useRun();
  const [topic, setTopic] = React.useState('partner_rider');
  const [body, setBody] = React.useState('');
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(() => createTicket(topic, body));
        if (r.ok) setBody('');
      }}
    >
      <label className="block text-[0.75rem] font-extrabold" htmlFor="ticket-topic">
        Who should answer
      </label>
      <select
        id="ticket-topic"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        className={input}
      >
        <option value="partner_rider">Rider ops</option>
        <option value="payment_or_refund">Pay</option>
        <option value="account">Account</option>
        <option value="order_problem">An order</option>
        <option value="something_else">Product or a bug</option>
      </select>
      <textarea
        aria-label="What happened"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        maxLength={4000}
        placeholder="What happened? Add the order number if there is one."
        className={input}
      />
      <Said said={said} />
      <button type="submit" disabled={busy || body.trim().length < 3} className={primary}>
        {busy ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}

export function TicketThread({
  ticketId,
  closed,
  messages,
}: {
  ticketId: string;
  closed: boolean;
  messages: { id: string; body: string; from_support: boolean; created_at: string }[];
}) {
  const { busy, said, run } = useRun();
  const [body, setBody] = React.useState('');
  return (
    <div className="space-y-2">
      {messages.length === 0 ? (
        <p className="text-muted-light text-[0.75rem] font-semibold">No reply yet.</p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-lg px-3 py-2 text-[0.8125rem] font-semibold ${
                m.from_support ? 'bg-info-bg' : 'bg-bg ml-6'
              }`}
            >
              <span className="text-muted-light block text-[0.625rem] font-extrabold uppercase">
                {m.from_support ? 'Support' : 'You'} ·{' '}
                {new Date(m.created_at).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Africa/Nairobi',
                })}
              </span>
              {m.body}
            </li>
          ))}
        </ul>
      )}
      {!closed && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => replyTicket(ticketId, body));
            if (r.ok) setBody('');
          }}
        >
          <input
            aria-label="Reply"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            placeholder="Reply"
            className={input}
          />
          <button type="submit" disabled={busy || body.trim() === ''} className={primary}>
            Reply
          </button>
        </form>
      )}
      <Said said={said && !said.ok ? said : null} />
    </div>
  );
}

// ─────────────────────────────────────────────── shifts

export function ShiftCommit({ zones }: { zones: { id: string; name: string }[] }) {
  const { busy, said, run } = useRun();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const [zone, setZone] = React.useState(zones[0]?.id ?? '');
  const [date, setDate] = React.useState(today);
  const [slot, setSlot] = React.useState('dinner');
  const last = new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-CA', {
    timeZone: 'Africa/Nairobi',
  });
  return (
    <form
      className="grid gap-2 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => commitShift(zone, date, slot));
      }}
    >
      <select
        aria-label="Area"
        value={zone}
        onChange={(e) => setZone(e.target.value)}
        className={input}
      >
        {zones.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name}
          </option>
        ))}
      </select>
      <input
        aria-label="Day"
        type="date"
        min={today}
        max={last}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className={input}
      />
      <select
        aria-label="Window"
        value={slot}
        onChange={(e) => setSlot(e.target.value)}
        className={input}
      >
        <option value="morning">Morning · 07–11</option>
        <option value="lunch">Lunch · 11–15</option>
        <option value="dinner">Dinner · 17–22</option>
        <option value="late">Late · 22–01</option>
      </select>
      <button type="submit" disabled={busy || !zone} className={primary}>
        {busy ? 'Saving…' : 'Commit'}
      </button>
      <div className="sm:col-span-4">
        <Said said={said} />
      </div>
    </form>
  );
}

export function ShiftRelease({ shiftId }: { shiftId: string }) {
  const { busy, said, run } = useRun();
  const [sure, setSure] = React.useState(false);
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => (sure ? void run(() => releaseShift(shiftId)) : setSure(true))}
        className={quiet}
      >
        {sure ? 'Confirm release' : 'Release'}
      </button>
      {said && !said.ok && (
        <span className="text-danger text-[0.6875rem] font-bold">{said.message}</span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────── early payout

interface PayoutRequest {
  id: string;
  amountKes: number;
  status: string;
  requestedAt: string;
  note?: string | null;
  providerRef?: string | null;
}

export function EarlyPayout({
  availableKes,
  minimumKes,
  payoutPhone,
  requests,
}: {
  availableKes: number;
  minimumKes: number;
  payoutPhone: string | null;
  requests: PayoutRequest[];
}) {
  const { busy, said, run } = useRun();
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const open = requests.find((q) => q.status === 'pending' || q.status === 'approved');
  const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;
  const LABEL: Record<string, string> = {
    pending: 'Waiting for finance',
    approved: 'Approved · being paid',
    paid: 'Paid',
    rejected: 'Not approved',
    cancelled: 'Cancelled',
  };

  return (
    <div className="space-y-3">
      <p className="text-muted text-[0.8125rem] font-semibold">
        You are paid every week. If you need money before then, ask here and finance answers. Up to{' '}
        <strong>{kes(availableKes)}</strong> now, to {payoutPhone ?? 'your M-Pesa number'}.
      </p>
      {open ? (
        <div className="bg-bg flex flex-wrap items-center gap-3 rounded-lg px-3 py-2">
          <span className="text-[0.875rem] font-extrabold">{kes(open.amountKes)}</span>
          <span className="text-muted text-[0.75rem] font-bold">{LABEL[open.status]}</span>
          {open.status === 'pending' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => cancelEarlyPayout(open.id))}
              className={quiet}
            >
              Cancel request
            </button>
          )}
        </div>
      ) : (
        <form
          className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => requestEarlyPayout(Number(amount), reason));
          }}
        >
          <input
            aria-label="Amount in shillings"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={`From ${minimumKes}`}
            className={input}
          />
          <input
            aria-label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="Reason (optional)"
            className={input}
          />
          <button
            type="submit"
            disabled={
              busy || !payoutPhone || Number(amount) < minimumKes || Number(amount) > availableKes
            }
            className={primary}
          >
            {busy ? 'Sending…' : 'Ask for it'}
          </button>
        </form>
      )}
      <Said said={said} />
      {requests.length > 0 && (
        <ul className="divide-border divide-y text-[0.8125rem] font-semibold">
          {requests.slice(0, 5).map((q) => (
            <li key={q.id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>
                {kes(q.amountKes)} ·{' '}
                {new Date(q.requestedAt).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  timeZone: 'Africa/Nairobi',
                })}
              </span>
              <span className="text-muted">
                {LABEL[q.status] ?? q.status}
                {q.providerRef ? ` · ${q.providerRef}` : ''}
                {q.status === 'rejected' && q.note ? ` · ${q.note}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────── phone change

export function PhoneChange({
  kind,
  current,
}: {
  kind: 'payout' | 'account';
  current: string | null;
}) {
  const { busy, said, run, setSaid } = useRun();
  const [editing, setEditing] = React.useState(false);
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [challenge, setChallenge] = React.useState<string | null>(null);
  const label = kind === 'payout' ? 'M-Pesa payout number' : 'Account phone';

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[0.875rem] font-extrabold">{current ?? 'Not set'}</span>
        <button type="button" onClick={() => setEditing(true)} className={quiet}>
          Change
        </button>
        <Said said={said} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {challenge === null ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => startPhoneChange(kind, phone), false);
            const id = r.data?.challengeId;
            if (r.ok && typeof id === 'string' && r.data?.delivered !== false) setChallenge(id);
          }}
        >
          <input
            aria-label={`New ${label}`}
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0712 345 678"
            className={`${input} max-w-[14rem]`}
          />
          <button type="submit" disabled={busy || phone.trim().length < 9} className={primary}>
            Send code
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setSaid(null);
            }}
            className={quiet}
          >
            Cancel
          </button>
        </form>
      ) : (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => verifyPhoneChange(challenge, code));
            if (r.ok) {
              setEditing(false);
              setChallenge(null);
              setCode('');
            }
          }}
        >
          <input
            aria-label="Code from the text message"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="6-digit code"
            className={`${input} max-w-[10rem]`}
          />
          <button type="submit" disabled={busy || code.length !== 6} className={primary}>
            Confirm
          </button>
        </form>
      )}
      <Said said={said} />
      {kind === 'payout' && (
        <p className="text-muted-light text-[0.6875rem] font-semibold">
          We text a code to the new number and tell your old one. Early payouts wait 24 hours after
          a change.
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────── the agreement

export function AgreementAccept({
  versionId,
  version,
  pdfUrl,
}: {
  versionId: string;
  version: string;
  pdfUrl: string | null;
}) {
  const { busy, said, run } = useRun();
  const [read, setRead] = React.useState(false);
  return (
    <div className="space-y-2">
      <p className="text-[0.8125rem] font-semibold">
        Rider agreement {version}
        {pdfUrl ? (
          <>
            {' · '}
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="font-extrabold underline">
              Read it
            </a>
          </>
        ) : null}
      </p>
      <label className="flex items-center gap-2 text-[0.8125rem] font-semibold">
        <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />I have
        read it and agree
      </label>
      <button
        type="button"
        disabled={busy || !read}
        onClick={() => void run(() => acceptAgreement(versionId))}
        className={primary}
      >
        Accept
      </button>
      <Said said={said} />
    </div>
  );
}
