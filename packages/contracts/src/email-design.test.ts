import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { EMAIL_CONCEPTS } from './email-concepts';
import {
  EMAIL_AREAS,
  EMAIL_PURPOSES,
  checkDesign,
  composeEmailHtml,
  designWarnings,
  emailPurpose,
  fromPlainEmail,
  purposeForTemplate,
  renderHouseEmail,
  renderUploadedEmail,
  replaceImageNames,
  starterDesign,
  supabaseCodeTemplate,
  supabaseRecoveryTemplate,
} from './email-design';
import { fillSupabaseTemplate, sampleEmail } from './email-samples';

const repo = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8').replace(
    /\r\n/g,
    '\n',
  );

describe('purposes', () => {
  it('have unique keys the database accepts, in a known area', () => {
    const keys = EMAIL_PURPOSES.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const purpose of EMAIL_PURPOSES) {
      expect(purpose.key).toMatch(/^[a-z_]+(\.[a-z_]+)?$/);
      expect(EMAIL_AREAS as readonly string[]).toContain(purpose.area);
    }
  });

  it('use each house design once, and only designs that exist', () => {
    const ids = EMAIL_CONCEPTS.map((c) => c.id);
    const used = EMAIL_PURPOSES.flatMap((p) => (p.conceptId ? [p.conceptId] : []));
    expect(new Set(used).size).toBe(used.length);
    expect([...used].sort()).toEqual([...ids].sort());
  });

  it('match the emails NexG sends today', () => {
    const cases: [string, string][] = [
      ['bell_merchant.live', 'merchant.live'],
      ['partner_merchant_live', 'merchant.live'],
      ['bell_merchant.application_approved', 'merchant.approved'],
      ['bell_merchant.setup_reminder', 'merchant.setup'],
      ['bell_merchant.suspended', 'merchant.restricted'],
      ['bell_merchant.resumed', 'merchant.restored'],
      ['bell_merchant.holiday_reminder', 'merchant.holiday_reminder'],
      ['bell_merchant.vacancy_application', 'careers.employer'],
      ['bell_merchant.something_new', 'merchant.other'],
      ['bell_careers.vacancy_taken_down', 'careers.employer'],
      ['bell_careers.application_update', 'careers.application_update'],
      ['bell_order.delivered', 'guest.order'],
      ['bell_refund.issued', 'guest.refund'],
      ['bell_rider.active', 'rider.status'],
      ['bell_staff.merchant.submitted', 'staff.alert'],
      ['staff_approval_waiting', 'staff.alert'],
      ['host_booking_cancelled', 'merchant.work_cancelled'],
      ['host_payout_details', 'partner.payout_details_changed'],
      ['host_payout_verified', 'partner.payout_details_verified'],
      ['host_receipt', 'applicant.receipt'],
      ['job_receipt', 'applicant.receipt'],
      ['host_something_else', 'host.update'],
      ['merchant_team_invite', 'merchant.team_invitation'],
      ['partner_update', 'partner.update'],
      ['form_rider', 'forms.alert'],
      ['receipt', 'guest.receipt'],
      ['invoice_sent', 'finance.document'],
      ['anything_else', 'all'],
    ];
    for (const [template, purpose] of cases) {
      expect([template, purposeForTemplate(template).key]).toEqual([template, purpose]);
    }
  });
});

describe('a plain email in the house design', () => {
  const bell = fromPlainEmail({
    subject: 'Your business is approved',
    body: 'Karibu Kitchen can now finish setting up.\n\nOpen it: https://nexgapp.com/merchant\n\n— NexG',
    purpose: emailPurpose('merchant.approved'),
  });

  it('turns the link line into the button and drops the signature', () => {
    expect(bell.title).toBe('Your business is approved');
    expect(bell.intro).toBe('Karibu Kitchen can now finish setting up.');
    expect(bell.action).toEqual({
      label: 'Review go-live setup',
      url: 'https://nexgapp.com/merchant',
    });
    expect(bell.eyebrow).toBe('BUSINESS APPROVED');
    expect(bell.tone).toBe('green');
  });

  it('finds a greeting and a receipt link', () => {
    const receipt = fromPlainEmail({
      subject: 'Receipt R-1 · KES 10.00',
      body: 'Hi Amina,\n\nYour NexG receipt R-1\n\nView or print it: https://www.nexgapp.com/receipts/R-1\n\n— NexG Concierge',
      purpose: emailPurpose('guest.receipt'),
    });
    expect(receipt.greeting).toBe('Hi Amina,');
    expect(receipt.intro).toBe('Your NexG receipt R-1');
    expect(receipt.action?.url).toBe('https://www.nexgapp.com/receipts/R-1');
  });

  it('renders inbox-safe HTML with the words escaped', () => {
    const html = renderHouseEmail({ ...bell, intro: 'Tom & <Jerry> "quoted"' });
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('Tom &amp; &lt;Jerry&gt; &quot;quoted&quot;');
    expect(html).toContain('https://www.nexgapp.com/email/nexg-wordmark.png');
    expect(html).toContain('href="https://nexgapp.com/merchant"');
    expect(html).toContain('Review go-live setup');
    expect(html).toContain('BUSINESS APPROVED');
    expect(html).toContain('Here to help,');
  });

  it('is what a sender gets back, or null so it sends the text alone', () => {
    const html = composeEmailHtml({
      subject: 'Hello',
      text: 'Words',
      purpose: 'merchant.live',
      assetBase: '',
    });
    expect(html).toContain('src="/email/nexg-wordmark.png"');
    expect(html).toContain('YOUR BUSINESS IS LIVE');
  });
});

