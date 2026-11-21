import { describe, expect, it } from 'vitest';

import { splitClause } from './clause';

describe('splitClause', () => {
  it('picks out the letter of a lettered item, keeping the rest word for word', () => {
    expect(splitClause('(c) our payment service provider;')).toEqual({
      kind: 'lettered',
      marker: '(c)',
      text: 'our payment service provider;',
    });
  });

  it('picks out a short label before a colon', () => {
    expect(splitClause('Account data: name, phone number, email address.')).toEqual({
      kind: 'labelled',
      label: 'Account data',
      text: 'name, phone number, email address.',
    });
  });

  it('leaves an introducing sentence and a numbered clause alone', () => {
    expect(splitClause('We use your personal data to:').kind).toBe('plain');
    expect(splitClause('10.1 Refund and complaint requests may be submitted: by email.').kind).toBe(
      'plain',
    );
  });

  it('does not treat a whole sentence before a colon as a label', () => {
    const sentence = 'We may update this policy from time to time and will tell you: in the app.';
    expect(splitClause(sentence).kind).toBe('plain');
  });
});
