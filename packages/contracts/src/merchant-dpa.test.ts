import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DPA,
  DPA_BLANKS,
  DPA_TEXT_SHA256,
  DPA_VERSION,
  MerchantDpaAnnex,
  annexValues,
  dpaText,
  fillDpaText,
  subClauseLabel,
  suggestedSensitiveData,
} from './merchant-dpa';

describe('Data Processing Agreement', () => {
  it('is the published wording: an edit needs a new version', () => {
    expect(createHash('sha256').update(dpaText()).digest('hex')).toBe(DPA_TEXT_SHA256);
    expect(DPA_VERSION).toBe(`2026-11-25+${DPA_TEXT_SHA256.slice(0, 12)}`);
  });

  it('has the clauses its cross-references name', () => {
    // "clause 13" (retention), "clause 11" (breach timeframe), "clauses 3–14".
    expect(DPA.clauses).toHaveLength(15);
    expect(DPA.clauses[12]!.heading).toBe('Data Retention and Deletion');
    expect(DPA.clauses[10]!.heading).toBe('Personal Data Breach Notification');
    expect(subClauseLabel(3, 2)).toBe('3.2.');
  });

  it('uses every blank, and fills each one', () => {
    const text = dpaText();
    for (const blank of Object.values(DPA_BLANKS)) expect(text).toContain(blank);
    const values = Object.fromEntries(
      Object.keys(DPA_BLANKS).map((key) => [key, `<${key}>`]),
    ) as Record<keyof typeof DPA_BLANKS, string>;
    const filled = dpaText(values);
    expect(filled).not.toMatch(/\{\{/);
    for (const key of Object.keys(DPA_BLANKS)) expect(filled).toContain(`<${key}>`);
    expect(() => fillDpaText('{{nope}}', values)).toThrow(/nope/);
  });

  it('is the version the database is told about', () => {
    const dir = resolve(__dirname, '../../../supabase/migrations');
    const seeded = readdirSync(dir)
      .filter((name) => name.endsWith('.sql'))
      .some((name) => readFileSync(resolve(dir, name), 'utf8').includes(`'${DPA_VERSION}'`));
    expect(seeded).toBe(true);
  });

  it('checks the Annex 1 answers', () => {
    const ok = MerchantDpaAnnex.parse({
      sensitive_data: '  None ',
      dpo_name: 'Jane  Wanjiru',
      dpo_email: ' Jane@Example.co.ke ',
      dpo_phone: '+254 712 345 678',
      odpc_registration: '',
    });
    expect(ok).toEqual({
      sensitive_data: 'None',
      dpo_name: 'Jane Wanjiru',
      dpo_email: 'jane@example.co.ke',
      dpo_phone: '+254 712 345 678',
      odpc_registration: null,
    });
    expect(annexValues(ok)).toEqual({
      sensitive_data: 'None',
      dpo_contact: 'Jane Wanjiru, jane@example.co.ke, +254 712 345 678',
      odpc_registration: 'Not applicable',
    });
    expect(MerchantDpaAnnex.safeParse({ ...ok, dpo_email: 'nope' }).success).toBe(false);
    expect(suggestedSensitiveData('pharmacy')).toMatch(/^Health data/);
    expect(suggestedSensitiveData('groceries')).toBe('None');
  });
});
