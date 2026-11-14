import { describe, expect, it, vi } from 'vitest';
import { LocalSaveSession } from '../src/app/local-save-session';
import { Game } from '../src/session/game';
import { buildWorld } from '../src/world';

const world = buildWorld();
const KEY = 'slg-map-save-v1';
const BACKUP = `${KEY}.previous`;
const fresh = () => new Game(world, { phoneClock: () => 0 }).serialize();

function setup(raw?: string, config = {}) {
  const values = new Map<string, string>(); if (raw !== undefined) values.set(KEY, raw);
  const state = { readDenied: false, failKey: '', error: new DOMException('quota', 'QuotaExceededError') };
  const storage = {
    getItem: vi.fn((key: string) => { if (state.readDenied) throw new DOMException('denied', 'SecurityError'); return values.get(key) ?? null; }),
    setItem: vi.fn((key: string, text: string) => { if (state.failKey === key || state.failKey === '*') throw state.error; values.set(key, text); }),
  };
  const options = { storage: () => storage, ...config };
  return { values, state, storage, options, session: new LocalSaveSession(world, options) };
}

describe('local save gameplay session', () => {
  it('manually saves and restores all existing state on a new session', () => {
    const s = setup(); const game = new Game(world);
    game.update(0.1, { dir: 'right', run: false });
    game.assets.apply({ moneyDeltaYen: -300, itemDeltas: [{ itemId: 'notebook', quantityDelta: 1 }] });
    game.setAppearance({ ...game.appearance, hairColor: 'black' });
    game.phone.setOwned(false);
    const data = game.serialize();
    expect(s.session.save(data, true)).toEqual({ ok: true });
    expect(s.session.notice).toEqual({ kind: 'saved' });
    const next = new LocalSaveSession(world, s.options);
    expect(new Game(world, { save: next.initialSave }).serialize()).toEqual(data);
  });

  it('gates every automatic save during confirmation and permits only explicit manual save', () => {
    const before = JSON.stringify(fresh()); const s = setup(before);
    s.session.pause(true);
    for (const _source of ['timer', 'pagehide', 'visibilitychange', 'area-enter', 'phone', 'appearance']) {
      expect(s.session.save({ ...fresh(), x: 0 })).toEqual({ ok: false, reason: 'paused' });
    }
    expect(s.values.get(KEY)).toBe(before); expect(s.storage.setItem).not.toHaveBeenCalled();
    expect(s.session.save(fresh(), true)).toEqual({ ok: true });
    s.session.pause(false); expect(s.session.save(fresh())).toEqual({ ok: true });
  });

  it('cancelling a menu changes no data and normal autosave continues afterwards', () => {
    const raw = JSON.stringify(fresh()); const s = setup(raw);
    s.session.pause(true); s.session.inspect(); s.session.pause(false);
    expect(s.values.get(KEY)).toBe(raw); expect(s.storage.setItem).not.toHaveBeenCalled();
    const next = { ...fresh(), assets: { moneyYen: 600, items: [] } };
    expect(s.session.save(next)).toEqual({ ok: true });
    expect(JSON.parse(s.values.get(KEY)!).assets.moneyYen).toBe(600);
  });

  it('does not report quota or denied storage as success, and retries the current state', () => {
    const raw = JSON.stringify(fresh()); const s = setup(raw); const notify = vi.fn(); s.session.onChange(notify);
    s.state.failKey = KEY;
    const next = { ...fresh(), assets: { moneyYen: 700, items: [] } };
    expect(s.session.save(next, true)).toEqual({ ok: false, reason: 'quota-exceeded' });
    expect(s.session.notice).toEqual({ kind: 'error', reason: 'quota-exceeded' });
    expect(s.values.get(KEY)).toBe(raw);
    s.state.failKey = ''; expect(s.session.save(next, true)).toEqual({ ok: true });
    expect(s.session.notice).toEqual({ kind: 'saved' }); expect(notify).toHaveBeenCalledTimes(2);
    s.state.readDenied = true;
    expect(s.session.save(next, true)).toEqual({ ok: false, reason: 'storage-unavailable' });
    expect(s.session.notice.kind).toBe('error');
  });

  it('explicit continue discards old pending state and blocks pagehide before reload', () => {
    const raw = JSON.stringify(fresh()); const s = setup(raw);
    s.state.failKey = KEY;
    expect(s.session.save({ ...fresh(), assets: { moneyYen: 2, items: [] } })).toEqual({ ok: false, reason: 'quota-exceeded' });
    s.state.failKey = '';
    expect(s.session.continue()).toEqual({ ok: true });
    expect(s.session.isSwitching).toBe(true);
    expect(s.session.save({ ...fresh(), assets: { moneyYen: 2, items: [] } })).toEqual({ ok: false, reason: 'paused' });
    expect(s.values.get(KEY)).toBe(raw);
    const next = new LocalSaveSession(world, s.options);
    expect(next.initialSave?.assets?.moneyYen).toBe(1000);
    expect(next.save(next.initialSave!)).toEqual({ ok: true });
    expect(JSON.parse(s.values.get(KEY)!).assets.moneyYen).toBe(1000);
  });

  it.each(['{broken', JSON.stringify({ ...fresh(), v: 2 }), JSON.stringify({ ...fresh(), variantId: 'future' })])
  ('preserves an unreadable startup value through opening, cancelling and every autosave: %s', raw => {
    const s = setup(raw); expect(s.session.initialSave).toBeUndefined();
    s.session.pause(true); s.session.inspect(); s.session.pause(false);
    expect(s.session.continue().ok).toBe(false);
    expect(s.session.save(fresh()).ok).toBe(false);
    expect(s.session.save(fresh(), true).ok).toBe(false);
    expect(s.values.get(KEY)).toBe(raw); expect(s.storage.setItem).not.toHaveBeenCalled();
  });

  it('allows memory play with denied startup storage without overwriting an unread old save', () => {
    const s = setup(JSON.stringify(fresh())); s.state.readDenied = true;
    const session = new LocalSaveSession(world, s.options);
    expect(session.initialSave).toBeUndefined(); expect(session.save(fresh()).ok).toBe(false);
    expect(session.notice).toEqual({ kind: 'error', reason: 'storage-unavailable' });
    expect(s.storage.setItem).not.toHaveBeenCalled();
  });

  it('can save current memory progress when denied startup storage recovers and is empty', () => {
    const s = setup(); s.state.readDenied = true;
    const session = new LocalSaveSession(world, s.options);
    const progress = { ...fresh(), assets: { moneyYen: 321, items: [] } };
    expect(session.save(progress, true).ok).toBe(false);
    s.state.readDenied = false; expect(session.inspect()).toBeUndefined();
    expect(session.save(progress, true)).toEqual({ ok: true });
    expect(JSON.parse(s.values.get(KEY)!).assets.moneyYen).toBe(321);
  });

  it('confirmed new game backs up exact bytes and starts with no old life/layout extensions', () => {
    const original = { ...fresh(), life: { v: 7, history: ['old'] }, assets: { moneyYen: 42, items: [], layout: { v: 8 } } };
    const raw = JSON.stringify(original, null, 2); const s = setup(raw);
    const data = fresh(); expect(s.session.startNew(data)).toEqual({ ok: true });
    expect(s.values.get(BACKUP)).toBe(raw); expect(JSON.parse(s.values.get(KEY)!)).toEqual(data);
    expect(s.session.save(new Game(world, { save: original }).serialize())).toEqual({ ok: false, reason: 'paused' });
    const next = new LocalSaveSession(world, s.options); expect(next.initialSave?.assets?.moneyYen).toBe(1000);
    expect(next.initialSave?.life).toEqual({ v: 1, stats: {}, flags: {}, history: [] });
  });

  it('can start anew from corrupt data only after it has been backed up', () => {
    const raw = '{broken'; const s = setup(raw);
    expect(s.session.startNew(fresh())).toEqual({ ok: true });
    expect(s.values.get(BACKUP)).toBe(raw); expect(JSON.parse(s.values.get(KEY)!)).toEqual(fresh());
    expect(s.storage.setItem.mock.calls.map(([key]) => key)).toEqual([BACKUP, KEY]);
  });

  it.each([BACKUP, KEY])('keeps the current game/save when new-game writing fails at %s', failKey => {
    const original = { ...fresh(), assets: { moneyYen: 77, items: [] } };
    const raw = JSON.stringify(original); const s = setup(raw);
    s.session.pause(true); s.state.failKey = failKey;
    expect(s.session.startNew(fresh()).ok).toBe(false); expect(s.session.isSwitching).toBe(false);
    expect(s.values.get(KEY)).toBe(raw);
    s.state.failKey = ''; s.session.pause(false);
    expect(s.session.save(original)).toEqual({ ok: true });
    expect(JSON.parse(s.values.get(KEY)!).assets.moneyYen).toBe(77);
  });

  it('updates the single previous-generation backup only on a confirmed new game', () => {
    const s = setup(JSON.stringify(fresh())); s.values.set(BACKUP, 'older backup');
    s.session.save(fresh()); expect(s.values.get(BACKUP)).toBe('older backup');
    const previous = s.values.get(KEY);
    expect(s.session.startNew(fresh()).ok).toBe(true);
    expect(s.values.get(BACKUP)).toBe(previous);
  });

  it('preserves the latest disk extensions during normal saves and supports a caller size bound', () => {
    const data = fresh(); const s = setup(JSON.stringify(data), { maxBytes: 1024 });
    const life = { v: 2, history: [1] }; s.values.set(KEY, JSON.stringify({ ...data, life }));
    expect(s.session.save(data)).toEqual({ ok: false, reason: 'protected-life' });
    expect(JSON.parse(s.values.get(KEY)!).life).toEqual(life);
    expect(s.session.save({ ...data, future: 'あ'.repeat(500) }, true)).toEqual({ ok: false, reason: 'too-large' });
  });

  it('review sessions never access storage or accept persistence/navigation operations', () => {
    const storage = vi.fn(() => { throw new Error('review must not access storage'); });
    const session = new LocalSaveSession(world, { storage, disabled: true });
    expect(session.initialSave).toBeUndefined(); expect(session.inspect()).toBeUndefined();
    expect(session.save(fresh()).ok).toBe(false); expect(session.startNew(fresh()).ok).toBe(false);
    expect(session.continue().ok).toBe(false); expect(storage).not.toHaveBeenCalled();
  });
});
