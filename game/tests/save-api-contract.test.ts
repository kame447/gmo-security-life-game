import { describe, expect, it } from 'vitest';
import { Game } from '../src/session/game';
import { parseSave } from '../src/state/save';
import { buildWorld } from '../src/world';
import { GameMigrations, importLegacy, jsonText, MAX_SAVE_BYTES, parseEnvelope, parseGameData,
  parseWriteRequest, SaveError, sameJson, slotId, type GameData } from '../src/save-api';

const now = '2026-11-13T20:30:00.000Z';
const legacy = { v: 1, variantId: 'childhood', areaId: 'town', x: 80, y: 120, facing: 'down' };
// DTO shapes read from inventory-wallet-save, clothing-contract, bag-hotbar-inventory,
// smartphone-foundation, phone-chat-model and shop-purchase; no branch imports.
export const extendedSave = {
  ...legacy, appearance: { silhouette: 'type-a', hairStyle: 'short', hairColor: 'black', outfit: 'shirt', outfitColor: 'blue' },
  assets: { moneyYen: 2480, items: [{ itemId: 'notebook', quantity: 2 }, { itemId: 'pencil', quantity: 3 }],
    layout: { v: 1, bag: [null, 'pencil', null], hotbar: [null, 'notebook', null], selectedHotbar: 1 } },
  phone: { v: 1, owned: false, dataBudget: { v: 1, remainingMb: 123.75, capacityMb: 5000,
    savedAtEpochMs: 1000, activeAtSave: true }, chat: { v: 1,
    contacts: [{ id: 'friend', name: '友だち', icon: 'F' }], threads: [{ id: 'friend-chat', contactId: 'friend',
      messages: [{ id: 'm1', from: 'self', text: 'こんにちは', atMs: 10, read: true }],
      pending: [{ id: 'r1', from: 'friend', text: 'またね', remainingMs: 1234 }], nextSequence: 2, replyCursor: 1 }] } },
  futureFeature: { nested: ['keep', null, { version: 8 }] },
};

