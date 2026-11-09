import { getCategoryById } from '@nexg/contracts';

import { createClient } from '@/lib/supabase/server';

type AgreementStatus = {
  category: string | null;
  interim: boolean;
  agreement: { id: string; title: string; version: string; path: string } | null;
  accepted: boolean;
  accepted_at: string | null;
  latest: { title: string | null; version: string; category: string; accepted_at: string } | null;
};

const SITE =
  process.env.NEXT_PUBLIC_WEB_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexgapp.com';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  });

/**
 * Which NexG Merchant Agreement the applicant accepted, for the reviewer:
 * the agreement for the application's category, its version, and when it
 * was accepted. Read through rpc_merchant_agreement_status, which only merchant
 * staff (and the merchant's own members) may call.
 */
export async function ApplicationAgreement({ merchantId }: { merchantId: string }) {
  const { data, error } = await createClient().rpc('rpc_merchant_agreement_status', {
    p_merchant_id: merchantId,
  });
  const status = data as unknown as AgreementStatus | null;
  return (
    <section
      aria-labelledby="application-agreement"
      className="border-border bg-surface mt-4 rounded-2xl border p-5"
    >
      <h2 id="application-agreement" className="text-[0.9375rem] font-extrabold">
        Merchant agreement
      </h2>
      {error || !status ? (
        <p className="text-muted mt-2 text-sm font-semibold">
          The agreement record could not be read.
        </p>
      ) : !status.agreement ? (
        <p className="text-muted mt-2 text-sm font-semibold">No category chosen yet.</p>
      ) : (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted font-semibold">Category</dt>
          <dd className="font-bold">
            {getCategoryById(status.category ?? '')?.name ?? status.category}
            {status.interim ? ' (interim agreement)' : ''}
          </dd>
          <dt className="text-muted font-semibold">Agreement</dt>
          <dd className="font-bold">
            <a
              href={`${SITE}${status.agreement.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              NexG Merchant Agreement – {status.agreement.title}
            </a>
          </dd>
          <dt className="text-muted font-semibold">Current version</dt>
          <dd className="font-mono text-[0.8125rem]">{status.agreement.version}</dd>
          <dt className="text-muted font-semibold">Accepted</dt>
          <dd className={status.accepted ? 'text-success font-bold' : 'text-danger font-bold'}>
            {status.accepted && status.accepted_at
              ? when(status.accepted_at)
              : 'Not accepted for the current category and version'}
          </dd>
          {!status.accepted && status.latest ? (
            <>
              <dt className="text-muted font-semibold">Last accepted</dt>
              <dd className="font-semibold">
                {status.latest.title ?? 'Agreement'} ({status.latest.version}),{' '}
                {when(status.latest.accepted_at)}
              </dd>
            </>
          ) : null}
        </dl>
      )}
    </section>
  );
}
