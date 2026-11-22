import { Card } from '@nexg/ui';
import Link from 'next/link';
import * as React from 'react';

import { signOutDevice } from '@/app/audit/actions';

import { DeviceSignOut } from './actions-ui';

import {
  DASH,
  Empty,
  OUTCOME_LABEL,
  Pill,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  num,
  stamp,
} from './shared';

/**
 * Devices & sessions.
 *
 * One admin account may be shared by several people. A device here is
 * one browser: the console gives each browser a random id in a
 * long-lived cookie, and every sign-in and every action carries it.
 * So "who on this account did that" becomes "which device did that",
 * which can be answered.
 *
 * Readable at full audit access only, because it shows IP addresses.
 * Addresses are cleared after 365 days; the device and session stay.
 */

export interface DeviceRow {
  staff_user_id: string | null;
  staff_email: string | null;
  device_id: string;
  device_label: string | null;
  first_seen: string;
  last_seen: string;
  last_ip: string | null;
  ip_count: number;
  sign_ins: number;
  failed_sign_ins: number;
  actions: number;
  live_sessions: number;
}

export interface DeviceSignIn {
  id: number;
  at: string;
  outcome: string;
  who: string | null;
  ip: string | null;
  ip_country: string | null;
  device_label: string | null;
  user_agent: string | null;
  session_id: string | null;
  ended_at: string | null;
  ended_reason: string | null;
  live: boolean;
}

export interface DeviceEvent {
  id: number;
  at: string;
  module: string;
  action: string;
  action_label: string;
  sentence: string;
  severity: string;
  target_type: string | null;
  target_label: string | null;
  ip: string | null;
  session_id: string | null;
}

export interface DeviceDetail {
  sign_ins: DeviceSignIn[];
  events: DeviceEvent[];
}

/** Old sign-ins carried a coarse hash ("d" + base36) rather than a device cookie. */
function isLegacyId(id: string) {
  return /^d[0-9a-z]{1,8}$/.test(id);
}

function shortId(id: string) {
  return isLegacyId(id) ? `${id} (old)` : id.slice(0, 8);
}

