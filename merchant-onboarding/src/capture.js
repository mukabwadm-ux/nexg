// Capture validation is deliberately separate from signed-in setup requirements.
export const CAPTURE_STEPS = ['business', 'offer', 'location', 'operations', 'documents', 'payout'];
const phonePattern = /^(?:\+?254|0)?[17]\d{8}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const present = (value) => value !== undefined && value !== null && String(value).trim() !== '';
export const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('254')) return `+${digits}`;
  if (digits.startsWith('0')) return `+254${digits.slice(1)}`;
  return digits ? `+254${digits}` : '';
};

export function hasOfferDetails(offer) {
  return [
    offer.name,
    offer.description,
    offer.price,
    ...Object.values(offer.attributes || {}),
  ].some((value) => present(value) && value !== false);
}

export function validateCapture(form, category, stepIndex, { includeConsent = false } = {}) {
  const errors = {};
  const business = form.business;
  const add = (path, message) => {
    errors[path] = message;
  };
  const numeric = (value, path, { minimum = 0, strict = false } = {}) => {
    if (!present(value)) return;
    if (
      !Number.isFinite(Number(value)) ||
      (strict ? Number(value) <= minimum : Number(value) < minimum)
    ) {
      add(
        path,
        strict ? 'Enter a number greater than zero.' : `Enter a number of at least ${minimum}.`,
      );
    }
  };
  if (stepIndex === 0) {
    for (const [key, label] of [
      ['name', 'business name'],
      ['firstName', 'first name'],
      ['lastName', 'last name'],
    ]) {
      if (!present(business[key])) add(`business.${key}`, `Enter your ${label}.`);
    }
    if (!phonePattern.test(String(business.phone || '').replace(/[\s()-]/g, '')))
      add('business.phone', 'Enter a valid Kenyan mobile number.');
    if (!emailPattern.test(business.email || ''))
      add('business.email', 'Enter a valid business email address.');
    if (!Number.isInteger(Number(business.branchCount)) || Number(business.branchCount) < 1)
      add('business.branchCount', 'Enter a whole number of at least one.');
    if (business.registered !== true && business.registered !== false)
      add('business.registered', 'Choose Yes or No. Either answer can continue.');
    if (!business.sameBusinessPhone && !/^\+?[\d\s()-]{7,20}$/.test(business.businessPhone || ''))
      add('business.businessPhone', 'Enter the business contact number.');
  }
  if (stepIndex === 1) {
    if (!category) add('categoryId', 'Choose a business category.');
    if (!form.subcategories.length) add('subcategories', 'Choose at least one subcategory.');
    if (category && form.subcategories.some((id) => !category.subcategories.includes(id)))
      add('subcategories', 'Choose a subcategory belonging to this category.');
    form.offers.forEach((offer, index) => {
      // A partially captured listing is a draft, not a complete publishable item.
      if (!hasOfferDetails(offer)) return;
      if (offer.priceMode === 'fixed') numeric(offer.price, `offers.${index}.price`);
    });
  }
  if (stepIndex === 2) {
    for (const [key, minimum, maximum] of [
      ['mapLat', -5, 5],
      ['mapLng', 33, 43],
    ]) {
      const value = form.location[key];
      if (
        present(value) &&
        (!Number.isFinite(Number(value)) || Number(value) < minimum || Number(value) > maximum)
      )
        add(`location.${key}`, 'Enter a valid coordinate for Kenya.');
    }
  }
  if (stepIndex === 3) {
    for (const [day, hours] of Object.entries(form.operations.hours)) {
      if (hours.open && hours.from && hours.to && hours.from === hours.to)
        add(`operations.hours.${day}`, 'Opening and closing times must be different.');
    }
    const activeNumbers =
      {
        prep: ['prepMin', 'prepMax', 'peakCapacity'],
        picker: ['pickerMinutes', 'slotCapacity'],
        turnaround: ['turnaroundHours'],
        request: ['responseSlaHours'],
        service: ['responseSlaHours'],
      }[category?.model] || [];
    for (const key of activeNumbers)
      numeric(form.operations[key], `operations.${key}`, { strict: true });
    if (
      category?.model === 'prep' &&
      present(form.operations.prepMin) &&
      present(form.operations.prepMax) &&
      Number(form.operations.prepMax) < Number(form.operations.prepMin)
    )
      add('operations.prepMax', 'Maximum preparation time must be at least the minimum.');
    const bookingActive =
      category?.booking === 'required' ||
      (category?.booking === 'conditional' &&
        form.operations.bookingEnabled &&
        category.bookingWhen.some((id) => form.subcategories.includes(id)));
    if (bookingActive) {
      for (const key of ['slotMinutes', 'horizonDays', 'capacityPerSlot'])
        numeric(form.operations.booking[key], `operations.booking.${key}`, { strict: true });
      numeric(form.operations.booking.cutoffHours, 'operations.booking.cutoffHours');
      if (category?.id === 'vehicle_rentals') {
        numeric(form.operations.rental.minimumDays, 'operations.rental.minimumDays', {
          strict: true,
        });
        numeric(form.operations.rental.turnaroundHours, 'operations.rental.turnaroundHours');
      }
    }
  }
  if (
    stepIndex === 4 &&
    present(form.compliance.kraPin) &&
    !/^[A-Za-z]\d{9}[A-Za-z]$/.test(form.compliance.kraPin.trim())
  )
    add('compliance.kraPin', 'Check the format of the KRA PIN you entered.');
  if (stepIndex === 5) {
    if (
      present(form.payout.mobileNumber) &&
      form.payout.method === 'mobile_money' &&
      !phonePattern.test(form.payout.mobileNumber.replace(/[\s()-]/g, ''))
    )
      add('payout.mobileNumber', 'Check the Kenyan mobile number you entered.');
    for (const key of form.payout.method === 'mpesa_till'
      ? ['tillNumber']
      : form.payout.method === 'mpesa_paybill'
        ? ['paybillNumber']
        : [])
      if (present(form.payout[key]) && !/^\d{1,20}$/.test(form.payout[key]))
        add(
          `payout.${key}`,
          'Use the digits of the destination number, keeping any leading zeros.',
        );
    if (
      form.payout.method === 'mpesa_paybill' &&
      String(form.payout.accountReference || '').length > 100
    )
      add('payout.accountReference', 'Keep the account reference within 100 characters.');
  }
  if (includeConsent) {
    if (!form.policies.accurate)
      add('policies.accurate', 'Confirm the information you supplied is accurate.');
    if (!form.policies.terms)
      add('policies.terms', 'Acknowledge the platform terms and data notice to continue.');
  }
  return errors;
}

export function capturedOffers(offers) {
  return offers.filter(hasOfferDetails).map((offer) => ({
    ...offer,
    // Do not turn an unanswered amount into a free product.
    price: offer.priceMode === 'fixed' && present(offer.price) ? Number(offer.price) : null,
    captureState: 'draft',
  }));
}

// Entry has its own small boundary. Inactive/partial portal setup cannot block it.
export function validateRegistration(form, category) {
  const errors = {
    ...validateCapture(form, category, 0),
    ...validateCapture({ ...form, offers: [] }, category, 1),
  };
  if (!form.policies.terms)
    errors['policies.terms'] = 'Acknowledge the platform terms and data notice to continue.';
  return errors;
}
