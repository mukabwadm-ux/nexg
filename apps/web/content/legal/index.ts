import { dataProcessing } from './data-processing';
import { refunds } from './refunds';
import { riderAgreement } from './rider-agreement';
import { terms } from './terms';
import type { LegalDocument } from './types';

/**
 * The documents the legal pages tab between.
 *
 * The terms, the refunds policy, the rider agreement and the data processing
 * agreement have text. The rest are listed with their taglines
 * because a visitor needs to know they are coming and roughly what each one
 * covers, but they carry no sections: writing plausible privacy or cookie
 * wording would be inventing commitments NexG has not made, and under the
 * Kenyan Data Protection Act a privacy notice in particular is a statement of
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
  undrafted(
    'cookies',
    'cookies',
    'Cookie Policy',
    'Cookies and similar tech',
    'The cookies this site sets, what each one is for, and how to refuse them.',
  ),
  refunds,
  undrafted(
    'merchant-terms',
    'merchant_terms',
    'Merchant Terms',
    'For businesses selling on NexG',
    'The agreement between NexG and a business listed on the platform: commission, settlement, obligations and how either side ends it.',
  ),
  riderAgreement,
  dataProcessing,
];

export function findDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((document) => document.slug === slug);
}

export type { LegalDocument, LegalSection } from './types';
