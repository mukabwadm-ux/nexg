'use client';

import { Button } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createManualOrder, type Outcome } from '@/app/orders/actions';

import { kes } from './shared';

interface Line {
  name: string;
  quantity: number;
  unit: string;
}

/**
 * + Manual order — the desk taking one on the phone.
 *
 * The same refusals as checkout, because an order taken by phone
 * that could not have been placed on the web is one nobody can
 * price, deliver or explain. The consent tick is not decoration:
 * it is what makes holding this guest's number lawful, and the
 * RPC refuses without it.
 */
export function ManualOrder({
  cityId,
  merchants,
}: {
  cityId: string;
  merchants: { id: string; trading_name: string | null; legal_name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<Outcome | null>(null);

  const [phone, setPhone] = React.useState('');
  const [name, setName] = React.useState('');
  const [consent, setConsent] = React.useState(false);
  const [merchant, setMerchant] = React.useState('');
  const [branch, setBranch] = React.useState('');
  const [branches, setBranches] = React.useState<{ id: string; name: string }[]>([]);
  const [dropoff, setDropoff] = React.useState('');
  const [note, setNote] = React.useState('');
  const [payment, setPayment] = React.useState('cash_on_delivery');
  const [lines, setLines] = React.useState<Line[]>([{ name: '', quantity: 1, unit: '' }]);

  React.useEffect(() => {
    if (!merchant) {
      setBranches([]);
      setBranch('');
      return;
    }
    let alive = true;
    fetch(`/api/branches?merchant=${merchant}`)
      .then((r) => (r.ok ? r.json() : { branches: [] }))
      .then((j) => {
        if (!alive) return;
        setBranches(j.branches ?? []);
        setBranch(j.branches?.[0]?.id ?? '');
      })
      .catch(() => alive && setBranches([]));
    return () => {
      alive = false;
    };
  }, [merchant]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const subtotal = lines.reduce(
    (t, l) => t + l.quantity * Math.round(Number(l.unit || 0) * 100),
    0,
  );

  async function submit() {
    setBusy(true);
    setSaid(null);
    const r = await createManualOrder({
      city_id: cityId,
      merchant_id: merchant,
      branch_id: branch,
      guest_phone: phone,
      guest_name: name || undefined,
      consent_read: consent,
      dropoff_label: dropoff,
      dropoff_note: note || undefined,
      payment_method: payment,
      items: lines
        .filter((l) => l.name.trim() && Number(l.unit) > 0)
        .map((l) => ({
          name: l.name,
          quantity: l.quantity,
          unit_price_cents: Math.round(Number(l.unit) * 100),
        })),
    });
    setSaid(r);
    setBusy(false);
    if (r.ok) {
      setOpen(false);
      router.refresh();
    }
  }

  /*
   * A dialog rather than something unfolding inside the header.
   * The desk fills this while somebody is on the phone, so it needs
   * the whole of their attention and none of the page reflowing
   * underneath it.
   */
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-gold text-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold"
      >
        + Manual order
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Taking an order on the phone"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
        >
          {/* The backdrop is a real button, so dismissing by clicking
              away is also reachable by keyboard rather than being a
              mouse-only affordance. Escape closes it too. */}
          <button
            type="button"
            aria-label="Close without taking the order"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default"
          />
          <div className="bg-surface border-border relative w-full max-w-lg space-y-2 rounded-xl border p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <p className="text-[0.875rem] font-extrabold">Taking an order on the phone</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-light text-[0.75rem] font-extrabold"
              >
                Close
              </button>
            </div>

            {said && !said.ok && (
              <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.75rem] font-bold">
                {said.message}
              </p>
            )}

            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Guest number · +2547…"
              className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name, if they give one"
              className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
            />

            <label className="flex items-start gap-2 text-[0.75rem] font-semibold">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I read the consent line aloud: “We keep your number to deliver this order and tell
                you about it. You can ask us to delete it afterwards.”
              </span>
            </label>

            <select
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
            >
              <option value="">Which merchant</option>
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.trading_name ?? m.legal_name}
                </option>
              ))}
            </select>

            {branches.length > 0 && (
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}

            <div className="space-y-1.5">
              {lines.map((l, idx) => (
                <div key={idx} className="flex gap-1.5">
                  <input
                    value={l.name}
                    onChange={(e) =>
                      setLines(
                        lines.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    placeholder="Item"
                    className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
                  />
                  <input
                    type="number"
                    min={1}
                    value={l.quantity}
                    onChange={(e) =>
                      setLines(
                        lines.map((x, i) =>
                          i === idx ? { ...x, quantity: Math.max(1, Number(e.target.value)) } : x,
                        ),
                      )
                    }
                    className="border-border-strong w-14 shrink-0 rounded-lg border px-2 py-2 text-right text-[0.8125rem] font-bold tabular-nums"
                  />
                  <input
                    type="number"
                    min={0}
                    value={l.unit}
                    onChange={(e) =>
                      setLines(
                        lines.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)),
                      )
                    }
                    placeholder="KES"
                    className="border-border-strong w-24 shrink-0 rounded-lg border px-2 py-2 text-right text-[0.8125rem] font-bold tabular-nums"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLines([...lines, { name: '', quantity: 1, unit: '' }])}
                className="text-[0.6875rem] font-extrabold underline underline-offset-4"
              >
                + another item
              </button>
            </div>

            <input
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
              placeholder="Where it goes · hotel and room, or the address"
              className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the rider needs to know"
              className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
            />

            <select
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
              className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
            >
              <option value="cash_on_delivery">Pay on delivery</option>
              <option value="mpesa_stk">M-Pesa</option>
              <option value="charge_to_room">Charge to room</option>
              <option value="on_account">On account</option>
            </select>

            <p className="text-muted text-[0.75rem] font-semibold">
              Items come to {kes(subtotal)}. Fees are added by the city&apos;s rate card when the
              order is created — if one is unpublished, this refuses rather than guessing.
            </p>

            <Button onClick={submit} disabled={busy || !phone || !consent || !merchant || !branch}>
              {busy ? 'Taking it…' : 'Take this order'}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
