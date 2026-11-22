import { describe, expect, it } from 'vitest';

import {
  cleanRates,
  convertFromKes,
  currencyForTimeZone,
  currencyFromCookie,
  formatAmount,
  formatKes,
  formatPrice,
  fractionDigits,
  roundForDisplay,
  SNAPSHOT_RATES,
} from './money';

const rates = { KES: 1, USD: 0.00775, EUR: 0.00668, UGX: 28.4, JPY: 1.17 };

describe('convertFromKes', () => {
  it('multiplies by the rate per shilling', () => {
    expect(convertFromKes(1000, 'USD', rates)).toBeCloseTo(7.75, 10);
    expect(convertFromKes(1000, 'UGX', rates)).toBeCloseTo(28400, 6);
  });

  it('leaves KES alone and refuses a currency it has no rate for', () => {
    expect(convertFromKes(1450, 'KES', rates)).toBe(1450);
    expect(convertFromKes(1450, 'GBP', rates)).toBeNull();
    expect(convertFromKes(Number.NaN, 'USD', rates)).toBeNull();
    expect(convertFromKes(100, 'USD', { USD: 0 })).toBeNull();
  });
});

describe('rounding', () => {
  it('keeps cents under 100 and drops them from 100 up', () => {
    expect(fractionDigits('USD', 11.237)).toBe(2);
    expect(fractionDigits('USD', 112.38)).toBe(0);
    expect(roundForDisplay('USD', 11.237)).toBe(11.24);
    expect(roundForDisplay('USD', 112.5)).toBe(113);
    expect(roundForDisplay('EUR', 0.334)).toBe(0.33);
  });

  it('never shows cents in currencies that do not use them', () => {
    expect(fractionDigits('UGX', 5.4)).toBe(0);
    expect(fractionDigits('JPY', 12.6)).toBe(0);
    expect(roundForDisplay('UGX', 41180.4)).toBe(41180);
  });

  it('formats KES the same way on the server and in every browser', () => {
    expect(formatKes(1450)).toBe('KES 1,450');
    expect(formatKes(1234567.4)).toBe('KES 1,234,567');
    expect(formatKes(0)).toBe('KES 0');
    expect(formatKes(-80)).toBe('KES -80');
  });
});

describe('formatPrice', () => {
  it('marks a converted price as approximate', () => {
    expect(formatPrice(1450, 'USD', rates)).toBe('≈ $11.24');
    expect(formatPrice(50, 'USD', rates)).toBe('≈ $0.39');
    expect(formatPrice(40000, 'USD', rates)).toBe('≈ $310');
    expect(formatPrice(1450, 'UGX', rates)).toMatch(/^≈ .*41,180$/);
  });

  it('falls back to KES rather than showing a wrong or empty price', () => {
    expect(formatPrice(1450, 'KES', rates)).toBe('KES 1,450');
    expect(formatPrice(1450, 'GBP', rates)).toBe('KES 1,450');
    expect(formatPrice(1450, 'USD', null)).toBe('KES 1,450');
  });

  it('formats an amount already converted', () => {
    expect(formatAmount(9.5, 'EUR', 'en')).toBe('€9.50');
    expect(formatAmount(1450, 'KES')).toBe('KES 1,450');
  });
});

describe('cleanRates', () => {
  it('keeps the offered currencies with positive finite rates', () => {
    expect(cleanRates({ USD: 0.0077, EUR: '0.0066', XYZ: 3, GBP: -1, JPY: Infinity })).toEqual({
      KES: 1,
      USD: 0.0077,
      EUR: 0.0066,
    });
  });

  it('rejects a table without a dollar rate, or no table', () => {
    expect(cleanRates({ EUR: 0.0066 })).toBeNull();
    expect(cleanRates(null)).toBeNull();
    expect(cleanRates('rates')).toBeNull();
  });

  it('has a complete built-in snapshot', () => {
    expect(cleanRates(SNAPSHOT_RATES.rates)).toEqual(SNAPSHOT_RATES.rates);
  });
});

describe('defaults', () => {
  it('picks a currency from the device time zone, shillings in Nairobi', () => {
    expect(currencyForTimeZone('Africa/Nairobi')).toBe('KES');
    expect(currencyForTimeZone('Africa/Kampala')).toBe('UGX');
    expect(currencyForTimeZone('Europe/Paris')).toBe('EUR');
    expect(currencyForTimeZone('Europe/London')).toBe('GBP');
    expect(currencyForTimeZone('America/New_York')).toBe('USD');
    expect(currencyForTimeZone('America/Sao_Paulo')).toBe('KES');
    expect(currencyForTimeZone(undefined)).toBe('KES');
  });

  it('reads a remembered choice from the cookie, ignoring unknown codes', () => {
    expect(currencyFromCookie('a=1; nexg_currency=EUR; b=2')).toBe('EUR');
    expect(currencyFromCookie('nexg_currency=XYZ')).toBeNull();
    expect(currencyFromCookie('')).toBeNull();
  });
});
