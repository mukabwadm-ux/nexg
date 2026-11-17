import { createHash } from 'node:crypto';

import { MERCHANT_AGREEMENTS } from '@nexg/contracts/merchant-agreements';
import { describe, expect, it } from 'vitest';

import {
  AGREEMENT_FIELDS,
  TEMPLATE_AGREEMENTS,
  agreementTitle,
  buildAgreement,
  fillValues,
  ordinal,
  sourceSha256,
  templateText,
  type ResolvedBlock,
} from './document';
import { sampleFill } from './fixtures';

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const text = (blocks: ResolvedBlock[]) =>
  blocks
    .flatMap((b) =>
      b.kind === 'p'
        ? [b.runs.map((r) => r.text).join('')]
        : b.kind === 'table'
          ? b.rows.flat(2).map((p) => p.runs.map((r) => r.text).join(''))
          : [],
    )
    .join('\n');

describe('merchant agreement template', () => {
  it('has a template for each of the 18 published agreements, under the same title', () => {
    expect([...TEMPLATE_AGREEMENTS].sort()).toEqual(MERCHANT_AGREEMENTS.map((a) => a.id).sort());
    for (const agreement of MERCHANT_AGREEMENTS)
      expect(agreementTitle(agreement.id)).toBe(agreement.title);
  });

  it('reproduces the text of every Word original exactly', () => {
    for (const id of TEMPLATE_AGREEMENTS)
      expect(sha256(templateText(id)), id).toBe(sourceSha256(id));
  });

  it('names the 25 blanks of the published agreements', () => {
    expect(Object.keys(AGREEMENT_FIELDS).sort()).toEqual(
      [
        'biweekly_box',
        'commission_pct',
        'company_email',
        'company_phone',
        'company_po_box',
        'company_rep_name',
        'company_rep_title',
        'cover_day',
        'cover_month_year',
        'in_room_pct',
        'made_day',
        'made_month_year',
        'merchant_address',
        'merchant_cover',
        'merchant_email',
        'merchant_kra_pin',
        'merchant_name',
        'merchant_party',
        'merchant_phone',
        'merchant_postal',
        'merchant_principal',
        'merchant_registration',
        'merchant_rep_name',
        'merchant_rep_title',
        'weekly_box',
      ].sort(),
    );
    // A fill gives every one of them a value.
    const values = fillValues(sampleFill());
    for (const field of Object.keys(AGREEMENT_FIELDS)) expect(values[field], field).toBeTruthy();
  });

  it('numbers the clauses as Word printed them', () => {
    const labels = (id: string) =>
      buildAgreement(id).blocks.flatMap((b) =>
        b.kind === 'p' && b.heading && b.label ? [b.label] : [],
      );
    expect(labels('beauty')).toHaveLength(19);
    expect(labels('beauty')[16]).toBe('17.');
    // Alcohol, Adults Only and Financial Services have an age-verification clause.
    expect(labels('alcohol-and-beverages')).toHaveLength(20);
    const beauty = buildAgreement('beauty').blocks;
    const notices = beauty.find(
      (b) =>
        b.kind === 'p' &&
        b.runs
          .map((r) => r.text)
          .join('')
          .startsWith('A notice under this Agreement'),
    );
    expect(notices && notices.kind === 'p' && notices.label).toBe('16.1');
  });

  it('fills every blank, and signs instead of leaving witness lines', () => {
    const fill = sampleFill();
    const doc = buildAgreement('beauty', fill);
    const all = text(doc.blocks);
    expect(all).not.toMatch(/_{4,}|\.{6,}|\(Merchant business name\)|\(address\)|☐ Weekly/);
    expect(all).toContain('DATED THE 17TH DAY OF NOVEMBER 2026');
    expect(all).toContain('is made on the 17th day of November, 2026');
    expect(all).toContain(
      'Sample Beauty Limited, a business duly registered in Kenya under registration number PVT-SAMPLE01, of Shop 4, Sample Mall, Ngong Road, Nairobi, KRA PIN P000000000A (the “Merchant”).',
    );
    expect(all).toContain('P.O. Box 00000-00100, Nairobi, Kenya');
    expect(all).toContain('14 % of Order value');
    expect(all).toContain('10 % of Order value, split per the Property Partner Agreement');
    expect(all).toContain('☒ Weekly');
    expect(all).not.toContain('ADVOCATE');
    const execution = doc.blocks.filter((b) => b.kind === 'execution');
    expect(execution).toHaveLength(1);
    // The blank template keeps the original's execution table.
    expect(text(buildAgreement('beauty').blocks)).toContain('ADVOCATE');
  });

  it('writes dates the way the agreements do', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '31st',
    ]);
    // Nairobi time decides the day: 22:30 UTC on the 16th is the 17th in Nairobi.
    const late = { ...sampleFill(), issuedAt: new Date('2026-11-16T22:30:00Z') };
    expect(fillValues(late).made_day).toBe('17th');
  });
});
