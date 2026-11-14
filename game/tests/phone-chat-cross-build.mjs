/** Read-only probe: actual frozen DTO-only Game builds, original vs current shared codec. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ownGame = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roots = process.argv.slice(2).map(path => resolve(path));
assert.equal(roots.length, 2, 'usage: node tests/phone-chat-cross-build.mjs <bag/game> <shop/game>');
const chat = { v: 1, contacts: [{ id: 'future-npc', name: '将来の相手', icon: 'person' }], threads: [{
  id: 'future-event', contactId: 'future-npc', nextSequence: 3, replyCursor: 1,
  messages: [{ id: 'event-1', from: 'future-npc', text: '<img src=x onerror=alert(1)>', atMs: 1000, read: false },
    { id: 'local-1', from: 'self', text: 'こんにちは', atMs: 1100, read: true }],
  pending: [{ id: 'local-2', from: 'future-npc', text: '返信', remainingMs: 250 }],
}] };

async function bundle(root, sharedCodec) {
  const result = await build({
    stdin: { contents: [
      `export { Game } from ${JSON.stringify(resolve(root, 'src/session/game.ts'))};`,
      `export { buildWorld } from ${JSON.stringify(resolve(root, 'src/world/index.ts'))};`,
      `export { loadSave, writeSave } from ${JSON.stringify(resolve(root, 'src/app/save-store.ts'))};`,
    ].join('\n'), resolveDir: root, loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'node', metafile: true,
    plugins: sharedCodec ? [{ name: 'stage-current-phone-codec-in-memory', setup(build) {
      build.onResolve({ filter: /save(?:\.ts)?$/ }, args => {
        const candidate = resolve(dirname(args.importer), args.path).replace(/\.ts$/, '');
        if (candidate === resolve(root, 'src/phone/save')) return { path: resolve(ownGame, 'src/phone/save.ts') };
      });
    } }] : [],
  });
  assert.ok(!Object.keys(result.metafile.inputs).some(path => /\/phone\/model\.ts$|\/ui\//.test(path)),
    'DTO-only builds must not need the phone model or UI');
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
try {
  for (const root of roots) {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
    for (const sharedCodec of [false, true]) {
      const { Game, buildWorld, loadSave, writeSave } = await bundle(root, sharedCodec);
      const world = buildWorld();
      const seed = { ...new Game(world).serialize(),
        assets: { moneyYen: 2480, items: [{ itemId: 'small-snack', quantity: 2 }] },
        phone: { v: 1, owned: false, dataBudget: { v: 1, remainingMb: 123, capacityMb: 5000 }, chat },
      };
      let stored;
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: () => stored,
        setItem: (_key, value) => { stored = value; },
      } });
      for (const patch of [{}, { x: -9999 }, { areaId: 'missing' }, { facing: 'invalid' }]) {
        stored = JSON.stringify({ ...seed, ...patch });
        const restored = new Game(world, { save: loadSave(world) });
        writeSave(restored.serialize());
        const actual = JSON.parse(stored);
        if (sharedCodec) assert.deepEqual(actual, seed, 'current codec preserves all fields and repairs position only');
        else {
          assert.equal(actual.phone.chat, undefined, 'document the frozen old codec dropping unknown chat');
          const { chat: _chat, ...legacyPhone } = seed.phone;
          assert.deepEqual(actual, { ...seed, phone: legacyPhone });
        }
      }
      if (sharedCodec) {
        stored = JSON.stringify(seed);
        const game = new Game(world, { save: loadSave(world) });
        assert.deepEqual(game.assets.apply({ moneyDeltaYen: -120,
          itemDeltas: [{ itemId: 'bottled-water', quantityDelta: 1 }] }), { ok: true });
        writeSave(game.serialize());
        const reloaded = new Game(world, { save: loadSave(world) });
        assert.equal(reloaded.assets.moneyYen, 2360);
        assert.deepEqual(reloaded.serialize().phone, seed.phone);
        reloaded.reset(); writeSave(reloaded.serialize());
        assert.deepEqual(JSON.parse(stored).phone, seed.phone);
        const exported = reloaded.serialize(); exported.phone.chat.threads[0].messages.length = 0;
        assert.deepEqual(reloaded.serialize().phone.chat, chat, 'retained DTO is detached from returned saves');
      }
      console.log(`PASS ${root} @${head}: ${sharedCodec ? 'current codec preserves chat (position/assets/reset/storage)' : 'frozen old codec drops chat (expected baseline)'}`);
    }
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }), status,
      'the probe must not edit the frozen checkout');
  }
} finally {
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
}
