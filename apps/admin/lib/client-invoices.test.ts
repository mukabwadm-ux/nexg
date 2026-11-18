import { describe, expect, it } from 'vitest';

import {
  addDays,
  billToOf,
  emailList,
  invoiceTotals,
  lineAmounts,
  money,
  normaliseDetail,
  parseKes,
  parseQuantity,
  vatRateLabel,
  type ClientInvoiceDetail,
} from './client-invoices';

describe('client invoice arithmetic', () => {
  it('works a line out the way the database does: net rounded, VAT per line', () => {
    // The same four lines as supabase/tests/99_finance_client_invoices.sql.
    const lines = [
      lineAmounts(2, 500000, 'standard', 16),
      lineAmounts(1, 250000, 'zero', 16),
      lineAmounts(3, 33333, 'exempt', 16),
      lineAmounts(1.5, 123457, 'standard', 16),
    ];
    expect(lines).toEqual([
      { net: 1000000, vat: 160000, gross: 1160000 },
      { net: 250000, vat: 0, gross: 250000 },
      { net: 99999, vat: 0, gross: 99999 },
      { net: 185186, vat: 29630, gross: 214816 },
    ]);
    expect(invoiceTotals(lines)).toEqual({ net: 1535185, vat: 189630, gross: 1724815 });
  });

  it('keeps fractional quantities exact to the thousandth', () => {
    expect(lineAmounts(0.1, 100, 'standard', 16)).toEqual({ net: 10, vat: 2, gross: 12 });
    expect(lineAmounts(0.333, 300, 'exempt', 16)).toEqual({ net: 100, vat: 0, gross: 100 });
  });

  it('reads shillings and quantities as typed', () => {
    expect(parseKes('1,234.5')).toBe(123450);
    expect(parseKes(' 5000 ')).toBe(500000);
    expect(parseKes('0.07')).toBe(7);
    expect(parseKes('')).toBeNull();
    expect(parseKes('12.345')).toBeNaN();
    expect(parseKes('-5')).toBeNaN();
    expect(parseQuantity('1.5')).toBe(1.5);
    expect(parseQuantity('1,000')).toBe(1000);
    expect(parseQuantity('0')).toBeNaN();
    expect(parseQuantity('1.2345')).toBeNaN();
  });

  it('writes amounts exactly and labels VAT treatments', () => {
    expect(money(1724815)).toBe('17,248.15');
    expect(money(5)).toBe('0.05');
    expect(money(null)).toBe('—');
    expect(vatRateLabel('standard', 16)).toBe('16%');
    expect(vatRateLabel('zero', 16)).toBe('0%');
    expect(vatRateLabel('exempt', 16)).toBe('Exempt');
  });

  it('counts due dates in calendar days and splits address lists', () => {
    expect(addDays('2026-11-19', 30)).toBe('2026-12-19');
    expect(addDays('2026-12-20', 14)).toBe('2027-01-03');
    expect(emailList('a@x.co.ke; B@X.co.ke, a@x.co.ke nope')).toEqual({
      ok: ['a@x.co.ke', 'b@x.co.ke'],
      bad: ['nope'],
    });
  });
});

describe('the invoice detail', () => {
  const detail = {
    invoice: {
      id: 'i',
      client_id: 'c',
      number: null,
      status: 'draft',
      issue_date: '2026-11-19',
      due_date: '2026-12-03',
      net_cents: '1000',
      vat_cents: '160',
      gross_cents: '1160',
      notes: null,
      bill_to: null,
    },
    client: {
      id: 'c',
      kind: 'corporate',
      legal_name: 'Sample Client Limited',
      trading_name: 'Sample Client',
      kra_pin: 'P000000000A',
      email: 'accounts@client.example',
      cc_emails: [],
      phone: null,
      address: null,
      payment_terms_days: 14,
      active: true,
    },
    lines: [{ quantity: '1.500', unit_price_cents: '667', vat_pct: '16.00' }],
    payments: [{ amount_cents: '500' }],
    paid_cents: '500',
    balance_cents: '660',
    tax_invoice: null,
    credit_note: null,
  } as unknown as ClientInvoiceDetail;

  it('turns the reader’s numbers into numbers', () => {
    const d = normaliseDetail(detail);
    expect(d.invoice.gross_cents).toBe(1160);
    expect(d.lines[0]!.quantity).toBe(1.5);
    expect(d.lines[0]!.vat_pct).toBe(16);
    expect(d.payments[0]!.amount_cents).toBe(500);
    expect(d.balance_cents).toBe(660);
  });

  it('bills a draft to the client as it stands', () => {
    expect(billToOf(detail).legal_name).toBe('Sample Client Limited');
    expect(billToOf(detail).kra_pin).toBe('P000000000A');
  });
});
