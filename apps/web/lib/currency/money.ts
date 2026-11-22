/**
 * Display currencies: what a customer can choose to read prices in.
 *
 * Every price on NexG is stored and charged in whole Kenyan shillings. A
 * converted amount is for reading only — it is marked "≈" wherever it is
 * shown, and checkout always shows the KES amount that will be charged.
 *
 * Pure and dependency-free so the server, the browser and the tests all
 * agree on it. Discovery (discovery/src/lib/displayCurrency.ts) carries a
 * copy of the rounding rules; keep the two in step.
 */

export const BASE_CURRENCY = 'KES';

/** The cookie that remembers the visitor's choice. Readable by script. */
export const CURRENCY_COOKIE = 'nexg_currency';

/** Fired on window when the choice changes, so Discovery can follow. */
export const CURRENCY_EVENT = 'nexg:currency-changed';

/**
 * The currencies offered, in the order the picker lists them: home first,
 * then the region, then the currencies most visitors arrive with.
 */
export const CURRENCIES = [
  { code: 'KES', name: 'Kenyan shilling' },
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'UGX', name: 'Ugandan shilling' },
  { code: 'TZS', name: 'Tanzanian shilling' },
  { code: 'RWF', name: 'Rwandan franc' },
  { code: 'ZAR', name: 'South African rand' },
  { code: 'NGN', name: 'Nigerian naira' },
  { code: 'AED', name: 'UAE dirham' },
  { code: 'SAR', name: 'Saudi riyal' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'CHF', name: 'Swiss franc' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export const CURRENCY_CODES: readonly string[] = CURRENCIES.map((c) => c.code);

export function isCurrencyCode(value: string | null | undefined): value is CurrencyCode {
  return !!value && CURRENCY_CODES.includes(value);
}

/**
 * Currencies nobody prices in cents. Shown as whole numbers at any size.
 * (NGN and INR have minor units, but a few naira or rupees either way is
 * noise on an approximate price.)
 */
const WHOLE_UNITS = new Set(['KES', 'UGX', 'TZS', 'RWF', 'JPY', 'NGN', 'INR']);

/** Units of each currency per one Kenyan shilling. KES itself is 1. */
export type RateTable = Record<string, number>;

export interface FxRates {
  base: 'KES';
  rates: RateTable;
  /** When the provider published these, ISO. Null for the built-in snapshot. */
  updatedAt: string | null;
  /** live: fetched just now · stored: the database copy · snapshot: built in. */
  source: 'live' | 'stored' | 'snapshot';
}

/**
 * The last resort: approximate rates written into the code (open.er-api.com,
 * 22 November 2026, about KES 130 to the dollar). Used only when neither the database
 * nor the provider has answered, so a converted price is a little old
 * rather than missing.
 */
export const SNAPSHOT_RATES: FxRates = {
  base: 'KES',
  updatedAt: null,
  source: 'snapshot',
  rates: {
    KES: 1,
    USD: 0.007694,
    EUR: 0.006998,
    GBP: 0.005858,
    UGX: 32.56,
    TZS: 20.46,
    RWF: 11.37,
    ZAR: 0.1341,
    NGN: 10.36,
    AED: 0.02826,
    SAR: 0.02885,
    CNY: 0.05134,
    INR: 0.7158,
    JPY: 1.221,
    CAD: 0.01101,
    AUD: 0.01152,
    CHF: 0.006467,
  },
};

/**
 * Keep only rates we offer and that are positive finite numbers. A table
 * without a dollar rate is treated as no table at all: a provider answer
 * that is missing the most common currency is not one to trust.
 */
export function cleanRates(input: unknown): RateTable | null {
  if (!input || typeof input !== 'object') return null;
  const out: RateTable = { KES: 1 };
  for (const code of CURRENCY_CODES) {
    if (code === 'KES') continue;
    const value = (input as Record<string, unknown>)[code];
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[code] = n;
  }
  return out.USD ? out : null;
}

/** KES → another currency, unrounded. Null when there is no rate for it. */
export function convertFromKes(kes: number, currency: string, rates: RateTable): number | null {
  if (!Number.isFinite(kes)) return null;
  if (currency === BASE_CURRENCY) return kes;
  const rate = rates[currency];
  if (!rate || !Number.isFinite(rate) || rate <= 0) return null;
  return kes * rate;
}

/**
 * How many decimals a converted amount gets.
 *
 * Whole units for currencies that do not use cents, and for anything of a
 * hundred or more: "≈ $112" reads as a price, "≈ $112.38" reads as false
 * precision on an approximate figure. Small amounts keep two decimals so a
 * KES 50 item is "≈ $0.39", not "≈ $0".
 */
export function fractionDigits(currency: string, amount: number): number {
  if (WHOLE_UNITS.has(currency)) return 0;
  return Math.abs(amount) >= 100 ? 0 : 2;
}

/** Round the way the display will show it. */
export function roundForDisplay(currency: string, amount: number): number {
  const digits = fractionDigits(currency, amount);
  const factor = 10 ** digits;
  return Math.round(amount * factor) / factor;
}

/** "KES 1,450", grouped by hand so the server and every browser agree. */
export function formatKes(shillings: number): string {
  const n = Math.round(shillings);
  const sign = n < 0 ? '-' : '';
  return `KES ${sign}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** An amount already in `currency`, formatted for `locale`. */
export function formatAmount(amount: number, currency: string, locale = 'en'): string {
  if (currency === BASE_CURRENCY) return formatKes(amount);
  const digits = fractionDigits(currency, amount);
  const rounded = roundForDisplay(currency, amount);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(rounded);
  } catch {
    return `${currency} ${rounded.toFixed(digits)}`;
  }
}

/**
 * A KES price in the chosen currency: "≈ $11.24", or "KES 1,450" when the
 * choice is KES or there is no rate for it (never a blank, never a wrong
 * number dressed as a right one).
 */
export function formatPrice(
  kes: number,
  currency: string,
  rates: RateTable | null | undefined,
  locale = 'en',
): string {
  if (currency === BASE_CURRENCY || !rates) return formatKes(kes);
  const converted = convertFromKes(kes, currency, rates);
  if (converted === null) return formatKes(kes);
  return `≈ ${formatAmount(converted, currency, locale)}`;
}

/**
 * Where a visitor probably keeps their money, from their device's time
 * zone. The time zone and not the browser language: many phones in Kenya
 * are set to US English, and showing a Nairobi shopper dollars because of
 * it would be wrong. A visitor whose phone is on Nairobi time sees
 * shillings, which is also what they will pay in.
 */
const ZONE_CURRENCY: Record<string, CurrencyCode> = {
  'Africa/Nairobi': 'KES',
  'Africa/Kampala': 'UGX',
  'Africa/Dar_es_Salaam': 'TZS',
  'Africa/Kigali': 'RWF',
  'Africa/Johannesburg': 'ZAR',
  'Africa/Lagos': 'NGN',
  'Asia/Dubai': 'AED',
  'Asia/Riyadh': 'SAR',
  'Asia/Shanghai': 'CNY',
  'Asia/Chongqing': 'CNY',
  'Asia/Urumqi': 'CNY',
  'Asia/Kolkata': 'INR',
  'Asia/Calcutta': 'INR',
  'Asia/Tokyo': 'JPY',
  'Europe/London': 'GBP',
  'Europe/Zurich': 'CHF',
  'Australia/Sydney': 'AUD',
  'Australia/Melbourne': 'AUD',
  'Australia/Brisbane': 'AUD',
  'Australia/Perth': 'AUD',
  'Australia/Adelaide': 'AUD',
  'America/Toronto': 'CAD',
  'America/Vancouver': 'CAD',
  'America/Edmonton': 'CAD',
  'America/Winnipeg': 'CAD',
  'America/Halifax': 'CAD',
};

const EURO_ZONES = new Set([
  'Amsterdam',
  'Athens',
  'Berlin',
  'Bratislava',
  'Brussels',
  'Dublin',
  'Helsinki',
  'Lisbon',
  'Ljubljana',
  'Luxembourg',
  'Madrid',
  'Malta',
  'Monaco',
  'Paris',
  'Riga',
  'Rome',
  'Tallinn',
  'Vienna',
  'Vilnius',
  'Zagreb',
  'Andorra',
  'Vatican',
  'San_Marino',
]);

export function currencyForTimeZone(zone: string | null | undefined): CurrencyCode {
  if (!zone) return 'KES';
  const direct = ZONE_CURRENCY[zone];
  if (direct) return direct;
  const [region, city] = zone.split('/');
  if (region === 'Europe' && city && EURO_ZONES.has(city)) return 'EUR';
  /* The US zones are America/<city>; Canada's are listed above. Latin
     America is left at KES rather than guessed at. */
  if (
    region === 'America' &&
    /^(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana|Kentucky|North_Dakota)/.test(
      city ?? '',
    )
  ) {
    return 'USD';
  }
  if (zone === 'Pacific/Honolulu') return 'USD';
  return 'KES';
}

/** Read the choice from a cookie header string; null when unset or unknown. */
export function currencyFromCookie(cookieHeader: string | null | undefined): CurrencyCode | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${CURRENCY_COOKIE}=([A-Z]{3})`));
  const code = match?.[1];
  return isCurrencyCode(code) ? code : null;
}
