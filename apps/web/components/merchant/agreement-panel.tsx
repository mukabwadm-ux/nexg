'use client';

import { getCategoryById } from '@nexg/contracts';
import { MerchantAgreementDetails } from '@nexg/contracts/merchant-agreements';
import { Download, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  AgreementDetailsFields,
  detailsFormFrom,
  useAgreementDetailsForm,
  withRepresentative,
  type AgreementDetailsRecord,
} from '@/components/merchant/agreement-details';
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

/** One entry of rpc_merchant_agreement_signed_list. */
export interface SignedAgreementCopy {
  id: string;
  title: string;
  version: string;
  reference: string;
  signed_at: string;
  pages: number;
  bytes: number;
  current: boolean;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-KE', { dateStyle: 'long', timeZone: 'Africa/Nairobi' });

const downloadHref = (merchantId: string, copy: SignedAgreementCopy) =>
  `/merchant/documents/agreement?merchant=${encodeURIComponent(merchantId)}&copy=${encodeURIComponent(copy.id)}`;

/*
 * The details the agreement is filled in with, editable by the owner until
 * NexG signs with them.
 */
function DetailsEditor({
  merchantId,
  record,
}: {
  merchantId: string;
  record: AgreementDetailsRecord;
}) {
  const router = useRouter();
  const form = useAgreementDetailsForm(detailsFormFrom(record));
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    const parsed = MerchantAgreementDetails.safeParse(
      withRepresentative(form.value, form.sameAsSignatory),
    );
    if (!parsed.success) {
      setMessage({ ok: false, text: parsed.error.issues[0]?.message ?? 'Check your details.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().rpc('rpc_merchant_agreement_details_save', {
      p_merchant_id: merchantId,
      p_details: parsed.data,
    });
    setBusy(false);
    if (error) {
      setMessage({
        ok: false,
        text: error.message || 'Your details could not be saved. Please retry.',
      });
      return;
    }
    setMessage({ ok: true, text: 'Saved. NexG fills these into your agreement when it signs it.' });
    router.refresh();
  }

  return (
    <div className="border-border rounded-xl border p-3" data-agreement-details>
      <p className="text-ink text-[0.8125rem] font-extrabold">Your details for the agreement</p>
      <p className="text-muted mt-1 text-xs font-semibold leading-[1.6]">
        NexG fills these into your merchant agreement and signs it. Once it is signed they cannot be
        changed here.
      </p>
      <div className="mt-3">
        <AgreementDetailsFields
          idPrefix="documents-agreement"
          value={form.value}
          onChange={(value) => {
            form.setValue(value);
            setMessage(null);
          }}
          sameAsSignatory={form.sameAsSignatory}
          onSameAsSignatoryChange={form.setSameAsSignatory}
          disabled={busy}
        />
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="bg-gold text-ink mt-3 rounded-lg px-3 py-2 text-[0.75rem] font-extrabold disabled:opacity-40"
      >
        {busy ? 'Saving…' : record.saved ? 'Save changes' : 'Save details'}
      </button>
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={`mt-2 text-[0.75rem] font-bold ${message.ok ? 'text-success' : 'text-danger'}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
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
  details = null,
  signed = null,
}: {
  merchantId: string;
  status: AgreementStatus | null;
  /** Null where the database does not hold agreement details yet. */
  details?: AgreementDetailsRecord | null;
  signed?: SignedAgreementCopy[] | null;
}) {
  const current = signed?.find((copy) => copy.current) ?? null;
  const earlier = signed?.filter((copy) => !copy.current) ?? [];
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
          {/* The details come first: they are what NexG fills the agreement in with. */}
          {details && !details.locked ? (
            <DetailsEditor merchantId={merchantId} record={details} />
          ) : null}
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
          {current ? (
            <div className="bg-success-bg rounded-lg px-3 py-2.5">
              <p className="text-success text-[0.8125rem] font-bold">
                Signed by NexG on {day(current.signed_at)}. Reference {current.reference}.
              </p>
              <a
                href={downloadHref(merchantId, current)}
                className="text-ink mt-2 inline-flex items-center gap-2 text-[0.8125rem] font-extrabold underline underline-offset-2"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download your signed agreement (PDF, {current.pages} pages)
              </a>
            </div>
          ) : null}
          {status.accepted && status.accepted_at ? (
            <p className="bg-success-bg text-success rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
              Accepted on {when(status.accepted_at)}.
              {current
                ? null
                : details
                  ? ' NexG signs it with the details above when your business is approved; if it already is, NexG’s team signs it once you save them.'
                  : null}
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
          {earlier.length ? (
            <div>
              <p className="text-muted text-[0.75rem] font-bold">Earlier signed agreements</p>
              <ul className="mt-1 space-y-1">
                {earlier.map((copy) => (
                  <li key={copy.id} className="text-[0.8125rem] font-semibold">
                    <a
                      href={downloadHref(merchantId, copy)}
                      className="text-ink underline underline-offset-2"
                    >
                      {copy.title}, version {copy.version}, signed {day(copy.signed_at)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
