/** Storage/input safety limits for this prototype, not progression or scenario rules. */
export const CHAT_LIMITS = Object.freeze({
  contacts: 16,
  threads: 16,
  messagesPerThread: 40,
  pendingPerThread: 4,
  textCodePoints: 280,
  nameCodePoints: 32,
  replyDelayMs: 60_000,
  saveBytes: 256 * 1024,
});
