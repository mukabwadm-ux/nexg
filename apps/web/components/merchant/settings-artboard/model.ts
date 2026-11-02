export const SECTIONS = [
  {
    id: 'account',
    label: 'Account & security',
    terms: 'login password recovery sessions authentication profile',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    terms: 'alerts quiet hours routing email recipients',
  },
  {
    id: 'preferences',
    label: 'Preferences',
    terms: 'language date time format density motion display',
  },
  {
    id: 'connections',
    label: 'Connections',
    terms: 'integrations pos erp inventory catalogue sync mapping',
  },
  { id: 'api', label: 'API & webhooks', terms: 'developer keys credentials events delivery' },
  {
    id: 'privacy',
    label: 'Data & privacy',
    terms: 'export access requests closure delete account',
  },
] as const;
export type Section = (typeof SECTIONS)[number]['id'];
export type Channel = 'In-app' | 'Email';
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
export interface SettingsIdentity {
  merchantId: string;
  userId: string;
  businessName: string;
  name: string;
  phone: string;
  email: string;
  phoneVerified: boolean;
  sample: boolean;
  routing: Record<string, string[]>;
  quiet: { from?: string; to?: string } | null;
}
export interface Preferences {
  language: 'English';
  dateFormat: 'long' | 'numeric';
  timeFormat: '12' | '24';
  density: 'Comfortable' | 'Compact';
  reduceMotion: boolean;
}
export interface AlertRule {
  id: string;
  group: string;
  label: string;
  description: string;
  channels: Channel[];
  recipient: string;
}
export interface Connection {
  id: string;
  name: string;
  function: string;
  location: string;
  state: 'Access expired' | 'Ready' | 'Validation pending' | 'Disconnected';
  source: 'External' | 'NEXG';
  access: 'Read only' | 'Outbound only';
  lastSuccess: string | null;
  mappings: { source: string; target: string }[];
}
export interface Credential {
  id: string;
  name: string;
  location: string;
  scopes: string[];
  state: 'Active' | 'Revoked';
  lastUsed: string | null;
  revision: number;
}
export interface Webhook {
  id: string;
  name: string;
  url: string;
  location: string;
  events: string[];
  state: 'Active' | 'Paused';
  signing: 'Verified' | 'Verification pending';
  delivery: 'Failed' | 'Queued' | 'Delivered' | 'Not sent';
  time: string | null;
}
export interface DataRequest {
  id: string;
  type: string;
  period: string;
  format: string;
  status: 'Submitted' | 'Preparing' | 'Ready' | 'Completed' | 'Cancelled';
  createdAt: string;
}
export interface Activity {
  id: string;
  label: string;
  time: string;
}
export interface SettingsState {
  version: 1;
  name: string;
  factor: boolean;
  preferences: Preferences;
  alerts: AlertRule[];
  routingRules: AlertRule[];
  quiet: { enabled: boolean; from: string; to: string };
  sessions: { id: string; device: string; current: boolean; activity: string }[];
  connections: Connection[];
  credentials: Credential[];
  webhooks: Webhook[];
  requests: DataRequest[];
  activity: Activity[];
}
export const DEFAULT_PREFERENCES: Preferences = {
  language: 'English',
  dateFormat: 'long',
  timeFormat: '24',
  density: 'Comfortable',
  reduceMotion: true,
};
export const SAMPLE_IDENTITY: SettingsIdentity = {
  merchantId: 'sample-karibu',
  userId: 'sample-amina',
  businessName: 'Karibu Studio',
  name: 'Amina Kamau',
  phone: '+254 7•• ••• 248',
  email: 'a••••@example.test',
  phoneVerified: true,
  sample: true,
  routing: {},
  quiet: null,
};
export function initialState(identity: SettingsIdentity): SettingsState {
  const sample = identity.sample;
  const alerts: AlertRule[] = sample
    ? [
        {
          id: 'appointment_request',
          group: 'Appointments',
          label: 'New appointment request',
          description: 'Get notified when a customer requests a new appointment.',
          channels: ['In-app', 'Email'],
          recipient: 'Reception team',
        },
        {
          id: 'appointment_changed',
          group: 'Appointments',
          label: 'Appointment changed',
          description: 'Get notified when an appointment is rescheduled or cancelled.',
          channels: ['In-app', 'Email'],
          recipient: 'Reception team',
        },
        {
          id: 'new_order',
          group: 'Product orders',
          label: 'New product order',
          description: 'Get notified when a customer places a product order.',
          channels: ['In-app'],
          recipient: 'Retail team',
        },
        {
          id: 'order_attention',
          group: 'Product orders',
          label: 'Order needs attention',
          description: 'Get notified when a product order requires your attention.',
          channels: ['In-app', 'Email'],
          recipient: 'Branch manager',
        },
      ]
    : [];
  return {
    version: 1,
    name: identity.name,
    factor: false,
    preferences: DEFAULT_PREFERENCES,
    alerts,
    routingRules: alerts.map((rule) => ({ ...rule, channels: ['In-app', 'Email'] })),
    quiet: {
      enabled: true,
      from: identity.quiet?.from ?? '22:00',
      to: identity.quiet?.to ?? '07:00',
    },
    sessions: sample
      ? [
          {
            id: 'current',
            device: 'Windows · Chrome',
            current: true,
            activity: '1 Nov, 09:10 EAT',
          },
          {
            id: 'android',
            device: 'Android · Chrome',
            current: false,
            activity: '31 Oct, 18:40 EAT',
          },
        ]
      : [],
    connections: sample
      ? [
          {
            id: 'fleet',
            name: 'Fleet catalogue',
            function: 'Vehicle descriptions',
            location: 'Kilimani',
            state: 'Access expired',
            source: 'External',
            access: 'Read only',
            lastSuccess: '1 Nov 2026, 08:05 EAT',
            mappings: [
              { source: 'vehicle_id', target: 'External identifier' },
              { source: 'description', target: 'Description' },
              { source: 'image_url', target: 'Image reference' },
            ],
          },
          {
            id: 'accounting',
            name: 'Accounting export',
            function: 'Posted transactions',
            location: 'Kilimani',
            state: 'Ready',
            source: 'NEXG',
            access: 'Outbound only',
            lastSuccess: '1 Nov 2026, 08:10 EAT',
            mappings: [{ source: 'posting_id', target: 'External identifier' }],
          },
        ]
      : [],
    credentials: sample
      ? [
          {
            id: 'stock-reader',
            name: 'Stock reader',
            location: 'Kilimani',
            scopes: ['Inventory read'],
            state: 'Active',
            lastUsed: '1 Nov, 10:10 EAT',
            revision: 1,
          },
        ]
      : [],
    webhooks: sample
      ? [
          {
            id: 'order-updates',
            name: 'Order updates',
            url: 'https://sync.example.test/nexg/events',
            location: 'Kilimani',
            events: ['Order status changed'],
            state: 'Active',
            signing: 'Verified',
            delivery: 'Failed',
            time: '1 Nov, 10:15 EAT',
          },
        ]
      : [],
    requests: sample
      ? [
          {
            id: 'DR-0142',
            type: 'Personal data access',
            period: '24 Oct 2026',
            format: 'CSV',
            status: 'Completed',
            createdAt: '24 Oct 2026',
          },
        ]
      : [],
    activity: sample
      ? [
          { id: 'signin', label: 'Successful sign-in', time: '1 Nov, 09:10 EAT' },
          { id: 'verified', label: 'Recovery destination verified', time: '30 Oct, 12:25 EAT' },
        ]
      : [],
  };
}
export function kenyaTime() {
  return (
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Nairobi',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date()) + ' EAT'
  );
}
