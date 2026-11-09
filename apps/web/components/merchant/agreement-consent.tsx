'use client';

import {
  INTERIM,
  agreementForCategory,
  merchantAgreementHref,
} from '@nexg/contracts/merchant-agreements';
import { getCategoryById } from '@nexg/contracts';
import { FileText } from 'lucide-react';

import { NEW_TAB } from '@/lib/legal-documents';

/**
 * The merchant agreement for the category the applicant picked, with the
 * "I have read and agree" box that submission requires. The agreement opens
 * in a new tab so the application stays where it was.
 */
export function AgreementConsent({
  categoryId,
  checked,
  onChange,
  error,
}: {
  categoryId: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
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
