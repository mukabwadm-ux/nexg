'use client';

import { useLocation } from '@nexg/location';
import { getCaptchaToken } from '@nexg/ui';
import { Loader2, Lock, MapPin, Minus, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

import { kesFromCents, useCart } from './cart-provider';
import { type Method, methodOptions, PaymentMethods } from './payment-methods';
import { discoverMerchantHref } from '@/lib/discover-links';

interface Quote {
  ok: boolean;
  message?: string;
  subtotal_cents: number;
  /** Before promotions; equal to subtotal_cents when none apply. */
  list_subtotal_cents?: number;
  delivery_fee_cents: number;
  service_fee_cents: number;
  small_basket_fee_cents: number;
  cash_handling_cents: number;
  total_cents: number;
  located: boolean;
}

interface Placed {
  ok: boolean;
  message?: string;
  order_id: string;
  reference: string;
  pay_online: boolean;
}

/* The generated database types do not include these RPCs until they are regenerated. */
type LooseRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const field =
  'border-border bg-surface focus:border-gold w-full rounded-xl border px-3.5 py-2.5 text-sm font-semibold outline-none';

export function CheckoutForm({
  bankEnabled = false,
  mpesaReady = true,
}: {
  bankEnabled?: boolean;
  /** Whether M-Pesa prompts can be sent. */
  mpesaReady?: boolean;
} = {}) {
  const cart = useCart();
  const router = useRouter();
  const { place, openSheet } = useLocation();

  const options = React.useMemo(
    () => methodOptions({ mpesaReady, bankEnabled }),
    [mpesaReady, bankEnabled],
  );
  const [method, setMethod] = React.useState<Method>(
    () => options.find((o) => o.ready)?.value ?? 'mpesa_stk',
  );
  const [phone, setPhone] = React.useState('');
  const [name, setName] = React.useState('');
  const [note, setNote] = React.useState('');
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [quoting, setQuoting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /* One id per checkout attempt, so a retry on a weak connection returns the same order. */
  const requestId = React.useRef<string | null>(null);
  /* A laundry collects from the customer, at a time they choose (agreed 11 Nov 2026). */
  const [isLaundry, setIsLaundry] = React.useState(false);
  const [pickupAt, setPickupAt] = React.useState(() => {
    const t = new Date(Date.now() + 86_400_000);
    t.setHours(9, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T09:00`;
  });

  React.useEffect(() => {
    if (!cart.merchantId) return;
    let live = true;
    void createClient()
      .from('merchant_public')
      .select('category, category_key')
      .eq('id', cart.merchantId)
      .maybeSingle()
      .then(({ data }) => {
        const key =
          (data as { category_key?: string | null; category?: string | null } | null) ?? null;
        if (live)
          setIsLaundry(
            ['laundry', 'laundry_cleaning'].includes(key?.category_key ?? key?.category ?? ''),
          );
      });
    return () => {
      live = false;
    };
  }, [cart.merchantId]);

  const rpc = React.useCallback((): LooseRpc => {
    const supabase = createClient();
    return ((fn: string, args: Record<string, unknown>) =>
      Promise.resolve(supabase.rpc(fn as never, args as never))) as unknown as LooseRpc;
  }, []);

  const items = React.useMemo(
    () => cart.lines.map((l) => ({ catalogue_item_id: l.id, quantity: l.quantity })),
    [cart.lines],
  );

  const payload = React.useMemo(
    () => ({
      merchant_id: cart.merchantId,
      payment_method: method,
      items,
      lat: place?.lat ?? null,
      lng: place?.lng ?? null,
    }),
    [cart.merchantId, method, items, place?.lat, place?.lng],
  );

  React.useEffect(() => {
    if (!cart.ready || !cart.merchantId || items.length === 0) return;
    let cancelled = false;
    setQuoting(true);
    void rpc()('rpc_order_quote_web', { p_payload: payload }).then(({ data, error: err }) => {
      if (cancelled) return;
      setQuoting(false);
      if (err) {
        setQuote(null);
        setError(err.message);
        return;
      }
      setError(null);
      setQuote(data as Quote);
    });
    return () => {
      cancelled = true;
    };
  }, [cart.ready, cart.merchantId, items, payload, rpc]);

  if (!cart.ready) return <p className="text-muted mt-6 text-sm">Loading your cart…</p>;

  if (cart.lines.length === 0) {
    return (
      <div className="border-border bg-surface mt-6 rounded-2xl border p-8 text-center">
        {/* A payment that could not start empties the cart after the order is
            saved. Without this the guest saw only "empty" and lost the reference. */}
        {error && (
          <p role="alert" className="text-danger mb-4 text-sm font-bold">
            {error}
          </p>
        )}
        <p className="text-lg font-extrabold">Your cart is empty</p>
        <p className="text-muted mt-1 text-sm">Pick something from a merchant to get started.</p>
        <Link
          href="/discover"
          className="bg-gold text-ink mt-5 inline-block rounded-full px-5 py-2.5 text-sm font-extrabold"
        >
          Browse merchants
        </Link>
      </div>
    );
  }

  const place_order = async () => {
    setError(null);
    if (!place) {
      openSheet('menu');
      setError('Tell us where to deliver first.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 9) {
      setError('Add a phone number the rider can call.');
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      /* No account needed (owner, 18 and 20 Nov 2026): a visitor who is not signed in orders
         from a temporary session, the way the Consumer app does. The database allows a
         temporary session three unpaid orders at a time. */
      if (!user) {
        const captchaToken = await getCaptchaToken().catch(() => undefined);
        const { error: guestError } = await supabase.auth.signInAnonymously({
          options: { captchaToken },
        });
        if (guestError) {
          setError('We could not start your order. Refresh the page and try again, or sign in.');
          return;
        }
      }

      requestId.current ??= crypto.randomUUID();
      const placed = await rpc()('rpc_order_place_web', {
        p_payload: {
          ...payload,
          guest_phone: phone,
          guest_name: name || null,
          dropoff_label: place.label,
          dropoff_note: note || null,
          client_request_id: requestId.current,
        },
      });
      const result = placed.data as Placed | null;
      if (placed.error || !result?.ok) {
        const hint = (placed.error as { hint?: string } | null)?.hint;
        setError(
          hint === 'phone_on_file'
            ? 'That number belongs to a NexG account. Sign in to order with it, or use another number.'
            : (placed.error?.message ?? result?.message ?? 'Could not place the order.'),
        );
        return;
      }
      requestId.current = null;

      /* A laundry collects at the time chosen above. The order is saved either way: a time that
         cannot be set is shown, and the laundry can be messaged from the order page. */
      if (isLaundry && pickupAt) {
        const set = await rpc()('rpc_order_set_pickup_time', {
          p_order_id: result.order_id,
          p_at: new Date(pickupAt).toISOString(),
        });
        if (set.error) {
          setError(
            `Your order ${result.reference} is saved, but the collection time was not: ${set.error.message}`,
          );
        }
      }

      if (!result.pay_online) {
        cart.clear();
        router.push(`/pay/${result.reference}`);
        return;
      }

      if (method === 'mpesa_stk') {
        const stk = await fetch('/api/payments/mpesa/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderId: result.order_id, phone }),
        });
        const sent = (await stk.json()) as { ok: boolean; message?: string; reference?: string };
        if (!sent.ok) {
          cart.clear();
          /* The order and its payment are saved: the pay page shows where it
             stands and sends the prompt again, on the same payment. */
          if (sent.reference) {
            router.push(`/pay/${sent.reference}`);
            return;
          }
          setError(
            `Your order ${result.reference} is saved, but the M-Pesa prompt could not be sent. ${sent.message ?? ''}`,
          );
          return;
        }
        cart.clear();
        router.push(`/pay/${sent.reference ?? result.reference}`);
        return;
      }

      if (method === 'bank_transfer') {
        const started = await fetch('/api/payments/bank/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderId: result.order_id }),
        });
        const bank = (await started.json()) as {
          ok: boolean;
          message?: string;
          reference?: string;
          authorization_url?: string;
        };
        cart.clear();
        if (bank.ok && bank.authorization_url) {
          window.location.href = bank.authorization_url;
          return;
        }
        /* The order and its payment are saved: the pay page says where it
           stands and offers another way to pay. */
        router.push(`/pay/${bank.reference ?? result.reference}`);
        return;
      }

      /* Every online method is handled above. Should one ever reach here,
         the order is saved and the pay page offers a way to pay it. */
      cart.clear();
      router.push(`/pay/${result.reference}`);
    } catch {
      /* The connection dropped mid-way: the order may already be saved.
         Nothing is charged without the guest confirming on their phone or
         at their bank, so the safe advice is to look before ordering again. */
      setError(
        'The connection dropped. Your order may already be saved: check Your account → Orders before placing it again. Nothing is charged until you confirm the payment.',
      );
    } finally {
      setBusy(false);
    }
  };

  const itemCount = cart.lines.reduce((n, l) => n + l.quantity, 0);
  const totalLabel = quote?.ok ? kesFromCents(quote.total_cents) : null;
  const payLabel =
    method === 'cash_on_delivery'
      ? totalLabel
        ? `Place order · pay ${totalLabel} on delivery`
        : 'Place order'
      : totalLabel
        ? `Pay ${totalLabel}`
        : 'Pay and place order';

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
        <section className="border-border bg-surface rounded-2xl border p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-extrabold">{cart.merchantName}</h2>
            <Link
              href={discoverMerchantHref(cart.merchantId)}
              className="text-gold-text text-sm font-bold hover:underline"
            >
              Add more
            </Link>
          </div>
          <ul className="divide-border mt-3 divide-y">
            {cart.lines.map((line) => (
              <li key={line.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="truncate text-sm font-extrabold">{line.name}</p>
                  <p className="text-muted text-xs font-semibold">
                    KES {line.price_kes.toLocaleString('en-KE')} each
                  </p>
                </div>
                <div className="border-border flex items-center rounded-full border">
                  <button
                    type="button"
                    aria-label={`Remove one ${line.name}`}
                    onClick={() => cart.setQuantity(line.id, line.quantity - 1)}
                    className="flex h-8 w-8 items-center justify-center"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-6 text-center text-sm font-extrabold">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={`Add one more ${line.name}`}
                    onClick={() => cart.setQuantity(line.id, line.quantity + 1)}
                    className="flex h-8 w-8 items-center justify-center"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="ml-auto w-24 text-right text-sm font-extrabold">
                  KES {(line.price_kes * line.quantity).toLocaleString('en-KE')}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => cart.setQuantity(line.id, 0)}
                  className="text-muted hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-border bg-surface space-y-3 rounded-2xl border p-5">
          <h2 className="text-lg font-extrabold">Delivery</h2>
          <button
            type="button"
            onClick={() => openSheet('menu')}
            className="border-border hover:border-gold flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left"
          >
            <MapPin aria-hidden="true" className="text-gold-text h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">
              {place ? place.label : 'Choose where to deliver'}
            </span>
            <span className="text-gold-text text-xs font-extrabold">
              {place ? 'Change' : 'Set'}
            </span>
          </button>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className={field}
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
            <input
              className={field}
              placeholder="Phone, e.g. +254 7…"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
            />
          </div>
          <input
            className={field}
            placeholder="Room, gate or landmark (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {isLaundry && (
            <label className="block">
              <span className="text-sm font-extrabold">When should the laundry collect?</span>
              <input
                type="datetime-local"
                className={`${field} mt-1.5`}
                value={pickupAt}
                onChange={(e) => setPickupAt(e.target.value)}
              />
              <span className="text-muted mt-1 block text-xs font-semibold">
                From 30 minutes to 14 days ahead. The laundry weighs your items and confirms the
                final price.
              </span>
            </label>
          )}
        </section>

        <PaymentMethods
          options={options}
          value={method}
          onChange={setMethod}
          phone={phone}
          total={quote?.ok ? kesFromCents(quote.total_cents) : null}
          cashFee={
            quote?.ok && quote.cash_handling_cents > 0
              ? kesFromCents(quote.cash_handling_cents)
              : null
          }
        />
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="border-border bg-surface rounded-2xl border p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-extrabold">Summary</h2>
            <span className="text-muted text-xs font-bold">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
          </div>
          <dl className="mt-3 space-y-2 text-sm font-semibold">
            <Row
              label="Subtotal"
              value={kesFromCents(quote?.subtotal_cents ?? cart.subtotalKes * 100)}
            />
            {quote?.ok && (
              <>
                {(quote.list_subtotal_cents ?? 0) > quote.subtotal_cents && (
                  <Row
                    label="You saved (in subtotal)"
                    value={kesFromCents((quote.list_subtotal_cents ?? 0) - quote.subtotal_cents)}
                  />
                )}
                <Row label="Delivery" value={kesFromCents(quote.delivery_fee_cents)} />
                <Row label="Service fee" value={kesFromCents(quote.service_fee_cents)} />
                {quote.small_basket_fee_cents > 0 && (
                  <Row
                    label="Small basket fee"
                    value={kesFromCents(quote.small_basket_fee_cents)}
                  />
                )}
                {quote.cash_handling_cents > 0 && (
                  <Row label="Cash handling" value={kesFromCents(quote.cash_handling_cents)} />
                )}
              </>
            )}
          </dl>
          <div className="border-border mt-3 flex items-baseline justify-between border-t pt-3">
            <span className="font-extrabold">Total</span>
            <span className="text-xl font-extrabold">
              {quote?.ok ? kesFromCents(quote.total_cents) : '—'}
            </span>
          </div>

          {quote && !quote.located && (
            <p className="text-muted mt-2 text-xs font-semibold">
              Delivery is estimated until you set your address.
            </p>
          )}
          {quote && !quote.ok && (
            <p className="text-danger mt-2 text-xs font-bold">{quote.message}</p>
          )}
          {error && <p className="text-danger mt-2 text-xs font-bold">{error}</p>}

          <button
            type="button"
            disabled={busy || quoting || !quote?.ok}
            onClick={() => void place_order()}
            className="bg-gold text-ink hover:bg-gold/90 mt-4 flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-extrabold disabled:opacity-50"
          >
            {busy || quoting ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : method !== 'cash_on_delivery' ? (
              <Lock aria-hidden="true" className="h-4 w-4" />
            ) : null}
            {payLabel}
          </button>
          <p className="text-muted mt-3 flex flex-wrap items-center justify-center gap-x-1.5 text-[0.6875rem] font-semibold">
            <Lock aria-hidden="true" className="h-3 w-3" />
            Secure payments
            <span aria-hidden="true"> · </span>
            <Link href="/legal/terms" className="hover:text-ink underline underline-offset-2">
              Terms
            </Link>
            <span aria-hidden="true"> · </span>
            <Link href="/legal/privacy" className="hover:text-ink underline underline-offset-2">
              Privacy
            </Link>
          </p>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
