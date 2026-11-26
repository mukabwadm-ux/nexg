import { dpaSigningContext } from '@/lib/merchant-dpa-signing';
import { createClient } from '@/lib/supabase/server';

import { IssueDpaButton } from './issue-dpa-button';

const day = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  });

interface Acceptance {
  id: string;
  version: string;
  current: boolean;
  accepted_at: string;
  account_email: string | null;
  reference: string;
  storage_path: string | null;
  sha256: string | null;
  pages: number | null;
  copy_stored_at: string | null;
  ip: string | null;
  device_label: string | null;
  details: {
    legal_name?: string;
    signatory_name?: string;
    signatory_title?: string;
    annex?: {
      sensitive_data?: string;
      dpo_name?: string;
      dpo_email?: string;
      dpo_phone?: string;
      odpc_registration?: string | null;
    };
  } | null;
}

interface DpaRecord {
  version: { version: string } | null;
  accepted: boolean;
  acceptances: Acceptance[];
}

const href = (merchantId: string, copy: Acceptance) =>
  `/merchants/${encodeURIComponent(merchantId)}/dpa?copy=${encodeURIComponent(copy.id)}`;

/**
 * The merchant's Data Processing Agreement for staff (20270327000100): the
 * acceptance of the current version with who, when, the address and device
 * it came from, its Annex 1 answers and the signed copy to download, or that
 * it is not accepted yet.
 */
export async function MerchantDpaAccepted({ merchantId }: { merchantId: string }) {
  const client = createClient();
  const { data, error } = await client.rpc('rpc_merchant_dpa_read', {
    p_merchant_id: merchantId,
  });
  // Until 20270327000100 runs the function does not exist: show nothing.
  if (error?.code === 'PGRST202') return null;
  const record = (data as unknown as DpaRecord | null) ?? null;
  const current = record?.acceptances.find((entry) => entry.current) ?? null;
  const earlier = record?.acceptances.filter((entry) => !entry.current) ?? [];
  const signing =
    current && !current.storage_path ? (await dpaSigningContext(client, merchantId)).context : null;
  return (
    <section
      aria-labelledby="merchant-dpa"
      className="border-border bg-surface mt-4 rounded-2xl border p-5"
    >
      <h2 id="merchant-dpa" className="text-[0.9375rem] font-extrabold">
        Data processing agreement
      </h2>
      {error || !record ? (
        <p className="text-muted mt-2 text-sm font-semibold">
          The DPA record could not be read{error ? `: ${error.message}` : '.'}
        </p>
      ) : !current ? (
        <div className="bg-warning-bg mt-3 rounded-xl px-4 py-3 text-sm">
          <p className="text-warning font-bold">Not accepted yet</p>
          <p className="text-ink mt-1 text-[0.8125rem] font-semibold">
            The owner accepts version {record.version?.version ?? '—'} from Business › Documents.
            Going live waits for it.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <div className="bg-success-bg rounded-xl px-4 py-3">
            <p className="text-success font-bold">
              Accepted {day(current.accepted_at)} · {current.reference}
            </p>
            <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
              Version {current.version}
              {current.pages ? ` · ${current.pages} pages` : ''}
              {current.sha256 ? (
                <>
                  {' '}
                  · SHA-256{' '}
                  <span className="font-mono text-[0.75rem]">{current.sha256.slice(0, 16)}…</span>
                </>
              ) : null}
            </p>
            {current.storage_path ? (
              <>
                <p className="text-success mt-1 text-[0.8125rem] font-bold">
                  Signed by NexG{current.copy_stored_at ? ` ${day(current.copy_stored_at)}` : ''}
                </p>
                <a
                  href={href(merchantId, current)}
                  className="text-ink mt-2 inline-flex min-h-11 items-center font-extrabold underline underline-offset-2"
                >
                  Download signed DPA (PDF)
                </a>
              </>
            ) : signing?.missing.length ? (
              <div className="mt-2">
                <p className="text-warning text-[0.8125rem] font-bold">Not signed by NexG yet</p>
                <ul className="text-ink mt-1 list-disc space-y-1 pl-5 text-[0.8125rem] font-semibold">
                  {signing.missing.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-ink text-[0.8125rem] font-bold">
                  Ready to sign with NexG’s signatory and signature.
                </p>
                <IssueDpaButton merchantId={merchantId} />
              </div>
            )}
          </div>
          <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted font-semibold">Accepted by</dt>
            <dd className="font-semibold">
              {current.details?.signatory_name ?? '—'}
              {current.details?.signatory_title ? `, ${current.details.signatory_title}` : ''}
              {current.account_email ? ` · ${current.account_email}` : ''}
            </dd>
            <dt className="text-muted font-semibold">From</dt>
            <dd className="font-semibold">
              {[current.ip, current.device_label].filter(Boolean).join(' · ') || 'Not recorded'}
            </dd>
            <dt className="text-muted font-semibold">Sensitive data</dt>
            <dd className="font-semibold">{current.details?.annex?.sensitive_data ?? '—'}</dd>
            <dt className="text-muted font-semibold">Compliance contact</dt>
            <dd className="font-semibold">
              {[
                current.details?.annex?.dpo_name,
                current.details?.annex?.dpo_email,
                current.details?.annex?.dpo_phone,
              ]
                .filter(Boolean)
                .join(', ') || '—'}
            </dd>
            <dt className="text-muted font-semibold">Data Commissioner no.</dt>
            <dd className="font-semibold">
              {current.details?.annex?.odpc_registration ?? 'Not applicable'}
            </dd>
          </dl>
        </div>
      )}
      {earlier.length ? (
        <div className="mt-3">
          <p className="text-muted text-[0.75rem] font-bold">Earlier versions accepted</p>
          <ul className="mt-1 space-y-1 text-[0.8125rem] font-semibold">
            {earlier.map((copy) => (
              <li key={copy.id}>
                {copy.storage_path ? (
                  <a href={href(merchantId, copy)} className="underline underline-offset-2">
                    Version {copy.version}, {day(copy.accepted_at)}
                  </a>
                ) : (
                  `Version ${copy.version}, ${day(copy.accepted_at)}`
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
