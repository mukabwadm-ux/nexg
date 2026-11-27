import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DateField } from './client-kit';

describe('DateField', () => {
  it('shows the picked day in words, day before month', () => {
    const html = renderToStaticMarkup(
      <DateField label="Spent On" value="2026-11-03" onChange={() => {}} required />,
    );
    expect(html).toContain('Tue, 3 Nov 2026');
    expect(html).toContain('Spent On');
  });

  it('asks for a date when none is set', () => {
    const html = renderToStaticMarkup(<DateField label="Paid On" value="" onChange={() => {}} />);
    expect(html).toContain('Pick a date');
  });
});
