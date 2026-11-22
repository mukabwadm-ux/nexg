import { describe, expect, it } from 'vitest';

import {
  compactReference,
  decodeStatement,
  describeRowErrors,
  detectBankColumns,
  detectStatementFormat,
  maskPhones,
  parseCsv,
  parseMoney,
  parseStatementDate,
  phoneTail,
  readStatement,
  STATEMENT_MAX_LINES,
  summariseStatement,
} from './statement-csv';

/*
 * SYNTHETIC fixture. No real M-PESA Org Portal export was available when
 * this was written: the layout (a preamble, a "Receipt No." header, newest
 * line first, charges as lines of their own sharing the receipt they were
 * charged on) follows Safaricom's documented statement columns. Every name,
 * number and receipt below is invented.
 */
const MPESA_SAMPLE = [
  'Organization Name:,NEXG TEST ORGANISATION (SYNTHETIC)',
  'Organization Short Code:,600100',
  'Account:,Utility Account',
  'Time Period:,01-11-2026 00:00:00 - 18-11-2026 23:59:59',
  'Opening Balance:,"10,000.00"',
  '',
  'Receipt No.,Completion Time,Initiation Time,Details,Transaction Status,Paid In,Withdrawn,Balance,Balance Confirmed,Reason Type,Other Party Info,Linked Transaction ID,A/C No.',
  'SKI9ZZ0001,18-11-2026 14:05:33,18-11-2026 14:05:31,"Pay Bill Online from 254712345678 - JANE WANJIKU Acc. NX-261118-0001",Completed,"1,250.00",,"12,615.00",true,Pay Bill Online,254712***678 - JANE WANJIKU,,NX-261118-0001',
  'SKI9ZZ0002,18-11-2026 13:40:10,18-11-2026 13:40:10,Business Payment to 254798765432 - PETER OTIENO,Completed,,-500.00,"11,365.00",true,Business Payment to Customer via API,254798765432 - PETER OTIENO,,',
  'SKI9ZZ0002,18-11-2026 13:40:10,18-11-2026 13:40:10,Business Payment Charge,Completed,,-15.00,"11,865.00",true,Business Payment Charge,600100 - NEXG TEST ORGANISATION,,',
  'SKI9ZZ0003,18-11-2026 12:00:00,18-11-2026 11:59:58,Pay Bill Online from 254700000003 - TEST CUSTOMER Acc. NX2611180003,Failed,450.00,,"11,880.00",true,Pay Bill Online,254700***003 - TEST CUSTOMER,,NX2611180003',
  'SKI9ZZ0004,17-11-2026 18:30:00,17-11-2026 18:30:00,Reversal of SKI9ZZ0000,Completed,,-300.00,"11,880.00",true,Reversal,254711***222 - SAM KIPTOO,SKI9ZZ0000,',
  'SKI9ZZ0005,17-11-2026 09:00:00,17-11-2026 09:00:00,Transfer from Utility to Working Account,Completed,,"-2,000.00","12,180.00",true,Organization Funds Transfer,600100 - NEXG TEST ORGANISATION,,',
  'SKI9ZZ0006,16-11-2026 08:15:00,16-11-2026 08:15:00,"Pay Bill from 254722333444 - MARY, ACHIENG Acc. nx-261116-0042",Completed,"4,180.00",,"14,180.00",true,Pay Bill,254722***444 - MARY ACHIENG,,nx-261116-0042',
  '',
].join('\r\n');

