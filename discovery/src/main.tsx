import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from './App';
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
  root.render(<StrictMode><App /></StrictMode>);
  current = { root, container };
}

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
