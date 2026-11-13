import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'scope-guard-remote-'));
  const remote = path.join(dir, 'remote.git'), seed = path.join(dir, 'seed'), bin = path.join(dir, 'bin');
  git(dir, 'init', '--bare', remote);
  git(dir, 'init', '--initial-branch=main', seed);
  git(seed, 'config', 'user.name', 'other');
  git(seed, 'config', 'user.email', 'other@example.invalid');
  mkdirSync(path.join(seed, '.github'));
  writeFileSync(path.join(seed, '.github', 'scope-guard.json'), JSON.stringify({ mode: 'warn', baseBranch: 'main', shared: [] }));
  writeFileSync(path.join(seed, 'base.txt'), 'base\n');
  git(seed, 'add', '.'); git(seed, 'commit', '-m', 'base');
  git(seed, 'remote', 'add', 'origin', remote); git(seed, 'push', 'origin', 'main');
  git(dir, '--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(seed, 'switch', '-c', 'feat/other');
  writeFileSync(path.join(seed, 'feature.txt'), 'other work\n');
  git(seed, 'add', 'feature.txt'); git(seed, 'commit', '-m', 'other work'); git(seed, 'push', 'origin', 'feat/other');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\nif [ -n "$SCOPE_TEST_TRACE" ]; then printf "%s:%s\\n" "$1" "$2" >> "$SCOPE_TEST_TRACE"; fi\ncase "$1:$2" in\n  pr:list) printf "%s\\n" "${SCOPE_TEST_PR_LIST:-[]}" ;;\n  api:user) printf "reviewer\\n" ;;\n  api:--paginate) printf "%s\\n" "${SCOPE_TEST_PR_FILES:-}" ;;\n  api:repos/*) test -n "$SCOPE_TEST_PR_AFTER" || exit 2; printf "%s\\n" "$SCOPE_TEST_PR_AFTER" ;;\n  *) exit 2 ;;\nesac\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GIT_TERMINAL_PROMPT: '0' };
  function clone(name, single) {
    const dirPath = path.join(dir, name);
    git(dir, 'clone', ...(single ? ['--single-branch', '--branch', 'main'] : []), `file://${remote}`, dirPath);
    git(dirPath, 'config', 'user.name', 'reviewer');
    git(dirPath, 'config', 'user.email', 'reviewer@example.invalid');
    return dirPath;
  }
  return { dir, remote, seed, env, clone };
}

function snapshot(cwd) {
  const fetchHead = path.join(cwd, '.git', 'FETCH_HEAD');
  return {
    remoteRefs: git(cwd, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/remotes/origin'),
    localRefs: git(cwd, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads'),
    fetchSpec: git(cwd, 'config', '--get-all', 'remote.origin.fetch'),
    fetchHead: existsSync(fetchHead) ? readFileSync(fetchHead, 'utf8') : null,
  };
}

function invoke(cwd, env, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: 'utf8' });
}

function invokeAsync(cwd, env, ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, env });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

test('status/check find all remote branches without changing either clone’s tracking refs', () => {
  const f = fixture();
  try {
    const narrow = f.clone('narrow', true), full = f.clone('full', false);
    assert.match(snapshot(narrow).fetchSpec, /^\+refs\/heads\/main:/);
    assert.match(snapshot(full).fetchSpec, /^\+refs\/heads\/\*:/);
    const results = [];
    for (const cwd of [narrow, full]) {
      const before = snapshot(cwd);
      const status = invoke(cwd, f.env, 'status');
      const check = invoke(cwd, f.env, 'check', 'feature.txt');
      assert.equal(status.status, 0, status.stderr);
      assert.equal(check.status, 1, check.stderr);
      assert.match(status.stdout, /ブランチ feat\/other \(other, PR なし\)/);
      assert.match(check.stdout, /\[重複\] feature\.txt/);
      assert.deepEqual(snapshot(cwd), before, 'tracking refs, local refs, fetch refspec and FETCH_HEAD remain unchanged');
      assert.equal(git(cwd, 'for-each-ref', '--format=%(refname)', 'refs/scope-guard'), '', 'temporary refs are removed');
      results.push({ status: status.stdout, check: check.stdout });
    }
    assert.deepEqual(results[0], results[1]);

    const eventPath = path.join(f.dir, 'event.json');
    writeFileSync(eventPath, JSON.stringify({ pull_request: {
      number: 1, body: null, created_at: '2026-01-01T00:00:00Z', head: { ref: 'feat/example' }, user: { login: 'reviewer' },
    } }));
    const ci = invoke(narrow, { ...f.env, GITHUB_EVENT_PATH: eventPath }, 'ci');
    assert.equal(ci.status, 0, ci.stderr);
    assert.match(ci.stdout, /モード: warn/);
    assert.match(ci.stdout, /::warning::/);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('a fetch failure preserves the existing warning-mode fallback and cleans temporary refs', () => {
  const f = fixture();
  try {
    const cwd = f.clone('offline', false);
    git(cwd, 'remote', 'set-url', 'origin', path.join(f.dir, 'missing.git'));
    const before = snapshot(cwd), result = invoke(cwd, f.env, 'status');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /git fetch に失敗/);
    assert.match(result.stdout, /不確定（追跡 ref に基づく）/);
    assert.deepEqual(snapshot(cwd), before);
    assert.equal(git(cwd, 'for-each-ref', '--format=%(refname)', 'refs/scope-guard'), '');
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('simultaneous checks use separate temporary refs and leave no tracking changes', async () => {
  const f = fixture();
  try {
    const cwd = f.clone('concurrent', true), before = snapshot(cwd);
    const results = await Promise.all([invokeAsync(cwd, f.env, 'status'), invokeAsync(cwd, f.env, 'status')]);
    for (const result of results) {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /ブランチ feat\/other \(other, PR なし\)/);
    }
    assert.equal(results[0].stdout, results[1].stdout);
    assert.deepEqual(snapshot(cwd), before);
    assert.equal(git(cwd, 'for-each-ref', '--format=%(refname)', 'refs/scope-guard'), '');
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('snapshots are opt-in, outside the repository, and compare successive fixed heads', () => {
  const f = fixture();
  try {
    const cwd = f.clone('snapshots', true), target = path.join(f.dir, 'heads.json'), before = snapshot(cwd);
    const names = readdirSync(cwd);
    const ordinary = invoke(cwd, f.env, 'status');
    assert.equal(ordinary.status, 0, ordinary.stderr);
    assert.match(ordinary.stdout, /過去の HEAD: 不明（snapshot 未指定）/);
    assert.deepEqual(readdirSync(cwd), names, 'ordinary status does not create a snapshot');

    const first = invoke(cwd, f.env, 'status', '--snapshot', target);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /前回の HEAD: 不明（初回 snapshot）/);
    assert.match(first.stdout, /一致だけでは変更パスの非重複を証明できません/);
    const firstRecord = JSON.parse(readFileSync(target, 'utf8')).records.find(item => item.key === 'branch:feat/other');
    const oldHead = git(f.seed, 'rev-parse', 'feat/other'), oldBase = git(f.seed, 'rev-parse', 'main');
    assert.equal(firstRecord.head, oldHead);
    assert.equal(firstRecord.baseHead, oldBase);
    assert.equal(firstRecord.comparisonBase, oldBase);
    const subdirTarget = path.join(f.dir, 'subdir-heads.json');
    const fromSubdir = invoke(path.join(cwd, '.github'), f.env, 'status', '--snapshot', subdirTarget);
    assert.equal(fromSubdir.status, 0, fromSubdir.stderr);
    assert.equal(JSON.parse(readFileSync(subdirTarget, 'utf8')).records.find(item => item.key === 'branch:feat/other').head, oldHead);
    const same = invoke(cwd, f.env, 'check', 'feature.txt', '--snapshot', target);
    assert.equal(same.status, 1, same.stderr);
    assert.match(same.stdout, /前回から HEAD・基点の変更はありません/);

    writeFileSync(path.join(f.seed, 'feature.txt'), 'updated work\n');
    git(f.seed, 'add', 'feature.txt'); git(f.seed, 'commit', '-m', 'update work'); git(f.seed, 'push', 'origin', 'feat/other');
    const newHead = git(f.seed, 'rev-parse', 'feat/other');
    const changed = invoke(cwd, f.env, 'status', '--snapshot', target);
    assert.equal(changed.status, 0, changed.stderr);
    assert.match(changed.stdout, new RegExp(`head ${oldHead.slice(0, 8)}→${newHead.slice(0, 8)}`));
    assert.equal(JSON.parse(readFileSync(target, 'utf8')).records.find(item => item.key === 'branch:feat/other').head, newHead);
    git(f.seed, 'switch', 'main');
    writeFileSync(path.join(f.seed, 'base.txt'), 'advanced base\n');
    git(f.seed, 'add', 'base.txt'); git(f.seed, 'commit', '-m', 'advance base'); git(f.seed, 'push', 'origin', 'main');
    const newBase = git(f.seed, 'rev-parse', 'main');
    const baseChanged = invoke(cwd, f.env, 'status', '--snapshot', target);
    assert.equal(baseChanged.status, 0, baseChanged.stderr);
    assert.match(baseChanged.stdout, new RegExp(`baseHead ${oldBase.slice(0, 8)}→${newBase.slice(0, 8)}`));
    const baseRecord = JSON.parse(readFileSync(target, 'utf8')).records.find(item => item.key === 'branch:feat/other');
    assert.equal(baseRecord.head, newHead);
    assert.equal(baseRecord.comparisonBase, oldBase);
    assert.deepEqual(snapshot(cwd), before, 'snapshot does not update tracked refs or fetch settings');

    const internal = path.join(cwd, 'snapshot.json');
    const rejected = invoke(cwd, f.env, 'status', '--snapshot', internal);
    assert.equal(rejected.status, 2);
    assert.match(rejected.stderr, /リポジトリと Git 共通領域の外/);
    assert.equal(existsSync(internal), false);
    const alias = path.join(f.dir, 'alias'); symlinkSync(cwd, alias, 'dir');
    assert.equal(invoke(cwd, f.env, 'status', '--snapshot', path.join(alias, 'snapshot.json')).status, 2);
    assert.equal(existsSync(internal), false);
    const otherRepo = path.join(f.dir, 'other-repository'); git(f.dir, 'init', otherRepo);
    assert.equal(invoke(cwd, f.env, 'status', '--snapshot', path.join(otherRepo, 'snapshot.json')).status, 2);
    assert.equal(existsSync(path.join(otherRepo, 'snapshot.json')), false);
    const unrelated = path.join(f.dir, 'unrelated.txt'); writeFileSync(unrelated, 'preserve this file\n');
    const invalid = invoke(cwd, f.env, 'status', '--snapshot', unrelated);
    assert.equal(invalid.status, 2);
    assert.doesNotMatch(invalid.stderr, /preserve this file/);
    assert.equal(readFileSync(unrelated, 'utf8'), 'preserve this file\n');
    assert.equal(existsSync(`${unrelated}.scope-guard.lock`), false);
    git(cwd, 'switch', '-c', 'feat/other');
    const own = invoke(cwd, f.env, 'check', 'feature.txt');
    assert.equal(own.status, 0, own.stderr);
    assert.match(own.stdout, /feat\/other \(other, PR なし\) \[比較対象外\]: HEAD/);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('PR API base and current base HEAD stay separate; a moving PR is explicitly uncertain', () => {
  const f = fixture();
  try {
    const cwd = f.clone('pr', true), head = git(f.seed, 'rev-parse', 'feat/other'), apiBase = git(f.seed, 'rev-parse', 'main');
    git(f.seed, 'switch', 'main');
    writeFileSync(path.join(f.seed, 'base.txt'), 'new main\n');
    git(f.seed, 'add', 'base.txt'); git(f.seed, 'commit', '-m', 'advance main'); git(f.seed, 'push', 'origin', 'main');
    const currentBase = git(f.seed, 'rev-parse', 'main');
    const list = [{ number: 7, title: 'other work', author: { login: 'other' }, headRefName: 'feat/other', headRefOid: head,
      baseRefName: 'main', baseRefOid: apiBase, isCrossRepository: false, body: null, isDraft: false,
      createdAt: '2026-01-01T00:00:00Z', url: 'https://example.invalid/7' }];
    const env = { ...f.env, SCOPE_TEST_PR_LIST: JSON.stringify(list), SCOPE_TEST_PR_FILES: 'feature.txt',
      SCOPE_TEST_PR_AFTER: JSON.stringify({ head, base: apiBase, headRef: 'feat/other', baseRef: 'main' }) };
    const stable = invoke(cwd, env, 'check', 'feature.txt');
    assert.equal(stable.status, 1, stable.stderr);
    assert.match(stable.stdout, new RegExp(`HEAD ${head.slice(0, 8)} / 比較基点 ${apiBase.slice(0, 8)} / PR API基点 ${apiBase.slice(0, 8)} / 現在の基点 main@${currentBase.slice(0, 8)}`));
    assert.doesNotMatch(stable.stdout, /不確定/);
    const movedHead = 'a'.repeat(40);
    const trace = path.join(f.dir, 'gh-trace.log');
    const moving = invoke(cwd, { ...env, SCOPE_TEST_TRACE: trace,
      SCOPE_TEST_PR_AFTER: JSON.stringify({ head: movedHead, base: apiBase, headRef: 'feat/other', baseRef: 'main' }) }, 'check', 'feature.txt');
    assert.equal(moving.status, 1, moving.stderr);
    assert.match(moving.stdout, /不確定（取得後 HEAD aaaaaaaa/);
    assert.equal(readFileSync(trace, 'utf8').split('\n').filter(line => line.startsWith('api:repos/')).length, 1, 'no retry loop');
    const target = path.join(f.dir, 'uncertain.json');
    const changedEnv = { ...env, SCOPE_TEST_PR_AFTER: JSON.stringify({ head: movedHead, base: apiBase, headRef: 'feat/other', baseRef: 'main' }) };
    assert.equal(invoke(cwd, changedEnv, 'check', 'feature.txt', '--snapshot', target).status, 1);
    const saved = JSON.parse(readFileSync(target, 'utf8')).records.find(item => item.key === 'pr:7');
    assert.equal(saved.uncertain, true);
    assert.equal(saved.headAfter, movedHead);
    const repeated = invoke(cwd, changedEnv, 'status', '--snapshot', target);
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.match(repeated.stdout, /不確定（同一 HEAD と断定できません）/);
    const baseMoved = invoke(cwd, { ...env, SCOPE_TEST_PR_AFTER: JSON.stringify({ head, base: 'b'.repeat(40), headRef: 'feat/other', baseRef: 'main' }) }, 'status');
    assert.equal(baseMoved.status, 0, baseMoved.stderr);
    assert.match(baseMoved.stdout, /不確定（取得後 HEAD/);
    const unknown = invoke(cwd, { ...env, SCOPE_TEST_PR_AFTER: '' }, 'status');
    assert.equal(unknown.status, 0, unknown.stderr);
    assert.match(unknown.stdout, /不確定/);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
