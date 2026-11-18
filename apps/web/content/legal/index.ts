import { cookies } from './cookies';
import { dataProcessing } from './data-processing';
import { merchantAgreement } from './merchant-agreement';
import { refunds } from './refunds';
import { riderAgreement } from './rider-agreement';
import { terms } from './terms';
import type { LegalDocument } from './types';

/**
 * The documents the legal pages tab between.
 *
 * Every document has text except the privacy policy, which is listed with its
 * tagline so a visitor knows it is coming. Its wording is not invented here:
 * under the Kenyan Data Protection Act a privacy notice is a statement of
 * obligations rather than marketing copy.
 */
function undrafted(
  slug: string,
  key: LegalDocument['key'],
  title: string,
  tagline: string,
  intro: string,
): LegalDocument {
  return {
    slug,
    key,
    title,
    tagline,
    intro,
    version: null,
    lastUpdated: null,
    draft: true,
    sections: [],
  };
}

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  terms,
  undrafted(
    'privacy',
    'privacy',
    'Privacy Policy',
    'What we collect and why',
    'What personal data NexG collects, why we collect it, how long we keep it and what you can ask us to do with it.',
  ),
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
