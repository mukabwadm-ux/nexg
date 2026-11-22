import test from 'node:test';
import assert from 'node:assert/strict';
import { convertedKes, setDisplayCurrencyForTest } from '../src/lib/displayCurrency';
import { formatPrice } from '../src/lib/formatPrice';
import { kes } from '../src/components/cart/useStoreCart';

const rates = { KES: 1, USD: 0.00775, UGX: 28.4 };

test('a KES price follows the display currency the visitor chose on the website', () => {
  setDisplayCurrencyForTest('USD', rates);
  assert.equal(formatPrice({ price: 1450, currency: 'KES' }, 'code'), '≈ $11.24');
  assert.equal(formatPrice({ price: 40000, currency: 'KES' }), '≈ $310', 'no cents from 100 up');
  setDisplayCurrencyForTest('UGX', rates);
  assert.match(convertedKes(1450)!, /^≈ .*41,180$/, 'no cents in currencies without them');
});

test('the cart stays in KES, and KES or a missing rate shows KES as before', () => {
  setDisplayCurrencyForTest('USD', rates);
  assert.match(kes(3400), /^KES\s3,400$/);
  setDisplayCurrencyForTest('GBP', rates);
  assert.equal(convertedKes(1450), undefined);
  setDisplayCurrencyForTest('USD', null);
  assert.equal(convertedKes(1450), undefined);
  setDisplayCurrencyForTest('KES', rates);
  assert.equal(convertedKes(1450), undefined);
  assert.match(formatPrice({ price: 1450, currency: 'KES' }, 'code')!, /KES\s1,450/);
});

test('a price in another source currency is never converted', () => {
  setDisplayCurrencyForTest('USD', rates);
  assert.match(formatPrice({ price: 20, currency: 'EUR' }, 'code')!, /EUR\s20/);
  setDisplayCurrencyForTest('KES', null);
});
