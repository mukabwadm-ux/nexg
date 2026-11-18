import { cookies } from './cookies';
import { dataProcessing } from './data-processing';
import { merchantAgreement } from './merchant-agreement';
import { privacy } from './privacy';
import { refunds } from './refunds';
import { riderAgreement } from './rider-agreement';
import { terms } from './terms';
import type { LegalDocument } from './types';

/** The documents the legal pages tab between, in tab order. */
export const LEGAL_DOCUMENTS: LegalDocument[] = [
  terms,
  privacy,
  cookies,
  refunds,
  merchantAgreement,
  riderAgreement,
  dataProcessing,
];

export function findDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((document) => document.slug === slug);
}

export type { LegalDocument, LegalSection } from './types';
