import { NextResponse } from 'next/server';

/**
 * Safaricom asks this before completing a Paybill payment, but only on
 * shortcodes where it has switched external validation on. Every payment
 * is accepted: refusing one because the account number looks wrong would
 * turn away a customer whose money Finance can still match by hand.
 */
export async function POST() {
  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