/* SYNTHETIC bank export: a preamble, then debit and credit columns. */
const BANK_SAMPLE = [
  'Account Name,NEXG TEST LIMITED (SYNTHETIC)',
  'Account Number,0123456789012',
  'Statement Period,01/11/2026 to 18/11/2026',
  '',
  'Transaction Date,Value Date,Narration,Reference,Debit,Credit,Balance',
  '01/11/2026,01/11/2026,Opening Balance,,,,"50,000.00"',
  '03/11/2026,03/11/2026,"Collection NX-261103-0007, Bank Sandbox",BSX123456,,"2,500.00","52,500.00"',
  '05/11/2026,05/11/2026,Office rent November,FT26309ABCD,"30,000.00",,"22,500.00"',
  '05/11/2026,05/11/2026,Ledger fee,CHG0001,150.00,,"22,350.00"',
  '13/11/2026,13/11/2026,Payout merchant run SR-2026-45,FT26317WXYZ,"1,200.50",,"21,149.50"',
].join('\n');

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, commas and line breaks inside quotes', () => {
    const { rows, error } = parseCsv('a,b,c\r\n"x, y","say ""hi""","line\nbreak"\r\n');
    expect(error).toBeUndefined();
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line\nbreak'],
    ]);
  });

  it('strips a UTF-8 BOM and keeps non-ASCII text', () => {
    const { rows } = parseCsv('﻿name,price_kes\nNyama choma — ½ kg,1200\n');
    expect(rows[0]).toEqual(['name', 'price_kes']);
    expect(rows[1]).toEqual(['Nyama choma — ½ kg', '1200']);
  });

  it('accepts LF, CRLF and a missing final newline, and drops blank lines', () => {
    expect(parseCsv('a,b\n\n1,2').rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a,b\r\n1,\r\n').rows).toEqual([
      ['a', 'b'],
      ['1', ''],
    ]);
  });

  it('reports an unterminated quote', () => {
    expect(parseCsv('a\n"open').error).toMatch(/never closed/);
  });

  it('numbers rows the way a spreadsheet does, blank lines and quoted breaks included', () => {
    const { rowNumbers } = parseCsv('a,b\n\n"x\ny",2\n3,4\n');
    expect(rowNumbers).toEqual([1, 3, 4]);
  });

  it('reads semicolon and tab separated files', () => {
    expect(parseCsv('a;"b;c"\n1;2', ';').rows).toEqual([
      ['a', 'b;c'],
      ['1', '2'],
    ]);
    expect(parseCsv('a\tb\n1\t2', '\t').rows[1]).toEqual(['1', '2']);
  });
});

describe('decodeStatement', () => {
  it('reads UTF-8, UTF-16 with a BOM and Windows-1252', () => {
    expect(decodeStatement(new TextEncoder().encode('Receipt No.,Paid In'))).toBe(
      'Receipt No.,Paid In',
    );
    const utf16 = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x2c, 0x00, 0x42, 0x00]);
    expect(decodeStatement(utf16)).toBe('A,B');
    expect(decodeStatement(new Uint8Array([0x43, 0x61, 0x66, 0xe9]))).toBe('Café');
  });
});

describe('values', () => {
  it('reads amounts as cents', () => {
    expect(parseMoney('1,234.50')).toBe(123450);
    expect(parseMoney('-500.00')).toBe(-50000);
    expect(parseMoney('(500)')).toBe(-50000);
    expect(parseMoney('KES 1,200')).toBe(120000);
    expect(parseMoney('1 000.5')).toBe(100050);
    expect(parseMoney('250.00 DR')).toBe(-25000);
    expect(parseMoney('1,000.00 CR')).toBe(100000);
    expect(parseMoney('1,000.00-')).toBe(-100000);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('-')).toBeNull();
    expect(parseMoney('abc')).toBeNaN();
    expect(parseMoney('1.234')).toBeNaN();
  });

  it('reads Nairobi dates and times in the layouts statements use', () => {
    const at = '2026-11-18T11:05:33.000Z';
    expect(parseStatementDate('18-11-2026 14:05:33')).toBe(at);
    expect(parseStatementDate('2026-11-18 14:05:33')).toBe(at);
    expect(parseStatementDate('18/11/2026 14:05:33')).toBe(at);
    expect(parseStatementDate('11/18/2026 2:05:33 PM', 'mdy')).toBe(at);
    expect(parseStatementDate('18 Nov 2026 14:05')).toBe('2026-11-18T11:05:00.000Z');
    expect(parseStatementDate('Nov 18, 2026 2:05 PM')).toBe('2026-11-18T11:05:00.000Z');
    expect(parseStatementDate('18/11/2026')).toBe('2026-11-17T21:00:00.000Z');
    expect(parseStatementDate('2026-11-18T14:05:33+03:00')).toBe(at);
    expect(parseStatementDate('31/02/2026')).toBeNull();
    expect(parseStatementDate('Total')).toBeNull();
  });

  it('cuts phone numbers to their last three digits and keeps order numbers', () => {
    expect(maskPhones('Pay Bill Online from 254712345678 - JANE Acc. NX-261118-0001')).toBe(
      'Pay Bill Online from ···678 - JANE Acc. NX-261118-0001',
    );
    expect(maskPhones('254712***678 - JANE')).toBe('···678 - JANE');
    expect(maskPhones('600100 - NEXG LIMITED')).toBe('600100 - NEXG LIMITED');
    expect(maskPhones('Acc. NX2611180001')).toBe('Acc. NX2611180001');
    expect(phoneTail('254712***678 - JANE')).toBe('678');
    expect(phoneTail('0712345678')).toBe('678');
    expect(phoneTail('600100 - NEXG LIMITED')).toBeNull();
    expect(compactReference('nx-261116-0042')).toBe('NX2611160042');
  });
});

