/**
 * The company details printed on every branded finance document (tax
 * invoice, payment receipt, settlement statement, monthly report). One
 * place to change them.
 */

export interface DocumentCompany {
  legalName: string;
  kraPin: string;
  addressLine1: string;
  addressLine2: string;
  website: string;
  email: string;
  phone: string;
}

/**
 * PLACEHOLDER: the owner has not given Finance's telephone number yet. Until
 * it is set here (or the letterhead phone is saved in admin Settings, which
 * is used first), documents print this text in its place.
 */
export const FINANCE_PHONE_PLACEHOLDER = '[Finance phone number]';

export const NEXG_DOCUMENT_COMPANY: DocumentCompany = {
  legalName: 'Nexgenius Concierge Limited',
  kraPin: 'P052549908S',
  addressLine1: 'Studio House, Marcus Garvey Road',
  addressLine2: 'Nairobi, Kenya',
  website: 'www.nexgapp.com',
  email: 'finance@nexgapp.com',
  phone: FINANCE_PHONE_PLACEHOLDER,
};

/** Where a document's QR code and printed link send people to check it. */
export const VERIFY_BASE_URL = 'https://www.nexgapp.com/verify';

export function verifyUrl(reference: string, code?: string | null): string {
  const base = `${VERIFY_BASE_URL}/${encodeURIComponent(reference)}`;
  return code ? `${base}?c=${encodeURIComponent(code)}` : base;
}

/** The company details with the letterhead's phone, when one is saved. */
export function documentCompany(phone?: string | null): DocumentCompany {
  const saved = phone?.trim();
  return saved ? { ...NEXG_DOCUMENT_COMPANY, phone: saved } : NEXG_DOCUMENT_COMPANY;
}
