import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
import { CURRENCY_EVENT, prepareDisplayCurrency } from './lib/displayCurrency';
import { ROOT_ID } from './styleScope';
import './styles.css';
// One card family and one storefront frame for every page (owner, 8 Nov 2026).
import './components/cards/cards.css';
import './components/storefronts/store.css';

/** What the NexG website calls (apps/web/components/discovery/discovery-app.tsx). */
interface DiscoveryApi {
  mount(container: HTMLElement): void;
  unmount(container?: HTMLElement): void;
}

declare global {
  interface Window { nexgDiscovery?: DiscoveryApi }
}

let current: { root: Root; container: HTMLElement } | undefined;

/**
 * Renders Discovery into `container`: `#discovery-root`, under the site's own header on the NexG website
 * (apps/web/app/discover), or on a page of its own (index.html). Every Discovery style is scoped to that id
 * (src/styleScope.ts), so a container without it gets it.
 */
function mount(container: HTMLElement) {
  if (current?.container === container) return;
  unmount();
  container.id = ROOT_ID;
  const root = createRoot(container);
  current = { root, container };
  // The display currency (and its rates, when it is not KES) is read before the first render, so prices never
  // flash from KES to the converted amount. KES visitors wait for nothing; others for at most two seconds.
  void prepareDisplayCurrency().then(() => {
    if (current?.root === root) root.render(<StrictMode><App key={renders++} /></StrictMode>);
  });
}

let renders = 0;

// The website's header picker changed the currency: render again with the new one. A fresh App, because prices are
// formatted during render all over Discovery and a plain re-render would leave memoised parts in the old currency.
window.addEventListener(CURRENCY_EVENT, () => {
  const mounted = current;
  if (!mounted) return;
  void prepareDisplayCurrency().then(() => {
    if (current === mounted) mounted.root.render(<StrictMode><App key={renders++} /></StrictMode>);
  });
});

/**
 * Takes Discovery off the page: the website calls this when the visitor moves to another page of the site without
 * a reload, so no listener of Discovery's outlives it. With a container, only a Discovery mounted there is removed.
 */
function unmount(container?: HTMLElement) {
  if (!current || (container && current.container !== container)) return;
  current.root.unmount();
  current = undefined;
}

// On window rather than as module exports: the build starts from index.html, so the entry keeps no export names.
window.nexgDiscovery = { mount, unmount };

// A page that already has the element starts at once; the website mounts again after moving between its pages.
const initial = document.getElementById(ROOT_ID);
if (initial) mount(initial);
