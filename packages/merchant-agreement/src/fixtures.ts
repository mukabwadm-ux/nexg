import type { AgreementFill } from './document';
import type { Letterhead } from './pdf';

/* Sample details for tests and previews: an invented merchant, never a real one. */

export const SAMPLE_LETTERHEAD: Letterhead = {
  registeredOffice: '4th Floor, Example House, Example Road, Westlands, Nairobi',
  poBox: '00000-00100',
  phone: '+254700000000',
  email: 'legal@example.com',
  website: 'www.example.com',
};

export function sampleFill(
  agreementId = 'beauty',
  version = '2026-11-09+8d1f082f56c1',
): AgreementFill {
  return {
    agreementId,
    version,
    issuedAt: new Date('2026-11-17T07:42:00Z'),
    reference: 'NXG-MA-SAMPLE01',
    merchant: {
      legalName: 'Sample Beauty Limited',
      registrationNumber: 'PVT-SAMPLE01',
      kraPin: 'P000000000A',
      address: 'Shop 4, Sample Mall, Ngong Road, Nairobi',
      postalAddress: 'P.O. Box 00000-00200, Nairobi',
      email: 'owner@sample.example',
      phone: '+254711000000',
      signatoryName: 'Sample Owner',
      signatoryTitle: 'Director',
      representativeName: 'Sample Manager',
      representativeTitle: 'Operations Manager',
      principalName: 'Sample Owner',
    },
    company: {
      poBox: SAMPLE_LETTERHEAD.poBox,
      email: SAMPLE_LETTERHEAD.email,
      phone: SAMPLE_LETTERHEAD.phone,
      registeredOffice: SAMPLE_LETTERHEAD.registeredOffice,
      website: SAMPLE_LETTERHEAD.website,
      signatoryName: 'Sample Signatory',
      signatoryTitle: 'CEO and Executive Director',
      representativeName: 'Sample Representative',
      representativeTitle: 'Head of Merchant Operations',
    },
    commissionPct: 14,
    inRoomCommissionPct: 10,
    settlementCycle: 'weekly',
    acceptance: {
      name: 'Sample Owner',
      title: 'Director',
      acceptedAt: new Date('2026-11-12T11:03:00Z'),
      accountEmail: 'owner@sample.example',
      version,
      reference: '00000000-0000-4000-8000-000000000001',
    },
  };
}

/* A 1×1 transparent PNG, standing in for a signature. */
export const TINY_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
);
