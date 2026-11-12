'use client';

import { LocationSheet } from '@nexg/location';
import * as React from 'react';

import { SiteLocationProvider } from '@/components/location/provider';

/**
 * NexG Discovery inside the website, under the site's own header (owner, 12 Nov 2026).
 *
 * Discovery is its own app (discovery/). The website's build packs it into public/discover
 * (discovery/scripts/build-for-web.mjs), with fixed names for its entry module and stylesheet
 * (discovery/vite.config.ts). This page renders the site header and, under it, an empty
 * #discovery-root that Discovery renders into. Discovery's styles only apply inside that element
 * (discovery/src/styleScope.ts), so the header, menu and location sheet are the same as on
 * every other page.
 */
export const DISCOVERY_SCRIPT = '/discover/assets/discovery.js';
export const DISCOVERY_STYLES = '/discover/assets/discovery.css';

/** What Discovery's module puts on window.nexgDiscovery once it has run (discovery/src/main.tsx). */
interface DiscoveryApi {
  mount(container: HTMLElement): void;
  unmount(container?: HTMLElement): void;
}

const discoveryApi = () => (window as { nexgDiscovery?: DiscoveryApi }).nexgDiscovery;

/*
 * Discovery renders inside #discovery-root, so React must leave the element's contents alone.
 * Given inner HTML, React neither hydrates nor diffs the children. It is one object for good:
 * React writes the inner HTML again whenever this prop is a different object, and a re-render
 * (a router refresh after a server action, say) would then wipe Discovery off the page.
 */
const DISCOVERY_RENDERS_HERE = { __html: '' };

/**
 * The location layer the header needs: its Deliver to chip, and the menu's Deliver to card, open
 * this sheet. Only the header changed here, so the sheet waits to be asked and there is no
 * location banner: Discovery's catalogue does not follow the delivery spot.
 */
export function DiscoveryChrome({ children }: { children: React.ReactNode }) {
  return (
    <SiteLocationProvider initial={null}>
      {children}
      <LocationSheet autoOpen={false} />
    </SiteLocationProvider>
  );
}

export function DiscoveryApp() {
  const root = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const element = root.current;
    if (!element) return;

    /* Discovery's bar pins right under the site header (the element just before this one), so it
       gets the header's measured height. */
    const header = element.previousElementSibling;
    const observer =
      header instanceof HTMLElement && header.tagName === 'HEADER'
        ? new ResizeObserver(() =>
            element.style.setProperty('--site-header-height', `${header.offsetHeight}px`),
          )
        : undefined;
    if (observer && header) observer.observe(header);

    /* On a fresh load the module has already rendered itself here. Arriving from another page of
       the site without a reload, it has not, so this renders it; leaving takes it off the page. */
    let active = true;
    import(/* webpackIgnore: true */ DISCOVERY_SCRIPT).then(
      () => {
        if (active) discoveryApi()?.mount(element);
      },
      () => {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            'Discovery is not built: run `pnpm --filter @nexg/web discover` to fill public/discover.',
          );
        }
      },
    );

    return () => {
      active = false;
      observer?.disconnect();
      discoveryApi()?.unmount(element);
    };
  }, []);

  return (
    <>
      <div
        ref={root}
        id="discovery-root"
        /* The site header's height until it is measured: its 2.75rem logo (3rem from sm), 0.5rem
           above and below, and its 1px border (site-header.tsx). Discovery's dark ground fills the
           screen under it from the first paint, before Discovery's own stylesheet arrives. */
        className="min-h-[calc(100dvh_-_var(--site-header-height))] bg-[#111315] [--site-header-height:calc(3.75rem_+_1px)] sm:[--site-header-height:calc(4rem_+_1px)]"
        dangerouslySetInnerHTML={DISCOVERY_RENDERS_HERE}
        /* Discovery may already be inside when React hydrates; that is expected, not a mismatch. */
        suppressHydrationWarning
      />
      {/* eslint-disable-next-line @next/next/no-css-tags -- Discovery's own stylesheet, built outside Next. */}
      <link rel="stylesheet" href={DISCOVERY_STYLES} />
      {/* A module script runs once the page is parsed, after the stylesheet above (defer is implied). */}
      <script type="module" src={DISCOVERY_SCRIPT} defer />
    </>
  );
}
