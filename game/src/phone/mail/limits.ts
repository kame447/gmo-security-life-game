/** Storage/input safety limits for this prototype, not progression or scenario rules. */
export const MAIL_LIMITS = Object.freeze({
  messages: 50,
  pending: 8,
  fromCodePoints: 32,
  addressCodePoints: 64,
  toCodePoints: 32,
  subjectCodePoints: 40,
  bodyCodePoints: 1000,
  links: 4,
  linkLabelCodePoints: 40,
  hrefCodePoints: 200,
  delayMs: 10 * 60_000,
  saveBytes: 128 * 1024,
});
