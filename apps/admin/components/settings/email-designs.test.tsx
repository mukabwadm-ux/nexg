import { EMAIL_AREAS, EMAIL_PURPOSES } from '@nexg/contracts/email-design';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { EmailDesignsTab, type EmailDesignRow, type EmailOverview } from './email-designs';

vi.mock('@/app/settings/actions', () => ({
  loadEmailDesign: vi.fn(),
  setEmailDesignStatus: vi.fn(),
  uploadEmailDesign: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));

const html = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

const overview = (canEdit: boolean): EmailOverview => ({
  sent_24h: 1234,
  failed_24h: 2,
  waiting: 3,
  skipped_24h: 0,
  by_template: {
    'bell_merchant.live': { sent: 5, failed: 1 },
    form_rider: { sent: 2, failed: 0 },
  },
  can_edit: canEdit,
});

const live: EmailDesignRow = {
  id: 'd1',
  purpose: 'merchant.live',
  name: 'Launch look',
  file_name: 'launch.html',
  notes: 'For the launch week',
  status: 'live',
  size_bytes: 20_480,
  image_count: 2,
  uploaded_by: 'Owner',
  created_at: '2026-11-20T08:00:00Z',
  live_since: '2026-11-20T08:00:00Z',
  status_changed_at: null,
};

describe('Settings > Notifications & templates', () => {
  it('lists every email under its area, with what it sent and the design it uses', () => {
    const page = renderToStaticMarkup(
      <EmailDesignsTab designs={[live]} overview={overview(true)} unavailable={null} />,
    );
    for (const area of EMAIL_AREAS) expect(page).toContain(html(area));
    for (const purpose of EMAIL_PURPOSES) expect(page).toContain(html(purpose.label));
    expect(page).toContain('1,234');
    expect(page).toContain('3 waiting to go out');
    expect(page).toContain('5 sent, 1 failed');
    expect(page).toContain('Uploaded design live');
    expect(page).toContain('Launch look');
    expect(page).toContain('launch.html · 20 KB · 2 images · Owner, 20 Nov 2026');
    expect(page).toContain('Use the house design');
  });

  it('lets an editor upload a design for any purpose', () => {
    const page = renderToStaticMarkup(
      <EmailDesignsTab designs={[]} overview={overview(true)} unavailable={null} />,
    );
    expect(page).toContain('Upload a design');
    expect(page).toContain('Choose an email…');
    expect(page.match(/<option value="[a-z_.]+">/g)?.length).toBe(EMAIL_PURPOSES.length);
    expect(page).toContain('Download the starting file');
  });

  it('is view only for everyone else', () => {
    const page = renderToStaticMarkup(
      <EmailDesignsTab designs={[live]} overview={overview(false)} unavailable={null} />,
    );
    expect(page).not.toContain('Upload a design');
    expect(page).not.toContain('Use the house design');
    expect(page).toContain('View only.');
  });

  it('still shows the house designs before the database has the update', () => {
    const page = renderToStaticMarkup(
      <EmailDesignsTab designs={[]} overview={null} unavailable="Not switched on yet." />,
    );
    expect(page).toContain('Not switched on yet.');
    expect(page).toContain(html(EMAIL_PURPOSES[0]!.label));
    expect(page).not.toContain('Upload a design');
  });
});
