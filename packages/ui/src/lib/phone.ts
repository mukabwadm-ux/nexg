import { AsYouType, getExampleNumber, parsePhoneNumberFromString } from 'libphonenumber-js';
import examples from 'libphonenumber-js/examples.mobile.json';
import type { CountryCode } from 'libphonenumber-js';

export interface PhoneCountry {
  code: CountryCode;
  /** Dialling prefix including the plus, e.g. "+254". */
  dialCode: string;
  name: string;
  flag: string;
}

/**
 * The countries NexG operates in. Kenya is first and is the default everywhere,
 * per spec section 2 (PhoneInput defaults to +254).
 */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { code: 'KE', dialCode: '+254', name: 'Kenya', flag: '🇰🇪' },
  { code: 'UG', dialCode: '+256', name: 'Uganda', flag: '🇺🇬' },
  { code: 'TZ', dialCode: '+255', name: 'Tanzania', flag: '🇹🇿' },
  { code: 'RW', dialCode: '+250', name: 'Rwanda', flag: '🇷🇼' },
] as const;

export const DEFAULT_PHONE_COUNTRY: CountryCode = 'KE';

export function countryFor(code: CountryCode): PhoneCountry {
  return PHONE_COUNTRIES.find((c) => c.code === code) ?? PHONE_COUNTRIES[0]!;
}

/** Digits only, with any leading trunk zero dropped (Kenyans type "0712…"). */
export function normaliseNationalInput(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Progressive display formatting as the user types, e.g. "712 345678".
 *
 * libphonenumber only groups a national number once its trunk prefix is
 * present, so we format with a leading zero and strip it again — the dial code
 * is already shown in the adjacent picker, and a number displayed as both
 * "+254" and "0712…" would be wrong.
 */
export function formatAsYouType(national: string, country: CountryCode): string {
  if (!national) return '';
  const grouped = new AsYouType(country).input(`0${national}`);
  return grouped.startsWith('0') ? grouped.slice(1).trimStart() : grouped;
}

/**
 * Convert a national number to E.164, or `null` when it is not a valid number
 * for that country. E.164 is what every downstream system stores.
 */
export function toE164(national: string, country: CountryCode): string | null {
  const digits = normaliseNationalInput(national);
  if (!digits) return null;
  const parsed = parsePhoneNumberFromString(digits, country);
  return parsed?.isValid() ? parsed.number : null;
}

/** Split a stored E.164 value back into a country and its national digits. */
export function fromE164(
  value: string | null | undefined,
): { country: CountryCode; national: string } | null {
  if (!value) return null;
  const parsed = parsePhoneNumberFromString(value);
  if (!parsed?.country) return null;
  return { country: parsed.country, national: parsed.nationalNumber };
}

/** A realistic placeholder for the chosen country, e.g. "712 345 678". */
export function placeholderFor(country: CountryCode): string {
  const example = getExampleNumber(country, examples);
  return example ? example.formatNational().replace(/^0/, '') : '712 345 678';
}
