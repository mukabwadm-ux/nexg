import { cookies } from './cookies';
import { dataProcessing } from './data-processing';
import { merchantAgreement } from './merchant-agreement';
import { privacy } from './privacy';
import { refunds } from './refunds';
import { riderAgreement } from './rider-agreement';
import { terms } from './terms';
import type { LegalAudience, LegalDocument } from './types';

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

/**
 * How the legal hub (/legal) lists the documents: in three groups, and who
 * each one is for, which its "Show documents for" filter uses. Every document
 * in LEGAL_DOCUMENTS appears in exactly one group (hub.test.ts checks).
 */
export const LEGAL_HUB_GROUPS: {
  id: 'everyone' | 'customers' | 'partners';
  title: string;
  documents: { slug: string; audiences: LegalAudience[]; badge?: string }[];
}[] = [
  {
    id: 'everyone',
    title: 'For everyone',
    documents: [
      { slug: 'privacy', audiences: ['customers', 'merchants', 'riders'] },
      { slug: 'cookies', audiences: ['customers', 'merchants', 'riders'] },
    ],
  },
  {
    id: 'customers',
    title: 'For customers',
    documents: [
      { slug: 'terms', audiences: ['customers'] },
      { slug: 'refunds', audiences: ['customers'] },
    ],
  },
  {
    id: 'partners',
    title: 'For partners',
    documents: [
      { slug: 'merchant-terms', audiences: ['merchants'], badge: 'Merchants' },
      { slug: 'rider-agreement', audiences: ['riders'], badge: 'Riders' },
      { slug: 'data-processing', audiences: ['merchants'], badge: 'Merchants' },
    ],
  },
];

export type { LegalAudience, LegalDocument, LegalRequest, LegalSection } from './types';
