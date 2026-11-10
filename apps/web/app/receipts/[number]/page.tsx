import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { PrintButton } from '@/components/legal/print-button';
import { Logo } from '@/components/logo';
import {
  RECEIPT_COLUMNS,
  RECEIPT_KIND_LABEL,
  receiptAmount,
  receiptDateTime,
  toReceipts,
} from '@/lib/receipts';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { number: string } }): Metadata {
  return { title: `Receipt ${params.number}`, robots: { index: false, follow: false } };
}

const NUMBER = /^(RCT|RFD)-\d{2}-\d{5}$/;

const PARTY_LABEL = {
  guest: 'Customer',
  merchant: 'Merchant',
  rider: 'Rider',
  host: 'Host',
} as const;

/**
 * One receipt, laid out to print on A4 and save as a PDF from the browser.
 * Row-level security decides who can open it: the person, merchant, rider or
 * host it belongs to, and NexG Finance. Anyone else gets a 404.
 */
export default async function ReceiptPage({ params }: { params: { number: string } }) {
  const number = decodeURIComponent(params.number).toUpperCase();
  if (!NUMBER.test(number)) notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/receipts/${number}`)}`);

  const { data } = await supabase
    .from('receipt' as never)
    .select(RECEIPT_COLUMNS)
    .eq('number', number)
    .maybeSingle();
  const [receipt] = toReceipts(data ? [data] : []);
  if (!receipt) notFound();

  const refund = receipt.kind === 'refund';

  return (
    <main className="bg-bg min-h-screen px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-[42rem]">
        <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
          <Link href="/" className="text-muted hover:text-ink text-[0.75rem] font-bold">
            ← NexG
          </Link>
          <PrintButton />
        </div>

        <article className="bg-surface border-border rounded-2xl border p-6 sm:p-8 print:rounded-none print:border-0">
          <header className="flex items-start justify-between gap-4">
            <div>
              <Logo className="h-14" />
              <p className="text-muted mt-2 text-[0.75rem] font-semibold">
                NexG Concierge · nexgapp.com · info@nexgapp.com
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-extrabold uppercase tracking-wide ${
                refund ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success'
              }`}
            >
              {refund ? 'Refunded' : receipt.kind === 'payout' ? 'Paid out' : 'Paid'}
            </span>
          </header>

          <div className="border-border mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2">
            <div>
              <p className="text-muted text-[0.625rem] font-extrabold uppercase tracking-wide">
                {RECEIPT_KIND_LABEL[receipt.kind]} receipt
              </p>
              <p className="text-ink mt-1 text-[1.125rem] font-extrabold">{receipt.number}</p>
              <p className="text-muted mt-0.5 text-[0.8125rem] font-semibold">
                {receiptDateTime(receipt.issued_at)}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-muted text-[0.625rem] font-extrabold uppercase tracking-wide">
                {PARTY_LABEL[receipt.party_type]}
              </p>
              {receipt.party_type === 'guest' && receipt.party_id === user.id && (
                <p className="text-ink mt-1 text-[0.875rem] font-bold">{user.email}</p>
              )}
            </div>
          </div>

          <h1 className="text-ink mt-6 text-[1rem] font-extrabold">{receipt.title}</h1>

          <table className="mt-3 w-full text-[0.875rem]">
            <tbody>
              {receipt.lines.map((line, index) => (
                <tr key={`${line.label}-${index}`} className="border-border border-b">
                  <td className="text-muted py-2 pr-4 font-semibold">{line.label}</td>
                  <td className="text-ink py-2 text-right font-semibold">
                    {line.amount_cents < 0 ? '−' : ''}
                    {receiptAmount(Math.abs(line.amount_cents), receipt.currency)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="text-ink pt-3 font-extrabold">
                  {refund
                    ? 'Refunded'
                    : receipt.kind === 'payout'
                      ? 'Paid to you'
                      : receipt.kind === 'earnings'
                        ? 'Your share'
                        : receipt.kind === 'deposit'
                          ? 'Received'
                          : 'Total paid'}
                </td>
                <td className="text-ink pt-3 text-right text-[1.125rem] font-extrabold">
                  {receiptAmount(receipt.total_cents, receipt.currency)}
                </td>
              </tr>
            </tbody>
          </table>

          {(receipt.method || receipt.method_ref) && (
            <p className="text-muted mt-5 text-[0.8125rem] font-semibold">
              {receipt.method ?? 'Payment'}
              {receipt.method_ref ? ` · ${receipt.method_ref}` : ''}
            </p>
          )}

          <footer className="border-border text-muted mt-8 border-t pt-4 text-[0.6875rem] font-semibold leading-relaxed">
            This receipt confirms money received or paid by NexG. It is not a tax invoice. Questions
            about it: nexgapp.com/help, quoting {receipt.number}.
          </footer>
        </article>
      </div>
    </main>
  );
}
