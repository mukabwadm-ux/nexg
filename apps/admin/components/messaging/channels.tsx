import * as React from 'react';

import { DASH } from '@/components/live/shared';

/**
 * Channels.
 *
 * Every way a conversation can reach the desk, and how the desk
 * is doing on each. Medians rather than means throughout: one
 * conversation left open over a weekend moves a mean by hours
 * and says nothing about the normal case.
 *
 * The WhatsApp panel underneath is not a duplicate of the row
 * above it. WhatsApp has a rule nothing else has — outside
 * twenty-four hours from the last inbound message, Meta refuses
 * anything but an approved template. An agent who cannot see
 * that writes a reply that is never delivered and believes they
 * answered.
 */

export interface ChannelRow {
  channel: string;
  total: number;
  open_now: number;
  unassigned: number;
  last_24h: number;
  last_7d: number;
  median_first_response_s: number | null;
  median_resolution_min: number | null;
  answered: number;
  resolved: number;
  breaching_now: number;
  latest_activity: string | null;
}

export interface WhatsAppWindowRow {
  conversation_id: string;
  msisdn_masked: string | null;
  last_inbound_at: string | null;
  window_expires_at: string | null;
  window_open: boolean;
  hours_left: number | null;
  status: string;
  subject: string | null;
}

/*
 * The labels, keyed on the real `msg_channel` values.
 *
 * An unknown key falls through to the raw enum value rather
 * than to a blank or to "Other" — a channel quietly labelled
 * "Other" is a channel nobody investigates, and this map was
 * already wrong once by guessing at the spelling.
 */
const CHANNEL_LABEL: Record<string, string> = {
  web: 'Website chat',
  guest_app: 'Guest app',
  merchant_dashboard: 'Merchant dashboard',
  rider_app: 'Rider app',
  host_view: 'Host view',
  hotel_desk: 'Hotel desk',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  internal: 'Internal',
};

/**
 * Durations.
 *
 * Under a threshold the figure is suppressed rather than
 * rounded. A median over three conversations is not a median,
 * it is one of the three, and a number on a dashboard gets
 * quoted whether or not it means anything.
 */
const ENOUGH_TO_MEASURE = 5;

function duration(seconds: number | null, sample: number): string {
  if (sample < ENOUGH_TO_MEASURE) return 'too few';
  if (seconds === null) return DASH;
  const s = Number(seconds);
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

function minutes(mins: number | null, sample: number): string {
  if (sample < ENOUGH_TO_MEASURE) return 'too few';
  if (mins === null) return DASH;
  const m = Number(mins);
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 1440) return `${(m / 60).toFixed(1)}h`;
  return `${(m / 1440).toFixed(1)}d`;
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

export function Channels({
  channels,
  whatsapp,
}: {
  channels: ChannelRow[];
  whatsapp: WhatsAppWindowRow[];
}) {
  const breaching = channels.reduce((a, c) => a + Number(c.breaching_now), 0);
  const closedWindows = whatsapp.filter((w) => !w.window_open && w.status !== 'resolved');

  return (
    <div className="space-y-8">
      {breaching > 0 ? (
        <p className="border-danger/40 bg-danger/5 text-danger rounded-lg border px-3 py-2 text-[0.8125rem] font-extrabold">
          {breaching} conversation{breaching === 1 ? ' is' : 's are'} past the time we promised a
          first reply and still has not had one.
        </p>
      ) : null}

      <section>
        <h2 className="mb-1 text-[0.9375rem] font-extrabold tracking-tight">Every way in</h2>
        <p className="text-muted-light mb-3 text-xs font-semibold">
          Medians, not averages — and nothing is reported from fewer than {ENOUGH_TO_MEASURE}{' '}
          conversations, because a median over three is just one of the three.
        </p>

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">Channel</th>
                <th className="px-4 py-2 text-right">Open now</th>
                <th className="px-4 py-2 text-right">Unassigned</th>
                <th className="px-4 py-2 text-right">24 hours</th>
                <th className="px-4 py-2 text-right">7 days</th>
                <th className="px-4 py-2 text-right">First reply</th>
                <th className="px-4 py-2 text-right">To resolve</th>
                <th className="px-4 py-2 text-right">Breaching</th>
                <th className="px-4 py-2">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {channels.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
                      No conversations have come in on any channel yet.
                    </p>
                  </td>
                </tr>
              ) : (
                channels.map((c) => (
                  <tr
                    key={c.channel}
                    className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                      c.breaching_now > 0 ? 'bg-danger/5' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5 font-extrabold">
                      {CHANNEL_LABEL[c.channel] ?? c.channel}
                    </td>
                    <td className="px-4 py-2.5 text-right font-extrabold tabular-nums">
                      {c.open_now}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        c.unassigned > 0 ? 'text-warn font-extrabold' : 'text-muted'
                      }`}
                    >
                      {c.unassigned}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">{c.last_24h}</td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">{c.last_7d}</td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {duration(c.median_first_response_s, Number(c.answered))}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {minutes(c.median_resolution_min, Number(c.resolved))}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        c.breaching_now > 0 ? 'text-danger font-extrabold' : 'text-muted-light'
                      }`}
                    >
                      {c.breaching_now}
                    </td>
                    <td className="text-muted-light px-4 py-2.5 text-[0.75rem]">
                      {stamp(c.latest_activity)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-[0.9375rem] font-extrabold tracking-tight">
          WhatsApp reply windows
        </h2>
        <p className="text-muted-light mb-3 text-xs font-semibold">
          Outside 24 hours from someone&apos;s last message, Meta refuses anything but an approved
          template. A free-text reply sent after that is never delivered, and nothing tells the
          agent.
        </p>

        {closedWindows.length > 0 ? (
          <p className="border-warn/40 bg-warn/5 text-warn mb-3 rounded-lg border px-3 py-2 text-[0.75rem] font-extrabold">
            {closedWindows.length} open conversation
            {closedWindows.length === 1 ? ' has' : 's have'} a closed window. Replying to{' '}
            {closedWindows.length === 1 ? 'it' : 'them'} needs an approved template.
          </p>
        ) : null}

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">Number</th>
                <th className="px-4 py-2">About</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">They last wrote</th>
                <th className="px-4 py-2">Window</th>
              </tr>
            </thead>
            <tbody>
              {whatsapp.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
                      No WhatsApp conversations. The number is not connected yet, so this is what
                      an unconnected channel looks like rather than a quiet one.
                    </p>
                  </td>
                </tr>
              ) : (
                whatsapp.map((w) => (
                  <tr
                    key={w.conversation_id}
                    className={`border-border border-b text-[0.8125rem] font-semibold last:border-0 ${
                      !w.window_open && w.status !== 'resolved' ? 'bg-warn/5' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono text-[0.75rem] font-extrabold">
                      {w.msisdn_masked ?? DASH}
                    </td>
                    <td className="text-muted px-4 py-2.5">{w.subject ?? 'no subject'}</td>
                    <td className="text-muted px-4 py-2.5">{w.status}</td>
                    <td className="text-muted px-4 py-2.5 text-[0.75rem]">
                      {stamp(w.last_inbound_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      {w.window_open ? (
                        <span className="bg-success/10 text-success rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                          open · {Number(w.hours_left ?? 0).toFixed(1)}h left
                        </span>
                      ) : (
                        <span className="bg-warn/10 text-warn rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                          closed · template only
                        </span>
                      )}
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
