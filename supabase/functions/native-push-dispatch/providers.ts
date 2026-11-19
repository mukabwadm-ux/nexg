import { apnsMessage, fcmMessage, type Delivery } from './payload.ts';

export type Outcome = 'sent' | 'retry' | 'gone' | 'failed' | 'expired';
type Environment = (key: string) => string | undefined;
type ProviderFetch = (input: string, init: RequestInit) => Promise<Response>;

type ProviderDeps = {
  read: Environment;
  fetch: ProviderFetch;
  now: () => number;
};

type JwtKey = { alg: 'ES256' | 'RS256'; key: string; kid?: string };

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

async function jwt(config: JwtKey, claims: Record<string, unknown>) {
  const encode = (record: Record<string, unknown>) =>
    base64Url(new TextEncoder().encode(JSON.stringify(record)));
  const content =
    encode({ alg: config.alg, ...(config.kid ? { kid: config.kid } : {}) }) + '.' + encode(claims);
  const pem = config.key.replaceAll('\\n', '\n').replace(/-----[^-]+-----|\s/g, '');
  const pkcs8 = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const algorithm =
    config.alg === 'ES256'
      ? { name: 'ECDSA', namedCurve: 'P-256' }
      : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const key = await crypto.subtle.importKey('pkcs8', pkcs8, algorithm, false, ['sign']);
  const signature = await crypto.subtle.sign(
    config.alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : algorithm,
    key,
    new TextEncoder().encode(content),
  );
  return content + '.' + base64Url(new Uint8Array(signature));
}

function retryable(response: Response) {
  return response.status === 429 || response.status === 408 || response.status >= 500;
}

export function createNativeSender({ read, fetch, now }: ProviderDeps) {
  let apple: { value: string; expires: number } | null = null;
  let google: { value: string; expires: number } | null = null;
  let refreshingGoogle: Promise<string | null> | null = null;
  const request = (url: string, init: RequestInit) =>
    fetch(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(6500),
    });

  async function appleToken() {
    if (apple && apple.expires > now()) return apple.value;
    const key = read('D8_APNS_KEY');
    const kid = read('D8_APNS_KEY_ID');
    const team = read('D8_APNS_TEAM_ID');
    if (!key || !kid || !team) return null;
    const created = now();
    const value = await jwt(
      { alg: 'ES256', key, kid },
      { iss: team, iat: Math.floor(created / 1000) },
    );
    apple = { value, expires: created + 45 * 60_000 };
    return value;
  }

  async function refreshGoogleToken() {
    const identity = read('D8_FCM_CLIENT_EMAIL');
    const key = read('D8_FCM_PRIVATE_KEY');
    if (!identity || !key) return null;
    const iat = Math.floor(now() / 1000);
    const endpoint = 'https://oauth2.googleapis.com/token';
    const assertion = await jwt(
      { alg: 'RS256', key },
      {
        iss: identity,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: endpoint,
        iat,
        exp: iat + 3600,
      },
    );
    const response = await request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (
      typeof data.access_token !== 'string' ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in <= 60
    ) {
      return null;
    }
    google = {
      value: data.access_token,
      expires: now() + (Math.min(data.expires_in, 3600) - 60) * 1000,
    };
    return google.value;
  }

  function googleToken() {
    if (google && google.expires > now()) return Promise.resolve(google.value);
    if (!refreshingGoogle) {
      refreshingGoogle = refreshGoogleToken().finally(() => {
        refreshingGoogle = null;
      });
    }
    return refreshingGoogle;
  }

  return async (delivery: Delivery): Promise<Outcome> => {
    const expiry = Date.parse(delivery.expires_at);
    if (!Number.isFinite(expiry) || expiry <= now()) return 'expired';
    try {
      if (delivery.platform === 'ios') {
        const credential = await appleToken();
        if (!credential) return 'retry';
        if (expiry <= now()) return 'expired';
        const host =
          delivery.environment === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
        const payload = apnsMessage(delivery, now());
        const response = await request(
          'https://' + host + '/3/device/' + encodeURIComponent(delivery.token),
          {
            method: 'POST',
            headers: {
              ...payload.headers,
              authorization: 'bearer ' + credential,
              'content-type': 'application/json',
            },
            body: JSON.stringify(payload.body),
          },
        );
        if (response.ok) return 'sent';
        if (response.status === 410) return 'gone';
        if (response.status === 403) apple = null;
        return retryable(response) ? 'retry' : 'failed';
      }

      const project = read(
        delivery.environment === 'sandbox' ? 'D8_FCM_SANDBOX_PROJECT' : 'D8_FCM_PROJECT',
      );
      if (!project || !/^[a-z0-9-]{6,63}$/.test(project)) return 'retry';
      const credential = await googleToken();
      if (!credential) return 'retry';
      if (expiry <= now()) return 'expired';
      const response = await request(
        'https://fcm.googleapis.com/v1/projects/' + project + '/messages:send',
        {
          method: 'POST',
          headers: { authorization: 'Bearer ' + credential, 'content-type': 'application/json' },
          body: JSON.stringify(fcmMessage(delivery, now())),
        },
      );
      if (response.ok) return 'sent';
      const error = await response.json().catch(() => null);
      if (
        response.status === 404 &&
        Array.isArray(error?.error?.details) &&
        error.error.details.some(
          (detail: { errorCode?: string }) => detail?.errorCode === 'UNREGISTERED',
        )
      ) {
        return 'gone';
      }
      if (response.status === 401) google = null;
      return retryable(response) ? 'retry' : 'failed';
    } catch {
      return 'retry';
    }
  };
}