describe('save-api envelope and legacy migration', () => {
  it('imports an actual main save without changing what the game restores', () => {
    const world = buildWorld(); const source = new Game(world).serialize();
    const envelope = importLegacy(JSON.stringify(source), 'manual-1', now);
    expect(envelope.revision).toBe(0);
    expect(envelope.data).toEqual(source);
    expect(parseSave(envelope.data, world)).toEqual(source);
  });
  it.each([legacy, { ...legacy, assets: { moneyYen: 1000, items: [] } },
    { ...legacy, phone: { v: 1, owned: false } }, extendedSave])('preserves a whole v1 DTO: %j', source => {
    const original = JSON.stringify(source);
    const envelope = importLegacy(original, 'auto', now);
    expect(envelope.data).toEqual(source);
    expect(parseEnvelope(JSON.parse(JSON.stringify(envelope)))).toEqual(envelope);
    expect(JSON.stringify(source)).toBe(original);
  });
  it('detaches input/output and preserves prototype-looking JSON keys', () => {
    const source = JSON.parse('{"v":1,"__proto__":{"safe":true},"constructor":"retained"}');
    const data = parseGameData(source); source.__proto__.safe = false;
    expect(JSON.stringify(data)).toBe('{"v":1,"__proto__":{"safe":true},"constructor":"retained"}');
    expect(({} as Record<string, unknown>).safe).toBeUndefined();
  });
  it.each(['auto', 'manual-1', 'a_b', 'x'.repeat(32)])('accepts proposed opaque slot ID %s', slot => expect(slotId(slot)).toBe(true));
  it.each(['', '../other', 'USER#bob', 'a/b', 'あ', 'A', 'x'.repeat(33), null])('rejects slot ID %s', slot => expect(slotId(slot)).toBe(false));
  it.each([
    { revision: -1 }, { revision: 1.5 }, { revision: Number.MAX_SAFE_INTEGER + 1 },
    { slotId: '../other' }, { updatedAt: 'yesterday' }, { updatedAt: '2026-02-30T00:00:00.000Z' }, { data: [] },
  ])('rejects damaged envelope metadata %j', patch => {
    expect(() => parseEnvelope({ ...importLegacy(JSON.stringify(legacy), 'auto', now), ...patch })).toThrow(SaveError);
  });
  it('checks an expected slot and enforces an UTF-8 envelope bound', () => {
    const envelope = importLegacy(JSON.stringify(legacy), 'auto', now);
    expect(() => parseEnvelope(envelope, 'another')).toThrow(SaveError);
    expect(() => parseEnvelope({ ...envelope, data: { v: 1, text: '界'.repeat(MAX_SAVE_BYTES / 2) } }))
      .toThrow(expect.objectContaining({ code: 'TOO_LARGE' }));
    expect(jsonText('x'.repeat(MAX_SAVE_BYTES - 2))).toHaveLength(MAX_SAVE_BYTES);
  });
  it.each(['x', '界'])('uses the same exact UTF-8 data bound inside requests and envelopes (%s)', unit => {
    const overhead = new TextEncoder().encode(JSON.stringify({ v: 1, text: '' })).length;
    const width = new TextEncoder().encode(unit).length;
    const available = MAX_SAVE_BYTES - overhead;
    const text = unit.repeat(Math.floor(available / width)) + 'x'.repeat(available % width);
    const data = { v: 1, text };
    expect(new TextEncoder().encode(JSON.stringify(data)).length).toBe(MAX_SAVE_BYTES);
    const request = { schemaVersion: 1, expectedRevision: Number.MAX_SAFE_INTEGER - 1,
      idempotencyKey: 'k'.repeat(128), data };
    const envelope = { schemaVersion: 1, slotId: 's'.repeat(32), revision: Number.MAX_SAFE_INTEGER,
      updatedAt: now, data };
    expect(parseWriteRequest(request).data).toEqual(data);
    expect(parseEnvelope(envelope).data).toEqual(data);
    const oversized = { v: 1, text: text + 'x' };
    for (const parse of [() => parseGameData(oversized), () => parseWriteRequest({ ...request, data: oversized }),
      () => parseEnvelope({ ...envelope, data: oversized })]) {
      expect(parse).toThrow(expect.objectContaining({ code: 'TOO_LARGE' }));
    }
  });
  it.each([undefined, { v: 1, bad: undefined }, { v: 1, bad: NaN }, { v: 1, bad: Infinity },
    { v: 1, bad: BigInt(1) }, { v: 1, bad: new Date() }, { v: 1, bad: () => 1 }])('rejects lossy non-JSON input %s', raw => {
    expect(() => parseGameData(raw)).toThrow(SaveError);
  });
  it('rejects cycles, sparse arrays, accessors and excess nesting', () => {
    const cycle: Record<string, unknown> = { v: 1 }; cycle.self = cycle;
    expect(() => parseGameData(cycle)).toThrow(SaveError);
    expect(() => parseGameData({ v: 1, array: Array(1) })).toThrow(SaveError);
    expect(() => parseGameData({ v: 1, array: Object.assign([1], { dropped: true }) })).toThrow(SaveError);
    const getter = Object.defineProperty({ v: 1 }, 'get', { enumerable: true, get: () => { throw Error('must not execute'); } });
    expect(() => parseGameData(getter)).toThrow(SaveError);
    let nested: unknown = null;
    for (let i = 0; i < 70; i++) nested = [nested];
    expect(() => parseGameData({ v: 1, nested })).toThrow(SaveError);
  });
  it('rejects malformed/unsupported legacy input without modifying original bytes', () => {
    for (const raw of ['{bad', '[]', '{"v":2,"future":"keep"}']) {
      const original = raw;
      expect(() => importLegacy(raw, 'auto', now)).toThrow(SaveError);
      expect(raw).toBe(original);
    }
    expect(() => parseEnvelope({ ...importLegacy(JSON.stringify(legacy), 'auto', now), schemaVersion: 2 }))
      .toThrow(expect.objectContaining({ code: 'UNSUPPORTED_VERSION' }));
  });
  it('registers sequential migrations explicitly and keeps unknown data', () => {
    const source = parseGameData(extendedSave);
    const migrations = new GameMigrations(3).register(1, data => ({ ...data, v: 2, stage2: true }))
      .register(2, data => ({ ...data, v: 3, stage3: true }));
    expect(migrations.migrate(source)).toEqual({ ...source, v: 3, stage2: true, stage3: true });
    expect(source.v).toBe(1);
    expect(() => migrations.migrate({ v: 4 })).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_VERSION' }));
    expect(() => new GameMigrations(2).migrate(source)).toThrow(SaveError);
    expect(() => migrations.register(1, data => data)).toThrow(SaveError);
    expect(() => new GameMigrations(2).register(1, data => data).migrate(source)).toThrow(SaveError);
  });
  it('requires a revision and bounded idempotency key but ignores an untrusted outer userId', () => {
    const request = { schemaVersion: 1, expectedRevision: 0, idempotencyKey: 'device-0001', data: legacy };
    expect(parseWriteRequest({ ...request, userId: 'someone-else' })).toEqual(request);
    expect(() => parseWriteRequest({ ...request, expectedRevision: undefined })).toThrow(SaveError);
    expect(() => parseWriteRequest({ ...request, idempotencyKey: '' })).toThrow(SaveError);
    const reordered: GameData = { ...legacy, v: 1 };
    expect(sameJson(reordered, Object.fromEntries(Object.entries(legacy).reverse()))).toBe(true);
  });
});
