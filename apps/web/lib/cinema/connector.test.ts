import { describe, expect, it } from 'vitest';

import { barcodeFormat, normaliseTickets } from './connector';

describe("a ticket's barcode format", () => {
  it("reads a system's own names for the kinds NexG draws", () => {
    expect(
      ['QR', 'qr_code', 'QRCode', 'Code-128', 'CODE128', 'PDF417', 'pdf-417', 'Aztec'].map(
        barcodeFormat,
      ),
    ).toEqual(['qr', 'qr', 'qr', 'code128', 'code128', 'pdf417', 'pdf417', 'aztec']);
  });

  it("calls any other kind 'other', never a guess, and nothing at all nothing", () => {
    expect(barcodeFormat('EAN-13')).toBe('other');
    expect(barcodeFormat('datamatrix')).toBe('other');
    expect(barcodeFormat(undefined)).toBeUndefined();
    expect(barcodeFormat('')).toBeUndefined();
    expect(barcodeFormat(42)).toBeUndefined();
  });

  it('records the format beside the barcode, and only there', () => {
    expect(
      normaliseTickets([
        { seat: 'F7', ticketRef: 'T1', barcode: 'ABC', barcodeFormat: 'QR_CODE' },
        { seat: 'F8', ticketRef: 'T2', barcode: 'DEF' },
        { seat: 'F9', ticketRef: 'T3', barcodeFormat: 'qr' },
        { seat: 'F10', ticketRef: 'T4', barcode: 'GHI', barcodeFormat: 'ean13', extra: 'dropped' },
        { ticketRef: 'no seat' },
        'not a ticket',
      ]),
    ).toEqual([
      { seat: 'F7', ticketRef: 'T1', barcode: 'ABC', barcodeFormat: 'qr' },
      { seat: 'F8', ticketRef: 'T2', barcode: 'DEF' },
      { seat: 'F9', ticketRef: 'T3' },
      { seat: 'F10', ticketRef: 'T4', barcode: 'GHI', barcodeFormat: 'other' },
    ]);
    expect(normaliseTickets(null)).toEqual([]);
  });
});
