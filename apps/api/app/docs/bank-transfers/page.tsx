import Link from 'next/link';

export default function BankTransfersPage() {
  return (
    <article className="max-w-3xl space-y-8 text-ink/80">
      <header className="space-y-3">
        <h2 className="text-3xl font-extrabold text-ink">Bank and payment partner integration</h2>
        <p>
          This guide is for banks and payment providers exploring a technical
          connection with NexG. No provider has been selected, and there are no
          bank collection or payout routes or partner callbacks available yet.
        </p>
      </header>

      <section className="space-y-3">
        <h3 className="text-xl font-bold text-ink">Intended payment flows</h3>
        <ul className="list-disc space-y-2 pl-6">
          <li><strong>Collections:</strong> customers pay into NexG&apos;s platform account. Collections must be matched to a NexG order or payment reference.</li>
          <li><strong>Settlements:</strong> payouts are limited to merchant or rider balances included in a finance-approved settlement. NexG will not accept arbitrary recipient-and-amount payout instructions from API callers.</li>
          <li><strong>Provider onboarding:</strong> provider selection and live credentials are deferred. Any implementation begins in the provider&apos;s sandbox; no real transfer is authorized by this documentation.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-bold text-ink">Integration status</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink/20 text-ink">
                <th scope="col" className="py-2 pr-4 font-semibold">Capability</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Status</th>
                <th scope="col" className="py-2 font-semibold">What this means for partners</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-ink/10 align-top">
                <th scope="row" className="py-3 pr-4 font-medium text-ink">Bank collection</th>
                <td className="py-3 pr-4">Not implemented</td>
                <td className="py-3">No payment initiation endpoint or partner callback URL is published.</td>
              </tr>
              <tr className="border-b border-ink/10 align-top">
                <th scope="row" className="py-3 pr-4 font-medium text-ink">Settlement payout</th>
                <td className="py-3 pr-4">Not implemented</td>
                <td className="py-3">No transfer instruction endpoint exists. Finance approval, reconciliation, and provider execution controls are prerequisites.</td>
              </tr>
              <tr className="border-b border-ink/10 align-top">
                <th scope="row" className="py-3 pr-4 font-medium text-ink">Sandbox</th>
                <td className="py-3 pr-4">Not available yet</td>
                <td className="py-3">A sandbox adapter and transfer status flow must be built before partners can test against NexG.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-bold text-ink">Partner integration requirements</h3>
        <ul className="list-disc space-y-2 pl-6">
          <li>Agree the provider, supported rails, sandbox credentials, settlement timing, limits, and reconciliation format before building the adapter.</li>
          <li>Verify provider signatures before processing callbacks. Provider-confirmed events—not redirects or client claims—must decide payment status.</li>
          <li>Use idempotent requests and auditable asynchronous states, including pending, paid, failed, and reversed outcomes.</li>
          <li>Keep bank credentials and account details out of merchant-facing API responses. Payouts use NexG&apos;s verified beneficiary records and approved settlement lines.</li>
          <li>Production must remain disabled until a provider is approved and configured. Sandbox outcomes must never be represented as live transfers.</li>
        </ul>
      </section>

      <p className="border-t border-ink/10 pt-5 text-sm">
        NexG merchants looking to connect their own systems should start with the{' '}
        <Link href="/docs/merchants" className="underline underline-offset-4">merchant integration guide</Link>.
        No bank partner API or callback endpoint is available until it is published in the{' '}
        <Link href="/docs" className="underline underline-offset-4">API reference</Link>.
      </p>
    </article>
  );
}
