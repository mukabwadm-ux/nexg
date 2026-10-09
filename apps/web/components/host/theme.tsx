import * as React from 'react';

/**
 * Applying a host's chosen theme.
 *
 * Settings could save a theme and nothing changed, because
 * saving was all it did. The row went into `user_preference`
 * and no page ever read it back.
 *
 * The tokens in `packages/ui` are CSS variables, so a theme is
 * a scoped override of them rather than a second stylesheet.
 * That matters: every component keeps using `bg-surface` and
 * `text-muted` and none of them needs to know a theme exists.
 *
 * Each colour is published twice — `--x` as hex for hand-written
 * CSS and `--x-rgb` as channels, which is what the Tailwind
 * preset consumes so `bg-ink/60` keeps working. Setting one and
 * not the other gives a half-applied theme where opacity
 * variants stay the old colour, so they are always written as a
 * pair here.
 */

export interface Theme {
  theme: string;
  accent: string | null;
  sidebar: string;
  density: string;
  font_size: string;
}

/** `#1F3A5F` → `31 58 95`, which is what the preset wants. */
function channels(hex: string): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Both spellings of one token, or nothing if the hex is bad. */
function pair(name: string, hex: string): string {
  const rgb = channels(hex);
  return rgb ? `--${name}:${hex};--${name}-rgb:${rgb};` : '';
}

/**
 * The palettes.
 *
 * Dark is a real palette rather than an inversion: flipping
 * lightness turns the gold into something muddy and the danger
 * red into something that reads as brown. Each one is written
 * out so it can be looked at.
 */
const PALETTES: Record<string, Record<string, string>> = {
  light: {
    bg: '#ffffff',
    surface: '#ffffff',
    border: '#e8e8e8',
    'border-strong': '#d4d4d4',
  },
  dark: {
    bg: '#15140f',
    surface: '#1e1d18',
    ink: '#f4f1ea',
    border: '#2e2c25',
    'border-strong': '#403d34',
    muted: '#c8c3b7',
    'muted-light': '#98938a',
    'gold-soft': '#2a2416',
    'success-bg': '#15271a',
    'danger-bg': '#2a1512',
    'warning-bg': '#2a2416',
    'info-bg': '#14212e',
  },
  contrast: {
    bg: '#ffffff',
    surface: '#ffffff',
    ink: '#000000',
    border: '#767676',
    'border-strong': '#000000',
    muted: '#1c1c1c',
    'muted-light': '#3d3d3d',
    'gold-text': '#6b5200',
    success: '#005c1f',
    danger: '#8c0000',
    warning: '#5c4500',
    info: '#003a66',
  },
};

/**
 * The style block for a theme.
 *
 * Scoped to `[data-host-theme]` rather than `:root` so it ends
 * at the portal. A host choosing high contrast for themselves
 * must not change what a guest sees on a landing page served
 * from the same application.
 */
export function HostTheme({ theme }: { theme: Theme | null }) {
  if (!theme || (theme.theme === 'nexg' && !theme.accent)) return null;

  const vars: string[] = [];

  for (const [name, hex] of Object.entries(PALETTES[theme.theme] ?? {})) {
    vars.push(pair(name, hex));
  }

  /*
   * The accent last, so it survives a palette that also sets
   * gold. It is checked against white text at 4.5:1 in the
   * database before it is stored, so anything arriving here has
   * already passed.
   */
  if (theme.accent) {
    vars.push(pair('gold', theme.accent));
    vars.push(pair('gold-text', theme.accent));
  }

  /* Font size is set on the wrapper rather than on html, so a
     larger portal does not also enlarge a guest page. */
  if (theme.font_size === 'large') vars.push('font-size:1.0625rem;');

  if (vars.length === 0) return null;

  return (
    <style
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `[data-host-theme]{${vars.join('')}}`,
      }}
    />
  );
}

/**
 * The wrapper every host page sits in.
 *
 * `data-density` is read by nothing yet and is written anyway,
 * because the alternative is a Settings control that saves a
 * value no part of the product can ever act on.
 */
export function HostThemeFrame({
  theme,
  children,
}: {
  theme: Theme | null;
  children: React.ReactNode;
}) {
  return (
    <div
      data-host-theme=""
      data-density={theme?.density ?? 'comfortable'}
      data-sidebar={theme?.sidebar ?? 'light'}
    >
      <HostTheme theme={theme} />
      {children}
    </div>
  );
}
