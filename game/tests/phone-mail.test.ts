import { describe, expect, it, vi } from 'vitest';
import { MAIL_PROTOTYPE } from '../src/data/mail-prototype';
import { PHONE_CONTENT } from '../src/phone/content';
import { MailModel } from '../src/phone/mail/model';
import { mailSaveBytes, parseMailSave } from '../src/phone/mail/codec';
import { MAIL_LIMITS } from '../src/phone/mail/limits';
import { PhoneModel, parsePhoneSave } from '../src/phone/model';

const make = () => new MailModel(MAIL_PROTOTYPE);
const incoming = (id = 'event-1', body = 'こんにちは') => ({ id, from: 'まちのひと', subject: 'おしらせ', body, atMs: 1000 });

describe('local mail model', () => {
  it('starts with the provisional welcome mail unread and the rest scheduled', () => {
    const mail = make();
    expect(mail.list().map(item => item.id)).toEqual(['welcome']);
    expect(mail.unreadCount).toBe(1);
    expect(mail.save().pending.map(item => item.id)).toEqual(['library-1', 'street-1']);
  });

  it('delivers scheduled mail only after active play time, newest first, and announces each arrival once', () => {
    const mail = make();
    const changed = vi.fn(), arrived = vi.fn();
    mail.onChange(changed); mail.onArrive(arrived);
    expect(mail.advance(0, 5000)).toBe(0);
    expect(mail.advance(29_999, 5000)).toBe(0);
    expect(changed).not.toHaveBeenCalled();
    expect(mail.advance(1, 6000)).toBe(1);
    expect(mail.list()[0]).toMatchObject({ id: 'library-1', from: 'まちの図書館', atMs: 6000, read: false });
    expect(arrived).toHaveBeenCalledTimes(1);
    expect(arrived.mock.calls[0][0]).toMatchObject({ id: 'library-1' });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(mail.advance(60_000, 7000)).toBe(1);
    expect(mail.list().map(item => item.id)).toEqual(['street-1', 'library-1', 'welcome']);
    expect(mail.advance(1_000_000, 8000)).toBe(0);
    expect(arrived).toHaveBeenCalledTimes(2);
  });

  it('saves pending delays as of the last arrival, so saves stay identical while the countdown runs', () => {
    const first = make(); first.advance(20_000, 1000);
    expect(first.save()).toEqual(make().save());
    const restarted = new MailModel(MAIL_PROTOTYPE, JSON.parse(JSON.stringify(first.save())));
    expect(restarted.advance(29_999, 9_000_000)).toBe(0);
    first.advance(10_000, 2000);
    expect(first.save().pending).toEqual([expect.objectContaining({ id: 'street-1', remainingMs: 60_000 })]);
    const restored = new MailModel(MAIL_PROTOTYPE, JSON.parse(JSON.stringify(first.save())));
    expect(restored.advance(0, 9_000_000)).toBe(0);
    expect(restored.advance(59_999, 9_000_000)).toBe(0);
    expect(restored.advance(1, 9_000_001)).toBe(1);
  });

  it('accepts event mail, rejects duplicates and empty text, and marks read once', () => {
    const mail = make();
    expect(mail.deliver(incoming())).toMatchObject({ ok: true, mail: { id: 'event-1', read: false } });
    expect(mail.unreadCount).toBe(2);
    expect(mail.deliver(incoming())).toEqual({ ok: false, reason: 'duplicate-id' });
    expect(mail.deliver(incoming('library-1'))).toEqual({ ok: false, reason: 'duplicate-id' });
    expect(mail.deliver(incoming('event-2', '   '))).toEqual({ ok: false, reason: 'empty-text' });
    expect(mail.deliver({ ...incoming('bad id'), id: 'bad id' })).toEqual({ ok: false, reason: 'invalid-mail' });
    expect(mail.markRead('event-1')).toBe(true);
    expect(mail.markRead('event-1')).toBe(false);
    expect(mail.unreadCount).toBe(1);
  });

  it('keeps markup and line breaks as literal text while stripping control characters', () => {
    const mail = make();
    mail.deliver(incoming('event-3', '<img src=x onerror=alert(1)>\r\n2行目\u0007です'));
    expect(mail.get('event-3')?.body).toBe('<img src=x onerror=alert(1)>\n2行目です');
  });

  it('repairs broken saves and bounds the number and size of mails', () => {
    expect(parseMailSave(null)).toEqual(parseMailSave(undefined));
    expect(parseMailSave({ v: 1, messages: [{ id: 'x', from: '', subject: '', body: 'a', atMs: 0 }], pending: [] }).messages).toEqual([]);
    const long = 'あ'.repeat(MAIL_LIMITS.bodyCodePoints + 50);
    const many = Array.from({ length: 300 }, (_, i) => ({ id: `m-${i}`, from: 'だれか', subject: '件名', body: long, atMs: i, read: false }));
    const save = parseMailSave({ v: 1, messages: many, pending: [] });
    expect(save.messages.length).toBeLessThanOrEqual(MAIL_LIMITS.messages);
    expect(save.messages.at(-1)?.id).toBe('m-299');
    expect([...save.messages[0].body].length).toBe(MAIL_LIMITS.bodyCodePoints);
    expect(mailSaveBytes(save)).toBeLessThanOrEqual(MAIL_LIMITS.saveBytes);
  });
});

