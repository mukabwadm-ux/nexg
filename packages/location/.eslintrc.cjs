/**
 * The location package may touch geolocation — that is its job —
 * but only `src/geolocation.ts` actually does. Everything else
 * goes through it, so there is one place to audit and one place
 * a reviewer has to understand.
 */
module.exports = {
  ...require('@nexg/config/eslint/react'),
  overrides: [
    {
      files: ['src/**/*.{ts,tsx}'],
      excludedFiles: ['src/geolocation.ts'],
      rules: {
        'no-restricted-properties': [
          'error',
          {
            object: 'navigator',
            property: 'geolocation',
            message:
              'Only src/geolocation.ts reads a position. Call readPositionOnce() from there so the gesture rule has exactly one place to be wrong.',
          },
        ],
      },
    },
  ],
};
