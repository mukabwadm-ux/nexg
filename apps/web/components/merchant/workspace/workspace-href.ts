/** Shell links stay in the authenticated merchant route tree and carry no captured input. */
export function safeMerchantWorkspaceHref(value: string): string | null {
  return value === '/merchant' || /^\/merchant(?:\/[a-z][a-z0-9-]*)+$/.test(value) ? value : null;
}
