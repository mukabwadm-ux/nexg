import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/uploads', () => ({ uploadDocument: vi.fn() }));
vi.mock('@/components/partner/use-live', () => ({ useLive: vi.fn() }));

import { seedBusiness, type Business } from './model';
import { DocumentsView, type LiveDocuments, type ViewProps } from './views';

const REQUIREMENT = '11111111-1111-4111-8111-111111111111';

/** One business document as the live Business page maps it from a requirement. */
function liveBusiness(): Business {
  const data = seedBusiness();
  return {
    ...data,
    documents: [
      {
        id: REQUIREMENT,
        name: 'Business registration certificate',
        scope: 'Business',
        optional: false,
        current: 'Verified',
        version: 0,
        replacement: 'None',
        reason: '',
        filename: '',
        size: 0,
        expires: '',
        note: '',
      },
    ],
  };
}

const EVIDENCE: LiveDocuments = {
  ownerId: '22222222-2222-4222-8222-222222222222',
  requirements: [
    {
      id: REQUIREMENT,
      kind: 'business_registration',
      label: 'Business registration certificate',
      help_text: null,
      why_text: null,
      has_expiry: false,
      essential: true,
      sort: 1,
    },
  ],
  onFile: [
    {
      requirement_id: REQUIREMENT,
      status: 'verified',
      rejection_reason: null,
      expires_at: null,
      side: null,
      created_at: '2026-11-18T08:00:00+00:00',
    },
  ],
  asked: [],
};

function render(props: Partial<ViewProps>) {
  const noop = () => {};
  return renderToStaticMarkup(
    <DocumentsView
      data={liveBusiness()}
      readOnly
      live
      edit={noop}
      save={async () => {}}
      message={noop}
      preview={noop}
      request={noop}
      {...props}
    />,
  );
}

describe('the Business documents panel', () => {
  it('uploads for real on a live business: the shared uploader, enabled', () => {
    const html = render({ liveDocuments: EVIDENCE });
    expect(html).toMatch(/<input[^>]*type="file"/);
    expect(html).not.toMatch(/<input[^>]*type="file"[^>]*disabled/);
    expect(html).not.toContain('Confirmed sample record');
    expect(html).not.toContain('local selection only');
    expect(html).toContain('Uploading a file does not verify it');
  });

  it('says who uploads when this person may not', () => {
    const html = render({ liveDocuments: null });
    expect(html).toContain('The application owner uploads and replaces business documents.');
    expect(html).not.toMatch(/<input[^>]*type="file"/);
  });

  it('keeps the design preview form outside a live business', () => {
    const html = render({ live: false, readOnly: false, data: seedBusiness() });
    expect(html).toContain('Upload replacement file');
  });
});
