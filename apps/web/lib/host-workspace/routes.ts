export const localHostWorkspace = '/host';

export function localHostWorkspaceEnabled() {
  if (process.env.NODE_ENV !== 'development') return false;
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

const views: ReadonlyMap<string, string> = new Map([
  ['/host/properties', 'properties'],
  ['/host/units', 'properties'],
  ['/host/qr', 'qr-cards'],
  ['/host/bookings', 'reservations'],
  ['/host/requests', 'operations'],
  ['/host/operations', 'operations/handoff'],
  ['/host/deliveries', 'operations/deliveries'],
  ['/host/packages', 'operations/packages'],
  ['/host/earnings', 'financial-history'],
  ['/host/charge-to-room', 'financial-history/folios'],
  ['/host/analytics', 'qr-analytics'],
  ['/host/verify', 'setup/verify'],
  ['/host/messages', 'inbox'],
  ['/host/support', 'support-tickets'],
  ['/host/privacy', 'privacy-requests'],
  ['/host/settings', 'settings'],
  ['/host/team', 'settings/team'],
  ['/host/refer', 'settings/referrals'],
]);
const idPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function localHostBookmark(pathname: string, params: URLSearchParams) {
  if (pathname === '/host/workspace-preview') {
    const view = params.get('open');
    return view && view.length <= 100
      ? localHostWorkspace + '?' + new URLSearchParams({ open: view })
      : localHostWorkspace;
  }
  let view = views.get(pathname);
  const property = params.get('property');
  if (pathname === '/host/units' && property && idPattern.test(property)) {
    view = 'property/' + property + '/units';
  }
  if (pathname.startsWith('/host/messages/')) {
    const conversation = pathname.slice('/host/messages/'.length);
    if (idPattern.test(conversation)) view = 'inbox/' + conversation;
  }
  return view ? localHostWorkspace + '?' + new URLSearchParams({ open: view }) : null;
}
