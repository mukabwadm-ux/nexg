'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { addStore, closeStore, renameStore, type Outcome } from '@/app/merchant/actions';

import { Panel, Pill } from './bits';

export interface StoreRow {
  id: string;
  name: string;
  address_text: string | null;
  latitude: number | null;
  longitude: number | null;
  zone_id: string | null;
  zone_name?: string | null;
  is_primary: boolean;
  closed_at: string | null;
  closed_reason: string | null;
  sort: number;
}

/**
 * Stores, and adding another.
 *
 * There is no map here. NexG has no Maps key, and a drawn map with
 * a draggable pin that is not really geocoding anything would let
 * a merchant think they had placed their shop when they had not.
 * What works without one is coordinates — which every phone's map
 * app will give you by holding a finger on the spot — so that is
 * what this asks for, and it says where to get them.
 */
export function Stores({
  merchantId,
  stores,
}: {
  merchantId: string;
  stores: StoreRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<Outcome | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [closing, setClosing] = React.useState<string | null>(null);

  const [name, setName] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [coords, setCoords] = React.useState('');
  const [primary, setPrimary] = React.useState(false);
  const [reason, setReason] = React.useState('');

  const run = async (fn: () => Promise<Outcome>, after?: () => void) => {
    setBusy(true);
    setSaid(null);
    const r = await fn();
    setSaid(r);
    setBusy(false);
    if (r.ok) {
      after?.();
      router.refresh();
    }
  };

  /* "-1.2650, 36.8030" — what you get from holding a finger on a
     spot in any phone map app and tapping the coordinates. */
  const parsed = React.useMemo(() => {
    const m = coords.trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }, [coords]);

  const reset = () => {
    setAdding(false);
    setName('');
    setAddress('');
    setCoords('');
    setPrimary(false);
  };

  return (
    <Panel
      title="Your stores"
      note={`${stores.length} open`}
      action={
        !adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="bg-ink rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white"
          >
            + Add a store
          </button>
        ) : null
      }
    >
      {said && (
        <p
          role="status"
          className={`mb-3 rounded-lg px-3 py-2 text-[0.8125rem] font-bold ${
            said.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {said.message ?? (said.ok ? 'Done.' : 'That did not work.')}
        </p>
      )}

      {adding && (
        <div className="bg-bg mb-4 space-y-2 rounded-xl p-4">
          <p className="text-[0.875rem] font-extrabold">A new store</p>
          <p className="text-muted text-[0.8125rem] font-semibold">
            We check it against the delivery map before it starts taking orders — usually the
            same day. It will not appear to guests until then.
          </p>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What guests should call it — usually the area"
            className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.875rem] font-semibold"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street address — a rider has to find the door"
            className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.875rem] font-semibold"
          />
          <div>
            <input
              value={coords}
              onChange={(e) => setCoords(e.target.value)}
              placeholder="-1.2650, 36.8030"
              className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.875rem] font-semibold tabular-nums"
            />
            <p className="text-muted-light mt-1 text-[0.75rem] font-semibold">
              Open your phone&apos;s map app, hold a finger on the exact spot, and copy the two
              numbers it shows.{' '}
              {coords.trim() && !parsed && (
                <span className="text-danger font-bold">
                  That is not a pair of coordinates yet.
                </span>
              )}
              {parsed && (
                <span className="text-success font-bold">
                  Got it — {parsed.lat}, {parsed.lng}.
                </span>
              )}
            </p>
          </div>

          <label className="flex items-center gap-2 text-[0.8125rem] font-semibold">
            <input
              type="checkbox"
              checked={primary}
              onChange={(e) => setPrimary(e.target.checked)}
            />
            Make this the main one
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !name.trim() || !address.trim() || !parsed}
              onClick={() =>
                run(
                  () =>
                    addStore({
                      merchantId,
                      name,
                      address,
                      lat: parsed!.lat,
                      lng: parsed!.lng,
                      makePrimary: primary,
                    }),
                  reset,
                )
              }
              className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-40"
            >
              {busy ? 'Adding…' : 'Add this store'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-[0.8125rem] font-extrabold underline underline-offset-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <ul className="divide-border divide-y">
        {stores.map((s) => (
          <li key={s.id} className="py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[0.9375rem] font-extrabold">
                  {s.name}
                  {s.is_primary && <Pill tone="bg-gold-soft text-gold-text">MAIN</Pill>}
                  {!s.zone_id && (
                    <Pill tone="bg-danger-bg text-danger">OUTSIDE A DELIVERY AREA</Pill>
                  )}
                </p>
                <p className="text-muted text-[0.8125rem] font-semibold">
                  {s.address_text ?? '[—]'}
                  {s.zone_name && ` · ${s.zone_name}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(editing === s.id ? null : s.id)}
                  className="text-[0.75rem] font-extrabold underline underline-offset-4"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setClosing(closing === s.id ? null : s.id)}
                  className="text-danger text-[0.75rem] font-extrabold underline underline-offset-4"
                >
                  Close
                </button>
              </div>
            </div>

            {editing === s.id && (
              <EditStore
                store={s}
                busy={busy}
                onSave={(n, a) => run(() => renameStore(s.id, n, a), () => setEditing(null))}
              />
            )}

            {closing === s.id && (
              <div className="bg-bg mt-2 space-y-2 rounded-xl p-3">
                <p className="text-[0.8125rem] font-semibold">
                  Closing {s.name} stops new orders there. Anything already running has to be
                  finished first, and the record stays because your statements refer to it.
                </p>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why — so we know whether it is coming back"
                  className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
                />
                <button
                  type="button"
                  disabled={busy || !reason.trim()}
                  onClick={() =>
                    run(() => closeStore(s.id, reason), () => {
                      setClosing(null);
                      setReason('');
                    })
                  }
                  className="bg-danger rounded-lg px-3 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-40"
                >
                  {busy ? 'Closing…' : `Close ${s.name}`}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function EditStore({
  store,
  busy,
  onSave,
}: {
  store: StoreRow;
  busy: boolean;
  onSave: (name: string, address: string) => void;
}) {
  const [name, setName] = React.useState(store.name);
  const [address, setAddress] = React.useState(store.address_text ?? '');

  return (
    <div className="bg-bg mt-2 space-y-2 rounded-xl p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
      />
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
      />
      <p className="text-muted-light text-[0.75rem] font-semibold">
        Moving a store to a different place is a new one rather than an edit — the delivery
        area, and the riders who cover it, both change.
      </p>
      <button
        type="button"
        disabled={busy || !name.trim()}
        onClick={() => onSave(name, address)}
        className="bg-ink rounded-lg px-3 py-2 text-[0.8125rem] font-extrabold text-white disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
