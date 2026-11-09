'use client';

import { Button, Card, Input } from '@nexg/ui';
import { CalendarCheck, Clock, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  holdStay,
  releaseStayHold,
  stayCheckoutStatus,
  type CheckoutStatus,
} from '@/app/(customer)/stays/[slug]/book/actions';

interface UnitOption {
  id: string;
  name: string;
  maxGuests: number;
  nightlyKes: number;
  minNights: number;
}

type Step = 'dates' | 'pay' | 'waiting' | 'done' | 'expired';

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

/**
 * Dates, a hold, then M-Pesa. The price shown is worked out here only as a
 * preview; what the guest pays is the total the database put on the hold.
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
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const nights = nightsBetween(checkIn, checkOut);
  const total = nights > 0 ? nights * unit.nightlyKes : 0;
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
    setStatus(next);
    setExpiresAt(next.holdExpiresAt);
    if (next.status === 'booked') setStep('done');
    else if (next.status === 'expired' || (next.status === 'cancelled' && !next.refundDue))
      setStep('expired');
    else if (next.refundDue) setStep('done');
    else if (next.paymentState === 'failed') {
      setError(
        next.paymentFailure
          ? `The payment did not go through: ${next.paymentFailure}`
          : 'The payment did not go through. Try again.',
      );
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
      const response = await fetch('/api/payments/mpesa/stay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stayId, phone }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        message?: string;
        expiresAt?: string;
      };
      if (!body.ok) {
        setError(body.message ?? 'The M-Pesa prompt could not be sent. Try again.');
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
      <p className="flex justify-between">
        <span className="text-muted">
          {kes(unit.nightlyKes)} × {status?.nights ?? nights} night
          {(status?.nights ?? nights) === 1 ? '' : 's'}
        </span>
        <span className="font-extrabold">{kes(status?.totalKes ?? total)}</span>
      </p>
    </div>
  );

  if (step === 'done') {
    return (
      <Card className="p-6">
        <CalendarCheck aria-hidden="true" className="text-success h-8 w-8" />
        {status?.refundDue ? (
          <>
            <h2 className="mt-3 text-[1.25rem] font-extrabold">Your payment arrived late</h2>
            <p className="text-muted mt-2 text-[0.875rem] font-semibold leading-[1.7]">
              Your hold ran out before M-Pesa confirmed the payment, and the dates were taken in the
              meantime. Nothing is booked. We have your payment
              {status.paymentReference ? ` (${status.paymentReference})` : ''} and will refund it in
              full. Write to us from the help page if you would like other dates instead.
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-3 text-[1.25rem] font-extrabold">You are booked</h2>
            <p className="text-muted mt-2 text-[0.875rem] font-semibold leading-[1.7]">
              {status?.property} · {status?.unit}. Paid{' '}
              {kes(status?.paidKes ?? status?.totalKes ?? 0)} by M-Pesa
              {status?.paymentReference ? `, reference ${status.paymentReference}` : ''}. A
              confirmation is on its way to your email, and your host will send the address and how
              to get in before you arrive.
            </p>
          </>
        )}
        {status && !status.refundDue && summary}
        <Button asChild className="mt-6" variant="outline">
          <Link href="/stays">Back to stays</Link>
        </Button>
      </Card>
    );
  }

  if (step === 'expired') {
    return (
      <Card className="p-6">
        <Clock aria-hidden="true" className="text-muted h-8 w-8" />
        <h2 className="mt-3 text-[1.25rem] font-extrabold">Your hold ran out</h2>
        <p className="text-muted mt-2 text-[0.875rem] font-semibold leading-[1.7]">
          Nothing was charged. The dates may still be free: choose them again to hold them for
          another 15 minutes.
        </p>
        <Button className="mt-5" onClick={() => void release()}>
          Choose dates again
        </Button>
      </Card>
    );
  }

  if (step === 'pay' || step === 'waiting') {
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = String(secondsLeft % 60).padStart(2, '0');
    return (
      <Card className="p-6">
        <p className="text-muted inline-flex items-center gap-1.5 text-[0.75rem] font-bold">
          <Clock aria-hidden="true" className="h-3.5 w-3.5" />
          {expiresAt ? `Held for you for ${minutes}:${seconds}` : 'Held for you'}
        </p>
        <h2 className="mt-2 text-[1.25rem] font-extrabold">Pay with M-Pesa</h2>
        {summary}

        {step === 'waiting' ? (
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
            {error && (
              <p role="alert" className="text-danger mt-3 text-[0.8125rem] font-semibold">
                {error}
              </p>
            )}
            <Button type="submit" className="mt-4 w-full" disabled={busyAction}>
              {busyAction ? 'Sending the prompt…' : `Pay ${kes(status?.totalKes ?? total)}`}
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
