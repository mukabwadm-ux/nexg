const path = require('node:path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@nexg/config/tailwind/preset')],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    // Scan the design system so its class names survive purging.
    path.join(path.dirname(require.resolve('@nexg/ui/package.json')), 'src/**/*.{ts,tsx}'),
  ],
};
