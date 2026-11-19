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
    // Delivery is only when it is due *and* deliverDue runs; reaching the time alone delivers nothing.
    const step = (elapsed: number, atMs: number) => { mail.advance(elapsed); return mail.deliverDue(atMs); };
    expect(step(0, 5000)).toBe(0);
    expect(step(29_999, 5000)).toBe(0);
    expect(changed).not.toHaveBeenCalled();
    mail.advance(1);
    expect(mail.list().map(item => item.id)).toEqual(['welcome']);
    expect(mail.deliverDue(6000)).toBe(1);
    expect(mail.list()[0]).toMatchObject({ id: 'library-1', from: 'まちの図書館', atMs: 6000, read: false });
    expect(arrived).toHaveBeenCalledTimes(1);
    expect(arrived.mock.calls[0][0]).toMatchObject({ id: 'library-1' });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(step(60_000, 7000)).toBe(1);
    expect(mail.list().map(item => item.id)).toEqual(['street-1', 'library-1', 'welcome']);
    expect(step(1_000_000, 8000)).toBe(0);
    expect(arrived).toHaveBeenCalledTimes(2);
  });

  it('saves pending delays as of the last arrival, so saves stay identical while the countdown runs', () => {
    const step = (model: MailModel, elapsed: number, atMs: number) => { model.advance(elapsed); return model.deliverDue(atMs); };
    const first = make(); first.advance(20_000);
    expect(first.save()).toEqual(make().save());
    const restarted = new MailModel(MAIL_PROTOTYPE, JSON.parse(JSON.stringify(first.save())));
    expect(step(restarted, 29_999, 9_000_000)).toBe(0);
    // Due but not yet delivered: the save still matches the fresh state.
    first.advance(10_000);
    expect(first.save()).toEqual(make().save());
    expect(first.deliverDue(2000)).toBe(1);
    expect(first.save().pending).toEqual([expect.objectContaining({ id: 'street-1', remainingMs: 60_000 })]);
    const restored = new MailModel(MAIL_PROTOTYPE, JSON.parse(JSON.stringify(first.save())));
    expect(step(restored, 0, 9_000_000)).toBe(0);
    expect(step(restored, 59_999, 9_000_000)).toBe(0);
    expect(step(restored, 1, 9_000_001)).toBe(1);
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

  it('keeps the display name, address, recipient and link destinations as separate data', () => {
    const mail = make();
    const result = mail.deliver({ ...incoming('event-4'), from: '配送サービス', fromAddress: 'notice@parcel-check.example', to: '自分',
      links: [{ label: 'お届け先を確認する', href: 'https://parcel-check.example/confirm?id=1' }] });
    expect(result).toMatchObject({ ok: true, mail: { from: '配送サービス', fromAddress: 'notice@parcel-check.example', to: '自分',
      links: [{ label: 'お届け先を確認する', href: 'https://parcel-check.example/confirm?id=1' }] } });
    const restored = new MailModel(MAIL_PROTOTYPE, JSON.parse(JSON.stringify(mail.save())));
    expect(restored.get('event-4')).toEqual(mail.get('event-4'));
  });

  it('drops addresses and links outside reserved fictitious names instead of storing real ones', () => {
    const mail = make();
    mail.deliver({ ...incoming('event-5'), fromAddress: 'someone@gmail.com', links: [
      { label: '本物のサイト', href: 'https://www.google.com/' },
      { label: 'スクリプト', href: 'javascript:alert(1)' },
      { label: '', href: 'https://ok.example/' },
      { label: '架空のサイト', href: 'http://shop.test/sale' },
    ] });
    expect(mail.get('event-5')).toMatchObject({ fromAddress: '', links: [{ label: '架空のサイト', href: 'http://shop.test/sale' }] });
  });

  it('loads mail saved before addresses existed with empty address, recipient and links', () => {
    const save = parseMailSave({ v: 1, messages: [{ id: 'old', from: 'だれか', subject: '件名', body: '本文', atMs: 1, read: true }],
      pending: [{ id: 'later', from: 'だれか', subject: '件名', body: '本文', remainingMs: 5 }] });
    expect(save.messages[0]).toEqual({ id: 'old', from: 'だれか', fromAddress: '', to: '', subject: '件名', body: '本文', links: [], atMs: 1, read: true });
    expect(save.pending[0]).toMatchObject({ id: 'later', fromAddress: '', links: [] });
  });

  it('gives every provisional mail a fictitious sender address', () => {
    const mail = make(); mail.advance(1_000_000); mail.deliverDue(1);
    for (const item of mail.list()) expect(item.fromAddress).toMatch(/@[a-z0-9.-]+\.example$/);
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
    phone.setVisible(false); phone.setPaused(false); now = 120_000; phone.tick({ areaId: 'home' });
    expect(arrived).not.toHaveBeenCalled();
    phone.setVisible(true); now = 150_000; phone.tick();
    expect(arrived).not.toHaveBeenCalled();
    phone.tick({ areaId: 'town' });
    expect(arrived).toHaveBeenCalledTimes(1);
    expect(phone.mails[0]).toMatchObject({ id: 'library-1', atMs: 1_700_000_000_000 });
  });

  it('delivers due mail only on an area change or when the phone opens, never in a frame or a save', () => {
    let now = 0;
    const phone = new PhoneModel(PHONE_CONTENT, { initialOwned: true, environment: outdoors, clock: () => now, epochClock: () => 1_700_000_000_000 });
    const arrived = vi.fn(); phone.onMailArrive(arrived);
    now = 30_000; phone.tick(); phone.tick({ areaId: 'town' });
    const saved = JSON.stringify(phone.save());
    now = 31_000; phone.tick();
    expect(JSON.stringify(phone.save())).toBe(saved);
    expect(arrived).not.toHaveBeenCalled();
    expect(phone.open()).toBe(true);
    expect(arrived).toHaveBeenCalledTimes(1);
    expect(phone.mailUnreadCount).toBe(2);
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
