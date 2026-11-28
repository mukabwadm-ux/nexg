'use client';

import {
  SIGNATORY_TITLES,
  type MerchantAgreementDetailsInput,
} from '@nexg/contracts/merchant-agreements';
import * as React from 'react';

/** What rpc_merchant_agreement_details_read returns. */
export interface AgreementDetailsRecord {
  saved: boolean;
  locked: boolean;
  updated_at: string | null;
  details: Record<keyof MerchantAgreementDetailsInput, string | null> | null;
  suggested: {
    legal_name: string | null;
    kra_pin: string | null;
    signatory_name: string | null;
    principal_name: string | null;
  };
}

/** The form's starting values: what was saved, else what the business is known by. */
export function detailsFormFrom(
  record: AgreementDetailsRecord | null,
  fallback: { legalName?: string; signatory?: string } = {},
): MerchantAgreementDetailsInput {
  const saved = record?.details;
  const pick = (key: keyof MerchantAgreementDetailsInput) => saved?.[key] ?? '';
  if (saved)
    return {
      legal_name: pick('legal_name'),
      registration_number: pick('registration_number'),
      kra_pin: pick('kra_pin'),
      address: pick('address'),
      postal_address: pick('postal_address'),
      signatory_name: pick('signatory_name'),
      signatory_title: pick('signatory_title'),
      representative_name: pick('representative_name'),
      representative_title: pick('representative_title'),
      principal_name: pick('principal_name'),
    };
  const signatory = record?.suggested.signatory_name ?? fallback.signatory ?? '';
  return {
    legal_name: record?.suggested.legal_name ?? fallback.legalName ?? '',
    registration_number: '',
    kra_pin: record?.suggested.kra_pin ?? '',
    address: '',
    postal_address: '',
    signatory_name: signatory,
    signatory_title: '',
    representative_name: '',
    representative_title: '',
    principal_name: record?.suggested.principal_name ?? signatory,
  };
}

/** The dispute representative is the signatory unless the form says otherwise. */
export function withRepresentative(
  value: MerchantAgreementDetailsInput,
  sameAsSignatory: boolean,
): MerchantAgreementDetailsInput {
  return sameAsSignatory
    ? {
        ...value,
        representative_name: value.signatory_name,
        representative_title: value.signatory_title,
      }
    : value;
}

const input =
  'border-border-strong bg-surface text-ink placeholder:text-muted-light focus:border-ink w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none disabled:opacity-60';
const label = 'text-ink block text-[0.8125rem] font-bold';
const help = 'text-muted mt-1 block text-xs font-semibold leading-[1.5]';

function Text({
  id,
  name,
  value,
  onChange,
  disabled,
  required = true,
  autoComplete,
  placeholder,
  hint,
  list,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  list?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {name}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        list={list}
        className={`${input} mt-1.5`}
      />
      {hint ? <span className={help}>{hint}</span> : null}
    </div>
  );
}

/**
 * The details the signed merchant agreement is filled in with: the
 * business's registered name, registration number, KRA PIN and address, who
 * signs for it, and its contacts for disputes. Used in the application
 * (next to the "I have read and agree" box) and on Business › Documents.
 */
