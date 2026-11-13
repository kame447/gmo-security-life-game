import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\ncase "$1:$2" in\n  pr:list) printf "[]\\n" ;;\n  api:user) printf "reviewer\\n" ;;\n  *) exit 2 ;;\nesac\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GIT_TERMINAL_PROMPT: '0' };
  function clone(name, single) {
    const dirPath = path.join(dir, name);
    git(dir, 'clone', ...(single ? ['--single-branch', '--branch', 'main'] : []), `file://${remote}`, dirPath);
    git(dirPath, 'config', 'user.name', 'reviewer');
    git(dirPath, 'config', 'user.email', 'reviewer@example.invalid');
    return dirPath;
  }
  return { dir, remote, env, clone };
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
    const cwd = f.clone('offline', true);
    git(cwd, 'remote', 'set-url', 'origin', path.join(f.dir, 'missing.git'));
    const before = snapshot(cwd), result = invoke(cwd, f.env, 'status');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /git fetch に失敗/);
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
