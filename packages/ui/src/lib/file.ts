/** Upload rules for `partner-documents` (spec section 2: image/PDF, 10 MB). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

/** Longest edge, in pixels, that a compressed photo is scaled down to. */
const MAX_IMAGE_EDGE = 1800;
const JPEG_QUALITY = 0.82;

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf';
}

export function isImage(file: File): boolean {
  return file.type.startsWith('image/');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reject a file before it ever reaches the network. Returns a message suitable
 * for showing to the applicant, or `null` when the file is acceptable.
 *
 * Oversized *images* are allowed through: compression runs next and usually
 * brings them under the limit. A PDF cannot be compressed here, so it is
 * rejected outright.
 */
export function validateFile(file: File): string | null {
  if (!(ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'That file type is not accepted. Upload a photo (JPG, PNG, WebP) or a PDF.';
  }
  if (file.size > MAX_FILE_BYTES && !isImage(file)) {
    return `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`;
  }
  return null;
}

/**
 * Scale and re-encode a photo in the browser so a 12 MP phone capture becomes a
 * ~300 KB JPEG before upload. Riders are on 3G (spec ground rule 7).
 *
 * PDFs and already-small images are returned untouched. Any failure resolves to
 * the original file rather than blocking the upload.
 */
export async function compressImage(file: File): Promise<File> {
  if (!isImage(file) || typeof document === 'undefined') return file;
  // HEIC has no canvas decoder in most browsers; let the server deal with it.
  if (file.type === 'image/heic' || file.type === 'image/heif') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));

    // Nothing to gain: already small in both dimensions and on disk.
    if (scale === 1 && file.size <= 1024 * 1024) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], replaceExtension(file.name, 'jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    // Compression is an optimisation, never a gate.
    return file;
  }
}

function replaceExtension(name: string, extension: string): string {
  return `${name.replace(/\.[^./\\]+$/, '')}.${extension}`;
}