export function AgreementDetailsFields({
  idPrefix,
  value,
  onChange,
  sameAsSignatory,
  onSameAsSignatoryChange,
  disabled = false,
}: {
  idPrefix: string;
  value: MerchantAgreementDetailsInput;
  onChange: (value: MerchantAgreementDetailsInput) => void;
  sameAsSignatory: boolean;
  onSameAsSignatoryChange: (same: boolean) => void;
  disabled?: boolean;
}) {
  const set = (key: keyof MerchantAgreementDetailsInput) => (next: string) =>
    onChange(withRepresentative({ ...value, [key]: next }, sameAsSignatory));
  const id = (key: string) => `${idPrefix}-${key}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Text
          id={id('legal-name')}
          name="Registered business name"
          value={value.legal_name}
          onChange={set('legal_name')}
          disabled={disabled}
          autoComplete="organization"
          hint="As it appears on your registration certificate."
        />
      </div>
      <Text
        id={id('registration')}
        name="Business registration number"
        value={value.registration_number}
        onChange={set('registration_number')}
        disabled={disabled}
        placeholder="PVT-AB12CD3"
        required={false}
        hint="As on your certificate of registration or incorporation (CR12 or equivalent). You can save without it while registration is under way, but it is needed before you go live."
      />
      <Text
        id={id('kra-pin')}
        name="KRA PIN"
        value={value.kra_pin}
        onChange={set('kra_pin')}
        disabled={disabled}
        placeholder="P051234567X"
        hint="The business's PIN, or the owner's for a sole proprietor."
      />
      <div className="sm:col-span-2">
        <Text
          id={id('address')}
          name="Physical address"
          value={value.address}
          onChange={set('address')}
          disabled={disabled}
          autoComplete="street-address"
          placeholder="Building, street and town"
        />
      </div>
      <div className="sm:col-span-2">
        <Text
          id={id('postal')}
          name="P.O. Box"
          value={value.postal_address}
          onChange={set('postal_address')}
          disabled={disabled}
          required={false}
          placeholder="P.O. Box 12345-00100"
          hint="Optional. Notices go to your physical address without one."
        />
      </div>
      <Text
        id={id('signatory-name')}
        name="Who signs for the business"
        value={value.signatory_name}
        onChange={set('signatory_name')}
        disabled={disabled}
        autoComplete="name"
        placeholder="Full name"
      />
      <Text
        id={id('signatory-title')}
        name="Their title"
        value={value.signatory_title}
        onChange={set('signatory_title')}
        disabled={disabled}
        list={id('titles')}
        placeholder="Director"
      />
      <datalist id={id('titles')}>
        {SIGNATORY_TITLES.map((title) => (
          <option key={title} value={title} />
        ))}
      </datalist>
      <div className="sm:col-span-2">
        <Text
          id={id('principal')}
          name="Owner or managing director"
          value={value.principal_name}
          onChange={set('principal_name')}
          disabled={disabled}
          hint="Who NexG's CEO meets if a dispute is escalated."
        />
      </div>
      <fieldset className="border-border rounded-xl border p-3 sm:col-span-2">
        <legend className={`${label} px-1`}>Representative for disputes</legend>
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={sameAsSignatory}
            disabled={disabled}
            onChange={(event) => {
              onSameAsSignatoryChange(event.target.checked);
              onChange(withRepresentative(value, event.target.checked));
            }}
            className="accent-gold mt-0.5 h-4 w-4 shrink-0"
          />
          <span className="text-ink text-[0.8125rem] font-semibold">
            The person who signs handles disputes first
          </span>
        </label>
        {sameAsSignatory ? null : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Text
              id={id('rep-name')}
              name="Name"
              value={value.representative_name}
              onChange={set('representative_name')}
              disabled={disabled}
            />
            <Text
              id={id('rep-title')}
              name="Title"
              value={value.representative_title}
              onChange={set('representative_title')}
              disabled={disabled}
            />
          </div>
        )}
      </fieldset>
    </div>
  );
}

/** True when the saved representative is the signatory (or nothing is saved yet). */
export function representativeIsSignatory(value: MerchantAgreementDetailsInput): boolean {
  return (
    (!value.representative_name && !value.representative_title) ||
    (value.representative_name === value.signatory_name &&
      value.representative_title === value.signatory_title)
  );
}

export function useAgreementDetailsForm(initial: MerchantAgreementDetailsInput) {
  const [value, setValue] = React.useState(initial);
  const [sameAsSignatory, setSameAsSignatory] = React.useState(() =>
    representativeIsSignatory(initial),
  );
  return { value, setValue, sameAsSignatory, setSameAsSignatory };
}
