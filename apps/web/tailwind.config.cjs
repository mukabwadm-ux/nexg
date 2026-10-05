const path = require('node:path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@nexg/config/tailwind/preset')],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    // Scan the design system so its class names survive purging.
    path.join(path.dirname(require.resolve('@nexg/ui/package.json')), 'src/**/*.{ts,tsx}'),
    /*
     * And the location layer, for the same reason. Leaving it out
     * does not break the build or raise anything — the components
     * render with whichever classes some other file happened to
     * generate, which looked like a broken modal rather than a
     * missing glob.
     */
    path.join(path.dirname(require.resolve('@nexg/location/package.json')), 'src/**/*.{ts,tsx}'),
  ],
};
