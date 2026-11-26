import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DeleteAccountPage from './page';

const { state, rpc } = vi.hoisted(() => ({
  state: { user: null as Record<string, unknown> | null, eligibility: null as unknown },
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc,
  }),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/components/site-header', () => ({ SiteHeader: () => null }));
vi.mock('@/components/site-footer', () => ({ SiteFooter: () => null }));

const page = async (searchParams?: { deleted?: string }) =>
  renderToStaticMarkup(await DeleteAccountPage({ searchParams }));

beforeEach(() => {
  state.user = null;
  state.eligibility = { eligible: true, blockers: {} };
  rpc.mockReset();
  rpc.mockImplementation(async () => ({ data: state.eligibility, error: null }));
});

describe('the account deletion page', () => {
  it('works signed out: who runs NexG, how to delete, and what is kept', async () => {
    const html = await page();
    expect(html).toContain('NexGenius Concierge Limited');
    expect(html).toContain('/sign-in?next=%2Faccount%2Fdelete');
    expect(html).toContain('derrick@nexgapp.com');
    expect(html).toContain('What is deleted');
    expect(html).toContain('up to 7 years');
    expect(html).not.toContain('type="checkbox"');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('treats a temporary session as signed out', async () => {
    state.user = { id: 'g', is_anonymous: true };
    expect(await page()).toContain('Sign in to delete your account');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('offers the deletion to a signed-in customer who may', async () => {
    state.user = { id: 'u', email: 'amina@example.test' };
    const html = await page();
    expect(html).toContain('amina@example.test');
    expect(html).toContain('type="checkbox"');
    expect(rpc).toHaveBeenCalledWith('rpc_my_account_deletion');
  });

  it('says what has to finish first instead', async () => {
    state.user = { id: 'u', email: 'amina@example.test' };
    state.eligibility = {
      eligible: false,
      blockers: { upcoming_stay: 'You have an upcoming stay.' },
    };
    const html = await page();
    expect(html).toContain('You have an upcoming stay.');
    expect(html).not.toContain('type="checkbox"');
  });

  it('confirms a finished deletion only to someone signed out', async () => {
    expect(await page({ deleted: '1' })).toContain('Your account has been deleted.');
    state.user = { id: 'u', email: 'amina@example.test' };
    expect(await page({ deleted: '1' })).not.toContain('Your account has been deleted.');
  });
});
