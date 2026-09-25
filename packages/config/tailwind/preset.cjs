/**
 * NexG Tailwind preset — the single source of truth for how the design tokens
 * in `@nexg/ui/tokens.css` are exposed to Tailwind.
 *
 * Colours resolve through CSS variables holding space-separated RGB channels
 * (`--bg-rgb: 246 243 236`) so that Tailwind opacity modifiers keep working
 * (`bg-ink/60`). The literal hex tokens from spec section 2 are also published
 * as `--bg`, `--ink`, … for hand-written CSS; see tokens.css.
 */
const animate = require('tailwindcss-animate');

/** @param {string} variable */
const channel = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        bg: channel('--bg-rgb'),
        surface: channel('--surface-rgb'),
        ink: channel('--ink-rgb'),
        gold: {
          DEFAULT: channel('--gold-rgb'),
          text: channel('--gold-text-rgb'),
          soft: channel('--gold-soft-rgb'),
        },
        border: {
          DEFAULT: channel('--border-rgb'),
          strong: channel('--border-strong-rgb'),
        },
        muted: {
          DEFAULT: channel('--muted-rgb'),
          light: channel('--muted-light-rgb'),
        },
        success: {
          DEFAULT: channel('--success-rgb'),
          bg: channel('--success-bg-rgb'),
        },
        danger: {
          DEFAULT: channel('--danger-rgb'),
          bg: channel('--danger-bg-rgb'),
        },
        warning: {
          DEFAULT: channel('--warning-rgb'),
          bg: channel('--warning-bg-rgb'),
        },
        // Console shell (dark sidebar in the admin artboards).
        shell: {
          DEFAULT: channel('--shell-rgb'),
          muted: channel('--shell-muted-rgb'),
          border: channel('--shell-border-rgb'),
        },
        // shadcn/ui aliases so upstream component code drops in unchanged.
        background: channel('--bg-rgb'),
        foreground: channel('--ink-rgb'),
        input: channel('--border-strong-rgb'),
        ring: channel('--gold-rgb'),
      },
      fontFamily: {
        sans: ['var(--font-manrope)', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Console labels: uppercase, tracked-out micro type from the artboards.
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.06em' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(20 20 20 / 0.04)',
        raised: '0 4px 16px -2px rgb(20 20 20 / 0.08), 0 2px 4px -2px rgb(20 20 20 / 0.04)',
        panel: '-8px 0 32px -8px rgb(20 20 20 / 0.12)',
      },
      keyframes: {
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-out-right': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(100%)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'slide-in-right': 'slide-in-right 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-out-right': 'slide-out-right 180ms cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in': 'fade-in 150ms ease-out',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [animate],
};
