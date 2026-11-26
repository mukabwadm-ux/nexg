import type { Metadata } from 'next';

import { CheckoutForm } from '@/components/cart/checkout-form';
import { SiteHeader } from '@/components/site-header';
import { offers } from '@/lib/payment-methods';
import { loadPaystackKeys } from '@/lib/paystack-keys';

export const metadata: Metadata = { title: 'Checkout' };

/* What can be paid with is read on each visit, never fixed at build time. */
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  await loadPaystackKeys();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Your cart</h1>
        <CheckoutForm bankEnabled={offers('bank_transfer')} mpesaReady={offers('mpesa_stk')} />
      </main>
    </>
  );
}
