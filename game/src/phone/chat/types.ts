/** Local conversation DTOs. Display timestamps are supplied by the caller. */
export const CHAT_SELF = 'self' as const;

export interface Contact { id: string; name: string; icon: string }
export interface ChatMessage {
  id: string;
  /** CHAT_SELF for an outgoing message, otherwise the thread's contact ID. */
  from: string;
  text: string;
  atMs: number;
  read: boolean;
}
export interface PendingReply {
  id: string;
  from: string;
  text: string;
  /** Remaining active play time. Never an epoch deadline or offline timer. */
  remainingMs: number;
}
export interface ChatThreadSave {
  id: string;
  contactId: string;
  messages: ChatMessage[];
  pending: PendingReply[];
  nextSequence: number;
  replyCursor: number;
}
/** Self-contained metadata lets builds without the phone UI preserve valid threads. */
export interface ChatSave { v: 1; contacts: Contact[]; threads: ChatThreadSave[] }
export interface ChatReply { text: string; delayMs: number }
export interface ChatThreadContent {
  id: string;
  contactId: string;
  initialMessages: ChatMessage[];
  /** Ordered fixed replies, one consumed per send. No text generation or matching. */
  replies: ChatReply[];
}
export interface ChatContent { contacts: Contact[]; threads: ChatThreadContent[] }
export interface ChatThreadSummary {
  id: string;
  contact: Contact;
  lastMessage: ChatMessage | null;
  unreadCount: number;
}
export type ChatFailure = 'unknown-thread' | 'empty-text' | 'invalid-message' |
  'duplicate-id' | 'queue-full' | 'id-exhausted';
export type ChatResult = { ok: true; message: ChatMessage } | { ok: false; reason: ChatFailure };
export interface IncomingMessage { id: string; from: string; text: string; atMs: number }

export interface ChatApi {
  listThreads(): ChatThreadSummary[];
  messages(threadId: string): ChatMessage[];
  /** Appends immediately; the caller guards networkAllowed before calling. */
  sendMessage(threadId: string, text: string, atMs: number): ChatResult;
  /** Event/NPC entry point. Duplicate IDs within retained history are rejected. */
  deliverMessage(threadId: string, message: IncomingMessage): ChatResult;
  /** Deliver pending replies after active play time; call with 0 while paused/hidden. */
  advance(elapsedPlayingMs: number, atMs: number): number;
  markRead(threadId: string): number;
  save(): ChatSave;
  /** Emitted after send/delivery/read, not on every countdown decrement. */
  onChange(listener: () => void): () => void;
}
