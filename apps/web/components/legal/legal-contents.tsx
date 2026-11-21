'use client';

import { ArrowLeft, ChevronDown, ListOrdered, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

type Section = { id: string; heading: string };

/** Height of the sticky header and the phone's contents bar together, in px. */
const READING_LINE = 140;

/** The section being read: the last one whose heading has reached the top of the window. */
function useCurrentSection(sections: Section[]): number {
  const [current, setCurrent] = React.useState(0);
  React.useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      let index = 0;
      sections.forEach((section, i) => {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= READING_LINE) index = i;
      });
      setCurrent(index);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sections]);
  return current;
}

/**
 * "On this page". On a wide screen, a list beside the text that stays in
 * view and marks the section being read. On a phone, a bar that stays at the
 * top ("On this page · Your Rights · 7 of 11") and opens the list as a sheet
 * from the bottom.
 */
export function LegalContents({
  sections,
  title,
  variant,
}: {
  sections: Section[];
  title: string;
  variant: 'rail' | 'bar';
}) {
  const current = useCurrentSection(sections);
  const sheet = React.useRef<HTMLDialogElement>(null);

  if (variant === 'rail') {
    return (
      <nav aria-label="On this page">
        <h2 className="text-page text-sm font-extrabold">On this page</h2>
        <ol className="mt-2 flex flex-col">
          {sections.map((section, index) => {
            const active = index === current;
            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={active ? 'location' : undefined}
                  className={`flex gap-2.5 rounded-lg px-2.5 py-1.5 text-sm leading-snug transition-colors ${
                    active
                      ? 'bg-page-line/60 text-page font-extrabold'
                      : 'text-page-muted hover:text-page font-medium'
                  }`}
                >
                  <span
                    className={`min-w-[1.25rem] shrink-0 font-bold ${
                      active ? 'text-warning dark:text-gold' : ''
                    }`}
                  >
                    {index + 1}
                  </span>
                  {section.heading}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  const open = () => sheet.current?.showModal();
  const close = () => sheet.current?.close();

  return (
    <>
      <div className="bg-bg border-page-line sticky top-16 z-30 -mx-4 mt-4 border-y px-4 sm:-mx-8 sm:px-8 lg:hidden print:hidden">
        <button
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          className="text-page focus-visible:ring-gold flex h-12 w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2"
        >
          <ListOrdered className="text-page-muted h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="shrink-0 text-sm font-extrabold">On this page</span>
          <span className="text-page-muted min-w-0 truncate text-[0.8125rem] font-semibold">
            <span aria-hidden="true">· </span>
            {sections[current]?.heading}
          </span>
          <span className="text-page-muted ml-auto shrink-0 text-[0.8125rem] font-bold">
            {current + 1} of {sections.length}
          </span>
          <ChevronDown className="h-[1.125rem] w-[1.125rem] shrink-0" aria-hidden="true" />
        </button>
      </div>

      {/* Tapping the dimmed page closes the sheet; from the keyboard, Esc and Close do. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={sheet}
        aria-labelledby="contents-sheet-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="bg-surface text-ink fixed inset-x-0 bottom-0 top-auto m-0 max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-[1.75rem] p-0 backdrop:bg-black/60"
      >
        <div className="px-4 pb-6 pt-2.5">
          <div aria-hidden="true" className="bg-border-strong mx-auto h-[5px] w-11 rounded-full" />
          <div className="mt-3.5 flex items-start gap-3 px-1">
            <div className="min-w-0 flex-1">
              <h2
                id="contents-sheet-title"
                className="text-xl font-extrabold leading-tight tracking-tight"
              >
                On this page
              </h2>
              <p className="text-muted mt-1 text-sm font-semibold">
                {title} · {sections.length} sections
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="bg-border/60 focus-visible:ring-gold flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <ol className="mt-3 flex flex-col gap-0.5">
            {sections.map((section, index) => {
              const active = index === current;
              return (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    onClick={close}
                    aria-current={active ? 'location' : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] ${
                      active ? 'bg-gold-soft font-extrabold' : 'font-medium'
                    }`}
                  >
                    <span
                      className={`min-w-[1.375rem] text-sm font-bold ${active ? 'text-warning' : 'text-muted'}`}
                    >
                      {index + 1}
                    </span>
                    {section.heading}
                  </a>
                </li>
              );
            })}
          </ol>

          <div className="border-border mt-3 border-t px-1 pt-2">
            <Link
              href="/legal"
              className="text-ink flex min-h-[3rem] items-center gap-2.5 text-base font-bold"
            >
              <ArrowLeft className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
              All legal documents
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
