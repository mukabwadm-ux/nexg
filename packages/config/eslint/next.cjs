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

    /*
     * The rule's default `depth` is 2, which is shallower than
     * any of our two-line rows: `<label><span><span>Name</span>
     * <span>what it does</span></span><input/></label>` puts the
     * text three deep and the rule reports a label with no text.
     *
     * The markup is correct — the input is a real descendant, so
     * the implicit association holds and clicking the text does
     * toggle it. Raising the depth lets the rule see that rather
     * than teaching everyone to ignore it, which is the state
     * that lets a genuinely unlabelled control through.
     */
    'jsx-a11y/label-has-associated-control': ['error', { depth: 4 }],

    /*
     * Scoped to real DOM elements.
     *
     * `<MerchantShell role="Owner">` is a job title on a React
     * component, not an ARIA role on an element, and the rule
     * cannot tell the two apart. Checking non-DOM components
     * flagged every one of those and nothing that renders.
     */
    'jsx-a11y/aria-role': ['error', { ignoreNonDOM: true }],
  },
};
