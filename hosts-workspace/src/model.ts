export type Role = 'Owner' | 'Manager' | 'Cleaner' | 'Caretaker' | 'Finance';
export interface Base {
  id: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}
export interface Property extends Base {
  name: string;
  description: string;
  area: string;
  image: string;
  status: string;
}
export interface Unit extends Base {
  propertyId: string;
  name: string;
  capacity: number;
  bedrooms: number;
  bathrooms: number;
  nightlyMinor: number;
  readiness: string;
  image: string;
  deliveryRule: string;
  contact: string;
  hours: string;
  access: string;
  status: string;
  guidePublished?: boolean;
  guideRevision?: number;
  planId?: string;
  map?: string;
  modelId?: string;
  modelName?: string;
}
export interface Stay extends Base {
  ref: string;
  unitId: string;
  guest: string;
  email?: string;
  phone?: string;
  start: string;
  end: string;
  status: string;
  kind: string;
  guests: number;
  totalMinor: number;
  arrivalTime: string;
  agreement?: string;
  billing?: string;
  holdUntil?: string;
}
export interface Task extends Base {
  unitId: string;
  stayId?: string;
  title: string;
  type: string;
  assigneeId: string;
  due: string;
  priority: string;
  status: string;
  checklist: string;
  completedChecks?: string;
  evidence?: string;
  comments?: string;
  cadence?: string;
  inspection?: boolean;
  workspaceTask?: boolean;
}
export interface Payment extends Base {
  stayId: string;
  amountMinor: number;
  type: string;
  status: string;
  date: string;
  reference: string;
}
export interface Expense extends Base {
  unitId: string;
  category: string;
  description: string;
  amountMinor: number;
  date: string;
  status: string;
  evidence?: string;
}
export interface Article extends Base {
  unitId: string;
  title: string;
  room: string;
  content: string;
  steps: string;
  media?: string;
  caption?: string;
  x?: number;
  y?: number;
  markerHeight?: number;
}
export interface QrCard extends Base {
  unitId: string;
  spot: string;
  status: string;
  token: string;
  scans: number;
  scans30d?: number;
  orders: number;
  lastScanAt?: string;
  expires?: string;
}
export interface Package extends Base {
  title: string;
  items: string;
  leadHours: number;
  amountMinor: number;
}
export interface PackageJob extends Base {
  packageId: string;
  unitId: string;
  stayId?: string;
  due: string;
  status: string;
  evidence?: string;
}
export interface Delivery extends Base {
  unitId: string;
  stayId?: string;
  title: string;
  stage: string;
  rule: string;
  reference: string;
  evidence?: string;
  issue?: string;
}
export interface Member extends Base {
  name: string;
  email: string;
  role: Role;
  propertyIds: string[];
  status: string;
}
export interface RecordItem extends Base {
  title?: string;
  unitId?: string;
  stayId?: string;
  status?: string;
  amountMinor?: number;
  date?: string;
  [key: string]: unknown;
}
export interface Settings {
  workspace: string;
  business: string;
  currency: string;
  timezone: string;
  checkIn: string;
  checkOut: string;
  language: string;
  signature: string;
  folioEnabled: boolean;
  [key: string]: unknown;
}
export interface WorkspaceData {
  properties: Property[];
  units: Unit[];
  stays: Stay[];
  tasks: Task[];
  payments: Payment[];
  expenses: Expense[];
  articles: Article[];
  qrCards: QrCard[];
  packages: Package[];
  packageJobs: PackageJob[];
  deliveries: Delivery[];
  team: Member[];
  invoices: RecordItem[];
  referrals: RecordItem[];
  devices: RecordItem[];
  audit: RecordItem[];
  feedback: RecordItem[];
  versions: RecordItem[];
  calendarConnections: RecordItem[];
  priorityRules: RecordItem[];
  settings: Settings;
}
export type Collection = Exclude<keyof WorkspaceData, 'settings'>;
export interface Actor {
  id: string;
  name: string;
  email: string;
  role: Role;
  propertyIds: string[];
}
export interface Command {
  type:
    | 'save'
    | 'delete'
    | 'transition'
    | 'publish'
    | 'restore'
    | 'unpublish'
    | 'remove-guide-file'
    | 'settings'
    | 'theme'
    | 'referral'
    | 'sign-out-others';
  collection?: Collection | 'workspace-task';
  id?: string;
  record?: Record<string, unknown>;
  status?: string;
  expectedVersion?: number;
  settings?: Partial<Settings>;
}
export interface DialogState {
  collection: Collection;
  id?: string;
  defaults?: Record<string, unknown>;
  mode?: 'edit' | 'detail';
}
export function dateKey(date = new Date(), timeZone = 'Africa/Nairobi') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function nextDate(date: string, days: number) {
  const utc = new Date(date + 'T00:00:00Z');
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}
export const money = (minor: number, currency = 'KES') =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(minor / 100);
export const dateText = (date: string) =>
  date
    ? new Date(date.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      })
    : '—';
export const activeStay = (s: Stay) => !['Cancelled', 'Completed', 'Draft'].includes(s.status);
export const nights = (s: Stay) =>
  Math.max(0, Math.round((Date.parse(s.end) - Date.parse(s.start)) / 86400000));
export const totals = (data: WorkspaceData, stayId?: string) => {
  const p = data.payments.filter(
    (p) => (!stayId || p.stayId === stayId) && p.status === 'Recorded',
  );
  const receipts =
    p.filter((p) => p.type === 'Receipt').reduce((n, p) => n + p.amountMinor, 0) -
    p.filter((p) => p.type === 'Refund').reduce((n, p) => n + p.amountMinor, 0);
  const deposits =
    p.filter((p) => p.type === 'Deposit').reduce((n, p) => n + p.amountMinor, 0) -
    p.filter((p) => p.type === 'Deposit refund').reduce((n, p) => n + p.amountMinor, 0);
  const accommodation = data.stays
    .filter((s) => (!stayId || s.id === stayId) && s.status !== 'Cancelled')
    .reduce((n, s) => n + s.totalMinor, 0);
  return { receipts, deposits, accommodation, balance: Math.max(0, accommodation - receipts) };
};

export interface HostSetup {
  live: boolean;
  status: string;
  verificationCode: string | null;
  verificationMethod: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  steps: {
    profile: boolean;
    unit: boolean;
    handoff: boolean;
    packages: boolean;
    verification: boolean;
  };
  readiness: Array<{
    unitId: string;
    address: boolean;
    handoff: boolean;
    contact: boolean;
    hours: boolean;
    qr: boolean;
  }>;
}

export interface WorkspaceSnapshot {
  actor: Actor;
  data: WorkspaceData;
  today: string;
  propertyWrites: boolean;
  setup: HostSetup;
}
