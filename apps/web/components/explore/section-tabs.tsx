'use client';

import * as React from 'react';

/**
 * The sticky row of section tabs above a merchant's menu ("Starters", "Mains",
 * "Drinks" for a restaurant; "Wash & fold", "Dry cleaning" for a laundry).
 * The tabs are the merchant's own sections, so they fit any kind of business.
 * Tapping one scrolls to it; scrolling marks the section on screen.
 */
export function SectionTabs({ sections }: { sections: { id: string; name: string }[] }) {
  const [active, setActive] = React.useState(sections[0]?.id ?? '');
  const rail = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    /*
     * The current section is the last one whose heading has passed just under
     * the sticky tabs (about 160px from the top). Measured on scroll rather
     * than with an observer, so two short sections at the end of the page do
     * not trade places.
     */
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = sections[0]?.id ?? '';
      for (const s of sections) {
        const el = document.getElementById(`section-${s.id}`);
        if (el && el.getBoundingClientRect().top <= 160) current = s.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  /* Keep the current tab in view on a phone, where the row scrolls sideways. */
  React.useEffect(() => {
    rail.current
      ?.querySelector<HTMLElement>(`[data-tab="${active}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  return (
    <nav
      aria-label="Sections"
      className="bg-bg/95 dark:border-page-line sticky top-[4.5rem] z-20 -mx-1 border-b border-[#E9E2D4] px-1 py-3 backdrop-blur"
    >
      <div
        ref={rail}
        className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sections.map((section) => {
          const on = section.id === active;
          return (
            <a
              key={section.id}
              data-tab={section.id}
              href={`#section-${section.id}`}
              aria-current={on ? 'true' : undefined}
              onClick={() => setActive(section.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                on ? 'bg-ink text-white' : 'text-muted hover:text-ink bg-white hover:bg-[#F1ECE1]'
              }`}
            >
              {section.name}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
