'use client';

import {
  INTERIM,
  agreementForCategory,
  merchantAgreementHref,
} from '@nexg/contracts/merchant-agreements';
import { getCategoryById } from '@nexg/contracts';
import type { MerchantAgreementDetailsInput } from '@nexg/contracts/merchant-agreements';
import { FileText } from 'lucide-react';

import { AgreementDetailsFields } from '@/components/merchant/agreement-details';
import { NEW_TAB } from '@/lib/legal-documents';

/** The details the signed agreement is filled in with, when the database takes them. */
export interface AgreementDetailsControl {
  value: MerchantAgreementDetailsInput;
  onChange: (value: MerchantAgreementDetailsInput) => void;
  sameAsSignatory: boolean;
  onSameAsSignatoryChange: (same: boolean) => void;
  error?: string | null;
}

/**
 * The merchant agreement for the category the applicant picked, with the
 * "I have read and agree" box that submission requires. The agreement opens
 * in a new tab so the application stays where it was. Above the box, the
 * details NexG fills the agreement in with before signing it on approval.
 */
export function AgreementConsent({
  categoryId,
  checked,
  onChange,
  error,
  details,
}: {
  categoryId: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
  details?: AgreementDetailsControl | null;
}) {
  const agreement = agreementForCategory(categoryId);
  const categoryName = getCategoryById(categoryId)?.name;
  if (!agreement || !categoryName)
    return (
      <p className="mo-help" style={{ marginTop: 12 }}>
        Choose your business category to see the NexG Merchant Agreement that applies to you.
      </p>
    );
  return (
    <div
      className="border-border bg-surface mt-4 rounded-xl border p-4"
      data-merchant-agreement={agreement.id}
    >
      <p className="text-ink flex items-center gap-2 text-sm font-extrabold">
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        NexG Merchant Agreement – {agreement.title}
      </p>
      <p className="text-muted mt-1 text-xs font-semibold leading-[1.6]">
        The agreement for {categoryName}
        {INTERIM.has(categoryId)
          ? `, used until a dedicated ${categoryName} agreement is published`
          : ''}
        . Version {agreement.version}.{' '}
        <a
          href={merchantAgreementHref(agreement)}
          {...NEW_TAB}
          className="text-ink font-bold underline underline-offset-2"
        >
          Read the agreement (PDF)
        </a>
      </p>
      {details ? (
        <div className="border-border mt-4 border-t pt-4" data-agreement-details>
          <p className="text-ink text-sm font-extrabold">Your details for the agreement</p>
          <p className="text-muted mt-1 text-xs font-semibold leading-[1.6]">
            NexG fills these into your agreement and signs it when your application is approved.
            Your signed copy is then in Business › Documents.
          </p>
          <div className="mt-3">
            <AgreementDetailsFields
              idPrefix="application-agreement"
              value={details.value}
              onChange={details.onChange}
              sameAsSignatory={details.sameAsSignatory}
              onSameAsSignatoryChange={details.onSameAsSignatoryChange}
            />
          </div>
          {details.error ? (
            <p role="alert" className="text-danger mt-2 text-xs font-bold">
              {details.error}
            </p>
          ) : null}
        </div>
      ) : null}
      <label className="mt-3 flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={Boolean(error)}
          className="accent-gold mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="text-ink text-sm font-semibold leading-[1.6]">
          I have read and agree to the NexG Merchant Agreement for {categoryName}.
        </span>
      </label>
      {error ? (
        <p role="alert" className="text-danger mt-2 text-xs font-bold">
          {error}
        </p>
      ) : null}
    </div>
  );
}
