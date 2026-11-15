// GitHub（gh CLI）と git から、進行中の作業とその占有範囲を集める。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseScope } from './lib.mjs';

export function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  }).trim();
}

export function repoRoot() {
  return run('git', ['rev-parse', '--show-toplevel']);
}

export function loadConfig(root) {
  const file = path.join(root, '.github', 'scope-guard.json');
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const mode = process.env.SCOPE_GUARD_MODE || config.mode || 'warn';
  return { mode, shared: config.shared ?? [], baseBranch: config.baseBranch ?? 'main' };
}

export function currentBranch() {
  try {
    return run('git', ['symbolic-ref', '--short', 'HEAD']);
  } catch {
    return null;
  }
}

export function trackedFiles() {
  return run('git', ['ls-files']).split('\n').filter(Boolean);
}

export function stagedFiles() {
  return run('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMRD'])
    .split('\n')
    .filter(Boolean);
}

function prFiles(number) {
  const out = run('gh', ['api', '--paginate', `repos/{owner}/{repo}/pulls/${number}/files?per_page=100`, '-q', '.[].filename']);
  return out.split('\n').filter(Boolean);
}

export function openPullRequests() {
  const list = JSON.parse(
    run('gh', [
      'pr', 'list', '--state', 'open', '--limit', '100',
      '--json', 'number,title,author,headRefName,body,isDraft,createdAt,url',
    ]),
  );
  return list.map((pr) => ({
    kind: 'pr',
    number: pr.number,
    title: pr.title,
    author: pr.author?.login ?? 'unknown',
    branch: pr.headRefName,
    isDraft: pr.isDraft,
    createdAt: pr.createdAt,
    url: pr.url,
    scope: parseScope(pr.body),
    files: prFiles(pr.number),
  }));
}

/** PR のないリモートブランチ。base より先に進んでいるものだけを返す。 */
export function branchesWithoutPr(prBranches, baseBranch) {
  const base = `origin/${baseBranch}`;
  const refs = run('git', ['for-each-ref', '--format=%(refname:short)%09%(authorname)', 'refs/remotes/origin'])
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));
  const works = [];
  for (const [ref, author] of refs) {
    const branch = ref.replace(/^origin\//, '');
    if (branch === 'HEAD' || branch === baseBranch || ref === 'origin' || prBranches.has(branch)) continue;
    const ahead = Number(run('git', ['rev-list', '--count', `${base}..${ref}`]));
    if (ahead === 0) continue;
    const files = run('git', ['diff', '--name-only', `${base}...${ref}`]).split('\n').filter(Boolean);
    works.push({ kind: 'branch', branch, author, scope: null, files });
  }
  return works;
}

/**
 * 進行中の作業一覧。短時間に何度も呼ばれるフック向けに .git 内へキャッシュする。
 * includeBranches は git fetch 済みのリモート追跡ブランチを使う。
 */
export function collectWorks({ root, baseBranch, includeBranches = true, cacheSeconds = 0 }) {
  const cacheFile = path.join(run('git', ['rev-parse', '--git-common-dir'], { cwd: root }), 'scope-guard-cache.json');
  if (cacheSeconds > 0 && existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
      if (Date.now() - cached.savedAt < cacheSeconds * 1000 && cached.includeBranches === includeBranches) {
        return cached.works;
      }
    } catch {
      // 壊れたキャッシュは取り直す
    }
  }
  const prs = openPullRequests();
  const works = includeBranches
    ? [...prs, ...branchesWithoutPr(new Set(prs.map((p) => p.branch)), baseBranch)]
    : prs;
  if (cacheSeconds > 0) {
    try {
      writeFileSync(cacheFile, JSON.stringify({ savedAt: Date.now(), includeBranches, works }));
    } catch {
      // キャッシュに書けなくても判定は続ける
    }
  }
  return works;
}

/** 自分を表す名前（GitHub のログイン名と git の user.name）。取れなければ空。 */
export function selfNames() {
  const names = new Set();
  for (const [cmd, args] of [['gh', ['api', 'user', '-q', '.login']], ['git', ['config', 'user.name']]]) {
    try {
      const name = run(cmd, args);
      if (name) names.add(name);
    } catch {
      // 取れない名前は使わない
    }
  }
  return names;
}

/** 自分の作業を除いた一覧と、自分の PR（あれば）を分ける。 */
export function splitOwn(works, { branch, prNumber }) {
  const own = works.find((w) => (prNumber ? w.kind === 'pr' && w.number === prNumber : w.kind === 'pr' && w.branch === branch));
  const others = works.filter((w) => w !== own && !(branch && w.branch === branch));
  return { own: own ?? null, others };
}
