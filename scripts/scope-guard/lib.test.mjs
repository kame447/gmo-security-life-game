import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findFileConflicts,
  findOutOfScope,
  findScopeOverlaps,
  matches,
  parseScope,
  patternsOverlap,
} from './lib.mjs';

test('parseScope は scope ブロックの各行をパターンとして読む', () => {
  const body = '説明\n\n```scope\n# コメント\n- game/src/phone/\n./docs/features/phone.md  # 仕様\n\n```\n';
  assert.deepEqual(parseScope(body), ['game/src/phone/**', 'docs/features/phone.md']);
  assert.equal(parseScope('scope なし'), null);
  assert.equal(parseScope(null), null);
});

test('glob の * は区切りを越えず、** は越える', () => {
  assert.ok(matches('game/src/*.ts', 'game/src/main.ts'));
  assert.ok(!matches('game/src/*.ts', 'game/src/ui/hud.ts'));
  assert.ok(matches('game/src/**', 'game/src/ui/hud.ts'));
  assert.ok(matches('game/**/*.test.ts', 'game/tests/a.test.ts'));
  assert.ok(matches('game/**/*.test.ts', 'game/a.test.ts'));
  assert.ok(matches('docs/a.md', 'docs/a.md'));
  assert.ok(!matches('docs/a.md', 'docs/a+md'));
});

test('patternsOverlap は実ファイルと未作成ディレクトリの両方を判定する', () => {
  const files = ['game/src/phone/model.ts', 'game/src/ui/hud.ts'];
  assert.ok(patternsOverlap('game/src/**', 'game/src/phone/**', files));
  assert.ok(!patternsOverlap('game/src/phone/**', 'game/src/ui/**', files));
  assert.ok(patternsOverlap('game/src/new/**', 'game/src/new/sub/**', files));
  assert.ok(!patternsOverlap('game/src/new/**', 'game/src/other/**', files));
  assert.ok(patternsOverlap('game/src/ui/hud.ts', 'game/src/ui/**', files));
});

const phone = { kind: 'pr', number: 1, author: 'a', branch: 'feat/phone', scope: ['game/src/phone/**'], files: ['game/src/main.ts'] };
const shop = { kind: 'branch', branch: 'feat/shop', author: 'b', scope: null, files: ['game/src/shop/purchase.ts'] };
const shared = ['game/src/main.ts'];

test('findFileConflicts は宣言範囲・変更ファイルとの重なりを返し、共有ファイルを区別する', () => {
  const result = findFileConflicts(
    ['game/src/phone/new.ts', 'game/src/main.ts', 'game/src/shop/purchase.ts', 'infra/main.tf'],
    [phone, shop],
    shared,
  );
  assert.deepEqual(
    result.map((r) => [r.file, r.work.branch, r.severity]),
    [
      ['game/src/phone/new.ts', 'feat/phone', 'conflict'],
      ['game/src/main.ts', 'feat/phone', 'shared'],
      ['game/src/shop/purchase.ts', 'feat/shop', 'conflict'],
    ],
  );
});

test('findFileConflicts は自分の別の作業との重なりを self として区別する', () => {
  const result = findFileConflicts(['game/src/shop/purchase.ts'], [shop], shared, new Set(['b']));
  assert.deepEqual(result.map((r) => r.severity), ['self']);
});

test('findOutOfScope は宣言外のファイルだけを返す', () => {
  assert.deepEqual(findOutOfScope(['a/x.ts', 'b/y.ts'], ['a/**']), ['b/y.ts']);
  assert.deepEqual(findOutOfScope(['a/x.ts'], null), []);
});

test('findScopeOverlaps は共有ファイルだけの重なりを除く', () => {
  const tracked = ['game/src/main.ts', 'game/src/phone/model.ts', 'game/src/shop/purchase.ts'];
  assert.deepEqual(findScopeOverlaps(['game/src/main.ts'], [phone], shared, tracked), []);
  const overlaps = findScopeOverlaps(['game/src/**'], [phone, shop], shared, tracked);
  assert.deepEqual(
    overlaps.map((o) => `${o.work.branch}:${o.other}`),
    ['feat/phone:game/src/phone/**', 'feat/shop:game/src/shop/purchase.ts'],
  );
});
