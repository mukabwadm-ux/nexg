'use client';

import { PhoneInput } from '@nexg/ui';

/*
 * The phone field on its own, for AuthPanel to load only on the Create
 * account tab. It brings libphonenumber (about 37 KB compressed), which a
 * plain sign-in never needs.
 */
export default PhoneInput;