export function DevicesTab({
  devices,
  selected,
  detail,
  error,
  canSignOut = false,
  currentDevice = null,
}: {
  devices: DeviceRow[];
  selected: string | null;
  detail: DeviceDetail | null;
  error: string | null;
  /** Super admins can end another device's sessions. */
  canSignOut?: boolean;
  /** This browser's own device id, which cannot sign itself out here. */
  currentDevice?: string | null;
}) {
  if (error) {
    return (
      <Card className="mt-5 p-6">
        <p className="text-[0.875rem] font-extrabold">Devices are not open to you.</p>
        <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">
          This list shows IP addresses, so it needs full access to the audit log. {error}
        </p>
      </Card>
    );
  }

  const byAccount = new Map<string, DeviceRow[]>();
  for (const d of devices) {
    const key = d.staff_email ?? '[Removed account]';
    byAccount.set(key, [...(byAccount.get(key) ?? []), d]);
  }
  const current = selected ? devices.find((d) => d.device_id === selected) : undefined;

  return (
    <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_30rem] xl:items-start">
      <div className="space-y-5">
        {devices.length === 0 && (
          <Empty>
            No device has signed in since device tracking began. The next sign-in to the console
            will appear here.
          </Empty>
        )}
        {[...byAccount.entries()].map(([account, rows]) => (
          <Card key={account} className="overflow-hidden p-0">
            <div className="border-border flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-[0.9375rem] font-extrabold">{account}</h2>
              <p className="text-muted text-[0.75rem] font-semibold">
                {rows.length} device{rows.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-[0.8125rem]">
                <thead className="bg-bg text-muted-light">
                  <tr>
                    <Th>Device</Th>
                    <Th>Last IP</Th>
                    <Th>First seen</Th>
                    <Th>Last seen</Th>
                    <Th>Sign-ins</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {rows.map((d) => (
                    <tr
                      key={d.device_id}
                      className={selected === d.device_id ? 'bg-gold-soft/40' : undefined}
                    >
                      <Td>
                        <Link
                          href={`/audit?tab=devices&device=${encodeURIComponent(d.device_id)}`}
                          className="font-extrabold underline-offset-2 hover:underline"
                        >
                          {d.device_label ?? 'Unknown device'}
                        </Link>
                        <span className="text-muted-light block font-mono text-[0.6875rem]">
                          {shortId(d.device_id)}
                        </span>
                        {d.live_sessions > 0 && (
                          <span className="mt-1 inline-block">
                            <Pill tone="bg-success-bg text-success">SIGNED IN NOW</Pill>
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.75rem]">{d.last_ip ?? DASH}</span>
                        {d.ip_count > 1 && (
                          <span className="text-muted-light block text-[0.6875rem]">
                            {d.ip_count} addresses
                          </span>
                        )}
                      </Td>
                      <Td>{stamp(d.first_seen)}</Td>
                      <Td>{stamp(d.last_seen)}</Td>
                      <Td>
                        {num(d.sign_ins)}
                        {d.failed_sign_ins > 0 && (
                          <span className="text-danger block text-[0.6875rem] font-bold">
                            {d.failed_sign_ins} refused
                          </span>
                        )}
                      </Td>
                      <Td>{num(d.actions)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      <DevicePanel
        device={current ?? null}
        id={selected}
        detail={detail}
        canSignOut={canSignOut}
        isCurrent={!!selected && selected === currentDevice}
      />
    </div>
  );
}

function DevicePanel({
  device,
  id,
  detail,
  canSignOut,
  isCurrent,
}: {
  device: DeviceRow | null;
  id: string | null;
  detail: DeviceDetail | null;
  canSignOut: boolean;
  isCurrent: boolean;
}) {
  if (!id || !detail) {
    return (
      <Card className="p-6">
        <p className="text-muted text-[0.8125rem] font-semibold leading-[1.8]">
          Pick a device to see every sign-in from it and everything done from it. Each browser gets
          its own device id, so two people sharing one account show up as two devices.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-[1.0625rem] font-extrabold leading-tight">
        {device?.device_label ?? 'Device'}
      </h2>
      <p className="text-muted-light mt-1 font-mono text-[0.6875rem] font-semibold">
        {shortId(id)} · {device?.staff_email ?? DASH}
      </p>
      <p className="mt-2 text-[0.75rem] font-bold">
        <Link
          href={`/audit?tab=activity&device=${encodeURIComponent(id)}`}
          className="text-gold-text underline"
        >
          Open these actions in the Activity tab
        </Link>
      </p>

      {isCurrent ? (
        <p className="text-muted mt-3 text-[0.75rem] font-semibold">
          This is the browser you are using now.
        </p>
      ) : (
        canSignOut &&
        (device?.live_sessions ?? 0) > 0 && (
          <div className="border-border mt-4 border-t pt-3">
            <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
              Sign this device out
            </p>
            <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.6]">
              Ends its sessions now; every other device stays signed in. If it still knows the
              password it can sign in again, so change the password as well if it should not.
            </p>
            <DeviceSignOut deviceId={id} onSignOut={signOutDevice} />
          </div>
        )
      )}

      <h3 className="text-muted-light mt-5 text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
        Sign-ins · {detail.sign_ins.length}
      </h3>
      {detail.sign_ins.length === 0 ? (
        <p className="text-muted mt-1.5 text-[0.75rem] font-semibold">None recorded.</p>
      ) : (
        <ul className="divide-border mt-1.5 divide-y">
          {detail.sign_ins.map((s) => (
            <li key={s.id} className="py-2 text-[0.75rem]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{stamp(s.at)}</span>
                <span className="flex gap-1.5">
                  {s.outcome !== 'success' && (
                    <Pill tone="bg-danger-bg text-danger">
                      {(OUTCOME_LABEL[s.outcome] ?? s.outcome).toUpperCase()}
                    </Pill>
                  )}
                  {s.live && <Pill tone="bg-success-bg text-success">LIVE</Pill>}
                </span>
              </div>
              <p className="text-muted mt-0.5 font-semibold">
                <span className="font-mono">{s.ip ?? 'no address'}</span>
                {s.ip_country ? ` · ${s.ip_country}` : ''}
                {s.session_id ? ` · session ${s.session_id.slice(0, 8)}` : ''}
                {s.ended_at
                  ? ` · ended ${stamp(s.ended_at)}${s.ended_reason ? ` (${s.ended_reason.replace('_', ' ')})` : ''}`
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      )}

      <h3 className="text-muted-light mt-5 text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
        Actions · {detail.events.length}
      </h3>
      {detail.events.length === 0 ? (
        <p className="text-muted mt-1.5 text-[0.75rem] font-semibold">
          Nothing recorded from this device yet.
        </p>
      ) : (
        <ul className="divide-border mt-1.5 divide-y">
          {detail.events.map((e) => (
            <li key={e.id} className="py-2 text-[0.75rem]">
              <Link
                href={`/audit?tab=activity&device=${encodeURIComponent(id)}&event=${e.id}`}
                className="block hover:underline"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="font-bold">{e.sentence}</span>
                  {e.severity !== 'info' && (
                    <Pill tone={SEVERITY_TONE[e.severity]}>{SEVERITY_LABEL[e.severity]}</Pill>
                  )}
                </span>
                <span className="text-muted mt-0.5 block font-semibold">
                  {stamp(e.at)}
                  {e.ip ? ` · ${e.ip}` : ''}
                  {e.session_id ? ` · session ${e.session_id.slice(0, 8)}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
