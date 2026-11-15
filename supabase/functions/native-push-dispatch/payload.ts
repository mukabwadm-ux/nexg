export type App = 'consumer' | 'stays' | 'rider';
export type Subject = 'order' | 'stay' | 'job' | 'offer';

export interface Delivery {
  id: string;
  lease: string;
  installation_id: string;
  binding: number;
  app: App;
  platform: 'ios' | 'android';
  environment: 'sandbox' | 'production';
  token: string;
  locale: 'en' | 'sw';
  surface: 'alert' | 'live';
  watch_id: string | null;
  subject: Subject;
  subject_id: string;
  stage: string;
  terminal: boolean;
  deadline: string | null;
  occurred_at: string;
  expires_at: string;
}

type Message = {
  title: string;
  body: string;
  short: string;
  step: number;
  progress: number;
};

type StageCopy = readonly [english: string, swahili: string, progress: number, step: number];

const STAGES: Record<Subject, Record<string, StageCopy>> = {
  order: {
    confirmed: ['Your order is confirmed', 'Agizo lako limethibitishwa', 15, 1],
    preparing: ['Your order is being prepared', 'Agizo lako linatayarishwa', 30, 1],
    ready: ['Your order is ready', 'Agizo lako liko tayari', 45, 2],
    picked_up: ['Your rider has your order', 'Msafirishaji amechukua agizo lako', 65, 3],
    arriving: ['Your rider is nearly there', 'Msafirishaji wako anakaribia', 85, 4],
    delivered: ['Your order was delivered', 'Agizo lako limewasilishwa', 100, 5],
    cancelled: ['Your order was cancelled', 'Agizo lako limeghairiwa', 0, 5],
    disputed: ['There’s an update about your order', 'Kuna taarifa mpya kuhusu agizo lako', 0, 5],
    refunded: [
      'There’s an update about your refund',
      'Kuna taarifa mpya kuhusu marejesho yako',
      0,
      5,
    ],
  },
  stay: {
    held: ['Your checkout hold is active', 'Nafasi yako bado imehifadhiwa', 0, 1],
    booked: ['Your stay is confirmed', 'Malazi yako yamethibitishwa', 100, 2],
    checked_in: ['You’re checked in', 'Umeingia kwenye malazi yako', 100, 2],
    checked_out: ['Your checkout is complete', 'Umetoka kwenye malazi yako', 100, 2],
    cancelled: ['Your stay was cancelled', 'Malazi yako yameghairiwa', 0, 2],
    hold_expired: ['Your checkout hold expired', 'Muda wa kuhifadhi nafasi umekwisha', 0, 2],
  },
  job: {
    assigned: ['Delivery assigned', 'Umepewa kazi ya usafirishaji', 15, 1],
    ready: ['Order ready for pickup', 'Agizo liko tayari kuchukuliwa', 40, 2],
    picked_up: ['Order picked up', 'Agizo limechukuliwa', 60, 3],
    arriving: ['Approaching drop-off', 'Unakaribia kufikisha agizo', 85, 4],
    delivered: ['Order delivered', 'Agizo limewasilishwa', 100, 5],
    completed: ['Delivery complete', 'Kazi ya usafirishaji imekamilika', 100, 5],
    cancelled: ['Delivery cancelled', 'Kazi ya usafirishaji imeghairiwa', 0, 5],
    reassigned: ['Delivery reassigned', 'Kazi imepewa msafirishaji mwingine', 0, 5],
  },
  offer: {
    offered: ['New delivery offer', 'Ombi jipya la usafirishaji', 0, 0],
  },
};

export const APP_IDS: Record<App, string> = {
  consumer: 'com.nexg.app',
  stays: 'com.nexg.stay',
  rider: 'com.nexg.rider',
};

export function copy(delivery: Delivery): Message {
  const row = STAGES[delivery.subject][delivery.stage];
  if (!row) throw new Error('Unsupported native push stage');
  return {
    title: row[delivery.locale === 'sw' ? 1 : 0],
    body: delivery.locale === 'sw' ? 'Fungua NexG kuona maelezo.' : 'Open NexG for details.',
    short: row[3] ? String(row[3]) : '',
    step: row[3],
    progress: row[2],
  };
}

