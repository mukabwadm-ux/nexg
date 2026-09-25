'use client';

import { FileText, ImageIcon, Upload, X } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';
import {
  ACCEPTED_MIME_TYPES,
  compressImage,
  formatBytes,
  isPdf,
  MAX_FILE_BYTES,
  validateFile,
} from '../lib/file';
import { Field } from './field';
import { Spinner } from './spinner';

export interface FileDropProps {
  id: string;
  label: string;
  /** Requirement help text, e.g. "Both sides, readable, no glare." */
  hint?: string;
  /** Validation or upload error shown under the control. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** An upload is in flight; the control is locked and shows progress. */
  loading?: boolean;
  labelHidden?: boolean;
  className?: string;
  /** The file already attached — renders the filled state. */
  file?: File | null;
  /** A previously saved upload, shown when there is no in-memory `file`. */
  existing?: { name: string; sizeBytes?: number; mime?: string } | null;
  /** Receives the file after validation and image compression. */
  onFileSelect?: (file: File) => void;
  onRemove?: () => void;
  /** Reports a client-side rejection so the caller can surface it. */
  onValidationError?: (message: string) => void;
}

/**
 * Document upload for the application flows (spec section 2). Accepts images
 * and PDFs up to 10 MB, compresses photos in the browser, and works by click,
 * keyboard, or drag and drop.
 */
export function FileDrop({
  id,
  label,
  hint,
  error,
  required,
  disabled,
  loading,
  labelHidden,
  className,
  file,
  existing,
  onFileSelect,
  onRemove,
  onValidationError,
}: FileDropProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [compressing, setCompressing] = React.useState(false);

  const busy = loading || compressing;
  const locked = disabled || busy;

  const accept = async (candidate: File | undefined) => {
    if (!candidate) return;

    const message = validateFile(candidate);
    if (message) {
      onValidationError?.(message);
      return;
    }

    setCompressing(true);
    try {
      const prepared = await compressImage(candidate);
      // Compression can still leave a huge image over the limit.
      if (prepared.size > MAX_FILE_BYTES) {
        onValidationError?.(
          `That image is still ${formatBytes(prepared.size)} after compression. ` +
            `The limit is ${formatBytes(MAX_FILE_BYTES)}.`,
        );
        return;
      }
      onFileSelect?.(prepared);
    } finally {
      setCompressing(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (locked) return;
    void accept(event.dataTransfer.files[0]);
  };

  const openPicker = () => {
    if (!locked) inputRef.current?.click();
  };

  const attached = file ?? existing ?? null;
  const attachedName = file?.name ?? existing?.name ?? '';
  const attachedSize = file?.size ?? existing?.sizeBytes;
  const attachedIsPdf = file ? isPdf(file) : existing?.mime === 'application/pdf';

  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      labelHidden={labelHidden}
      className={className}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="sr-only"
        accept={ACCEPTED_MIME_TYPES.join(',')}
        disabled={locked}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        onChange={(event) => {
          void accept(event.target.files?.[0]);
          // Allow re-selecting the same filename after a removal.
          event.target.value = '';
        }}
      />

      {attached ? (
        <div
          className={cn(
            'bg-surface flex items-center gap-3 rounded-lg border p-3',
            error ? 'border-danger' : 'border-border-strong',
          )}
        >
          <span
            aria-hidden="true"
            className="bg-bg text-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
          >
            {attachedIsPdf ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
          </span>

          <span className="min-w-0 flex-1">
            <span className="text-ink block truncate text-sm font-semibold">{attachedName}</span>
            <span className="text-muted-light block text-xs">
              {busy ? 'Uploading…' : attachedSize ? formatBytes(attachedSize) : 'Saved'}
            </span>
          </span>

          {busy ? (
            <Spinner className="text-muted-light" label="Uploading" />
          ) : (
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={openPicker}
                disabled={locked}
                className={cn(
                  'text-gold-text rounded-md px-2 py-1 text-xs font-bold',
                  'hover:bg-gold-soft focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
                  'disabled:opacity-45',
                )}
              >
                Replace
              </button>
              {onRemove && (
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={locked}
                  aria-label={`Remove ${attachedName}`}
                  className={cn(
                    'text-muted-light flex h-7 w-7 items-center justify-center rounded-md',
                    'hover:bg-border/60 hover:text-ink',
                    'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
                    'disabled:opacity-45',
                  )}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </span>
          )}
        </div>
      ) : (
        /*
         * A button, not a label — so that Space and Enter open the picker and
         * the control announces itself as actionable.
         */
        <button
          type="button"
          onClick={openPicker}
          disabled={locked}
          onDragOver={(event) => {
            event.preventDefault();
            if (!locked) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6',
            'text-center transition-colors',
            'focus-visible:ring-gold focus-visible:ring-offset-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-60',
            dragging && 'border-gold bg-gold-soft',
            error ? 'border-danger bg-danger-bg/40' : !dragging && 'border-border-strong bg-bg/60',
          )}
        >
          {busy ? (
            <Spinner className="text-muted-light h-5 w-5" label="Preparing file" />
          ) : (
            <Upload className="text-muted-light h-5 w-5" aria-hidden="true" />
          )}
          <span className="text-ink text-sm font-bold">
            {busy ? 'Preparing…' : 'Tap to upload or drag a file here'}
          </span>
          <span className="text-muted-light text-xs">
            Photo or PDF, up to {formatBytes(MAX_FILE_BYTES)}
          </span>
        </button>
      )}
    </Field>
  );
}
