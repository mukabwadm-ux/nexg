import { describe, expect, it } from 'vitest';

import type { MerchantWorkspaceAccess } from './merchant-access';
import { openBeforeApproval, verificationNotice } from './merchant-verification';

const base: MerchantWorkspaceAccess = {
  state: 'pending',
  setup: true,
  operations: false,
  review_state: 'draft',
  revision: 1,
  needs_resubmission: false,
};

describe('what an unapproved merchant can open', () => {
  it('opens only Home, Business and Documents before approval', () => {
    const open = ['Home', 'Work', 'Offerings', 'Business', 'Documents', 'Money', 'Settings'].filter(
      (label) => openBeforeApproval(label as never, base),
    );
    expect(open).toEqual(['Home', 'Business', 'Documents']);
  });

  it('keeps Business and Documents locked for someone who cannot edit setup', () => {
    expect(openBeforeApproval('Business', { ...base, setup: false })).toBe(false);
    expect(openBeforeApproval('Documents', { ...base, setup: false })).toBe(false);
    expect(openBeforeApproval('Home', { ...base, setup: false })).toBe(true);
  });
});

describe('the verification message', () => {
  it('asks a merchant who has not submitted to submit for verification', () => {
    const notice = verificationNotice(base, 'm-1', false);
    expect(notice?.title).toBe('Please submit your details for verification');
    expect(notice?.action?.href).toBe('/merchants/register?merchantId=m-1');
  });

  it('says the details are being verified once submitted', () => {
    const notice = verificationNotice({ ...base, review_state: 'pending' }, 'm-1', false);
    expect(notice?.title).toBe('Your details are being verified');
    expect(notice?.action).toBeUndefined();
  });

  it('asks for a resubmission when changes were requested or saved changes are newer', () => {
    expect(
      verificationNotice(
        { ...base, state: 'changes_requested', review_state: 'changes_requested' },
        'm-1',
        false,
      )?.title,
    ).toBe('Changes requested: please update and resubmit');
    expect(
      verificationNotice(
        { ...base, review_state: 'pending', needs_resubmission: true },
        'm-1',
        false,
      )?.title,
    ).toBe('Changes requested: please update and resubmit');
  });

  it('shows nothing once the workspace is approved and active', () => {
    expect(
      verificationNotice(
        { ...base, state: 'approved', review_state: 'approved', operations: true },
        'm-1',
        false,
      ),
    ).toBeNull();
    expect(verificationNotice({ ...base, state: 'legacy' }, 'm-1', false)).toBeNull();
  });

  it('tells an approved merchant on an unverified email to verify it', () => {
    expect(
      verificationNotice({ ...base, state: 'approved', review_state: 'approved' }, 'm-1', true)
        ?.title,
    ).toBe('Your account is approved');
  });
});
