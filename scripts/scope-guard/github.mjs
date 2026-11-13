// GitHub（gh CLI）と git から、進行中の作業とその占有範囲を集める。
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

export function openPullRequests({ includeRevisions = false } = {}) {
  const fields = ['number', 'title', 'author', 'headRefName', 'body', 'isDraft', 'createdAt', 'url'];
  if (includeRevisions) fields.push('headRefOid', 'baseRefName', 'baseRefOid', 'isCrossRepository');
  const list = JSON.parse(
    run('gh', [
      'pr', 'list', '--state', 'open', '--limit', '100',
      '--json', fields.join(','),
    ]),
  );
  return list.map((pr) => {
    const files = prFiles(pr.number);
    const work = {
      kind: 'pr', number: pr.number, title: pr.title, author: pr.author?.login ?? 'unknown',
      branch: pr.headRefName, isDraft: pr.isDraft, createdAt: pr.createdAt, url: pr.url,
      scope: parseScope(pr.body), files,
    };
    if (includeRevisions) {
      let after = null;
      try {
        after = JSON.parse(run('gh', ['api', `repos/{owner}/{repo}/pulls/${pr.number}`, '-q', '{head:.head.sha,base:.base.sha,headRef:.head.ref,baseRef:.base.ref}']));
      } catch {
        // A failed recheck makes the snapshot uncertain; it does not change scope decisions.
      }
      work.revision = {
        head: pr.headRefOid ?? null, apiBase: pr.baseRefOid ?? null, baseRef: pr.baseRefName ?? null,
        isCrossRepository: !!pr.isCrossRepository,
        headAfter: after?.head ?? null, apiBaseAfter: after?.base ?? null,
        uncertain: !after || !pr.headRefOid || !pr.baseRefOid || after.head !== pr.headRefOid || after.base !== pr.baseRefOid ||
          after.headRef !== pr.headRefName || after.baseRef !== pr.baseRefName,
      };
    }
    return work;
  });
}

function mergeBase(base, head) {
  if (!base || !head) return null;
  try { return run('git', ['merge-base', base, head]) || null; } catch { return null; }
}

function branchesInNamespace(prBranches, baseBranch, namespace, includeRevisions) {
  const base = `${namespace}/${baseBranch}`;
  const refs = run('git', ['for-each-ref', '--format=%(refname)%09%(authorname)%09%(objectname)', namespace])
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));
  const heads = new Map(refs.map(([ref, , sha]) => [ref.slice(namespace.length + 1), sha]));
  const baseHead = heads.get(baseBranch) ?? null;
  const works = [];
  for (const [ref, author, head] of refs) {
    const branch = ref.slice(namespace.length + 1);
    if (branch === 'HEAD' || branch === baseBranch || prBranches.has(branch)) continue;
    const ahead = Number(run('git', ['rev-list', '--count', `${base}..${ref}`]));
    if (ahead === 0) continue;
    const files = run('git', ['diff', '--name-only', `${base}...${ref}`]).split('\n').filter(Boolean);
    const work = { kind: 'branch', branch, author, scope: null, files };
    if (includeRevisions) work.revision = { head, baseRef: baseBranch, baseHead, comparisonBase: mergeBase(baseHead, head), uncertain: false };
    works.push(work);
  }
  return { works, heads };
}

/** PR のない remote branch を取得する。利用者の追跡 ref は更新しない。 */
function remoteBranchSnapshot(prBranches, baseBranch, includeRevisions = false) {
  const namespace = `refs/scope-guard/${randomUUID()}`;
  let fetched = false;
  try {
    try {
      // An explicit destination and empty refmap ignore single-branch clone settings.
      // FETCH_HEAD and the caller's refs/remotes/origin/* remain untouched.
      run('git', ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules',
        '--refmap=', 'origin', `+refs/heads/*:${namespace}/*`]);
      fetched = true;
    } catch {
      console.error('scope-guard: git fetch に失敗しました。手元のリモート追跡ブランチで判定します。');
    }
    const result = branchesInNamespace(prBranches, baseBranch, fetched ? namespace : 'refs/remotes/origin', includeRevisions);
    if (includeRevisions && !fetched) for (const work of result.works) work.revision.uncertain = true;
    return { ...result, fetched };
  } finally {
    try {
      const refs = run('git', ['for-each-ref', '--format=%(refname)', namespace]).split('\n').filter(Boolean);
      for (const ref of refs) run('git', ['update-ref', '-d', ref]);
    } catch (error) {
      console.error(`scope-guard: 一時 ref を解除できませんでした（${error.message.split('\n')[0]}）。`);
    }
  }
}

export function branchesWithoutPr(prBranches, baseBranch) {
  return remoteBranchSnapshot(prBranches, baseBranch).works;
}

/**
 * 進行中の作業一覧。短時間に何度も呼ばれるフック向けに .git 内へキャッシュする。
 * includeBranches は一時 ref に取得した remote branch を使う。
 */
export function collectWorks({ root, baseBranch, includeBranches = true, cacheSeconds = 0, includeRevisions = false }) {
  const cacheFile = path.join(run('git', ['rev-parse', '--git-common-dir'], { cwd: root }), 'scope-guard-cache.json');
  if (cacheSeconds > 0 && !includeRevisions && existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
      if (Date.now() - cached.savedAt < cacheSeconds * 1000 && cached.includeBranches === includeBranches) {
        return cached.works;
      }
    } catch {
      // 壊れたキャッシュは取り直す
    }
  }
  const prs = openPullRequests({ includeRevisions });
  const remote = includeBranches ? remoteBranchSnapshot(new Set(prs.map((p) => p.branch)), baseBranch, includeRevisions) : null;
  if (includeRevisions && remote) {
    for (const pr of prs) {
      pr.revision.baseHead = remote.heads.get(pr.revision.baseRef) ?? null;
      pr.revision.comparisonBase = mergeBase(pr.revision.apiBase, pr.revision.head);
      const remoteHead = remote.heads.get(pr.branch);
      if (!remote.fetched || !pr.revision.baseHead || !pr.revision.comparisonBase ||
        (!pr.revision.isCrossRepository && remoteHead !== pr.revision.head)) pr.revision.uncertain = true;
    }
  }
  const works = remote ? [...prs, ...remote.works] : prs;
  if (cacheSeconds > 0 && !includeRevisions) {
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
