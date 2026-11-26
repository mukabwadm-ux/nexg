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
