/**
 * Paying from the M-Pesa menu instead of the prompt. Shown only when the
 * shortcode is a Paybill and Safaricom reports Paybill payments to NexG, so
 * a payment made this way settles the order by itself.
 */
export function PaybillOption({
  paybill,
  orderReference,
  amountCents,
}: {
  paybill: string;
  orderReference: string;
  amountCents: number;
}) {
  const account = compactReference(orderReference);
  const amount = `KES ${Math.ceil(amountCents / 100).toLocaleString('en-KE')}`;
  const steps: [string, string][] = [
    ['Business number', paybill],
    ['Account number', account],
    ['Amount', amount],
  ];
  return (
    <section
      aria-labelledby="paybill-option"
      className="border-border bg-surface mt-5 rounded-2xl border p-4"
    >
      <h2 id="paybill-option" className="text-ink text-[0.9375rem] font-extrabold">
        No prompt? Pay from the M-Pesa menu
      </h2>
      <p className="text-muted mt-1 text-[0.8125rem] font-medium leading-relaxed">
        Lipa na M-Pesa, then Pay Bill. Use the account number exactly as shown; this page updates by
        itself once M-Pesa confirms.
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        {steps.map(([label, value]) => (
          <div key={label} className="bg-bg rounded-xl px-3 py-2">
            <dt className="text-muted text-[0.6875rem] font-bold uppercase tracking-[0.08em]">
              {label}
            </dt>
            <dd className="text-ink mt-0.5 font-mono text-[0.9375rem] font-extrabold tracking-wide">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** NX-251110-0042 → NX2511100042: what a customer types as the account number. */
export function compactReference(reference: string): string {
  return reference.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
