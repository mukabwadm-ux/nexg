'use client';

import { Card } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { saveAgreementSigner, type SignerOutcome } from '@/app/settings/signing-actions';

/** What rpc_merchant_agreement_signer_read returns. */
export interface SignerRecord {
  can_edit: boolean;
  versions: number;
  signed_with_current: number;
  current: {
    id: string;
    signatory_name: string;
    signatory_title: string;
    representative_name: string;
    representative_title: string;
    po_box: string;
    registered_office: string;
    email: string;
    phone: string;
    website: string;
    in_room_commission_pct: number;
    signature_sha256: string;
    created_at: string;
    created_by_name: string | null;
  } | null;
}

const input =
  'border-border bg-bg text-ink focus:border-ink mt-1.5 w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none disabled:opacity-60';

function Field({
  name,
  label,
  value,
  hint,
  disabled,
  type = 'text',
  wide = false,
}: {
  name: string;
  label: string;
  value: string;
  hint?: string;
  disabled: boolean;
  type?: string;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-ink text-[0.8125rem] font-bold">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={value}
        disabled={disabled}
        required
        step={type === 'number' ? '0.01' : undefined}
        min={type === 'number' ? 0 : undefined}
        max={type === 'number' ? 100 : undefined}
        className={input}
      />
      {hint ? (
        <span className="text-muted-light mt-1 block text-[0.75rem] font-semibold">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * Settings › Agreement signing: who signs merchant agreements for NexG,
 * the signature applied, and the letterhead every signed agreement carries.
 * A super admin edits; legal can look. Each save is a new version, and the
 * agreements already signed keep the version they were signed with.
 */
export function SigningTab({
  record,
  signatureUrl,
  error,
}: {
  record: SignerRecord | null;
  signatureUrl: string | null;
  error: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState<SignerOutcome | null>(null);
  if (!record)
    return (
      <Card className="p-5">
        <p className="text-muted text-sm font-semibold">
          {error ?? 'Only a super admin or legal can see NexG’s signing details.'}
        </p>
      </Card>
    );
  const current = record.current;
  const readOnly = !record.can_edit || pending;
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await saveAgreementSigner(form);
          setOutcome(result);
          if (result.ok) router.refresh();
        });
      }}
    >
      <Card className="p-5">
        <h2 className="text-[0.9375rem] font-extrabold">Signature</h2>
        <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.6]">
          Applied to every merchant agreement NexG signs when a merchant is approved. Kept in
          private storage; each change is in the audit log for review.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-6">
          <div className="border-border bg-bg flex h-28 w-64 items-center justify-center rounded-xl border">
            {signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a short-lived private link
              <img
                src={signatureUrl}
                alt="NexG's current signature"
                className="max-h-24 max-w-60"
              />
            ) : (
              <span className="text-muted-light text-[0.8125rem] font-semibold">
                No signature yet
              </span>
            )}
          </div>
          {record.can_edit ? (
            <label className="block">
              <span className="text-ink text-[0.8125rem] font-bold">
                {current ? 'Replace the signature' : 'Upload the signature'}
              </span>
              <input
                name="signature"
                type="file"
                accept="image/png,image/jpeg"
                required={!current}
                disabled={readOnly}
                className="mt-1.5 block text-[0.8125rem]"
              />
              <span className="text-muted-light mt-1 block text-[0.75rem] font-semibold">
                PNG with a transparent background works best. At most 2 MB.
              </span>
            </label>
          ) : null}
        </div>
        {current ? (
          <p className="text-muted-light mt-3 text-[0.75rem] font-semibold">
            Version {record.versions}, saved{' '}
            {new Date(current.created_at).toLocaleString('en-KE', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Africa/Nairobi',
            })}
            {current.created_by_name ? ` by ${current.created_by_name}` : ''} · SHA-256{' '}
            <span className="font-mono">{current.signature_sha256.slice(0, 16)}…</span> ·{' '}
            {record.signed_with_current} agreement
            {record.signed_with_current === 1 ? '' : 's'} signed with it
          </p>
        ) : null}
      </Card>

      <Card className="p-5">
        <h2 className="text-[0.9375rem] font-extrabold">Signatory and disputes</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            name="signatory_name"
            label="Signs for NexG"
            value={current?.signatory_name ?? ''}
            disabled={readOnly}
          />
          <Field
            name="signatory_title"
            label="Title"
            value={current?.signatory_title ?? 'CEO and Executive Director'}
            disabled={readOnly}
          />
          <Field
            name="representative_name"
            label="Representative for disputes (Stage 1)"
            value={current?.representative_name ?? ''}
            disabled={readOnly}
          />
          <Field
            name="representative_title"
            label="Their title"
            value={current?.representative_title ?? ''}
            disabled={readOnly}
          />
          <Field
            name="in_room_commission_pct"
            label="Property Partner in-room commission (%)"
            value={current ? String(current.in_room_commission_pct) : ''}
            type="number"
            hint="Annex A: the rate on orders placed through a Property Partner, split per its agreement."
            disabled={readOnly}
          />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-[0.9375rem] font-extrabold">Letterhead and notices</h2>
        <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
          Printed on every signed agreement, and NexG’s address for notices in Annex C.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            name="registered_office"
            label="Registered office"
            value={current?.registered_office ?? ''}
            disabled={readOnly}
            wide
          />
          <Field
            name="po_box"
            label="P.O. Box"
            value={current?.po_box ?? ''}
            hint="Box number and postal code, e.g. 12345-00100. Printed as P.O. Box …, Nairobi, Kenya."
            disabled={readOnly}
          />
          <Field name="phone" label="Phone" value={current?.phone ?? ''} disabled={readOnly} />
          <Field
            name="email"
            label="Email for notices"
            value={current?.email ?? ''}
            type="email"
            disabled={readOnly}
          />
          <Field
            name="website"
            label="Website"
            value={current?.website ?? ''}
            disabled={readOnly}
          />
        </div>
      </Card>

      {record.can_edit ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="bg-ink text-bg inline-flex min-h-11 items-center rounded-lg px-5 text-sm font-bold disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save signing details'}
          </button>
          {outcome ? (
            <p
              role={outcome.ok ? 'status' : 'alert'}
              className={`text-[0.8125rem] font-bold ${outcome.ok ? 'text-success' : 'text-danger'}`}
            >
              {outcome.message}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-muted text-[0.8125rem] font-semibold">
          Only a super admin can change these.
        </p>
      )}
    </form>
  );
}
