import { describe, expect, it } from 'vitest';

import {
  onboardingAnswersToSave,
  onboardingProblems,
  onboardingValueError,
  parseOnboardingDetails,
} from './merchant-onboarding-details';

const details = parseOnboardingDetails({
  category: 'wellness',
  fields: [
    {
      key: 'owner_id_number',
      section: 'owner',
      label: 'Owner ID',
      type: 'text',
      required: 'yes',
      pattern: '^[A-Z0-9]{6,12}$',
    },
    {
      key: 'we_in_person',
      section: 'compliance',
      label: 'In person?',
      type: 'yes_no',
      required: 'yes',
    },
    {
      key: 'we_permit_number',
      section: 'compliance',
      label: 'Permit number',
      type: 'text',
      required: 'conditional',
      required_when: { field: 'we_in_person', equals: 'yes' },
    },
    {
      key: 'policies_acknowledged',
      section: 'policies',
      label: 'Policy',
      type: 'yes_no',
      required: 'yes',
      must_be_yes: true,
    },
    { key: 'map_pin', section: 'business', label: 'Pin', type: 'text', required: 'no' },
    {
      key: 'at_drivers',
      section: 'compliance',
      label: 'Drivers',
      type: 'rows',
      required: 'yes',
      columns: [
        { key: 'full_name', label: 'Full name', type: 'text' },
        { key: 'expiry', label: 'Expiry', type: 'date', future_date: true },
      ],
    },
    { key: 'broken' },
  ],
  answers: {
    owner_id_number: '12345678',
    at_drivers: [{ full_name: 'Jane', expiry: '2099-01-01' }],
  },
  missing: [{ key: 'policies_acknowledged', label: 'Policy' }],
});

describe('merchant onboarding details', () => {
  it('reads what the database returns and drops malformed fields', () => {
    expect(details.fields.map((f) => f.key)).toEqual([
      'owner_id_number',
      'we_in_person',
      'we_permit_number',
      'policies_acknowledged',
      'map_pin',
      'at_drivers',
    ]);
    expect(details.answers.owner_id_number).toBe('12345678');
    expect(details.missing).toEqual([{ key: 'policies_acknowledged', label: 'Policy' }]);
  });

  it('asks for a conditional field only after its question is answered yes', () => {
    const no = onboardingProblems(details.fields, {
      ...details.answers,
      we_in_person: 'no',
      policies_acknowledged: 'yes',
    });
    expect(no).toEqual([]);
    const yes = onboardingProblems(details.fields, {
      ...details.answers,
      we_in_person: 'yes',
      policies_acknowledged: 'yes',
    });
    expect(yes.map((p) => p.key)).toEqual(['we_permit_number']);
  });

  it('needs Yes for a confirmation and checks formats', () => {
    const problems = onboardingProblems(details.fields, {
      ...details.answers,
      owner_id_number: '12-3',
      we_in_person: 'no',
      policies_acknowledged: 'no',
    });
    expect(problems.map((p) => p.message)).toEqual([
      'Owner ID: is not in the expected format',
      'Policy: needs Yes to continue',
    ]);
  });

  it('refuses an expired date in a row, naming the row', () => {
    const drivers = details.fields.find((f) => f.key === 'at_drivers')!;
    expect(onboardingValueError(drivers, [{ full_name: 'Jane', expiry: '2001-01-01' }])).toBe(
      'row 1: Expiry has passed; renew it before you continue',
    );
    expect(onboardingValueError(drivers, [])).toBe('needs at least one row');
  });

  it('clears hidden and empty answers when saving, and skips invalid ones on a draft', () => {
    const answers = {
      ...details.answers,
      owner_id_number: 'bad id!',
      we_in_person: 'no',
      we_permit_number: 'CP 1',
    };
    const draft = onboardingAnswersToSave(details.fields, answers, { dropInvalid: true });
    expect(draft).not.toHaveProperty('owner_id_number');
    expect(draft.we_permit_number).toBeNull();
    expect(draft.map_pin).toBeNull();
    expect(draft.at_drivers).toEqual([{ full_name: 'Jane', expiry: '2099-01-01' }]);
  });
});
