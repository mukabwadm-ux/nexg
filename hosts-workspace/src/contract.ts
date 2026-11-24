export interface SupportThread {
  id: string;
  subject: string;
  topic: string | null;
  status: string | null;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
}

export interface SupportMessage {
  id: string;
  body: string | null;
  author: string | null;
  mine: boolean;
  redacted: boolean;
  at: string | null;
}

export interface SupportInbox {
  threads: SupportThread[];
  topics: { value: string; label: string }[];
}

export interface SupportConversation {
  thread: SupportThread;
  messages: SupportMessage[];
  earlierBefore: number | null;
}

/* Chats between a stay's guest and the host: GET/POST /api/host-workspace/stay-messages. */
export type StaySide = 'guest' | 'host';

export interface StayThread {
  id: string;
  stayId: string;
  hostId: string;
  propertyId: string | null;
  unitId: string | null;
  propertyName: string | null;
  unitName: string | null;
  hostName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  stayStatus: string;
  canSend: boolean;
  lastMessageAt: string | null;
  lastMessage: { body: string | null; at: string; side: StaySide; mine: boolean } | null;
  unread: number;
}

export interface StayMessage {
  id: string;
  seq: number;
  body: string | null;
  redacted: boolean;
  at: string;
  side: StaySide;
  mine: boolean;
  author: string | null;
}

export interface StayConversation {
  thread: StayThread;
  messages: StayMessage[];
  earlierBefore: number | null;
}