describe('M-PESA statements', () => {
  const reading = readStatement(MPESA_SAMPLE);
  const line = (receipt: string, n = 0) => reading.lines.filter((l) => l.receipt === receipt)[n]!;

  it('finds the header under the preamble and reads every line', () => {
    expect(reading.format).toBe('mpesa');
    expect(reading.errors).toEqual([]);
    expect(reading.headerRow).toBe(7);
    expect(reading.lines).toHaveLength(7);
    expect(reading.lines.map((l) => l.line_no)).toEqual([8, 9, 10, 11, 12, 13, 14]);
    expect(detectStatementFormat(MPESA_SAMPLE)).toBe('mpesa');
  });

  it('reads a customer payment: amount, time, account and the phone’s last digits', () => {
    expect(line('SKI9ZZ0001')).toMatchObject({
      direction: 'in',
      amount_cents: 125000,
      completed_at: '2026-11-18T11:05:33.000Z',
      initiated_at: '2026-11-18T11:05:31.000Z',
      account_ref: 'NX2611180001',
      phone_tail: '678',
      other_party: '···678 - JANE WANJIKU',
      details: 'Pay Bill Online from ···678 - JANE WANJIKU Acc. NX-261118-0001',
      status_text: 'Completed',
      reason_type: 'Pay Bill Online',
      balance_cents: 1261500,
      kind: 'collection',
    });
    expect(line('SKI9ZZ0001').raw.join(' ')).not.toMatch(/254712345678/);
  });

  it('tells payouts, charges, failures, reversals and transfers apart', () => {
    expect(line('SKI9ZZ0002')).toMatchObject({
      direction: 'out',
      amount_cents: 50000,
      kind: 'payout',
    });
    expect(line('SKI9ZZ0002', 1)).toMatchObject({
      direction: 'out',
      amount_cents: 1500,
      kind: 'charge',
    });
    expect(line('SKI9ZZ0003')).toMatchObject({ kind: 'failed', status_text: 'Failed' });
    expect(line('SKI9ZZ0004')).toMatchObject({ kind: 'reversal', linked_receipt: 'SKI9ZZ0000' });
    expect(line('SKI9ZZ0005')).toMatchObject({
      kind: 'transfer',
      amount_cents: 200000,
      account_ref: null,
    });
    expect(line('SKI9ZZ0006')).toMatchObject({
      kind: 'collection',
      account_ref: 'NX2611160042',
      details: 'Pay Bill from ···444 - MARY, ACHIENG Acc. nx-261116-0042',
    });
  });

  it('adds up the period, leaving out what did not complete', () => {
    const summary = summariseStatement(reading.lines, { from: '2026-11-17', to: '2026-11-18' });
    expect(summary).toMatchObject({
      lines: 7,
      paidInCents: 543000,
      withdrawnCents: 281500,
      openingCents: 1000000,
      closingCents: 1261500,
      firstDay: '2026-11-16',
      lastDay: '2026-11-18',
      outsidePeriod: 1,
    });
    expect(summary.kinds).toEqual({
      collection: 2,
      payout: 1,
      charge: 1,
      failed: 1,
      reversal: 1,
      transfer: 1,
    });
  });

  it('finds columns by name in any order, with the account taken from the details', () => {
    const csv = [
      'Details,Paid In,Receipt No,Withdrawn,Completion Time',
      'Pay Bill Online from 254700111222 - A B Acc. NX-261101-0009,500.00,SKA1,,2026-11-01 08:00:00',
    ].join('\n');
    const r = readStatement(csv);
    expect(r.errors).toEqual([]);
    expect(r.lines[0]).toMatchObject({
      receipt: 'SKA1',
      account_ref: 'NX2611010009',
      other_party: '···222 - A B',
      phone_tail: '222',
      amount_cents: 50000,
      direction: 'in',
      kind: 'collection',
    });
  });

  it('reads dates the way the file writes them', () => {
    const csv = [
      'Receipt No.,Completion Time,Paid In,Withdrawn',
      'SKB1,11/02/2026 09:00:00,100.00,',
      'SKB2,11/18/2026 09:00:00,100.00,',
    ].join('\n');
    expect(readStatement(csv).lines[0]!.completed_at).toBe('2026-11-02T06:00:00.000Z');
  });

  it('names the row of anything it cannot read', () => {
    const csv = [
      'Receipt No.,Completion Time,Paid In,Withdrawn',
      'SKC1,2026-11-01 08:00:00,abc,',
      'SKC2,yesterday,100.00,',
      'SKC3,2026-11-01 09:00:00,100.00,50.00',
      ',,Total,',
    ].join('\n');
    const r = readStatement(csv);
    expect(r.errors).toEqual([
      { row: 2, message: '“abc” is not an amount.' },
      { row: 3, message: '“yesterday” is not a date and time.' },
      { row: 4, message: 'The line has money both paid in and withdrawn.' },
    ]);
    expect(describeRowErrors(r.errors, 2)).toBe(
      'Row 2: “abc” is not an amount. Row 3: “yesterday” is not a date and time. And 1 more.',
    );
  });

  it('refuses a file that is not a statement, or has too many lines', () => {
    expect(readStatement('name,price\nTea,100').errors[0]!.message).toMatch(/not a statement/);
    expect(readStatement('').errors[0]!.message).toMatch(/empty/);
    const many = [
      'Receipt No.,Completion Time,Paid In,Withdrawn',
      ...Array.from(
        { length: STATEMENT_MAX_LINES + 1 },
        (_, i) => `SKD${i},2026-11-01 08:00:00,1.00,`,
      ),
    ].join('\n');
    expect(readStatement(many).errors[0]!.message).toMatch(/20,000 lines per import/);
  });
});

