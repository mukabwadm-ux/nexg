'use client';

import { Button, Card, Input } from '@nexg/ui';
import { CalendarCheck, CalendarX, Clock, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  holdStay,
  quoteStay,
  releaseStayHold,
  stayCheckoutStatus,
  type CheckoutStatus,
  type StayQuote,
} from '@/app/(customer)/stays/[slug]/book/actions';
import { TrackEvent } from '@/components/analytics/google-analytics';
import { ChargedInKesNote, ChargedPrice, Price } from '@/components/currency/price';
import { stayPurchase } from '@/lib/analytics/stay-events';
import { createClient } from '@/lib/supabase/client';

interface UnitOption {
  id: string;
  name: string;
  maxGuests: number;
  nightlyKes: number;
  minNights: number;
}

type Step = 'dates' | 'pay' | 'waiting' | 'done' | 'expired';

/* What rpc_stay_checkout_status does not say about a cancelled stay, read from
   the guest's own row (row-level security gives them no one else's). */
interface Cancellation {
  confirmed_at: string | null;
  refunded_at: string | null;
  refund_amount_kes: number | null;
}

const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;

function addDays(day: string, n: number) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

function nightsBetween(a: string, b: string) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86_400_000);
}

function longDate(day: string) {
  return new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** What a guest is told about a cancelled stay that was booked, or paid for. */
function cancelledNotice(status: CheckoutStatus, cancellation: Cancellation) {
  const refunded = cancellation.refunded_at !== null;
  const reference = status.paymentReference ? ` (${status.paymentReference})` : '';

  /* Never booked: the payment came after the hold ran out and the dates had gone. */
  if (cancellation.confirmed_at === null && status.refundDue) {
    return {
      heading: 'Your payment arrived late',
      text:
        'Your hold ran out before the payment was confirmed, and the dates were taken in the ' +
        'meantime. Nothing is booked. ' +
        (refunded
          ? `Your payment${reference} has been refunded in full.`
          : `We have your payment${reference} and will refund it in full.`) +
        ' Write to us from the help page if you would like other dates instead.',
    };
  }

  const paid = status.paidKes ?? 0;
  const back = cancellation.refund_amount_kes ?? paid;
  const money = back < paid ? `${kes(back)} of the ${kes(paid)} you paid` : `Your ${kes(back)}`;
  const outcome = refunded
    ? `${money} has been refunded.`
    : status.refundDue
      ? `${money} is being refunded to the way you paid.`
      : cancellation.refund_amount_kes === 0
        ? 'No refund is due under the cancellation policy.'
        : 'Write to us from the help page about your payment.';
  return {
    heading: 'This stay is cancelled',
    text: cancellation.confirmed_at === null ? outcome : `NexG cancelled this stay. ${outcome}`,
  };
}

/** Nights at the same rate (and season) together, in date order. */
function priceLines(quote: StayQuote, baseKes: number) {
  const lines: { key: string; rateKes: number; nights: number; note: string }[] = [];
  for (const night of quote.perNight) {
    const note = night.season ?? (night.weekend && night.rateKes !== baseKes ? 'Fri & Sat' : '');
    const key = `${night.rateKes}|${note}`;
    const line = lines.find((l) => l.key === key);
    if (line) line.nights += 1;
    else lines.push({ key, rateKes: night.rateKes, nights: 1, note });
  }
  return lines;
}

/**
 * Dates, a hold, then M-Pesa. The price shown is the database's quote for
 * the dates (weekend rate, seasons, long-stay discount), the same total the
 * hold charges. A card page left unfinished (opened in the app) can be
 * continued here, on that same page.
 */
export function StayCheckout({
  slug,
  units,
  unitId,
  busy,
  today,
  signedIn,
  initial,
}: {
  slug: string;
  units: UnitOption[];
  unitId: string;
  busy: { start: string; end: string }[];
  today: string;
  signedIn: boolean;
  initial: { checkIn?: string; checkOut?: string; adults?: number; stayId?: string };
}) {
  const router = useRouter();
  const unit = units.find((u) => u.id === unitId) ?? units[0]!;
  const [checkIn, setCheckIn] = useState(initial.checkIn ?? addDays(today, 1));
  const [checkOut, setCheckOut] = useState(
    initial.checkOut ?? addDays(initial.checkIn ?? addDays(today, 1), Math.max(2, unit.minNights)),
  );
  const [adults, setAdults] = useState(Math.min(initial.adults ?? 2, unit.maxGuests));
  const [children, setChildren] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<Step>(initial.stayId ? 'waiting' : 'dates');
  const [stayId, setStayId] = useState(initial.stayId ?? '');
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [cancellation, setCancellation] = useState<Cancellation | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const nights = nightsBetween(checkIn, checkOut);
  const quoteKey = `${unit.id}|${checkIn}|${checkOut}`;
  const [quoted, setQuoted] = useState<{ key: string; quote: StayQuote | null } | null>(null);
  /* undefined: still asking; null: no server price (nights × rate stands in). */
  const quote = quoted?.key === quoteKey ? quoted.quote : undefined;
  const total = quote?.totalKes ?? (quote === null && nights > 0 ? nights * unit.nightlyKes : null);
  const lines = quote ? priceLines(quote, unit.nightlyKes) : [];
  const taken = useMemo(() => {
    if (nights <= 0) return false;
    for (let i = 0; i < nights; i += 1) {
      const night = addDays(checkIn, i);
      if (busy.some((b) => b.start <= night && night < b.end)) return true;
    }
    return false;
  }, [busy, checkIn, nights]);

  const problem =
    nights <= 0
      ? 'Check-out has to be after check-in.'
      : checkIn < today
        ? 'Check-in cannot be in the past.'
        : nights < unit.minNights
          ? `This unit takes stays of at least ${unit.minNights} nights.`
          : adults + children > unit.maxGuests
            ? `This unit sleeps up to ${unit.maxGuests}.`
            : taken
              ? 'Some of those nights are already booked. Try other dates.'
              : '';

  useEffect(() => {
    if (step !== 'dates' || nights <= 0 || nights > 90) return;
    let live = true;
    const timer = window.setTimeout(() => {
      quoteStay({ unitId: unit.id, checkIn, checkOut })
        .then((q) => {
          if (live) setQuoted({ key: quoteKey, quote: q });
        })
        .catch(() => {
          if (live) setQuoted({ key: quoteKey, quote: null });
        });
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [step, unit.id, checkIn, checkOut, nights, quoteKey]);

  const bookUrl = `/stays/${slug}/book?unit=${unit.id}&in=${checkIn}&out=${checkOut}&adults=${adults}`;

  /* Re-read where the checkout stands; used on load (?stay=) and while waiting. */
  const refresh = useCallback(async () => {
    if (!stayId) return;
    const next = await stayCheckoutStatus(stayId);
    if (!next) {
      setError('That booking could not be found on this account.');
      setStep('dates');
      return;
    }
    let cancelled: Cancellation | null = null;
    if (next.status === 'cancelled') {
      const { data } = await createClient()
        .from('stay')
        .select('confirmed_at, refunded_at, refund_amount_kes')
        .eq('id', stayId)
        .maybeSingle();
      /* Unread, nothing is claimed either way: the next check asks again. */
      if (!data) return;
      cancelled = data;
    }
    setCancellation(cancelled);
    setStatus(next);
    setExpiresAt(next.holdExpiresAt);
    if (next.status === 'booked') setStep('done');
    else if (cancelled) {
      /* Only a hold that ended with nothing booked or paid "ran out". */
      setStep(cancelled.confirmed_at || next.refundDue || next.paidKes ? 'done' : 'expired');
    } else if (next.status === 'expired') setStep('expired');
    else if (next.paymentState === 'failed') {
      setError(
        next.paymentFailure
          ? `The payment did not go through: ${next.paymentFailure}`
          : 'The payment did not go through. Try again.',
      );
      setStep('pay');
    } else if (next.status === 'held' && next.lastTry) setStep('waiting');
    else if (next.status === 'held' && next.paymentStatus === 'failed') {
      setError('The payment did not go through. Try again.');
      setStep('pay');
    } else if (next.status === 'held' && next.paymentState !== 'authorised') setStep('pay');
  }, [stayId]);

  useEffect(() => {
    if (initial.stayId) void refresh();
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step !== 'waiting') return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [step, refresh]);

  useEffect(() => {
    if (step !== 'pay' && step !== 'waiting') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  const secondsLeft = expiresAt ? Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000)) : 0;
  useEffect(() => {
    if (step === 'pay' && expiresAt && secondsLeft === 0) setStep('expired');
  }, [step, expiresAt, secondsLeft]);

  /* After the hold: keep reading until the database has closed it and no
     payment is still being checked. */
  const paymentOpen = status?.paymentStatus === 'pending' || status?.paymentState === 'authorised';
  const afterHold = status !== null && status.status !== 'held';
  useEffect(() => {
    if (step !== 'expired' || !stayId || (afterHold && !paymentOpen)) return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [step, stayId, afterHold, paymentOpen, refresh]);

  async function hold() {
    setError('');
    setBusyAction(true);
    const result = await holdStay({
      unitId: unit.id,
      checkIn,
      checkOut,
      adults,
      children,
      firstName,
    });
    setBusyAction(false);
    if (!result.ok || !result.stayId) {
      setError(result.message);
      return;
    }
    setStayId(result.stayId);
    setExpiresAt(result.expiresAt ?? null);
    setStep('pay');
    router.replace(`/stays/${slug}/book?unit=${unit.id}&stay=${result.stayId}`, { scroll: false });
  }

  async function pay() {
    setError('');
    setBusyAction(true);
    try {
      /* The same payment code as the apps (lib/booking/native-stay-checkout). */
      const response = await fetch(
        `/api/customer/checkout/stays/${encodeURIComponent(stayId)}/payment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'mpesa_stk', phone }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        title?: string;
        expiresAt?: string;
      };
      if (!response.ok) {
        setError(body.title ?? 'The M-Pesa prompt could not be sent. Try again.');
        return;
      }
      if (body.expiresAt) setExpiresAt(body.expiresAt);
      setStep('waiting');
    } catch {
      setError('The M-Pesa prompt could not be sent. Check your connection and try again.');
    } finally {
      setBusyAction(false);
    }
  }

  /* Back to the card page already open: the database hands back that same page,
     so there is nothing new to pay twice. */
  async function continueCard() {
    setError('');
    setBusyAction(true);
    try {
      const response = await fetch(
        `/api/customer/checkout/stays/${encodeURIComponent(stayId)}/payment`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'card' }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { title?: string; url?: string };
      if (response.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      if (!response.ok) setError(body.title ?? 'The payment page could not be opened. Try again.');
      await refresh();
    } catch {
      setError('The payment page could not be opened. Check your connection and try again.');
    } finally {
      setBusyAction(false);
    }
  }

  async function release() {
    if (stayId) await releaseStayHold(stayId);
    setStayId('');
    setStatus(null);
    setStep('dates');
    router.replace(bookUrl, { scroll: false });
  }

  const summary = (
    <div className="border-border mt-5 space-y-1.5 border-t pt-4 text-[0.8125rem] font-semibold">
      <p className="flex justify-between">
        <span className="text-muted">
          {status
            ? `${longDate(status.checkIn)} → ${longDate(status.checkOut)}`
            : `${longDate(checkIn)} → ${longDate(checkOut)}`}
        </span>
      </p>
      {status ? (
        <p className="flex justify-between">
          <span className="text-muted">
            {status.nights} night{status.nights === 1 ? '' : 's'}
          </span>
          <ChargedPrice kes={status.totalKes ?? 0} className="font-extrabold" />
        </p>
      ) : quote && (lines.length > 1 || quote.discountKes > 0) ? (
        <>
          {lines.map((line) => (
            <p key={line.key} className="flex justify-between gap-3">
              <span className="text-muted">
                <Price kes={line.rateKes} /> × {line.nights} night{line.nights === 1 ? '' : 's'}
                {line.note ? ` · ${line.note}` : ''}
              </span>
              <Price kes={line.rateKes * line.nights} />
            </p>
          ))}
          {quote.discountKes > 0 && (
            <p className="flex justify-between gap-3">
              <span className="text-muted">
                {quote.nights >= 28 ? 'Monthly' : 'Weekly'} stay discount ({quote.discountPct}%)
              </span>
              <span>
                − <Price kes={quote.discountKes} />
              </span>
            </p>
          )}
          <p className="flex justify-between">
            <span className="text-muted">Total</span>
            <ChargedPrice kes={quote.totalKes} className="font-extrabold" />
          </p>
        </>
      ) : (
        <p className="flex justify-between">
          <span className="text-muted">
            <Price kes={lines[0]?.rateKes ?? unit.nightlyKes} /> × {nights} night
            {nights === 1 ? '' : 's'}
          </span>
          {total == null ? (
            <span className="text-muted">Working out the price…</span>
          ) : (
            <ChargedPrice kes={total} className="font-extrabold" />
          )}
        </p>
      )}
      <ChargedInKesNote className="text-muted text-xs" />
    </div>
  );

  if (step === 'done' && status && cancellation) {
    const notice = cancelledNotice(status, cancellation);
    return (
      <Card className="p-6">
        <CalendarX aria-hidden="true" className="text-muted h-8 w-8" />
        <h2 className="mt-3 text-[1.25rem] font-extrabold">{notice.heading}</h2>
        <p className="text-muted mt-2 text-[0.875rem] font-semibold leading-[1.7]">{notice.text}</p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/stays">Back to stays</Link>
        </Button>
      </Card>
    );
  }

  if (step === 'done') {
    return (
      <Card className="p-6">
        {status?.status === 'booked' && (
          <TrackEvent
            once={`purchase_${status.paymentReference ?? stayId}`}
            event={stayPurchase({
              reference: status.paymentReference ?? stayId,
              slug,
              property: status.property,
              unit: status.unit,
              nights: status.nights,
              paidKes: status.paidKes ?? status.totalKes ?? 0,
            })}
          />
        )}
        <CalendarCheck aria-hidden="true" className="text-success h-8 w-8" />
        <h2 className="mt-3 text-[1.25rem] font-extrabold">You are booked</h2>
        <p className="text-muted mt-2 text-[0.875rem] font-semibold leading-[1.7]">
          {status?.property} · {status?.unit}. Paid {kes(status?.paidKes ?? status?.totalKes ?? 0)}
          {status?.paymentReference ? `, reference ${status.paymentReference}` : ''}. A confirmation
          is on its way to your email, and your host will send the address and how to get in before
          you arrive.
        </p>
        {status && summary}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/account?tab=receipts">See your receipt</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/stays">Back to stays</Link>
          </Button>
        </div>
      </Card>
    );
  }

  /* A payment still being checked: nothing is claimed either way, and the
     guest is not asked to pay again. */
  if (step === 'expired' && paymentOpen) {
    return (
      <Card className="p-6">
        <Clock aria-hidden="true" className="text-muted h-8 w-8" />
        <h2 className="mt-3 text-[1.25rem] font-extrabold">We are checking your payment</h2>
        <p className="text-muted mt-2 text-[0.875rem] font-semibold leading-[1.7]">
          Your hold ran out before the payment was confirmed. If money left your account, do not pay
          again: write to us from the help page.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => void refresh()}>Check again</Button>
          <Button asChild variant="outline">
            <Link href="/stays">Back to stays</Link>
          </Button>
        </div>
      </Card>
    );
  }

  if (step === 'expired') {
    /* Said only when the database, after the hold, shows no payment was tried.
       Otherwise money may have left the account, or may still arrive. */
    const nothingCharged = afterHold && !status?.paymentState && status?.paymentStatus === 'unpaid';
    return (
      <Card className="p-6">
        <Clock aria-hidden="true" className="text-muted h-8 w-8" />
        <h2 className="mt-3 text-[1.25rem] font-extrabold">Your hold ran out</h2>
        <p className="text-muted mt-2 text-[0.875rem] font-semibold leading-[1.7]">
          {nothingCharged ? 'Nothing was charged. ' : ''}
          The dates may still be free: choose them again to hold them for another 15 minutes.
          {nothingCharged
            ? ''
            : ' If money left your account, do not pay again: write to us from the help page.'}
        </p>
        <Button className="mt-5" onClick={() => void release()}>
          Choose dates again
        </Button>
      </Card>
    );
  }

  if (step === 'pay' || step === 'waiting') {
    const cardUnfinished = step === 'waiting' && status?.lastTry === 'not_completed';
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = String(secondsLeft % 60).padStart(2, '0');
    return (
      <Card className="p-6">
        <p className="text-muted inline-flex items-center gap-1.5 text-[0.75rem] font-bold">
          <Clock aria-hidden="true" className="h-3.5 w-3.5" />
          {expiresAt ? `Held for you for ${minutes}:${seconds}` : 'Held for you'}
        </p>
        <h2 className="mt-2 text-[1.25rem] font-extrabold">
          {cardUnfinished ? 'Payment not completed' : 'Pay with M-Pesa'}
        </h2>
        {summary}

        {cardUnfinished ? (
          <div className="bg-surface-muted mt-5 rounded-xl p-4" role="status" aria-live="polite">
            <p className="text-muted text-[0.8125rem] font-semibold leading-[1.7]">
              The card payment was not finished. Continue on the same payment page while your dates
              are held. If you have just paid, wait a moment: this page updates by itself.
            </p>
            {error && (
              <p role="alert" className="text-danger mt-3 text-[0.8125rem] font-semibold">
                {error}
              </p>
            )}
            <Button
              type="button"
              className="mt-4 w-full"
              disabled={busyAction}
              onClick={() => void continueCard()}
            >
              {busyAction ? 'Opening the payment page…' : 'Continue payment'}
            </Button>
            {/* M-Pesa takes up to KES 150,000 a payment. The card page stays
                open at Paystack, so the guest is told not to finish both. */}
            {(status?.totalKes ?? total ?? 0) <= 150000 && (
              <button
                type="button"
                className="text-muted hover:text-ink mt-3 w-full text-center text-[0.75rem] font-bold underline"
                disabled={busyAction}
                onClick={() => {
                  setError('');
                  setStep('pay');
                }}
              >
                Pay with M-Pesa instead
              </button>
            )}
            <button
              type="button"
              className="text-muted hover:text-ink mt-2 w-full text-center text-[0.75rem] font-bold underline"
              disabled={busyAction}
              onClick={() => void release()}
            >
              Change dates
            </button>
          </div>
        ) : step === 'waiting' ? (
          <div className="bg-surface-muted mt-5 rounded-xl p-4" role="status" aria-live="polite">
            <p className="inline-flex items-center gap-2 text-[0.9375rem] font-extrabold">
              <Smartphone aria-hidden="true" className="h-4 w-4" />
              Check your phone
            </p>
            <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">
              Enter your M-Pesa PIN on the prompt. This page updates by itself once the payment goes
              through.
            </p>
            <button
              type="button"
              className="text-muted hover:text-ink mt-3 text-[0.75rem] font-bold underline"
              onClick={() => setStep('pay')}
            >
              No prompt? Send it again
            </button>
          </div>
        ) : (
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              void pay();
            }}
          >
            <Input
              id="mpesa-phone"
              label="M-Pesa number"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0712 345 678"
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            {status?.lastTry === 'not_completed' && (
              <p className="text-muted mt-3 text-[0.75rem] font-semibold leading-[1.6]">
                If the card payment page is still open, close it without paying, so you are not
                charged twice.
              </p>
            )}
            {error && (
              <p role="alert" className="text-danger mt-3 text-[0.8125rem] font-semibold">
                {error}
              </p>
            )}
            <Button type="submit" className="mt-4 w-full" disabled={busyAction}>
              {busyAction ? 'Sending the prompt…' : `Pay ${kes(status?.totalKes ?? total ?? 0)}`}
            </Button>
            <button
              type="button"
              className="text-muted hover:text-ink mt-3 w-full text-center text-[0.75rem] font-bold underline"
              onClick={() => void release()}
            >
              Change dates
            </button>
          </form>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) void hold();
        }}
      >
        {units.length > 1 && (
          <label className="block">
            <span className="text-[0.8125rem] font-bold">Unit</span>
            <select
              className="border-border mt-1.5 block w-full rounded-lg border bg-white px-3 py-2 text-[0.875rem]"
              value={unit.id}
              onChange={(event) =>
                router.push(
                  `/stays/${slug}/book?unit=${event.target.value}&in=${checkIn}&out=${checkOut}&adults=${adults}`,
                )
              }
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {kes(u.nightlyKes)} a night · sleeps {u.maxGuests}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="stay-check-in"
            label="Check in"
            type="date"
            min={today}
            required
            value={checkIn}
            onChange={(event) => {
              const value = event.target.value;
              setCheckIn(value);
              if (value && checkOut <= value)
                setCheckOut(addDays(value, Math.max(1, unit.minNights)));
            }}
          />
          <Input
            id="stay-check-out"
            label="Check out"
            type="date"
            min={addDays(checkIn, 1)}
            required
            value={checkOut}
            onChange={(event) => setCheckOut(event.target.value)}
          />
          <Input
            id="stay-adults"
            label="Adults"
            type="number"
            min={1}
            max={unit.maxGuests}
            required
            value={adults}
            onChange={(event) => setAdults(Number(event.target.value) || 1)}
          />
          <Input
            id="stay-children"
            label="Children"
            type="number"
            min={0}
            max={unit.maxGuests}
            value={children}
            onChange={(event) => setChildren(Number(event.target.value) || 0)}
          />
        </div>

        {signedIn && (
          <Input
            id="stay-first-name"
            label="Your first name"
            hint="So your host knows who is arriving."
            maxLength={80}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        )}

        {summary}

        {(problem || error) && (
          <p role="alert" className="text-danger text-[0.8125rem] font-semibold">
            {problem || error}
          </p>
        )}

        {signedIn ? (
          <Button type="submit" className="w-full" disabled={Boolean(problem) || busyAction}>
            {busyAction ? 'Holding your dates…' : 'Hold these dates and pay'}
          </Button>
        ) : (
          <Button asChild className="w-full">
            <Link href={`/sign-in?tab=sign-in&role=guest&next=${encodeURIComponent(bookUrl)}`}>
              Sign in to book
            </Link>
          </Button>
        )}
        <p className="text-muted-light text-center text-[0.6875rem] font-semibold">
          {signedIn
            ? 'Your dates are held for 15 minutes while you pay. Nothing is charged until you enter your M-Pesa PIN.'
            : 'Sign in or create an account with your email, then come straight back here.'}
        </p>
      </form>
    </Card>
  );
}
