import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export interface OAuthStateClaims {
  businessId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  includeFreeBusy: boolean;
}

export class GoogleSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSecurityError';
  }
}

function requireIdentity(value: string): void {
  if (!value || value.length > 256)
    throw new GoogleSecurityError('A bounded business and user identity is required.');
}

function signingKey(secret: string | Uint8Array): Buffer {
  const key = Buffer.from(secret);
  if (key.length < 32)
    throw new GoogleSecurityError('OAuth state requires a server secret of at least 32 bytes.');
  return key;
}

/** Persist nonce + identity + expiry before redirecting. Never expose the signing secret. */
export function mintOAuthState(input: {
  businessId: string;
  userId: string;
  secret: string | Uint8Array;
  includeFreeBusy?: boolean;
  ttlSeconds?: number;
  now?: number;
}): { state: string; claims: OAuthStateClaims } {
  requireIdentity(input.businessId);
  requireIdentity(input.userId);
  const ttl = input.ttlSeconds ?? 600;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 600)
    throw new GoogleSecurityError('OAuth state lifetime must be between 1 and 600 seconds.');
  const issuedAt = Math.floor((input.now ?? Date.now()) / 1000);
  const claims: OAuthStateClaims = {
    businessId: input.businessId,
    userId: input.userId,
    nonce: randomBytes(32).toString('base64url'),
    issuedAt,
    expiresAt: issuedAt + ttl,
    includeFreeBusy: input.includeFreeBusy === true,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', signingKey(input.secret))
    .update(payload)
    .digest('base64url');
  return { state: `${payload}.${signature}`, claims };
}

/** consumeNonce MUST atomically delete/mark the persisted nonce and reject replay. */
export async function verifyOAuthState(input: {
  state: string;
  secret: string | Uint8Array;
  expectedBusinessId: string;
  expectedUserId: string;
  consumeNonce: (claims: OAuthStateClaims) => Promise<boolean>;
  now?: number;
}): Promise<OAuthStateClaims> {
  requireIdentity(input.expectedBusinessId);
  requireIdentity(input.expectedUserId);
  if (input.state.length > 4096) throw new GoogleSecurityError('Invalid OAuth state.');
  const [payload, signature, extra] = input.state.split('.');
  if (!payload || !signature || extra) throw new GoogleSecurityError('Invalid OAuth state.');
  const expected = createHmac('sha256', signingKey(input.secret)).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new GoogleSecurityError('Invalid OAuth state signature.');
  let claims: OAuthStateClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthStateClaims;
  } catch {
    throw new GoogleSecurityError('Invalid OAuth state payload.');
  }
  const now = Math.floor((input.now ?? Date.now()) / 1000);
  if (
    !claims ||
    claims.businessId !== input.expectedBusinessId ||
    claims.userId !== input.expectedUserId ||
    typeof claims.nonce !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(claims.nonce) ||
    !Number.isInteger(claims.issuedAt) ||
    !Number.isInteger(claims.expiresAt) ||
    claims.issuedAt > now + 30 ||
    claims.expiresAt <= now ||
    claims.expiresAt - claims.issuedAt > 600 ||
    claims.expiresAt <= claims.issuedAt ||
    typeof claims.includeFreeBusy !== 'boolean'
  ) {
    throw new GoogleSecurityError('OAuth state is expired or belongs to another session.');
  }
  if (!(await input.consumeNonce(claims)))
    throw new GoogleSecurityError(
      'OAuth state has already been used or was not issued for this session.',
    );
  return claims;
}

export interface TokenBinding {
  businessId: string;
  userId: string;
}
function encryptionKey(key: Uint8Array): Buffer {
  if (key.byteLength !== 32)
    throw new GoogleSecurityError('Token encryption requires exactly 32 random bytes.');
  return Buffer.from(key);
}
function associatedData(binding: TokenBinding): Buffer {
  requireIdentity(binding.businessId);
  requireIdentity(binding.userId);
  return Buffer.from(JSON.stringify(['nexg-google-tokens-v1', binding.businessId, binding.userId]));
}

/** Use a secret-manager key. Store only the returned ciphertext in the connection record. */
export function encryptGoogleTokens<T extends object>(
  tokens: T,
  key: Uint8Array,
  binding: TokenBinding,
): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), nonce);
  cipher.setAAD(associatedData(binding));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return [
    'v1',
    nonce.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptGoogleTokens<T extends object>(
  sealed: string,
  key: Uint8Array,
  binding: TokenBinding,
): T {
  const [version, noncePart, tagPart, ciphertextPart, extra] = sealed.split('.');
  if (version !== 'v1' || !noncePart || !tagPart || !ciphertextPart || extra)
    throw new GoogleSecurityError('Invalid encrypted token envelope.');
  const nonce = Buffer.from(noncePart, 'base64url');
  const tag = Buffer.from(tagPart, 'base64url');
  if (nonce.length !== 12 || tag.length !== 16)
    throw new GoogleSecurityError('Invalid encrypted token envelope.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), nonce);
    decipher.setAAD(associatedData(binding));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64url')),
      decipher.final(),
    ]);
    const parsed: unknown = JSON.parse(plaintext.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Object required');
    return parsed as T;
  } catch {
    throw new GoogleSecurityError('Token decryption failed.');
  }
}
