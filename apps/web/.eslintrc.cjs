const next = require('@nexg/config/eslint/next');

/**
 * One extra rule for this app: nothing here may touch the
 * browser's geolocation API.
 *
 * The site-wide rule is that `getCurrentPosition` is called only
 * inside the click handler of "Use my current location", which
 * lives in `@nexg/location`. That rule held for about an hour
 * the first time it was written down, because the obvious thing
 * to do when a page needs a location is to ask for one.
 *
 * A prompt that arrives without a user gesture is not a cosmetic
 * problem. Chrome degrades and then auto-blocks sites that do
 * it, and a Block is close to permanent — most people never find
 * the padlock menu. One careless call costs the ability to ask
 * at all, for every visitor, afterwards.
 *
 * So it is a lint error here, and a Playwright test loads every
 * public route with a spy installed and fails the build if
 * anything calls it before a click. Two guards, because this one
 * is worth two.
 */
module.exports = {
  ...next,
  rules: {
    ...(next.rules ?? {}),
    'no-restricted-properties': [
      'error',
      {
        object: 'navigator',
        property: 'geolocation',
        message:
          'Geolocation belongs to @nexg/location, which only reads a position inside a click handler. Import useLocation() or <UseMyLocation /> instead — a prompt on page load gets the site permanently blocked by the browser.',
      },
    ],
  },
};
