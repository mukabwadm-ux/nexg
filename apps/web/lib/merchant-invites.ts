/**
 * Join every business that invited this account.
 *
 * An owner invites somebody by email from the Team page, and the invitation
 * says to sign in at nexgapp.com with that address. Whatever way they sign
 * in or sign up, the moment their confirmed address is known this turns the
 * open invitations for it into memberships (`rpc_merchant_invites_accept`).
 *
 * Best effort by design: a failure here must never stop somebody signing
 * in. The invitation stays open and the next sign-in, or a visit to
 * /merchants/join, tries again.
 */
export async function acceptMerchantInvites(client: unknown): Promise<number> {
  try {
    const { data, error } = await (
      client as { rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }> }
    ).rpc('rpc_merchant_invites_accept');
    if (error) return 0;
    const joined = (data as { joined?: unknown } | null)?.joined;
    return Array.isArray(joined) ? joined.length : 0;
  } catch {
    return 0;
  }
}
