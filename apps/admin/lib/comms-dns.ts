import 'server-only';

import { resolveTxt } from 'node:dns/promises';

export type DnsState = 'configured' | 'missing' | 'unknown';

export interface DomainCheck {
  domain: string;
  spf: DnsState;
  dkim: DnsState;
  dmarc: DnsState;
  spfAt: string | null;
}

async function txt(name: string): Promise<string[] | null> {
  try {
    const records = await Promise.race([
      resolveTxt(name),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);
    return records.map((parts) => parts.join(''));
  } catch (e) {
    const code = (e as { code?: string }).code;
    /* No such name or no TXT there is an answer: it is missing. Anything else we could not tell. */
    return code === 'ENOTFOUND' || code === 'ENODATA' ? [] : null;
  }
}

/**
 * The sender domain's email authentication, read from public DNS: SPF (on
 * the domain or Resend's `send.` subdomain), Resend's DKIM key
 * (`resend._domainkey`) and DMARC (`_dmarc`). Nothing is stored.
 */
export async function checkDomain(
  fromEmail: string | null | undefined,
): Promise<DomainCheck | null> {
  const domain = fromEmail?.split('@')[1]?.toLowerCase().trim();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  const [root, send, dkim, dmarc] = await Promise.all([
    txt(domain),
    txt(`send.${domain}`),
    txt(`resend._domainkey.${domain}`),
    txt(`_dmarc.${domain}`),
  ]);
  const has = (r: string[] | null, re: RegExp): DnsState =>
    r === null ? 'unknown' : r.some((v) => re.test(v)) ? 'configured' : 'missing';
  const spfRoot = has(root, /^v=spf1/i);
  const spfSend = has(send, /^v=spf1/i);
  return {
    domain,
    spf:
      spfSend === 'configured' || spfRoot === 'configured'
        ? 'configured'
        : spfRoot === 'unknown'
          ? 'unknown'
          : 'missing',
    spfAt: spfSend === 'configured' ? `send.${domain}` : spfRoot === 'configured' ? domain : null,
    dkim: has(dkim, /p=/i),
    dmarc: has(dmarc, /^v=DMARC1/i),
  };
}
