import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const FORMAT = 'scope-guard-heads-v1';
const FIELDS = ['head', 'comparisonBase', 'baseRef', 'apiBase', 'baseHead', 'headAfter', 'apiBaseAfter', 'uncertain'];
const short = (sha) => typeof sha === 'string' && sha ? sha.slice(0, 8) : '不明';

export function parseSnapshotOption(args) {
  const rest = [];
  let snapshot;
  let literal = false;
  for (let i = 0; i < args.length; i++) {
    if (!literal && args[i] === '--') { literal = true; continue; }
    if (!literal && args[i] === '--snapshot') {
      if (snapshot !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--snapshot にはパスを1つ指定してください');
      snapshot = args[++i];
    } else rest.push(args[i]);
  }
  return { rest, snapshot };
}

export function revisionText(work) {
  const r = work.revision ?? {};
  const fields = [`HEAD ${short(r.head)}`, `比較基点 ${short(r.comparisonBase)}`];
  if (work.kind === 'pr') fields.push(`PR API基点 ${short(r.apiBase)}`, `現在の基点 ${r.baseRef ?? '不明'}@${short(r.baseHead)}`);
  else fields.push(`現在の基点 ${r.baseRef ?? '不明'}@${short(r.baseHead)}`);
  if (r.uncertain) fields.push(work.kind === 'pr'
    ? `不確定（取得後 HEAD ${short(r.headAfter)} / API基点 ${short(r.apiBaseAfter)}）`
    : '不確定（追跡 ref に基づく）');
  return fields.join(' / ');
}

export function snapshotRecords(works) {
  return works.map(work => ({
    key: work.kind === 'pr' ? `pr:${work.number}` : `branch:${work.branch}`,
    kind: work.kind, branch: work.branch, number: work.kind === 'pr' ? work.number : null,
    ...Object.fromEntries(FIELDS.map(field => [field, work.revision?.[field] ?? (field === 'uncertain' ? true : null)])),
  })).sort((a, b) => a.key.localeCompare(b.key));
}

function inside(parent, target) {
  const rel = path.relative(parent, target);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

function inGitRepository(directory) {
  try {
    const result = execFileSync('git', ['-C', directory, 'rev-parse', '--is-inside-work-tree', '--is-inside-git-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return result.split('\n').some(line => line.trim() === 'true');
  } catch (error) {
    if (error.status === 128 && /not a git repository/i.test(String(error.stderr ?? ''))) return false;
    throw new Error('snapshot の保存先を安全に確認できません');
  }
}

function checkedPath(requested, repoRoot, commonGitDir) {
  const absolute = path.resolve(requested);
  const parent = realpathSync(path.dirname(absolute));
  const target = path.join(parent, path.basename(absolute));
  const root = realpathSync(repoRoot), git = realpathSync(commonGitDir);
  if (inside(path.resolve(repoRoot), absolute) || inside(path.resolve(commonGitDir), absolute) ||
    inside(root, target) || inside(git, target) || inGitRepository(parent)) throw new Error('snapshot はリポジトリと Git 共通領域の外へ指定してください');
  if (existsSync(target)) {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('snapshot は通常ファイルを指定してください');
  } else {
    // lstat also catches a dangling symbolic link, which existsSync treats as absent.
    try { lstatSync(target); throw new Error('snapshot は通常ファイルを指定してください'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

function readSnapshot(target) {
  if (!existsSync(target)) return null;
  const contents = readFileSync(target, 'utf8');
  let value;
  try { value = JSON.parse(contents); }
  catch { throw new Error('既存ファイルは Scope Guard の snapshot ではありません'); }
  const validSha = sha => sha === null || (typeof sha === 'string' && /^[a-f0-9]{40,64}$/.test(sha));
  const keys = new Set();
  const invalid = item => {
    if (!item || typeof item.key !== 'string' || keys.has(item.key) || !['pr', 'branch'].includes(item.kind) ||
      typeof item.branch !== 'string' || typeof item.uncertain !== 'boolean' ||
      !(item.baseRef === null || typeof item.baseRef === 'string') ||
      !['head', 'comparisonBase', 'apiBase', 'baseHead', 'headAfter', 'apiBaseAfter'].every(key => validSha(item[key]))) return true;
    keys.add(item.key);
    return item.kind === 'pr' ? !Number.isInteger(item.number) || item.key !== `pr:${item.number}` : item.number !== null || item.key !== `branch:${item.branch}`;
  };
  if (value?.format !== FORMAT || !Array.isArray(value.records) || value.records.some(invalid)) {
    throw new Error('既存ファイルは Scope Guard の snapshot ではありません');
  }
  return value.records;
}

function describeChanges(previous, current) {
  if (!previous) return ['前回の HEAD: 不明（初回 snapshot）'];
  const old = new Map(previous.map(item => [item.key, item])), now = new Map(current.map(item => [item.key, item]));
  const messages = [];
  for (const key of [...new Set([...old.keys(), ...now.keys()])].sort()) {
    const before = old.get(key), after = now.get(key);
    const label = `${key}${before?.uncertain || after?.uncertain ? ' [不確定]' : ''}`;
    if (!before) messages.push(`${label}: 新規 HEAD ${short(after.head)}`);
    else if (!after) messages.push(`${label}: 一覧から消失（前回 HEAD ${short(before.head)}）`);
    else {
      const changed = FIELDS.filter(field => before[field] !== after[field]);
      const shown = (item, field) => field === 'uncertain' || field === 'baseRef' ? String(item[field]) : short(item[field]);
      if (changed.length) messages.push(`${label}: ${changed.map(field => `${field} ${shown(before, field)}→${shown(after, field)}`).join(', ')}`);
      else if (before.uncertain || after.uncertain) messages.push(`${key}: 不確定（同一 HEAD と断定できません）`);
    }
  }
  return messages.length ? messages : ['前回から HEAD・基点の変更はありません'];
}

/** Explicit opt-in only: compare the prior valid snapshot, then atomically replace it. */
export function updateSnapshot(requested, repoRoot, commonGitDir, works) {
  const target = checkedPath(requested, repoRoot, commonGitDir);
  const lock = `${target}.scope-guard.lock`;
  const fd = openSync(lock, 'wx', 0o600);
  let temp;
  try {
    const previous = readSnapshot(target), current = snapshotRecords(works);
    const messages = describeChanges(previous, current);
    temp = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
    writeFileSync(temp, `${JSON.stringify({ format: FORMAT, capturedAt: new Date().toISOString(), records: current }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    renameSync(temp, target);
    temp = undefined;
    return messages;
  } finally {
    if (temp && existsSync(temp)) unlinkSync(temp);
    closeSync(fd);
    unlinkSync(lock);
  }
}
