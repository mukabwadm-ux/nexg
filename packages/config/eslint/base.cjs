/** Shared ESLint base for every NexG workspace package. */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  env: { es2022: true, node: true, browser: true },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.next/',
    '.turbo/',
    'coverage/',
    'playwright-report/',
    'test-results/',
    '*.config.js',
    '*.config.cjs',
    '*.config.mjs',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'smart'],
  },
};