describe('bank statements', () => {
  it('works out the columns from the header and reads the lines', () => {
    const r = readStatement(BANK_SAMPLE, { format: 'bank' });
    expect(r.errors).toEqual([]);
    expect(r.headerRow).toBe(5);
    expect(r.columns).toEqual({
      date: 0,
      description: 2,
      reference: 3,
      moneyIn: 5,
      moneyOut: 4,
      amount: null,
      balance: 6,
    });
    expect(detectStatementFormat(BANK_SAMPLE)).toBe('bank');
    expect(r.lines.map((l) => [l.line_no, l.receipt, l.direction, l.amount_cents, l.kind])).toEqual(
      [
        [7, 'BSX123456', 'in', 250000, 'collection'],
        [8, 'FT26309ABCD', 'out', 3000000, 'payout'],
        [9, 'CHG0001', 'out', 15000, 'charge'],
        [10, 'FT26317WXYZ', 'out', 120050, 'payout'],
      ],
    );
    expect(r.lines[0]).toMatchObject({
      completed_at: '2026-11-02T21:00:00.000Z',
      account_ref: 'NX2611030007',
      details: 'Collection NX-261103-0007, Bank Sandbox',
    });
    expect(summariseStatement(r.lines)).toMatchObject({
      paidInCents: 250000,
      withdrawnCents: 3135050,
      openingCents: 5000000,
      closingCents: 2114950,
    });
  });

  it('reads one signed amount column, with CR and DR', () => {
    const csv = [
      'Date,Description,Ref,Amount,Balance',
      '2026-11-02,Card settlement,REF1,"1,000.00 CR",',
      '2026-11-03,Transfer out,REF2,-250.00,',
      '2026-11-04,Bank charges,REF3,25.00 DR,',
    ].join('\n');
    const r = readStatement(csv, { format: 'bank' });
    expect(r.errors).toEqual([]);
    expect(r.columns).toMatchObject({ date: 0, description: 1, reference: 2, amount: 3 });
    expect(r.lines.map((l) => [l.direction, l.amount_cents, l.kind])).toEqual([
      ['in', 100000, 'collection'],
      ['out', 25000, 'payout'],
      ['out', 2500, 'charge'],
    ]);
  });

  it('uses the columns chosen on screen over the ones it guessed', () => {
    const header = BANK_SAMPLE.split('\n')[4]!.split(',');
    const guessed = detectBankColumns(header);
    const r = readStatement(BANK_SAMPLE, {
      format: 'bank',
      columns: { ...guessed, reference: null, description: 3 },
    });
    expect(r.lines[0]).toMatchObject({ receipt: null, details: 'BSX123456' });
  });

  it('asks for a date and the amounts when they cannot be found', () => {
    const r = readStatement(BANK_SAMPLE, {
      format: 'bank',
      columns: {
        date: null,
        description: 2,
        reference: 3,
        moneyIn: null,
        moneyOut: null,
        amount: null,
        balance: 6,
      },
    });
    expect(r.errors.map((e) => e.message)).toEqual([
      'Choose the column with the date.',
      'Choose the columns with the amounts.',
    ]);
    expect(
      readStatement('Date,Narration\n2026-11-01,Tea', { format: 'bank' }).errors[0]!.message,
    ).toMatch(/No header row with a date and an amount/);
  });
});
