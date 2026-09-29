import 'server-only';

import { DICTIONARIES, DEFAULT_LOCALE } from './dictionaries';

/**
 * Machine translation, once per language, then never again.
 *
 * NexG's copy is written in English. Two languages can be hand-written;
 * every language a phone can be set to cannot, so the rest is machine
 * output that a person can correct string by string afterwards.
 *
 * No provider is wired to this project yet. Without TRANSLATION_API_KEY
 * everything below is a no-op that returns zero and the site stays in
 * English — which is the honest failure, rather than a half-translated
 * page or an error in front of a visitor who only set their phone to
 * Chinese.
 */

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

/** Whether a machine translation can be produced at all right now. */
export function canMachineTranslate(): boolean {
  return !!process.env.TRANSLATION_API_KEY;
}

/**
 * The provider charges per character, and this runs on a path an
 * anonymous visitor can trigger. One language is a few hundred strings
 * and a few pence; a script asking for four hundred languages is not.
 */
const MAX_LOCALES_PER_DAY = Number(process.env.TRANSLATION_DAILY_LOCALE_CAP ?? 25);

/**
 * Google's Translation v2 REST endpoint, in batches.
 *
 * v2 rather than v3 because v3 wants a service account and an OAuth
 * exchange on every call; v2 takes an API key, which is all a server
 * action needs. Swapping provider means replacing this function.
 */
async function translateBatch(texts: string[], target: string): Promise<string[] | null> {
  const key = process.env.TRANSLATION_API_KEY;
  if (!key) return null;

  const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts, target, source: DEFAULT_LOCALE, format: 'text' }),
    /* Never cached: the answer is written to our own cache instead. */
    cache: 'no-store',
  });

  if (!response.ok) {
    console.error('[i18n] translation provider refused', response.status, await response.text());
    return null;
  }

  const body = (await response.json()) as {
    data?: { translations?: { translatedText: string }[] };
  };
  const out = body.data?.translations?.map((t) => t.translatedText);
  return out?.length === texts.length ? out : null;
}

export interface FillResult {
  ok: boolean;
  stored: number;
  message?: string;
}

/**
 * Fill the cache for one language.
 *
 * Sends the English dictionary in chunks, because a single request with
 * every string in it is both slower to first byte and more to lose if
 * it fails. Whatever comes back is stored; whatever does not falls back
 * to English at render time, so a partial fill is a partly translated
 * page rather than a broken one.
 */
export async function fillTranslations(
  locale: string,
  put: (rows: { key: string; source: string; translated: string }[]) => Promise<void>,
): Promise<FillResult> {
  if (!canMachineTranslate()) {
    return { ok: false, stored: 0, message: 'No translation provider is configured.' };
  }

  const source = DICTIONARIES[DEFAULT_LOCALE] ?? {};
  const keys = Object.keys(source);
  const CHUNK = 96;
  let stored = 0;

  for (let i = 0; i < keys.length; i += CHUNK) {
    const slice = keys.slice(i, i + CHUNK);
    const translated = await translateBatch(
      slice.map((k) => source[k] ?? k),
      locale,
    );
    if (!translated) break;

    await put(
      slice.map((key, n) => ({
        key,
        source: source[key] ?? key,
        translated: translated[n] ?? '',
      })),
    );
    stored += slice.length;
  }

  return stored > 0
    ? { ok: true, stored }
    : { ok: false, stored: 0, message: 'The provider returned nothing.' };
}

export { MAX_LOCALES_PER_DAY };
