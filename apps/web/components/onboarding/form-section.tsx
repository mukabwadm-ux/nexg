import type * as React from 'react';

/** Where one section of a one-page form stands, for its card's marker, badge and summary. */
export interface FormSectionState {
  id: string;
  title: string;
  done: boolean;
  attention: boolean;
  started: boolean;
  /** One line shown in place of the fields once the section is folded. */
  summary: string;
}

/**
 * One numbered card of a one-page form in the merchant form's look
 * (merchant-onboarding.css inside MerchantRegistrationFormFrame): the rider
 * application on /riders and the request on /ask. One card is open at a
 * time; the others fold to their summary with Open or Edit.
 */
export function FormSection({
  scope,
  section,
  number,
  open,
  onOpen,
  onContinue,
  children,
}: {
  /** Keeps the ids of two forms' sections apart (`mo-section-<scope>-<id>`). */
  scope: string;
  section: FormSectionState;
  number: number;
  open: boolean;
  onOpen: () => void;
  /** The section's Continue button; the last section has none. */
  onContinue: (() => void) | undefined;
  children: React.ReactNode;
}) {
  const bodyId = `mo-section-${scope}-${section.id}`;
  const state = section.done
    ? 'done'
    : section.attention
      ? 'attention'
      : open || section.started
        ? 'progress'
        : 'todo';
  const badge = {
    done: 'Complete',
    attention: 'Needs attention',
    progress: 'In progress',
    todo: 'To do',
  }[state];
  return (
    <section
      className={`mo-section is-${state} ${open ? 'is-open' : ''}`}
      aria-labelledby={`${bodyId}-title`}
    >
      <div className="mo-section-head">
        <span className="mo-section-marker" aria-hidden="true">
          {section.done ? <Tick /> : number}
        </span>
        <div className="mo-section-title">
          <h2 id={`${bodyId}-title`}>{section.title}</h2>
          {!open && section.summary && <p>{section.summary}</p>}
        </div>
        {open || !section.done ? <span className="mo-section-badge">{badge}</span> : null}
        {!open && (
          <button
            type="button"
            className="mo-section-edit"
            aria-expanded="false"
            aria-controls={bodyId}
            onClick={onOpen}
          >
            {section.done ? 'Edit' : 'Open'}
            <span className="mo-sr-only"> {section.title}</span>
          </button>
        )}
      </div>
      <div id={bodyId} className="mo-section-body" hidden={!open}>
        {children}
        {onContinue && (
          <div className="mo-section-actions">
            <button type="button" className="mo-button mo-section-continue" onClick={onContinue}>
              Continue
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/** The marker's tick once a section is complete. */
export function Tick() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
    >
      <path d="M5 12.5 10 17 19 7" />
    </svg>
  );
}
