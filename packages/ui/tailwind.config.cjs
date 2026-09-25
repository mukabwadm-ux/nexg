/**
 * Only used when linting/previewing the package in isolation. The apps own the
 * real content globs; both extend this same preset.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@nexg/config/tailwind/preset')],
  content: ['./src/**/*.{ts,tsx}'],
};
