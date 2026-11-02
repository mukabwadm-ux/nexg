import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MerchantDecisionPage from './page';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

const merchantId = '3b1e199d-f616-4be1-8f77-7e83403c1f85';
const expiry = '2099-01-01T00:00:00Z';
let state: {
  user: { id: string; is_anonymous?: boolean } | null;
  authError: unknown;
  home: unknown;
  homeError: unknown;
  access: unknown;
  accessError: unknown;
  requests: { name: string; args: unknown }[];
  reads: string[];
};
beforeEach(() => {
  state = {
    user: { id: 'user-1' }, authError: null,
    home: { kind: 'merchant', id: merchantId, name: 'Private company', home: '/merchant' }, homeError: null,
    access: { state: 'rejected', setup: false, operations: false, expires_at: expiry,
      reason: 'Private rejection reason', review_state: 'rejected', revision: 4 }, accessError: null,
    requests: [], reads: [],
  };
  mocks.createClient.mockImplementation(() => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: state.authError }) },
    rpc: async (name: string, args?: unknown) => {
      state.requests.push({ name, args });
      return name === 'fn_partner_home'
        ? { data: state.home, error: state.homeError }
        : { data: state.access, error: state.accessError };
    },
    from: (table: string) => { state.reads.push(table); throw new Error('No section read is allowed.'); },
  }));
});

const render = async () => renderToStaticMarkup(await MerchantDecisionPage());
const expectRecovery = (html: string) => {
  expect(html).toContain('href="/help"');
  expect(html).toContain('href="/merchants/decision"');
  expect(html).toContain('>Sign out</button>');
  expect(html).not.toContain('href="/merchant"');
  expect(html).not.toContain(merchantId);
  expect(html).not.toContain('Private company');
  expect(html).not.toContain('Private rejection reason');
  expect(state.reads).toEqual([]);
};

describe('merchant application decision recovery', () => {
  it('shows a current rejected decision with recovery and no workspace grant or private fields', async () => {
    const html = await render();
    expect(html).toContain('Application not approved');
    expect(html).toContain('Your application was not approved.');
    expectRecovery(html);
    expect(state.requests).toEqual([
      { name: 'fn_partner_home', args: undefined },
      { name: 'rpc_merchant_workspace_access', args: { p_merchant_id: merchantId } },
    ]);
  });

  it.each([null, { id: 'anonymous', is_anonymous: true }])('requires an existing non-anonymous Auth user: %j', async user => {
    state.user = user;
    await expect(MerchantDecisionPage()).rejects.toThrow('redirect:/sign-in?reason=workspace-session');
    expect(state.requests).toEqual([]);
  });

  it('does not trust a user returned with an Auth error', async () => {
    state.authError = new Error('private auth failure');
    await expect(MerchantDecisionPage()).rejects.toThrow('redirect:/sign-in?reason=workspace-session');
    expect(state.requests).toEqual([]);
  });

  it.each([
    null,
    { kind: 'guest', id: merchantId, home: '/merchant' },
    { kind: 'merchant', id: 'invalid', home: '/merchant' },
    { kind: 'merchant', id: merchantId, home: '/merchants/decision' },
  ])('renders a safe restricted state for no current workspace or blocked authority: %j', async home => {
    state.home = home;
    state.access = { state: 'blocked', setup: false, operations: false, reason: 'Private rejection reason' };
    const html = await render();
    expect(html).toContain('Workspace access is restricted');
    expectRecovery(html);
  });

  it.each([undefined, 'invalid', '2020-01-01T00:00:00Z'])('does not display a rejected decision without a current session expiry: %s', async expires_at => {
    state.access = { state: 'rejected', setup: false, operations: false, expires_at };
    const html = await render();
    expect(html).toContain('Workspace access is restricted');
    expect(html).not.toContain('Application not approved');
    expectRecovery(html);
  });

  it.each([
    { state: 'pending', setup: true, operations: false, expires_at: expiry },
    { state: 'changes_requested', setup: true, operations: false, expires_at: expiry },
    { state: 'approved', setup: false, operations: true, expires_at: expiry,
      review_state: 'approved', revision: 4, needs_resubmission: false },
    { state: 'legacy', setup: true, operations: true },
  ])('returns restored %s capability to the guarded workspace', async access => {
    state.access = access;
    await expect(MerchantDecisionPage()).rejects.toThrow('redirect:/merchant');
    expect(state.reads).toEqual([]);
  });

  it.each([
    { state: 'pending', setup: false, operations: false },
    { state: 'approved', setup: false, operations: false },
    { state: 'changes_requested', setup: false, operations: false },
  ])('keeps a known decision without workspace capabilities restricted: %j', async access => {
    state.access = access;
    const html = await render();
    expect(html).toContain('Workspace access is restricted');
    expectRecovery(html);
  });

  it.each(['home', 'access', 'unknown', 'transport'])('renders generic unavailable recovery for %s failures', async failure => {
    if (failure === 'home') state.homeError = new Error('Private rejection reason');
    if (failure === 'access') state.accessError = new Error('Private rejection reason');
    if (failure === 'unknown') state.access = { state: 'unknown', setup: false, operations: false };
    if (failure === 'transport') mocks.createClient.mockImplementation(() => { throw new Error('Private rejection reason'); });
    const html = await render();
    expect(html).toContain('We could not check your application');
    expectRecovery(html);
  });
});
