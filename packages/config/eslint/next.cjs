/** ESLint config for the Next.js apps. */
const base = require('./base.cjs');

module.exports = {
  ...base,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:jsx-a11y/recommended',
    'next/core-web-vitals',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'jsx-a11y'],
  rules: {
    ...base.rules,
    // next/font is mandated by the spec; guard against raw <img> and <a> regressions.
    '@next/next/no-img-element': 'error',
    '@next/next/no-html-link-for-pages': 'error',
  },
};
