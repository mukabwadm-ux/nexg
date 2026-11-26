import { createHash } from 'node:crypto';

import { PDFDocument } from 'pdf-lib';

import { buildAgreement, type AgreementFill } from './document';
import { buildDpa, type DpaFill } from './dpa';
import { NEXG_LOGO_PNG_BASE64 } from './logo.generated';
import { renderAgreementPdf, type Letterhead } from './pdf';
import { TEMPLATE } from './template.generated';

export {
  AGREEMENT_FIELDS,
  TEMPLATE_AGREEMENTS,
  agreementTitle,
  blankValues,
  buildAgreement,
  fillValues,
  formatNairobi,
  formatPct,
  formatPhone,
  ordinal,
  sourceSha256,
  templateText,
  type AcceptanceRecord,
  type AgreementDocument,
  type AgreementFill,
  type CompanyParty,
  type MerchantParty,
} from './document';
export { COMPANY_NAME, COMPANY_NUMBER, renderAgreementPdf, type Letterhead } from './pdf';
export { buildDpa, dpaFillValues, type DpaFill } from './dpa';
export {
  formatAmount,
  renderInvoicePdf,
  type InvoicePdfInput,
  type InvoicePdfLine,
  type InvoiceVatRate,
  type RenderedInvoice,
} from './invoice';

/** Bump when the layout of the generated PDF changes. */
const RENDERER_VERSION = 1;

/**
 * Which template and renderer made a PDF: recorded with every signed copy,
 * so a later change to either is visible against the copies issued before.
 */
export const TEMPLATE_VERSION = `${RENDERER_VERSION}+${createHash('sha256')
  .update(JSON.stringify(TEMPLATE))
  .digest('hex')
  .slice(0, 12)}`;

export function nexgLogo(): Uint8Array {
  return Uint8Array.from(Buffer.from(NEXG_LOGO_PNG_BASE64, 'base64'));
}

export interface SignedAgreement {
  bytes: Uint8Array;
  sha256: string;
  pages: number;
}

/**
 * The merchant's agreement, filled in and signed: the template for the
 * agreement in `fill`, the merchant's and NexG's details, NexG's signature
 * and the electronic acceptance record, on the NexG letterhead.
 */
export async function renderSignedAgreement(
  fill: AgreementFill,
  assets: { letterhead: Letterhead; signature: { bytes: Uint8Array; type: 'png' | 'jpg' } },
): Promise<SignedAgreement> {
  const doc = buildAgreement(fill.agreementId, fill);
  const { bytes, pages } = await renderAgreementPdf(doc, {
    letterhead: assets.letterhead,
    logo: nexgLogo(),
    signature: assets.signature,
    reference: fill.reference,
    version: fill.version,
    metadata: {
      subject: `Merchant agreement between NexGenius Concierge Limited and ${fill.merchant.legalName}`,
      createdAt: fill.issuedAt,
      keywords: [fill.reference, fill.version, TEMPLATE_VERSION],
    },
  });
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), pages };
}

/** Which layout made a DPA copy: recorded with every copy. Bump when it changes. */
export const DPA_RENDER_VERSION = 'dpa-1';

/**
 * The merchant's Data Processing Agreement, filled in from its onboarding
 * details and accepted: on the NexG letterhead, with NexG's signature when
 * its signatory is set up, and the electronic acceptance record.
 */
export async function renderSignedDpa(
  fill: DpaFill,
  assets: { letterhead: Letterhead; signature: { bytes: Uint8Array; type: 'png' | 'jpg' } | null },
): Promise<SignedAgreement> {
  const { bytes, pages } = await renderAgreementPdf(buildDpa(fill), {
    letterhead: assets.letterhead,
    logo: nexgLogo(),
    signature: assets.signature ?? undefined,
    reference: fill.reference,
    version: fill.version,
    metadata: {
      subject: `Data Processing Agreement between NexGenius Concierge Limited and ${fill.merchant.legalName}`,
      createdAt: fill.acceptedAt,
      keywords: [fill.reference, fill.version, DPA_RENDER_VERSION],
    },
  });
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex'), pages };
}

/**
 * Why a signature image could not be applied to an agreement, or null when
 * it can: it is embedded once here, at upload, rather than failing later
 * when a merchant is approved.
 */
export async function signatureImageProblem(
  bytes: Uint8Array,
  type: 'png' | 'jpg',
): Promise<string | null> {
  const magic = type === 'png' ? [0x89, 0x50, 0x4e, 0x47] : [0xff, 0xd8, 0xff];
  if (!magic.every((byte, i) => bytes[i] === byte))
    return `The file is not a ${type === 'png' ? 'PNG' : 'JPEG'} image.`;
  try {
    const pdf = await PDFDocument.create();
    const image = type === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    if (image.width < 60 || image.height < 20)
      return 'The signature image is too small. Use one at least 300 pixels wide.';
    return null;
  } catch {
    return 'The signature image could not be read. Save it again as a PNG or JPEG and upload that.';
  }
}
