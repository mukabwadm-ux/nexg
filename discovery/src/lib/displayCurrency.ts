/**
 * The visitor's display currency, shared with the NexG website.
 *
 * The website's header picker writes the `nexg_currency` cookie and fires
 * `nexg:currency-changed`; the rates come from the website's /api/fx (per
 * one KES). Prices stay KES everywhere they are stored, carted and charged —
 * a converted amount is display only and always shown with "≈".
 *
 * The rounding rules are a copy of apps/web/lib/currency/money.ts; keep the
 * two in step.
 */

export const CURRENCY_COOKIE = 'nexg_currency';
export const CURRENCY_EVENT = 'nexg:currency-changed';

const OFFERED = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF', 'ZAR', 'NGN', 'AED', 'SAR', 'CNY', 'INR', 'JPY', 'CAD', 'AUD', 'CHF'];
const WHOLE_UNITS = new Set(['KES', 'UGX', 'TZS', 'RWF', 'JPY', 'NGN', 'INR']);

/** Same table as the website: a phone on Nairobi time sees shillings. */
const ZONES: Record<string, string> = {
  'Africa/Nairobi': 'KES', 'Africa/Kampala': 'UGX', 'Africa/Dar_es_Salaam': 'TZS', 'Africa/Kigali': 'RWF',
  'Africa/Johannesburg': 'ZAR', 'Africa/Lagos': 'NGN', 'Asia/Dubai': 'AED', 'Asia/Riyadh': 'SAR',
  'Asia/Shanghai': 'CNY', 'Asia/Kolkata': 'INR', 'Asia/Calcutta': 'INR', 'Asia/Tokyo': 'JPY',
  'Europe/London': 'GBP', 'Europe/Zurich': 'CHF', 'Australia/Sydney': 'AUD', 'Australia/Melbourne': 'AUD',
  'America/Toronto': 'CAD', 'America/Vancouver': 'CAD',
};
const EURO = /^Europe\/(Amsterdam|Athens|Berlin|Bratislava|Brussels|Dublin|Helsinki|Lisbon|Ljubljana|Luxembourg|Madrid|Malta|Monaco|Paris|Riga|Rome|Tallinn|Vienna|Vilnius|Zagreb)$/;
const US = /^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana|Kentucky|North_Dakota)/;

function zoneCurrency(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return ZONES[zone] ?? (EURO.test(zone) ? 'EUR' : US.test(zone) || zone === 'Pacific/Honolulu' ? 'USD' : 'KES');
  } catch {
    return 'KES';
  }
}

function cookieCurrency(): string | null {
  if (typeof document === 'undefined') return null;
  const code = document.cookie.match(/(?:^|;\s*)nexg_currency=([A-Z]{3})/)?.[1];
  return code && OFFERED.includes(code) ? code : null;
}

let currency = 'KES';
let rates: Record<string, number> | null = null;

/** Read the choice; fetch rates when it is not KES. Resolves within `timeoutMs` whatever happens. */
export async function prepareDisplayCurrency(timeoutMs = 2000): Promise<void> {
  currency = cookieCurrency() ?? zoneCurrency();
  if (currency === 'KES' || typeof fetch === 'undefined') return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/fx', { signal: controller.signal });
    const body = response.ok ? await response.json() as { rates?: Record<string, number> } : null;
    rates = body?.rates && typeof body.rates.USD === 'number' ? body.rates : null;
  } catch {
    rates = null;
  } finally {
    clearTimeout(timer);
  }
}

/** For tests. */
export function setDisplayCurrencyForTest(code: string, table: Record<string, number> | null): void {
  currency = code;
  rates = table;
}

export function displayCurrency(): string {
  return currency;
}

/**
 * A KES amount in the display currency, "≈ $11.24"; undefined when the
 * display currency is KES or has no rate, so the caller shows KES as before.
 */
export function convertedKes(amount: number): string | undefined {
  if (currency === 'KES' || !rates || !Number.isFinite(amount)) return undefined;
  const rate = rates[currency];
  if (!rate || rate <= 0) return undefined;
  const value = amount * rate;
  const digits = WHOLE_UNITS.has(currency) || Math.abs(value) >= 100 ? 0 : 2;
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  try {
    const locale = (typeof document !== 'undefined' && document.documentElement.lang) || 'en';
    return `≈ ${new Intl.NumberFormat(locale, {
      style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(rounded)}`;
  } catch {
    return `≈ ${currency} ${rounded.toFixed(digits)}`;
  }
}
