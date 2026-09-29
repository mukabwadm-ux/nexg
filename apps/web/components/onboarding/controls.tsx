'use client';

import {
  Flower2,
  Gift,
  Pill as PillIcon,
  Scissors,
  Shirt,
  ShoppingCart,
  Utensils,
  Wine,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';

import type { Question } from './types';

/**
 * The tiles and chips the whole flow is made of.
 *
 * Everything is a real <button> with aria-pressed rather than a styled div,
 * so the flow is operable from a keyboard and a screen reader is told what is
 * chosen. On a phone this is also the difference between a tap target that
 * works and one that needs a second try.
 */

const ICONS: Record<string, LucideIcon> = {
  Utensils,
  Wine,
  Shirt,
  Flower2,
  Scissors,
  Pill: PillIcon,
  ShoppingCart,
  Gift,
};

export function Chip({
  selected,
  onClick,
  children,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`focus-visible:ring-gold rounded-full px-4 py-2.5 text-[0.8125rem] font-extrabold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? 'bg-ink text-gold'
          : 'border-border-strong bg-surface text-ink hover:border-ink border'
      }`}
    >
      {children}
    </button>
  );
}

export function CategoryTile({
  icon,
  label,
  selected,
  onClick,
}: {
  icon: string;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = ICONS[icon] ?? Gift;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`focus-visible:ring-gold flex flex-col items-center gap-3 rounded-2xl border p-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        selected
          ? 'border-ink bg-ink text-white'
          : 'border-border bg-surface hover:border-border-strong'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 items-center justify-center rounded-xl ${
          selected ? 'bg-gold text-ink' : 'bg-bg text-ink'
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[0.8125rem] font-extrabold">{label}</span>
    </button>
  );
}

export function OptionTile({
  icon,
  badge,
  title,
  description,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  badge: string;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`focus-visible:ring-gold rounded-2xl border p-6 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        selected
          ? 'border-ink bg-ink text-white'
          : 'border-border bg-surface hover:border-border-strong'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className="bg-gold text-ink flex h-11 w-11 items-center justify-center rounded-xl"
        >
          {icon}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold uppercase tracking-wide ${
            selected ? 'bg-gold text-ink' : 'bg-gold-soft text-gold-text'
          }`}
        >
          {badge}
        </span>
      </div>
      <p className="mt-5 text-lg font-extrabold tracking-tight">{title}</p>
      <p
        className={`mt-2 text-[0.875rem] leading-[1.7] ${selected ? 'text-white/70' : 'text-muted'}`}
      >
        {description}
      </p>
    </button>
  );
}

/** The small amber "BECAUSE OF YOUR ANSWER" tag on every follow-up. */
export function BecauseTag() {
  return (
    <span className="bg-gold-soft text-gold-text shrink-0 rounded px-2 py-1 text-[0.625rem] font-extrabold uppercase tracking-wide">
      Because of your answer
    </span>
  );
}

export function QuestionCard({
  question,
  value,
  onChange,
  showTag = true,
}: {
  question: Question;
  value: string | string[] | undefined;
  onChange: (next: string | string[]) => void;
  showTag?: boolean;
}) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];

  const toggle = (option: string) => {
    if (question.type === 'multi') {
      onChange(
        selected.includes(option) ? selected.filter((v) => v !== option) : [...selected, option],
      );
    } else {
      onChange(option);
    }
  };

  return (
    <div className="border-border bg-surface rounded-2xl border p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[0.9375rem] font-extrabold leading-snug">{question.label}</h3>
        {showTag && <BecauseTag />}
      </div>

      {question.type === 'text' ? (
        <textarea
          rows={2}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className="border-border-strong bg-bg focus-visible:ring-gold mt-4 w-full rounded-xl border px-3 py-2.5 text-[0.875rem] font-semibold focus:outline-none focus-visible:ring-2"
          placeholder="A sentence is enough"
        />
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {question.options?.map((option) => (
            <Chip
              key={option.value}
              selected={selected.includes(option.value)}
              onClick={() => toggle(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      )}

      {question.hint && (
        <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">{question.hint}</p>
      )}
    </div>
  );
}

/** The amber strip under the questions that says what paperwork follows. */
export function DocumentsNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-warning/40 bg-warning-bg text-warning flex items-start gap-3 rounded-xl border p-4 text-[0.8125rem] font-bold leading-[1.7]">
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        ✦
      </span>
      <span>{children}</span>
    </p>
  );
}
