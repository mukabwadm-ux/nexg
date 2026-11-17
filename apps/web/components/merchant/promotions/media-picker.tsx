'use client';

import { Film, ImageIcon, Upload } from 'lucide-react';
import * as React from 'react';

import { PROMO_MEDIA_ACCEPT, PROMO_MEDIA_RULES, megabytes } from '@/lib/promo-media';
import { pickMedia, releasePicked, type PickedMedia } from '@/lib/promo-media-client';

/** Media already saved, shown when nothing new has been chosen. */
export interface SavedMedia {
  kind: 'image' | 'video';
  /** A signed link, for showing. */
  src: string;
  poster?: string | null;
}

function seconds(value: number) {
  const whole = Math.round(value);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Choosing a finished image or video. Every browser check runs as soon as a
 * file is chosen (type, size, what its bytes really are, that it opens, its
 * size in pixels and, for a video, its length), so the merchant hears about a
 * problem before the preview, not after review. Nothing is uploaded here.
 */
export function MediaPicker({
  id,
  label,
  hint,
  picked,
  saved,
  disabled,
  onPick,
}: {
  id: string;
  label: string;
  hint?: string;
  picked: PickedMedia | null;
  saved?: SavedMedia | null;
  disabled?: boolean;
  onPick: (media: PickedMedia | null) => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [checking, setChecking] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [over, setOver] = React.useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    setChecking(true);
    try {
      const result = await pickMedia(file);
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      releasePicked(picked);
      onPick(result.media);
    } finally {
      setChecking(false);
      if (input.current) input.current.value = '';
    }
  }

  const shown = picked
    ? {
        kind: picked.kind,
        still: picked.kind === 'video' ? (picked.poster?.url ?? null) : picked.url,
        caption: [
          picked.file.name,
          megabytes(picked.file.size),
          `${picked.width} × ${picked.height}`,
          picked.duration !== undefined ? seconds(picked.duration) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }
    : saved
      ? {
          kind: saved.kind,
          still: saved.kind === 'video' ? (saved.poster ?? null) : saved.src,
          caption: saved.kind === 'video' ? 'Your current video' : 'Your current image',
        }
      : null;

  return (
    <div className="grid gap-2">
      <span id={`${id}-label`} className="text-[0.8125rem] font-bold">
        {label}
      </span>
      <div
        className={`rounded-lg border border-dashed p-3 transition-colors ${
          over ? 'border-[#98701a] bg-[#fff8e6]' : 'border-[#cdd0d7] bg-white'
        }`}
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (!disabled) void take(event.dataTransfer.files[0]);
        }}
      >
        {shown ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-md bg-[#171b24]">
              {shown.still && (
                // eslint-disable-next-line @next/next/no-img-element -- a file in memory or a signed link.
                <img src={shown.still} alt="" className="h-full w-full object-cover" />
              )}
              <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
                {shown.kind === 'video' ? (
                  <Film size={11} aria-hidden="true" />
                ) : (
                  <ImageIcon size={11} aria-hidden="true" />
                )}
                {shown.kind === 'video' ? 'Video' : 'Image'}
              </span>
            </div>
            <p className="min-w-0 flex-1 break-words text-[0.8125rem] font-semibold text-[#34394a]">
              {shown.caption}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="pm-button"
                disabled={disabled || checking}
                onClick={() => input.current?.click()}
              >
                {checking ? 'Checking…' : 'Replace'}
              </button>
              {picked && (
                <button
                  type="button"
                  className="pm-button"
                  disabled={disabled || checking}
                  onClick={() => {
                    releasePicked(picked);
                    onPick(null);
                  }}
                >
                  {saved ? 'Keep current' : 'Remove'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="flex w-full flex-col items-center gap-1.5 rounded-md px-3 py-4 text-center disabled:opacity-55"
            disabled={disabled || checking}
            onClick={() => input.current?.click()}
            aria-describedby={`${id}-rules`}
          >
            <Upload size={20} aria-hidden="true" />
            <span className="text-[0.875rem] font-extrabold">
              {checking ? 'Checking the file…' : 'Upload an image or a video'}
            </span>
            <span className="text-[0.75rem] font-semibold text-[#586071]">or drop it here</span>
          </button>
        )}
        {/* Hidden outright, not visually hidden: the workspace styles give every
            input a width, which would push a merely sr-only one off the page.
            The buttons above open it. */}
        <input
          ref={input}
          id={id}
          type="file"
          accept={PROMO_MEDIA_ACCEPT}
          hidden
          aria-labelledby={`${id}-label`}
          disabled={disabled || checking}
          onChange={(event) => void take(event.target.files?.[0])}
        />
      </div>
      <p id={`${id}-rules`} className="m-0 text-[0.75rem] font-semibold text-[#586071]">
        {PROMO_MEDIA_RULES} {hint}
      </p>
      {problem && (
        <p
          role="alert"
          className="m-0 rounded-md bg-[#fdecea] px-3 py-2 text-[0.8125rem] font-bold text-[#a3261b]"
        >
          {problem}
        </p>
      )}
    </div>
  );
}
