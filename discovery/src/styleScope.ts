/**
 * Keeps Discovery's styles inside Discovery (owner, 12 Nov 2026: Discovery shows the website's own header).
 *
 * On the NexG website, /discover is a page of the site: the site's header and its stylesheet sit on the same page,
 * and Discovery renders into `<div id="discovery-root">` under that header. Every rule in Discovery's CSS is
 * scoped to that element at build time (vite.config.ts), so nothing here restyles the site's header, menu or
 * location sheet, and the site's design tokens (--gold, --surface …) are left alone outside Discovery.
 *
 * The scope is the element's id rather than a class on purpose. An id outranks any number of classes, so every
 * Discovery rule beats the site's class-based rules on Discovery's elements, such as the dark theme's border colour
 * for every element (packages/ui globals.css). Every rule gains the same, so Discovery's rules keep their order
 * among themselves.
 *
 * - `:root` becomes `#discovery-root`, so Discovery's colours, font and custom properties apply to Discovery alone.
 * - A bare `body` rule becomes `body:has(#discovery-root)`: it still sets up the page Discovery is on.
 * - `html…` with nothing after it (`html:has(.item-sheet[open])`) stays a rule for the document.
 *   With more after it (`html[data-store-docked] .discovery-header`) the root goes in between.
 * - A selector that already names `#discovery-root` is left as written.
 * - Everything else gets `#discovery-root ` in front.
 *
 * The site's own base styles (Tailwind's preflight and packages/ui globals) are undone inside the root by a short
 * block in styles.css, so Discovery looks the same on the site as on a page of its own.
 */
export const ROOT_ID = 'discovery-root';
const ROOT = `#${ROOT_ID}`;

/** Where the first compound selector ends: the first combinator or space outside brackets and parentheses. */
function headEnd(selector: string): number {
  let depth = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth -= 1;
    else if (depth === 0 && (character === ' ' || character === '>' || character === '+' || character === '~')) return index;
  }
  return selector.length;
}

/** One selector (no top-level commas) scoped to Discovery's root. */
export function scopeSelector(raw: string): string {
  const selector = raw.trim();
  if (!selector || selector.includes(ROOT)) return selector;
  if (selector === 'body') return `body:has(${ROOT})`;
  if (/^:root(?![\w-])/.test(selector)) return `${ROOT}${selector.slice(':root'.length)}`;
  if (/^html(?![\w-])/.test(selector)) {
    const end = headEnd(selector);
    const rest = selector.slice(end).trim();
    return rest ? `${selector.slice(0, end)} ${ROOT} ${rest}` : selector;
  }
  return `${ROOT} ${selector}`;
}

/** The parts of a PostCSS rule this plugin reads and writes. */
interface ScopedRule {
  selectors: string[];
  parent?: { type: string; name?: string };
}

/** PostCSS plugin for Vite's css.postcss.plugins. Keyframe steps (`from`, `50%`) are not selectors and stay as they are. */
export function scopeStyles() {
  return {
    postcssPlugin: 'nexg-discovery-scope',
    Rule(rule: ScopedRule) {
      const parent = rule.parent;
      if (parent?.type === 'atrule' && /keyframes$/i.test(parent.name ?? '')) return;
      const scoped = rule.selectors.map(scopeSelector);
      if (scoped.some((selector, index) => selector !== rule.selectors[index])) rule.selectors = scoped;
    },
  };
}
