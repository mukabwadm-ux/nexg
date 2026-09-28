import { terms } from './terms';
import type { LegalDocument } from './types';

/**
 * The six documents the artboard tabs between.
 *
 * Only the terms are drafted. The other five are listed with their taglines
 * because a visitor needs to know they are coming and roughly what each one
 * covers, but they carry no sections: writing plausible privacy or refund
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
  undrafted(
    'refunds',
    'refunds',
    'Refunds & Cancellations',
    'When you get your money back',
    'When an order can be cancelled, what a cancellation costs, and how a refund is returned to you.',
  ),
  undrafted(
    'merchant-terms',
    'merchant_terms',
    'Merchant Terms',
    'For businesses selling on NexG',
    'The agreement between NexG and a business listed on the platform: commission, settlement, obligations and how either side ends it.',
  ),
  undrafted(
    'rider-agreement',
    'rider_agreement',
    'Rider Agreement',
    'For delivery partners',
    'The agreement between NexG and a rider: how work is offered, how you are paid, what equipment and cover you need.',
  ),
];

export function findDocument(slug: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((document) => document.slug === slug);
}

export type { LegalDocument, LegalSection } from './types';
