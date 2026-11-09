'use client';

import { Download, ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { RECEIPT_KIND_LABEL, receiptAmount, receiptDate, type Receipt } from '@/lib/receipts';

const FILTERS = ['All', 'Payment', 'Payout', 'Earnings', 'Deposit', 'Refund'] as const;

/**
 * The list every finance area shares. Each row opens the printable receipt,
 * which the browser saves as a PDF.
 */
export function ReceiptList({
  receipts,
  empty = 'No receipts yet. One appears here each time money moves.',
}: {
  receipts: Receipt[] | null;
  empty?: string;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');

  if (receipts === null) {
    return (
      <p role="alert" className="text-danger text-sm font-semibold">
        Receipts could not be loaded. Refresh the page to try again.
      </p>
    );
  }

  const kinds = new Set(receipts.map((receipt) => RECEIPT_KIND_LABEL[receipt.kind]));
  const filters = FILTERS.filter((option) => option === 'All' || kinds.has(option));
  const visible = receipts.filter(
    (receipt) => filter === 'All' || RECEIPT_KIND_LABEL[receipt.kind] === filter,
  );

  return (
    <div>
      {filters.length > 2 && (
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter receipts">
          {filters.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition-colors ${
                filter === option
                  ? 'bg-ink text-white'
                  : 'border-border-strong bg-surface text-ink hover:border-ink border'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="border-border text-muted flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center text-sm font-semibold">
          <ReceiptText aria-hidden="true" className="h-6 w-6" />
          {empty}
        </div>
      ) : (
        <ul className="border-border divide-border bg-surface divide-y overflow-hidden rounded-xl border">
          {visible.map((receipt) => (
            <li key={receipt.id}>
              <Link
                href={`/receipts/${receipt.number}`}
                className="hover:bg-bg flex items-center justify-between gap-4 px-4 py-3 transition-colors"
              >
                <span className="min-w-0">
                  <span className="text-ink block text-[0.8125rem] font-extrabold">
                    {receipt.number}
                    <span className="text-muted ml-2 rounded-full border border-current px-1.5 py-px text-[0.625rem] font-bold uppercase tracking-wide">
                      {RECEIPT_KIND_LABEL[receipt.kind]}
                    </span>
                  </span>
                  <span className="text-muted mt-0.5 block truncate text-[0.75rem] font-semibold">
                    {receipt.title} · {receiptDate(receipt.issued_at)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="text-ink block text-[0.875rem] font-extrabold">
                    {receipt.kind === 'refund' ? '−' : ''}
                    {receiptAmount(receipt.total_cents, receipt.currency)}
                  </span>
                  <span className="text-muted inline-flex items-center gap-1 text-[0.6875rem] font-bold">
                    <Download aria-hidden="true" className="h-3 w-3" /> View or save
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
