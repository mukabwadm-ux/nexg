import type { Metadata } from 'next';

import { CheckoutForm } from '@/components/cart/checkout-form';
import { SiteHeader } from '@/components/site-header';
import { offers } from '@/lib/payment-methods';

export const metadata: Metadata = { title: 'Checkout' };

export default function CheckoutPage() {
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
