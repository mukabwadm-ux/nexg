'use client';

import { getCategoryById } from '@nexg/contracts';
import { FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Panel } from '@/components/partner/bits';
import { NEW_TAB } from '@/lib/legal-documents';
import { createClient } from '@/lib/supabase/client';

/** What rpc_merchant_agreement_status returns. */
export interface AgreementStatus {
  category: string | null;
  interim: boolean;
  agreement: { id: string; title: string; version: string; path: string } | null;
  accepted: boolean;
  accepted_at: string | null;
  latest: { title: string | null; version: string; category: string; accepted_at: string } | null;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  });

/**
 * The merchant agreement on the Documents page: the one that applies to the
 * business's category, its version and when it was accepted. A merchant who
 * has not accepted the current one (an earlier applicant, a category change,
 * or a revised agreement) can read and accept it here.
 */
export function AgreementPanel({
  merchantId,
  status,
}: {
  merchantId: string;
  status: AgreementStatus | null;
}) {
  const router = useRouter();
  const [ticked, setTicked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const agreement = status?.agreement;
  const categoryName = status?.category ? getCategoryById(status.category)?.name : undefined;

  async function accept() {
    if (!agreement) return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await createClient().rpc('rpc_merchant_agreement_accept', {
      p_merchant_id: merchantId,
      p_agreement_id: agreement.id,
      p_version: agreement.version,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message || 'Your acceptance could not be saved. Please retry.');
      return;
    }
    router.refresh();
  }

  return (
    <Panel title="Merchant agreement" note={categoryName}>
      {!status || !agreement ? (
        <p className="text-muted text-[0.8125rem] font-semibold">
          Choose your business category to see the NexG Merchant Agreement that applies to you.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-ink flex items-center gap-2 text-[0.9375rem] font-extrabold">
            <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
            NexG Merchant Agreement – {agreement.title}
          </p>
          <p className="text-muted text-[0.8125rem] font-semibold leading-[1.6]">
            Version {agreement.version}
            {status.interim && categoryName
              ? `. Used for ${categoryName} until a dedicated agreement is published`
              : ''}
            .{' '}
            <a
              href={agreement.path}
              {...NEW_TAB}
              className="text-ink font-bold underline underline-offset-2"
            >
              Read the agreement (PDF)
            </a>
          </p>
          {status.accepted && status.accepted_at ? (
            <p className="bg-success-bg text-success rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
              Accepted on {when(status.accepted_at)}.
            </p>
          ) : (
            <div className="border-gold/40 bg-gold/5 rounded-xl border p-3">
              <p className="text-ink text-[0.8125rem] font-bold">
                {status.latest
                  ? `You accepted ${status.latest.title ? `the ${status.latest.title} agreement` : 'an earlier agreement'} (version ${status.latest.version}) on ${when(status.latest.accepted_at)}. Your category or the agreement has changed since, so please accept the current one.`
                  : 'You have not accepted the merchant agreement for your category yet.'}
              </p>
              <label className="mt-3 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={ticked}
                  onChange={(event) => setTicked(event.target.checked)}
                  className="accent-gold mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="text-ink text-[0.8125rem] font-semibold">
                  I have read and agree to the NexG Merchant Agreement for{' '}
                  {categoryName ?? agreement.title}.
                </span>
              </label>
              <button
                type="button"
                disabled={!ticked || busy}
                onClick={() => void accept()}
                className="bg-gold text-ink mt-3 rounded-lg px-3 py-2 text-[0.75rem] font-extrabold disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Accept agreement'}
              </button>
              {error ? (
                <p role="alert" className="text-danger mt-2 text-[0.75rem] font-bold">
                  {error}
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