describe('uploaded designs', () => {
  const content = {
    title: 'T <1>',
    intro: 'Body',
    action: { label: 'Go', url: 'https://x.test/a' },
  };

  it('must have a place for the message and no script', () => {
    expect(
      checkDesign('<html><body>{{content}} and enough text here</body></html>', 'merchant.live'),
    ).toEqual([]);
    expect(
      checkDesign('<html><body>no message placeholder in this file</body></html>', 'merchant.live'),
    ).toHaveLength(1);
    expect(
      checkDesign(
        '<html><body>{{content}}<script>alert(1)</script></body></html>',
        'merchant.live',
      ),
    ).toHaveLength(1);
    expect(
      checkDesign('<html><body>{{content}} and enough text here</body></html>', 'nonsense'),
    ).toHaveLength(1);
  });

  it('for a Supabase email must keep what Supabase fills in', () => {
    expect(
      checkDesign('<html><body>{{content}} but no token at all</body></html>', 'auth.code'),
    ).toHaveLength(1);
    expect(
      checkDesign('<html><body>Your code is {{ .Token }} today</body></html>', 'auth.code'),
    ).toEqual([]);
  });

  it('are filled in, unknown placeholders dropped and Supabase fields kept', () => {
    const html = renderUploadedEmail(
      '<h1>{{title}}</h1>{{ content }}{{action}}<p>{{unknown}}{{ .Token }}</p>',
      content,
    );
    expect(html).toContain('<h1>T &lt;1&gt;</h1>');
    expect(html).toContain('Body');
    expect(html).toContain('href="https://x.test/a"');
    expect(html).not.toContain('{{unknown}}');
    expect(html).toContain('{{ .Token }}');
  });

  it('warn about images named by file and swap them for uploaded copies', () => {
    const design =
      '<img src="assets/logo.png"><img src="https://cdn.test/a.png"><td style="background:url(\'hero.jpg\')">';
    expect(designWarnings(design)).toHaveLength(1);
    const swapped = replaceImageNames(design, {
      'logo.png': 'https://store.test/logo.png',
      'hero.jpg': 'https://store.test/hero.jpg',
    });
    expect(swapped).toContain('src="https://store.test/logo.png"');
    expect(swapped).toContain('src="https://cdn.test/a.png"');
    expect(swapped).toContain("url('https://store.test/hero.jpg')");
    expect(designWarnings(swapped)).toEqual([]);
  });

  it('start from a file that passes the checks', () => {
    expect(checkDesign(starterDesign(), 'merchant.live')).toEqual([]);
  });
});

describe('Supabase emails', () => {
  it('keep every field and branch Supabase needs', () => {
    expect(supabaseCodeTemplate()).toContain('{{ .Token }}');
    const recovery = supabaseRecoveryTemplate();
    const opens = recovery.match(/\{\{ if /g)?.length ?? 0;
    const ends = recovery.match(/\{\{ end \}\}/g)?.length ?? 0;
    expect(opens).toBeGreaterThan(5);
    expect(opens).toBe(ends);
    for (const next of [
      '%2Freset-password%3Fnext%3D%252Fhost',
      '%2Freset-password%3Fnext%3D%252Frider',
      '%2Freset-password%3Fnext%3D%252Fmerchant',
      'next=%2Freset-password"',
    ]) {
      expect(recovery).toContain(next);
    }
    expect(checkDesign(recovery, 'auth.password_reset')).toEqual([]);
  });

  it('come out right for a reset and for each welcome', () => {
    const recovery = supabaseRecoveryTemplate();
    const reset = fillSupabaseTemplate(recovery);
    expect(reset).toContain('Choose a new password');
    expect(reset).not.toContain('Set your password');
    expect(reset).not.toContain('{{');

    const merchant = fillSupabaseTemplate(recovery, {
      'Data.nexg_welcome': true,
      'Data.nexg_welcome_business': 'Karibu Kitchen',
      'Data.nexg_welcome_first_name': 'Amina',
    });
    expect(merchant).toContain('Welcome to NexG, Amina');
    expect(merchant).toContain('<strong>Karibu Kitchen</strong>');
    expect(merchant).toContain('next=%2Freset-password%3Fnext%3D%252Fmerchant');
    expect(merchant).not.toContain('Choose a new password');

    const host = fillSupabaseTemplate(recovery, {
      'Data.nexg_welcome': true,
      'Data.nexg_welcome_host': true,
    });
    expect(host).toContain('NexG Hosts');
    expect(host).toContain('%252Fhost');
    expect(host).not.toContain('%252Fmerchant');
  });

  it('are the files in supabase/templates (run node scripts/sync-email-design.mjs)', () => {
    expect(repo('supabase/templates/otp-code.html')).toBe(`${supabaseCodeTemplate()}\n`);
    expect(repo('supabase/templates/password-recovery.html')).toBe(
      `${supabaseRecoveryTemplate()}\n`,
    );
  });
});

describe('the copy notify-dispatch runs', () => {
  it('is this file (run node scripts/sync-email-design.mjs)', () => {
    expect(repo('supabase/functions/notify-dispatch/email-design.ts')).toBe(
      repo('packages/contracts/src/email-design.ts'),
    );
  });
});

describe('previews', () => {
  it('have sample words for every purpose', () => {
    for (const purpose of EMAIL_PURPOSES) {
      const sample = sampleEmail(purpose);
      expect(sample.subject.length).toBeGreaterThan(0);
      expect(renderHouseEmail(sample.content)).toContain('<h1');
    }
  });
});