describe('mail in the phone', () => {
  const outdoors = { areaId: 'town', areaKind: 'outdoor' as const, paused: false, visible: true };

  it('opens the inbox and a mail, marks it read, and returns to the inbox with back', () => {
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true });
    expect(phone.mailUnreadCount).toBe(1);
    expect(phone.openMail('welcome')).toBe(false);
    phone.open();
    expect(phone.launch('mail')).toBe(true);
    expect(phone.openMail('missing')).toBe(false);
    expect(phone.openMail('welcome')).toBe(true);
    expect(phone.currentMail).toMatchObject({ id: 'welcome', read: true });
    expect(phone.mailUnreadCount).toBe(0);
    phone.back();
    expect(phone.currentMail).toBeNull();
    expect(phone.currentApp?.id).toBe('mail');
    phone.back();
    expect(phone.currentApp).toBeNull();
  });

  it('receives scheduled mail with the play clock even while closed, and stops while paused or hidden', () => {
    let now = 0;
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true, environment: outdoors, clock: () => now, epochClock: () => 1_700_000_000_000 });
    const arrived = vi.fn(); phone.onMailArrive(arrived);
    phone.setPaused(true); now = 60_000; phone.tick();
    phone.setVisible(false); phone.setPaused(false); now = 120_000; phone.tick();
    expect(arrived).not.toHaveBeenCalled();
    phone.setVisible(true); now = 150_000; phone.tick();
    expect(arrived).toHaveBeenCalledTimes(1);
    expect(phone.mails[0]).toMatchObject({ id: 'library-1', atMs: 1_700_000_000_000 });
  });

  it('saves the inbox only after it changes and restores unread state; old saves still load', () => {
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true });
    expect(phone.save().mail).toBeUndefined();
    phone.deliverMail(incoming());
    const saved = JSON.parse(JSON.stringify(phone.save()));
    expect(saved.mail.messages.map((mail: { id: string }) => mail.id)).toEqual(['welcome', 'event-1']);
    const restored = new PhoneModel(PHONE_CONTENT, { initialOwned: true, saved });
    expect(restored.mailUnreadCount).toBe(2);
    expect(restored.mails[0].id).toBe('event-1');
    const legacy = parsePhoneSave({ v: 1, owned: true, dataBudget: saved.dataBudget }, true);
    expect(legacy.mail).toBeUndefined();
    expect(new PhoneModel(PHONE_CONTENT, { initialOwned: true, saved: legacy }).mails.map(mail => mail.id)).toEqual(['welcome']);
  });
});
