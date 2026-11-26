/**
 * What the Stay refunds tab reads about paid stays, and how it words it.
 * No directive: the server tab and the client list both use it.
 */

/** A row of rpc_stay_paid_bookings (not in the generated types yet). */
export interface PaidBookingRow {
  stay_id: string;
  property: string | null;
  unit: string | null;
  host: string | null;
  guest_first_name: string | null;
  check_in: string;
  check_out: string;
  status: 'booked' | 'in_stay';
  paid_kes: number;
  provider: string | null;
  is_test: boolean | null;
  paid_at: string | null;
}

/** Null when the answer is not a list, so the tab can say it did not load. */
export function toPaidBookings(data: unknown): PaidBookingRow[] | null {
  if (!Array.isArray(data)) return null;
  return data.filter((row): row is PaidBookingRow => {
    const r = row as Partial<PaidBookingRow> | null;
    return (
      typeof r?.stay_id === 'string' &&
      typeof r.check_in === 'string' &&
      typeof r.check_out === 'string' &&
      typeof r.paid_kes === 'number'
    );
  });
}

/** How a stay was paid. Test or live is only said of Paystack. */
export function paidVia(
  provider: string | null | undefined,
  isTest: boolean | null | undefined,
): string {
  if (provider === 'paystack') return isTest ? 'Paystack (test)' : 'Paystack (live)';
  if (provider === 'mpesa') return 'M-Pesa';
  if (provider?.startsWith('bank')) return 'Bank';
  if (!provider || provider === 'unassigned') return 'Method not recorded';
  return provider;
}

export function shortDate(day: string) {
  return new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
