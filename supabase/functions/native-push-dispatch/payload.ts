export type App = 'consumer' | 'stays' | 'rider';
export type Subject =
  | 'order'
  | 'booking'
  | 'stay'
  | 'ticket'
  | 'job'
  | 'offer'
  | 'disposal'
  | 'payout'
  | 'account'
  | 'conversation';

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

// The words a lock screen may show. Never a code, an address, a price or a
// name: the app opens the record after a tap and shows the rest there.
const STAGES: Record<Subject, Record<string, StageCopy>> = {
  order: {
    confirmed: ['Your order is confirmed', 'Agizo lako limethibitishwa', 15, 1],
    preparing: ['Your order is being prepared', 'Agizo lako linatayarishwa', 30, 1],
    ready: ['Your order is ready', 'Agizo lako liko tayari', 45, 2],
    picked_up: [
      'Your rider has your order. Your delivery code is in NexG',
      'Msafirishaji amechukua agizo lako. Nambari yako ya kupokea iko NexG',
      65,
      3,
    ],
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
  booking: {
    payment_due: ['Pay to confirm your booking', 'Lipa ili kuthibitisha nafasi yako', 0, 0],
    quote: ['Your booking has a price', 'Nafasi yako imepewa bei', 0, 0],
    confirmed: ['Your booking is confirmed', 'Nafasi yako imethibitishwa', 100, 1],
    changed: ['Your booking time changed', 'Muda wa nafasi yako umebadilika', 100, 1],
    reminder: ['Your booking is in an hour', 'Nafasi yako ni baada ya saa moja', 100, 1],
    upcoming: ['Your booking is coming up', 'Nafasi yako inakaribia', 100, 1],
    cancelled: ['Your booking was cancelled', 'Nafasi yako imeghairiwa', 0, 2],
    completed: ['Thanks for visiting', 'Asante kwa kutembelea', 100, 2],
  },
  stay: {
    held: ['Pay to keep your stay', 'Lipa ili kuhifadhi malazi yako', 0, 1],
    booked: ['Your stay is confirmed', 'Malazi yako yamethibitishwa', 100, 2],
    changed: ['Your stay dates changed', 'Tarehe za malazi yako zimebadilika', 100, 2],
    check_in_soon: ['Your check-in details are ready', 'Maelezo ya kuingia yako tayari', 100, 2],
    checked_in: ['You’re checked in', 'Umeingia kwenye malazi yako', 100, 2],
    check_out_soon: ['Check-out is in a few hours', 'Kutoka ni baada ya saa chache', 100, 2],
    checked_out: ['Your checkout is complete', 'Umetoka kwenye malazi yako', 100, 2],
    cancelled: ['Your stay was cancelled', 'Malazi yako yameghairiwa', 0, 2],
    hold_expired: ['Your hold expired', 'Muda wa kuhifadhi nafasi umekwisha', 0, 2],
  },
  ticket: {
    reply: ['NexG support replied', 'Huduma ya NexG imejibu', 0, 0],
  },
  // A stay chat (20270314000700). Never the message text: the app loads it after a tap.
  conversation: {
    host_message: ['New message about your stay', 'Ujumbe mpya kuhusu malazi yako', 0, 0],
    guest_message: ['New message from a guest', 'Ujumbe mpya kutoka kwa mgeni', 0, 0],
    // A trip group (20270314001100).
    group_message: [
      'New message in your trip group',
      'Ujumbe mpya katika kundi lako la safari',
      0,
      0,
    ],
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
    expiring: ['Offer about to expire', 'Ombi linakaribia kuisha', 0, 0],
  },
  disposal: {
    disposal_approved: ['Disposal request approved', 'Ombi la kutupa limekubaliwa', 0, 0],
    disposal_rejected: ['Disposal request declined', 'Ombi la kutupa limekataliwa', 0, 0],
  },
  payout: {
    payout_approved: ['Payout request approved', 'Ombi la malipo limekubaliwa', 0, 0],
    payout_paid: ['Your payout was sent', 'Malipo yako yametumwa', 0, 0],
    payout_rejected: ['Payout request declined', 'Ombi la malipo limekataliwa', 0, 0],
  },
  account: {
    account_active: ['Your rider account is active', 'Akaunti yako ya usafirishaji iko hai', 0, 0],
    account_suspended: [
      'Your rider account is on hold',
      'Akaunti yako ya usafirishaji imesimamishwa',
      0,
      0,
    ],
    account_offboarded: [
      'Your rider account was closed',
      'Akaunti yako ya usafirishaji imefungwa',
      0,
      0,
    ],
  },
};

export const APP_IDS: Record<App, string> = {
  consumer: 'com.nexg.app',
  stays: 'com.nexg.stay',
  rider: 'com.nexg.rider',
};

// Android channels each app creates before it registers.
export const CHANNELS: Record<App, { alert: string; offer?: string }> = {
  consumer: { alert: 'nexg-service-updates' },
  stays: { alert: 'nexg-service-updates' },
  rider: { alert: 'delivery-updates', offer: 'rider.offers' },
};

export function copy(delivery: Delivery): Message {
  const row = STAGES[delivery.subject]?.[delivery.stage];
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
    // The Consumer app's NexgConsumerProgress props (LiveProgressCopy).
    return {
      name: 'NexgConsumerProgress',
      props: JSON.stringify({
        title: message.title,
        body: message.body,
        short: message.short,
        icon: delivery.subject === 'booking' ? 'calendar' : 'bag',
        stale,
        progress: message.progress,
      }),
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
  const urgent = delivery.subject === 'offer';
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
            ...(urgent ? { 'interruption-level': 'time-sensitive' } : {}),
          },
          nexg_d8: envelope(delivery, message),
        },
  };
}

export function fcmMessage(delivery: Delivery, now: number) {
  const message = copy(delivery);
  const live = delivery.surface === 'live';
  // Alerts and live updates for one record share a tag, so Android keeps one
  // notification per record and replaces it in place.
  const tag = `${delivery.subject}:${delivery.subject_id}`;
  const channels = CHANNELS[delivery.app];
  const offer = delivery.subject === 'offer';
  return {
    message: {
      token: delivery.token,
      data: { nexg_d8: JSON.stringify(envelope(delivery, message)) },
      android: {
        restricted_package_name: APP_IDS[delivery.app],
        priority: live || offer ? 'HIGH' : 'NORMAL',
        ttl: `${Math.max(0, Math.floor((Date.parse(delivery.expires_at) - now) / 1000))}s`,
        ...(live
          ? {}
          : {
              notification: {
                title: message.title,
                body: message.body,
                tag,
                channel_id: (offer && channels.offer) || channels.alert,
                visibility: 'PRIVATE',
              },
            }),
      },
    },
  };
}
