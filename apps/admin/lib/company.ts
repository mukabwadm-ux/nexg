/**
 * The Company pages' own vocabulary: access levels, what kind of file a
 * file is, and the labels and tones of every status. The generic pieces
 * (period, money, dates, tones) live in ./portal and are re-exported here.
 */

import type { Tone } from './portal';

export * from './portal';

export type CompanyLevel = 'full' | 'limited' | 'view';

/** What the signed-in person may do in Company, from their module level. */
export function companyAccess(level: string | null | undefined, isSuperAdmin = false) {
  const full = isSuperAdmin || level === 'full';
  const write = full || level === 'limited';
  return { canWrite: write, canApprove: full };
}

/* ───────────────────────────────────────────────────────────────── files */

export type FileKind = 'pdf' | 'doc' | 'sheet' | 'slides' | 'image' | 'text' | 'archive' | 'other';

export const FILE_KINDS: { key: FileKind; label: string }[] = [
  { key: 'pdf', label: 'PDF' },
  { key: 'doc', label: 'Documents' },
  { key: 'sheet', label: 'Spreadsheets' },
  { key: 'slides', label: 'Presentations' },
  { key: 'image', label: 'Images' },
  { key: 'text', label: 'Text & CSV' },
  { key: 'archive', label: 'Archives' },
  { key: 'other', label: 'Other' },
];

/** What kind of file this is, by type first and the name's extension second. */
export function fileKind(mime: string | null | undefined, name = ''): FileKind {
  const m = (mime ?? '').toLowerCase();
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (m.includes('spreadsheet') || m.includes('ms-excel') || ['xlsx', 'xls', 'ods'].includes(ext))
    return ext === 'csv' ? 'text' : 'sheet';
  if (
    m.includes('presentation') ||
    m.includes('powerpoint') ||
    ['pptx', 'ppt', 'odp'].includes(ext)
  )
    return 'slides';
  if (m.includes('word') || m.includes('opendocument.text') || m === 'application/rtf')
    return 'doc';
  if (['docx', 'doc', 'odt', 'rtf'].includes(ext)) return 'doc';
  if (m === 'text/csv' || m === 'text/plain' || ['csv', 'txt'].includes(ext)) return 'text';
  if (m.includes('zip') || ext === 'zip') return 'archive';
  return 'other';
}

/** The short badge on a file row: PDF, XLSX, DOCX. */
export function fileBadge(name: string, mime?: string | null): string {
  const ext = name.includes('.') ? name.split('.').pop()!.toUpperCase() : '';
  if (ext && ext.length <= 5) return ext;
  const kind = fileKind(mime, name);
  return kind === 'other' ? 'FILE' : kind.toUpperCase();
}

/** Types the company-files bucket accepts; kept in step with the migration. */
export const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'application/rtf',
  'text/csv',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'application/zip',
  'application/x-zip-compressed',
] as const;

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * The project's file storage allowance, which every bucket shares: 1 GB on
 * the Supabase Free plan NexG is on (checked 2026-11-16). Pro includes
 * 100 GB; change this when the plan changes.
 */
export const STORAGE_ALLOWANCE_BYTES = 1024 ** 3;

/** Why an upload would be refused, before it is tried; null when fine. */
export function uploadProblem(file: { name: string; type: string; size: number }): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is over 50 MB.`;
  if (!(ACCEPTED_FILE_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name} is not a type Company files keeps (PDF, Office, images, CSV, text or ZIP).`;
  }
  return null;
}

