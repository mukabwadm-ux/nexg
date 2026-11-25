import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CURRENCIES } from '@/lib/currency/money';
import { AUTHORED_LOCALES } from '@/lib/i18n/dictionaries';

import { FlagSelect } from './flag-select';
import { CurrencyFlag, LanguageFlag } from './flags';

describe('flags', () => {
  it('has a flag for every language the site speaks', () => {
    for (const locale of AUTHORED_LOCALES) {
      expect(renderToStaticMarkup(<LanguageFlag locale={locale} />), locale).toContain('<svg');
    }
  });

  it('has a flag for every currency on offer', () => {
    for (const { code } of CURRENCIES) {
      expect(renderToStaticMarkup(<CurrencyFlag code={code} />), code).toContain('<svg');
    }
  });

  it('shows the chosen row with its flag on the closed dropdown', () => {
    const html = renderToStaticMarkup(
      <FlagSelect
        id="lang"
        labelId="lang-label"
        value="sw"
        options={[
          { value: 'en', label: 'English', icon: <LanguageFlag locale="en" /> },
          { value: 'sw', label: 'Kiswahili', icon: <LanguageFlag locale="sw" /> },
        ]}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('Kiswahili');
    expect(html).not.toContain('English');
    expect(html).toContain('<svg');
  });
});
