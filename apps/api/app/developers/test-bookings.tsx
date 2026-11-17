'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@nexg/ui';
import { FlaskConical } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import type { DeveloperMerchant } from '@/lib/merchants';
import { consoleMoves, MOVE_LABELS, type TestBooking, type TestBookingList } from '@/lib/sandbox';

import { makeTestBooking, moveTestBooking, type TestBookingResult } from './sandbox-actions';

export interface BookableService {
  code: string;
  label: string;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const kes = (cents: number) => `KES ${(cents / 100).toLocaleString('en-KE')}`;

/**
 * Test bookings for the merchants this person owns: make a sample booking,
 * then move it on with a button, and watch the events arrive at a test
 * webhook endpoint. The buttons follow the order a real booking goes
 * through; the API also lets a booking skip ahead.
 */
export function TestBookings({
  merchants,
  services,
  initial,
  testEndpoint,
}: {
  merchants: DeveloperMerchant[];
  services: BookableService[];
  initial: TestBookingList;
  /** Whether any of the person's merchants has a test endpoint switched on. */
  testEndpoint: boolean;
}) {
  const owned = merchants.filter((m) => m.role === 'owner');
  const [pending, startTransition] = useTransition();
  const [bookings, setBookings] = useState<TestBooking[]>(initial.ok ? initial.bookings : []);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial.ok) setBookings(initial.bookings);
  }, [initial]);

  const serviceLabel = (code: string) =>
    services.find((s) => s.code === code)?.label ?? code.replace(/_/g, ' ');

  function run(action: () => Promise<TestBookingResult>) {
    startTransition(async () => {
      setError(null);
      setNotice(null);
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBookings(result.bookings);
      setNotice(result.message);
    });
  }

  function make(formData: FormData) {
    run(() =>
      makeTestBooking(
        String(formData.get('merchant_id') ?? ''),
        String(formData.get('service') ?? ''),
      ),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5" aria-hidden="true" />
          Test bookings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-ink/70 text-sm">
          Make a test booking, then move it through its statuses. NexG sends{' '}
          <span className="font-mono text-xs">booking.created</span>, then{' '}
          <span className="font-mono text-xs">booking.status_changed</span> at every move, to your
          test webhook endpoints. Nothing is dispatched or charged.{' '}
          <Link href="/docs/environments#moving-test-bookings" className="underline">
            How test bookings work
          </Link>
          .
        </p>

        {!initial.ok ? (
          <p className="text-ink/70 text-sm">
            Test bookings are not available right now. Try again later.
          </p>
        ) : owned.length === 0 ? (
          <p className="text-ink/70 text-sm">
            Test bookings are for merchants you own. Ask the merchant&apos;s owner to try them.
          </p>
        ) : (
          <>
            {!testEndpoint && (
              <p className="text-ink/70 text-sm">
                No test endpoint is switched on, so these events have nowhere to go yet. Add one
                under Webhooks and choose Test.
              </p>
            )}

            <form action={make} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <label htmlFor="test_booking_merchant" className="text-sm font-medium">
                  Merchant
                </label>
                <select
                  id="test_booking_merchant"
                  name="merchant_id"
                  className="w-full rounded border px-3 py-2 text-sm"
                  defaultValue={owned[0]?.id}
                >
                  {owned.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.tradingName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="test_booking_service" className="text-sm font-medium">
                  Service
                </label>
                <select
                  id="test_booking_service"
                  name="service"
                  className="w-full rounded border px-3 py-2 text-sm"
                  defaultValue={services[0]?.code}
                >
                  {services.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={pending || services.length === 0}>
                {pending ? 'Working...' : 'Make a test booking'}
              </Button>
            </form>

            {bookings.length > 0 && (
              <ul className="space-y-3">
                {bookings.map((b) => {
                  const moves = consoleMoves(b.next);
                  return (
                    <li key={b.id} className="border-border rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="font-mono text-xs">{b.reference}</span>
                        <span className="rounded-full border px-2 py-0.5 text-xs font-semibold">
                          {(b.status ?? b.stage).replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-ink/60 mt-1 text-xs">
                        {[
                          b.merchantName,
                          serviceLabel(b.service),
                          kes(b.totalCents),
                          when(b.createdAt),
                        ].join(' · ')}
                      </p>
                      {moves.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {moves.map((status) => (
                            <Button
                              key={status}
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => moveTestBooking(b.id, status))}
                            >
                              {MOVE_LABELS[status]}
                            </Button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {notice && <p className="text-ink/80 text-sm">{notice}</p>}
        {error && (
          <p
            role="alert"
            className="text-danger border-danger/40 bg-danger/5 rounded border px-3 py-2 text-sm font-semibold"
          >
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