/** A storage key for an upload: the uploader's folder, a random folder, a safe name. */
export function storageKey(userId: string, name: string, random: string): string {
  const safe =
    name
      .normalize('NFKD')
      .replace(/[^\w.\- ]+/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .slice(-120) || 'file';
  return `${userId}/${random}/${safe}`;
}

/* ─────────────────────────────────────────────────────────────── statuses */

export const STOCK_STATUS: Record<string, { label: string; tone: Tone }> = {
  in_stock: { label: 'In Stock', tone: 'green' },
  low_stock: { label: 'Low Stock', tone: 'amber' },
  out_of_stock: { label: 'Out of Stock', tone: 'red' },
};

export const ASSET_STATUS: Record<string, { label: string; tone: Tone }> = {
  available: { label: 'Available', tone: 'green' },
  in_use: { label: 'In Use', tone: 'blue' },
  maintenance: { label: 'Maintenance', tone: 'amber' },
  retired: { label: 'Retired', tone: 'grey' },
  lost: { label: 'Lost', tone: 'red' },
};

export const ASSET_CONDITION: Record<string, { label: string; tone: Tone }> = {
  new: { label: 'New', tone: 'green' },
  good: { label: 'Good', tone: 'green' },
  fair: { label: 'Fair', tone: 'amber' },
  poor: { label: 'Poor', tone: 'red' },
  broken: { label: 'Broken', tone: 'red' },
};

export const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'grey' },
  submitted: { label: 'Awaiting Approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'blue' },
  rejected: { label: 'Turned Down', tone: 'red' },
  ordered: { label: 'Ordered', tone: 'purple' },
  received: { label: 'Received', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  issued: { label: 'Issued', tone: 'purple' },
  partially_received: { label: 'Part Received', tone: 'amber' },
  received: { label: 'Received', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

export const VENDOR_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'green' },
  on_hold: { label: 'On Hold', tone: 'amber' },
  archived: { label: 'Archived', tone: 'grey' },
};

export const PRIORITY: Record<string, { label: string; tone: Tone }> = {
  low: { label: 'Low', tone: 'grey' },
  normal: { label: 'Normal', tone: 'blue' },
  high: { label: 'High', tone: 'amber' },
  urgent: { label: 'Urgent', tone: 'red' },
};

export const DEPARTMENTS: Record<string, string> = {
  operations: 'Operations',
  finance: 'Finance',
  technology: 'Technology',
  marketing: 'Marketing',
  people: 'People',
  support: 'Customer Support',
  riders: 'Riders',
  office: 'Office',
  other: 'Other',
};

export const VENDOR_CATEGORIES: Record<string, string> = {
  it_electronics: 'IT & Electronics',
  furniture: 'Furniture',
  office_supplies: 'Office Supplies',
  rider_gear: 'Rider Gear',
  fuel_energy: 'Fuel & Energy',
  printing: 'Printing',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
  professional_services: 'Professional Services',
  logistics: 'Logistics',
  food_beverage: 'Food & Beverage',
  other: 'Other',
};

export const PAYMENT_TERMS: Record<string, string> = {
  prepaid: 'Paid in Advance',
  on_delivery: 'On Delivery',
  net_7: '7 Days',
  net_15: '15 Days',
  net_30: '30 Days',
  net_60: '60 Days',
};

export const LOCATION_KINDS: Record<string, string> = {
  office: 'Office',
  warehouse: 'Warehouse',
  store: 'Store',
  hub: 'Rider Hub',
  other: 'Other',
};

export const UNITS = ['pcs', 'box', 'pack', 'ream', 'pair', 'set', 'roll', 'L', 'kg', 'm'] as const;

export const CATEGORY_ICONS = [
  'laptop',
  'armchair',
  'printer',
  'hard-hat',
  'fuel',
  'paperclip',
  'package',
  'bike',
  'car',
  'wrench',
  'shield',
  'spray-can',
  'coffee',
  'plug',
  'smartphone',
  'router',
  'box',
  'shirt',
  'book',
] as const;

/** How much to order to get a line back above its reorder level. */
export function suggestedOrder(quantityOnHand: number, reorderLevel: number): number {
  if (reorderLevel <= 0) return quantityOnHand <= 0 ? 1 : 0;
  const target = reorderLevel * 2;
  return Math.max(0, Math.ceil(target - quantityOnHand));
}

/* ───────────────────────────────────────────────────────────── folders */

/** What the folder helpers need of a folder. */
export interface FolderNode {
  id: string;
  name: string;
  /** The top-level folder this one sits in; null for a top-level folder. */
  parent_id: string | null;
  sort: number;
}

/** Top-level folders in their order, each followed by its sub-folders. */
export function folderTree<T extends FolderNode>(folders: T[]): { folder: T; subs: T[] }[] {
  const order = (a: T, b: T) => a.sort - b.sort || a.name.localeCompare(b.name);
  return folders
    .filter((f) => !f.parent_id)
    .sort(order)
    .map((folder) => ({
      folder,
      subs: folders.filter((f) => f.parent_id === folder.id).sort(order),
    }));
}

/** "Corporate and Legal › Company registration". */
export function folderPath(folders: FolderNode[], id: string | null | undefined): string | null {
  const f = folders.find((x) => x.id === id);
  if (!f) return null;
  const parent = f.parent_id ? folders.find((x) => x.id === f.parent_id) : null;
  return parent ? `${parent.name} › ${f.name}` : f.name;
}

/** Every folder for a picker: each top-level folder, then its sub-folders under it. */
export function folderOptions(folders: FolderNode[]): { value: string; label: string }[] {
  return folderTree(folders).flatMap(({ folder, subs }) => [
    { value: folder.id, label: folder.name },
    ...subs.map((s) => ({ value: s.id, label: `${folder.name} › ${s.name}` })),
  ]);
}
