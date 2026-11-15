/** Real save plans and filesystem transactions. All writes use disposable copies. */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile, chmod, stat } from 'node:fs/promises';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const filename = fileURLToPath(import.meta.url), sourceRoot = fileURLToPath(new URL('..', import.meta.url));
const writerURL = new URL('../scripts/world-editor-save.mjs', import.meta.url);
const HOME = 'home-family-interior', DIRECTORY = 'data/world/areas';

if (process.argv[2] === '--fault') {
  // A fresh process isolates fault injection from Vite and other node:test files.
  const [root, planFile, fault] = process.argv.slice(3);
  const plan = JSON.parse(await readFile(planFile, 'utf8'));
  const originalOpen = fs.promises.open, originalRename = fs.promises.rename;
  let stages = 0, renames = 0, bytesWritten = 0;
  fs.promises.open = async function (file, ...args) {
    const handle = await originalOpen.call(this, file, ...args);
    if (!String(file).endsWith('.tmp')) return handle;
    const number = ++stages;
    return {
      async writeFile(bytes) {
        await handle.writeFile(bytes); bytesWritten += Buffer.byteLength(bytes);
        if (fault === 'write-second' && number === 2) throw new Error('injected write after bytes');
      },
      async sync() {
        if (fault === 'sync-second' && number === 2) throw new Error('injected sync after bytes');
        return handle.sync();
      },
      close: () => handle.close(),
    };
  };
  fs.promises.rename = async function (from, to) {
    if (String(from).endsWith('.tmp')) {
      renames++;
      if (fault === `rename-${renames}`) throw new Error(`injected rename ${renames}`);
    }
    return originalRename.call(this, from, to);
  };
  syncBuiltinESMExports();
  const { commitLayouts } = await import(writerURL.href);
  await assert.rejects(commitLayouts(root, async () => plan), /injected/);
  console.log(JSON.stringify({ fault, stages, renames, bytesWritten }));
} else {
  let directory, template, plans;
  const { commitLayouts, applyLayout, previewLayout } = await import(writerURL.href);
  const areas = root => path.join(root, DIRECTORY);
  const jsonBytes = async root => Object.fromEntries(await Promise.all((await readdir(areas(root))).filter(n => n.endsWith('.json')).sort()
    .map(async name => [name, (await readFile(path.join(areas(root), name))).toString('base64')])));
  const clean = async (root, beforeBytes) => {
    assert.deepEqual(await jsonBytes(root), beforeBytes);
    assert.deepEqual((await readdir(areas(root))).sort(), Object.keys(beforeBytes).sort(), 'No newly created file, lock, stage or backup may remain');
  };
  async function copy(full = false) {
    const root = await mkdtemp(path.join(directory, 'case-'));
    if (full) {
      for (const name of ['src', 'data', 'package.json']) await cp(path.join(template, name), path.join(root, name), { recursive: true });
      await symlink(path.join(sourceRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    } else {
      await mkdir(path.join(root, 'data/world'), { recursive: true });
      await cp(areas(template), areas(root), { recursive: true });
    }
    return root;
  }
  async function modules(root, action) {
    const server = await createServer({ root, configFile: false, envFile: false, logLevel: 'silent', appType: 'custom',
      server: { middlewareMode: true, watch: null, hmr: false } });
    try {
      const world = await server.ssrLoadModule('/src/world/index.ts');
      const model = await server.ssrLoadModule('/src/world-editor/model.ts');
      const persistence = await server.ssrLoadModule('/src/world-editor/persistence.ts');
      const changes = await server.ssrLoadModule('/src/editor/changes.ts');
      const policy = await server.ssrLoadModule('/src/world-editor/world-policy.ts');
      return await action({ ...world, ...model, ...persistence, ...changes, ...policy });
    } finally { await server.close(); }
  }
  before(async () => {
    directory = await mkdtemp(path.join(process.env.SLG_U2_TEST_ROOT ?? tmpdir(), 'slg-u2-multi-'));
    template = path.join(directory, 'template'); await mkdir(template);
    for (const name of ['src', 'data', 'package.json']) await cp(path.join(sourceRoot, name), path.join(template, name), { recursive: true });
    await symlink(path.join(sourceRoot, 'node_modules'), path.join(template, 'node_modules'), 'dir');
    plans = await modules(template, ({ buildWorld, WorldEditorModel, withDerived, diffDocuments, prepareSave, AREA_EDIT_POLICIES }) => {
      const world = buildWorld(), model = new WorldEditorModel(world);
      const registry = { ...AREA_EDIT_POLICIES, 'town-main': () => {} };
      const plan = (home, shop) => {
        const after = model.document;
        if (home) after.objects.find(o => o.id === `${HOME}-plant-14-9`).x--;
        if (shop) {
          after.objects.find(o => o.facilityId === 'shop-konbini').x--;
          after.portals.find(p => p.id === 'konbini-enter').from.x--;
          after.portals.find(p => p.id === 'konbini-exit').to.x--;
        }
        const expected = withDerived(after, model.context), changes = diffDocuments(model.initial, expected, model.context);
        return { payload: { changes }, expected, prepared: prepareSave({ changes }, world, registry) };
      };
      return { two: plan(false, true), three: plan(true, true), home: plan(true, false) };
    });
    assert.deepEqual(plans.three.prepared.files.map(f => [f.areaId, f.created]), [[HOME, false], ['shop-konbini-interior', true], ['town-main', true]]);
  });
  after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

  describe('ワールド全体の複数ファイル保存', () => {
    for (const [name, count] of [['two', 2], ['three', 3]]) {
      it(`${count}ファイルを一度に保存し、新しいVite loaderで文書全文を再読込する`, async () => {
        const root = await copy(true), plan = plans[name];
        await chmod(path.join(areas(root), `${HOME}.json`), 0o640);
        const result = await commitLayouts(root, async () => plan.prepared);
        assert.equal(result.saved, true); assert.equal(result.targets.length, count);
        assert.equal((await stat(path.join(areas(root), `${HOME}.json`))).mode & 0o777, 0o640);
        for (const file of plan.prepared.files) assert.equal(await readFile(path.join(root, file.relativePath), 'utf8'), file.text);
        await modules(root, ({ buildWorld, WorldEditorModel, validateWorld }) => {
          const world = buildWorld(); assert.deepEqual(validateWorld(world), []);
          assert.deepEqual(new WorldEditorModel(world).document, plan.expected);
        });
        assert.equal((await readdir(areas(root))).filter(n => !n.endsWith('.json')).length, 0);
        await assert.rejects(applyLayout(root, plan.payload), /Source data changed/);
      });
    }
    it('公開保存APIでまちの2ファイルを保存し、新しいloaderで文書全文が一致する', async () => {
      const root = await copy(true), plan = plans.two;
      const result = await applyLayout(root, plan.payload);
      assert.equal(result.saved, true); assert.equal(result.targets.length, 2);
      for (const file of plan.prepared.files) assert.equal(await readFile(path.join(root, file.relativePath), 'utf8'), file.text);
      await modules(root, ({ buildWorld, WorldEditorModel, validateWorld }) => {
        const world = buildWorld(); assert.deepEqual(validateWorld(world), []);
        assert.deepEqual(new WorldEditorModel(world).document, plan.expected);
      });
    });
    it('公開保存APIは教室を含む屋内保存を受け入れ、不正なエリアと余計な欄を拒否し、自宅の旧hintに互換である', async () => {
      const root = await copy(true), beforeBytes = await jsonBytes(root);
      const classroomPayload = await modules(root, ({ buildWorld, WorldEditorModel, diffDocuments }) => {
        const model = new WorldEditorModel(buildWorld()), next = model.document;
        next.interactions.find(i => i.id === 'school-teacher').name += '変更';
        next.objects.push({ ...model.create('chair-wood', 'school-classroom-interior'), x: 4, y: 8 });
        return { expected: next, changes: diffDocuments(model.initial, next, model.context) };
      });
      const classroomResult = await applyLayout(root, { changes: classroomPayload.changes });
      assert.equal(classroomResult.saved, true);
      await modules(root, ({ buildWorld, WorldEditorModel, validateWorld }) => {
        const world = buildWorld(); assert.deepEqual(validateWorld(world), []);
        assert.deepEqual(new WorldEditorModel(world).document, classroomPayload.expected);
      });
      await clean(root, beforeBytes);
      const unknownArea = structuredClone(plans.home.payload);
      unknownArea.changes.operations.push({ type: 'add', table: 'objects', id: 'unknown-room-chair-1', after: { id: 'unknown-room-chair-1', areaId: 'unknown-room', kind: 'chair-wood', catalogId: 'chair-wood', facing: 'down', x: 1, y: 1, w: 1, h: 1, solid: true, layer: 'sorted' } });
      await assert.rejects(applyLayout(root, unknownArea), /エリア|存在|このエリア|参照/);
      await assert.rejects(applyLayout(root, { ...plans.home.payload, files: plans.three.prepared.files }), /欄/);
      await assert.rejects(applyLayout(root, { ...plans.home.payload, policies: { 'town-main': true } }), /欄/);
      await clean(root, beforeBytes);
      const payload = { areaId: HOME, ...plans.home.payload }, preview = await previewLayout(root, payload);
      assert.equal(preview.target, `${DIRECTORY}/${HOME}.json`);
      assert.deepEqual(preview.targets, [{ areaId: HOME, path: `${DIRECTORY}/${HOME}.json`, created: false }]);
      assert.equal((await applyLayout(root, payload)).saved, true);
      assert.equal(await readFile(path.join(areas(root), `${HOME}.json`), 'utf8'), plans.home.prepared.files[0].text);
    });
    for (const fault of ['write-second', 'sync-second', 'rename-2', 'rename-3']) {
      it(`${fault}: 既存1・新規2の一部まで進んでも、元の全bytesと不在状態を復元する`, async () => {
        const root = await copy(), beforeBytes = await jsonBytes(root), planFile = path.join(root, 'plan.json');
        await writeFile(planFile, JSON.stringify(plans.three.prepared));
        const result = spawnSync(process.execPath, [filename, '--fault', root, planFile, fault], { encoding: 'utf8', cwd: sourceRoot });
        assert.equal(result.status, 0, result.stdout + result.stderr);
        const trace = JSON.parse(result.stdout); assert.ok(trace.bytesWritten > 0);
        if (fault.startsWith('rename')) assert.equal(trace.renames, Number(fault.at(-1)));
        else assert.equal(trace.stages, 2);
        await clean(root, beforeBytes);
      });
    }
    it('最後の対象に他者lockがあれば、先に得たlockだけを解放し、書込みを始めない', async () => {
      const root = await copy(), beforeBytes = await jsonBytes(root), foreign = path.join(areas(root), 'town-main.json.lock');
      await writeFile(foreign, 'foreign-owner');
      await assert.rejects(commitLayouts(root, async () => plans.three.prepared), /EEXIST/);
      assert.equal(await readFile(foreign, 'utf8'), 'foreign-owner');
      assert.deepEqual(await jsonBytes(root), beforeBytes);
      assert.deepEqual((await readdir(areas(root))).sort(), [...Object.keys(beforeBytes), 'town-main.json.lock'].sort());
    });
    it('準備中に別の編集が入ったら上書きせず、その変更を保つ', async () => {
      const root = await copy(), home = path.join(areas(root), `${HOME}.json`), changed = `${await readFile(home, 'utf8')}\n`;
      await assert.rejects(commitLayouts(root, async () => {
        await writeFile(home, changed); return plans.three.prepared;
      }), /ほかの編集/);
      assert.equal(await readFile(home, 'utf8'), changed);
      assert.deepEqual((await readdir(areas(root))).sort(), [`${HOME}.json`]);
    });
    it('同じ基準の同時保存は1件だけ通り、別の保存のlockや新規ファイルを消さない', async () => {
      const root = await copy(); let count = 0, release;
      const gate = new Promise(resolve => { release = resolve; });
      const prepare = async () => { if (++count === 2) release(); await gate; return plans.three.prepared; };
      const results = await Promise.allSettled([commitLayouts(root, prepare), commitLayouts(root, prepare)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      for (const file of plans.three.prepared.files) assert.equal(await readFile(path.join(root, file.relativePath), 'utf8'), file.text);
      assert.equal((await readdir(areas(root))).filter(n => !n.endsWith('.json')).length, 0);
    });
    it('既存のlayout symlinkと配置directory symlinkを拒否し、外のsentinelは不変', async () => {
      for (const kind of ['file', 'directory']) {
        const root = await copy(), outside = await mkdtemp(path.join(directory, 'outside-'));
        const sentinel = path.join(outside, `${HOME}.json`), bytes = await readFile(path.join(areas(root), `${HOME}.json`));
        await writeFile(sentinel, bytes);
        if (kind === 'file') {
          await rm(path.join(areas(root), `${HOME}.json`)); await symlink(sentinel, path.join(areas(root), `${HOME}.json`));
        } else { await rm(areas(root), { recursive: true }); await symlink(outside, areas(root), 'dir'); }
        await assert.rejects(commitLayouts(root, async () => plans.three.prepared), /不正|シンボリックリンク/);
        assert.deepEqual(await readFile(sentinel), bytes);
        assert.deepEqual(await readdir(outside), [`${HOME}.json`]);
      }
    });
    it('trusted保存計画も固定パス・areaId・重複を検査し、部分保存は始めない', async () => {
      const root = await copy(), beforeBytes = await jsonBytes(root);
      for (const alter of [
        plan => { plan.files[1].relativePath = '../outside.json'; },
        plan => { plan.files[1].areaId = '../outside'; },
        plan => { plan.files[1].text = JSON.stringify({ areaId: 'other-area' }); },
        plan => { plan.files.push(plan.files[0]); },
      ]) {
        const plan = structuredClone(plans.three.prepared); alter(plan);
        await assert.rejects(commitLayouts(root, async () => plan), /保存先/);
        await clean(root, beforeBytes);
      }
    });
  });
}
