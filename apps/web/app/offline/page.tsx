import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'No connection' };

/**
 * What the service worker serves when the network is gone.
 *
 * Deliberately plain and deliberately honest: it says what we
 * cannot do rather than offering a cached page that might be
 * telling somebody a shop is open when it closed an hour ago.
 */
export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight">You are offline</h1>
      <p className="text-muted mt-2 text-sm font-semibold leading-[1.7]">
        We are not showing you a saved copy of the page, because what is open, what a delivery
        costs and where your rider is all change by the minute — and a stale answer is worse than
        none.
      </p>
      <p className="text-muted-light mt-4 text-[0.8125rem] font-semibold">
        If an order is already on its way it is still on its way. We will reach you on WhatsApp.
      </p>
    </main>
  );
}