function envelope(delivery: Delivery, message: Message) {
  return {
    version: 1,
    eventId: delivery.id,
    installationId: delivery.installation_id,
    binding: delivery.binding,
    app: delivery.app,
    surface: delivery.surface,
    subject: delivery.subject,
    subjectId: delivery.subject_id,
    watchId: delivery.watch_id,
    stage: delivery.stage,
    terminal: delivery.terminal,
    expiresAt: delivery.expires_at,
    deadline: delivery.deadline,
    title: message.title,
    body: message.body,
    progress: message.progress,
  };
}

function widgetContent(delivery: Delivery, message: Message) {
  const stale =
    delivery.locale === 'sw' ? 'Fungua NexG kupata taarifa mpya.' : 'Open NexG to refresh.';
  if (delivery.app === 'consumer') {
    return {
      name: 'NexgConsumerProgress',
      props: JSON.stringify({ ...message, icon: 'bag.fill', stale }),
    };
  }
  if (delivery.app === 'stays') {
    const occurredAt = Date.parse(delivery.occurred_at);
    const endsAt = delivery.deadline ? Date.parse(delivery.deadline) : occurredAt + 1;
    return {
      name: 'NexgStaysTracking',
      props: JSON.stringify({
        title: message.title,
        body: message.body,
        icon: 'clock',
        stale,
        startedAt: Math.min(occurredAt, endsAt - 1),
        endsAt,
      }),
    };
  }
  return {
    name: 'RiderJobActivity',
    props: JSON.stringify({
      ...message,
      active: delivery.locale === 'sw' ? 'Kazi ya usafirishaji' : 'Active delivery',
      next: message.body,
      stale,
    }),
  };
}

export function apnsMessage(delivery: Delivery, now: number) {
  const message = copy(delivery);
  const live = delivery.surface === 'live';
  const topic = APP_IDS[delivery.app] + (live ? '.push-type.liveactivity' : '');
  const expiry = Math.floor(Date.parse(delivery.expires_at) / 1000);
  const timestamp = Math.floor(now / 1000);
  const deadline = delivery.deadline ? Math.floor(Date.parse(delivery.deadline) / 1000) : expiry;
  const collapse = `${delivery.subject}:${delivery.subject_id}:${delivery.surface}`;
  return {
    headers: {
      'apns-topic': topic,
      'apns-push-type': live ? 'liveactivity' : 'alert',
      'apns-priority': live && !delivery.terminal ? '5' : '10',
      'apns-expiration': String(expiry),
      'apns-collapse-id': collapse,
    },
    body: live
      ? {
          aps: {
            timestamp,
            event: delivery.terminal ? 'end' : 'update',
            'content-state': widgetContent(delivery, message),
            ...(delivery.terminal
              ? { 'dismissal-date': timestamp }
              : { 'stale-date': Math.min(expiry, deadline) }),
          },
        }
      : {
          aps: {
            alert: { title: message.title, body: message.body },
            sound: 'default',
            'thread-id': collapse,
          },
          nexg_d8: envelope(delivery, message),
        },
  };
}

export function fcmMessage(delivery: Delivery, now: number) {
  const message = copy(delivery);
  const live = delivery.surface === 'live';
  const tag = `${delivery.subject}:${delivery.subject_id}`;
  return {
    message: {
      token: delivery.token,
      data: { nexg_d8: JSON.stringify(envelope(delivery, message)) },
      android: {
        restricted_package_name: APP_IDS[delivery.app],
        priority: live || delivery.subject === 'offer' ? 'HIGH' : 'NORMAL',
        ttl: `${Math.max(0, Math.floor((Date.parse(delivery.expires_at) - now) / 1000))}s`,
        ...(live
          ? {}
          : {
              notification: {
                title: message.title,
                body: message.body,
                tag,
                channel_id: delivery.app === 'rider' ? 'delivery-updates' : 'nexg-service-updates',
                visibility: 'PRIVATE',
              },
            }),
      },
    },
  };
}
