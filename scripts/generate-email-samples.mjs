#!/usr/bin/env node
/**
 * Writes packages/contracts/src/email-concepts.ts from the email designs'
 * catalogue (docs/merchant-portal-plan/email-concept/catalogue.json), so
 * Admin > Settings > Notifications & templates can show every design with
 * its sample words.
 *
 *   node scripts/generate-email-samples.mjs
 *
 * Run it again after the catalogue changes, then `pnpm format`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogue = JSON.parse(
  readFileSync(join(root, 'docs/merchant-portal-plan/email-concept/catalogue.json'), 'utf8'),
);

const concepts = catalogue.map((e) => ({
  id: e.id,
  name: e.name,
  group: e.group,
  subject: e.subject,
  trigger: e.trigger ?? '',
  content: {
    audience: 'MERCHANT',
    eyebrow: e.eyebrow,
    tone: e.tone,
    title: e.title,
    ...(e.greeting ? { greeting: e.greeting } : {}),
    intro: e.intro,
    ...(e.code ? { code: e.code, codeLabel: e.codeLabel, expiry: e.expiry } : {}),
    ...(e.amount ? { amount: e.amount, amountLabel: e.amountLabel } : {}),
    ...(e.rows?.length ? { rows: e.rows } : {}),
    ...(e.steps?.length ? { steps: e.steps } : {}),
    ...(e.cta ? { action: { label: e.cta, url: 'https://www.nexgapp.com/merchant' } } : {}),
    ...(e.ctaNote ? { actionNote: e.ctaNote } : {}),
    ...(e.callout
      ? {
          callout: {
            title: e.callout.title,
            body: e.callout.body,
            ...(e.callout.tone === 'warning' ? { warning: true } : {}),
          },
        }
      : {}),
    ...(e.closing ? { closing: e.closing } : {}),
    ...(e.preheader ? { preheader: e.preheader } : {}),
  },
}));

const out = `/**
 * The house email designs' sample words, one per design in
 * docs/merchant-portal-plan/email-concept. Written by
 * scripts/generate-email-samples.mjs from its catalogue.json; do not edit.
 */
import type { EmailContent } from './email-design';

export interface EmailConcept {
  id: string;
  name: string;
  group: string;
  subject: string;
  trigger: string;
  content: EmailContent;
}

export const EMAIL_CONCEPTS: EmailConcept[] = ${JSON.stringify(concepts, null, 2)};
`;

writeFileSync(join(root, 'packages/contracts/src/email-concepts.ts'), out);
console.log(`Wrote ${concepts.length} designs to packages/contracts/src/email-concepts.ts`);
