import assert from 'node:assert/strict';
import test from 'node:test';
import {
  capturedOffers,
  normalizePhone,
  validateCapture,
  validateRegistration,
} from './capture.js';

function registration() {
  return {
    business: {
      name: 'Acacia Services',
      firstName: 'Amina',
      lastName: 'Otieno',
      phone: '0712345678',
      email: 'amina@example.com',
      branchCount: '1',
      registered: false,
      sameBusinessPhone: true,
    },
    categoryId: 'wellness',
    subcategories: ['spa'],
    offers: [
      {
        id: 'draft-1',
        name: '',
        description: '',
        subcategory: 'spa',
        price: '',
        priceMode: 'fixed',
        attributes: {},
      },
    ],
    location: { mapLat: '', mapLng: '', coverageModes: [] },
    operations: { hours: {}, booking: {}, rental: {} },
    compliance: { kraPin: '' },
    payout: { method: 'mobile_money', mobileNumber: '' },
    policies: { accurate: true, terms: true },
  };
}
const category = { subcategories: ['spa'], offerFields: [] };

test('all missing operational details are optional at registration', () => {
  const form = registration();
  const errors = Object.assign(
    {},
    ...[0, 1, 2, 3, 4, 5].map((step) =>
      validateCapture(form, category, step, { includeConsent: step === 5 }),
    ),
  );
  assert.deepEqual(errors, {});
  assert.deepEqual(capturedOffers(form.offers), []);
});
test('missing core category selection is explained without an operational error', () => {
  const form = registration();
  form.subcategories = [];
  assert.deepEqual(validateCapture(form, category, 1), {
    subcategories: 'Choose at least one subcategory.',
  });
});
test('a subcategory from a different category cannot guide this portal', () => {
  const form = registration();
  form.subcategories = ['restaurant'];
  assert.equal(
    validateCapture(form, category, 1).subcategories,
    'Choose a subcategory belonging to this category.',
  );
});
test('partial listing survives without inventing a free price', () => {
  const offer = {
    id: 'draft-1',
    name: 'Massage',
    description: '',
    subcategory: 'spa',
    priceMode: 'fixed',
    price: '',
    attributes: {},
  };
  assert.deepEqual(capturedOffers([offer]), [{ ...offer, price: null, captureState: 'draft' }]);
  assert.equal(capturedOffers([{ ...offer, price: '0' }])[0].price, 0);
});
test('malformed supplied amounts are rejected while omitted amounts stay optional', () => {
  const form = registration();
  form.offers[0].name = 'Massage';
  form.offers[0].price = '-30';
  assert.equal(
    validateCapture(form, category, 1)['offers.0.price'],
    'Enter a number of at least 0.',
  );
  form.offers[0].price = '';
  assert.deepEqual(validateCapture(form, category, 1), {});
});
test('supplied map coordinates must be finite', () => {
  const form = registration();
  form.location.mapLat = 'unknown';
  assert.equal(
    validateCapture(form, category, 2)['location.mapLat'],
    'Enter a valid coordinate for Kenya.',
  );
});
test('overnight hours are retained instead of being rejected as same-day closing', () => {
  const form = registration();
  form.operations.hours.Monday = { open: true, from: '20:00', to: '02:00' };
  assert.deepEqual(validateCapture(form, category, 3), {});
  form.operations.hours.Monday.to = '20:00';
  assert.equal(
    validateCapture(form, category, 3)['operations.hours.Monday'],
    'Opening and closing times must be different.',
  );
});
test('false registration declaration is a valid answer; unanswered is not', () => {
  const form = registration();
  assert.deepEqual(validateCapture(form, category, 0), {});
  form.business.registered = null;
  assert.equal(
    validateCapture(form, category, 0)['business.registered'],
    'Choose Yes or No. Either answer can continue.',
  );
});
test('a separate business phone is required only when not reusing the mobile contact', () => {
  const form = registration();
  form.business.sameBusinessPhone = false;
  assert.equal(
    validateCapture(form, category, 0)['business.businessPhone'],
    'Enter the business contact number.',
  );
  form.business.businessPhone = '+254 20 123 4567';
  assert.deepEqual(validateCapture(form, category, 0), {});
});
test('marketing preference is optional while entry acknowledgements remain explicit', () => {
  const form = registration();
  form.business.marketing = false;
  form.policies.terms = false;
  assert.equal(
    validateCapture(form, category, 5, { includeConsent: true })['policies.terms'],
    'Acknowledge the platform terms and data notice to continue.',
  );
  form.policies.terms = true;
  assert.deepEqual(validateCapture(form, category, 5, { includeConsent: true }), {});
});
test('normalizes the captured Kenya contact without implying verification', () => {
  assert.equal(normalizePhone('0712 345 678'), '+254712345678');
  assert.equal(normalizePhone('+254 712 345 678'), '+254712345678');
});
test('disabling booking retains a partial draft without blocking on hidden invalid fields', () => {
  const form = registration();
  const bookingCategory = { ...category, booking: 'conditional', bookingWhen: ['spa'] };
  form.operations.bookingEnabled = true;
  form.operations.booking.slotMinutes = '0';
  assert.equal(
    validateCapture(form, bookingCategory, 3)['operations.booking.slotMinutes'],
    'Enter a number greater than zero.',
  );
  form.operations.bookingEnabled = false;
  assert.deepEqual(validateCapture(form, bookingCategory, 3), {});
  assert.equal(form.operations.booking.slotMinutes, '0');
});
test('inactive preparation and rental drafts do not block another operating model', () => {
  const form = registration();
  form.operations.prepMin = '-10';
  form.operations.rental.minimumDays = '0';
  assert.deepEqual(validateCapture(form, { ...category, model: 'stock' }, 3), {});
  assert.equal(
    validateCapture(form, { ...category, model: 'prep' }, 3)['operations.prepMin'],
    'Enter a number greater than zero.',
  );
});
test('short registration permits entry without operational attestations or records', () => {
  const form = registration();
  form.policies.accurate = false;
  assert.deepEqual(validateRegistration(form, category), {});
});
test('short registration is not blocked by a partial portal-only listing or schedule', () => {
  const form = registration();
  form.offers[0] = { ...form.offers[0], name: 'Unfinished portal draft', price: '-10' };
  form.operations.prepMin = '-20';
  assert.deepEqual(validateRegistration(form, category), {});
});
test('short registration still needs canonical category membership and the actual policy choice', () => {
  const form = registration();
  form.subcategories = ['restaurant'];
  form.policies.terms = false;
  assert.deepEqual(validateRegistration(form, category), {
    subcategories: 'Choose a subcategory belonging to this category.',
    'policies.terms': 'Acknowledge the platform terms and data notice to continue.',
  });
});
test('short registration does not require marketing consent', () => {
  const form = registration();
  form.business.marketing = false;
  assert.deepEqual(validateRegistration(form, category), {});
});
