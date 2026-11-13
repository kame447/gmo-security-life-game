#!/usr/bin/env node
// 作業範囲ガード。使い方は docs/team-workflow.md を参照。
//
//   node scripts/scope-guard/cli.mjs status            進行中の作業と占有範囲を表示
//   node scripts/scope-guard/cli.mjs check <path...>   編集予定のパスが他の作業と重なるか確認
//   node scripts/scope-guard/cli.mjs pre-commit        ステージしたファイルを確認（Git フック用）
//   node scripts/scope-guard/cli.mjs claude-hook       Claude Code の PreToolUse フック用
//   node scripts/scope-guard/cli.mjs ci                PR の範囲外変更と重複を確認（GitHub Actions 用）
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  claimPatterns,
  describeWork,
  findFileConflicts,
  findOutOfScope,
  findScopeOverlaps,
  hasWildcard,
  matches,
  normalizePattern,
  parseScope,
} from './lib.mjs';
import {
  collectWorks,
  currentBranch,
  loadConfig,
  repoRoot,
  selfNames,
  splitOwn,
  stagedFiles,
  trackedFiles,
} from './github.mjs';

const HOOK_CACHE_SECONDS = 120;
const LABELS = { conflict: '[重複]', shared: '[共有]', self: '[自分]' };

function printConflicts(conflicts) {
  const byWork = new Map();
  for (const c of conflicts) {
    const key = describeWork(c.work);
    if (!byWork.has(key)) byWork.set(key, { work: c.work, items: [] });
    byWork.get(key).items.push(c);
  }
  for (const [label, { work, items }] of byWork) {
    console.log(`  ${label}${work.url ? ` ${work.url}` : ''}`);
    for (const c of items) {
      console.log(`    ${LABELS[c.severity]} ${c.file}`);
    }
  }
}

function reportLocal(files, { label, patterns = [] }) {
  const root = repoRoot();
  const config = loadConfig(root);
  const branch = currentBranch();
  const works = collectWorks({ root, baseBranch: config.baseBranch, cacheSeconds: label === 'pre-commit' ? HOOK_CACHE_SECONDS : 0 });
  const { own, others } = splitOwn(works, { branch });
  const self = selfNames();
  const conflicts = findFileConflicts(files, others, config.shared, self);
  // まだファイルのないディレクトリ・パターンは、他の作業の範囲とパターン同士で比べる
  for (const o of findScopeOverlaps(patterns, others, config.shared, trackedFiles())) {
    conflicts.push({ file: `${o.mine}（${o.other} と重複）`, work: o.work, severity: self.has(o.work.author) ? 'self' : 'conflict' });
  }
  const hard = conflicts.filter((c) => c.severity === 'conflict');
  const outOfScope = own?.scope ? findOutOfScope(files, own.scope) : [];

  if (conflicts.length === 0 && outOfScope.length === 0) {
    console.log(`scope-guard: 他の作業との重なりはありません（${files.length} ファイル、${patterns.length} パターン）。`);
    return { hard: 0 };
  }
  if (conflicts.length > 0) {
    console.log('scope-guard: 他の作業が占有しているファイルがあります。');
    printConflicts(conflicts);
    if (hard.length > 0) {
      console.log('  → [重複] は編集前に担当者と調整してください。');
    }
    console.log('  → [共有] は最小限の変更にして PR に記載し、[自分] は自分の作業どうしのマージ順に注意してください。');
  }
  if (outOfScope.length > 0) {
    console.log(`scope-guard: 自分の PR #${own.number} の scope 外のファイルです。PR 本文の scope を更新してください。`);
    for (const f of outOfScope) console.log(`    ${f}`);
  }
  if (!own) {
    console.log('scope-guard: このブランチの PR がありません。作業開始時に scope を書いた Draft PR を出してください。');
  }
  return { hard: hard.length, mode: config.mode };
}

function cmdStatus() {
  const root = repoRoot();
  const config = loadConfig(root);
  const works = collectWorks({ root, baseBranch: config.baseBranch });
  console.log(`進行中の作業: ${works.length} 件（モード: ${config.mode}）\n`);
  for (const work of works) {
    console.log(`■ ${describeWork(work)}${work.title ? ` ${work.title}` : ''}`);
    if (work.scope) console.log(`  scope: ${work.scope.join(', ')}`);
    console.log(`  変更ファイル: ${work.files.length} 件`);
  }
  const counts = new Map();
  for (const work of works) {
    for (const f of claimPatterns(work)) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const hot = [...counts].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  if (hot.length > 0) {
    console.log('\n複数の作業が占有しているパス:');
    for (const [f, n] of hot.slice(0, 30)) console.log(`  ${String(n).padStart(2)} 件  ${f}`);
  }
}

function cmdCheck(paths) {
  if (paths.length === 0) {
    console.error('使い方: node scripts/scope-guard/cli.mjs check <path...>');
    process.exit(2);
  }
  const root = repoRoot();
  const tracked = trackedFiles();
  const files = [];
  const patterns = [];
  for (const arg of paths) {
    let rel = path.relative(root, path.resolve(arg)).split(path.sep).join('/');
    let isDir = arg.endsWith('/');
    try {
      isDir ||= statSync(arg).isDirectory();
    } catch {
      // 未作成のパス
    }
    if (!isDir && !hasWildcard(rel)) {
      files.push(rel);
      continue;
    }
    const pattern = normalizePattern(isDir ? `${rel}/` : rel);
    const expanded = tracked.filter((f) => matches(pattern, f));
    if (expanded.length > 0) files.push(...expanded);
    else patterns.push(pattern);
  }
  const { hard } = reportLocal(files, { label: 'check', patterns });
  process.exit(hard > 0 ? 1 : 0);
}

function cmdPreCommit() {
  if (process.env.SCOPE_GUARD_SKIP === '1') return;
  const files = stagedFiles();
  if (files.length === 0) return;
  try {
    const { hard, mode } = reportLocal(files, { label: 'pre-commit' });
    if (hard > 0 && mode === 'enforce') {
      console.log('scope-guard: enforce モードのためコミットを中止しました。調整済みなら SCOPE_GUARD_SKIP=1 で再実行してください。');
      process.exit(1);
    }
  } catch (error) {
    console.error(`scope-guard: 確認できませんでした（${error.message.split('\n')[0]}）。コミットは続行します。`);
  }
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function cmdClaudeHook() {
  try {
    const input = JSON.parse(await readStdin());
    const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
    if (!target) return;
    const root = repoRoot();
    const rel = path.relative(root, path.resolve(input.cwd ?? root, target)).split(path.sep).join('/');
    if (rel.startsWith('..') || rel.startsWith('.git/')) return;
    const config = loadConfig(root);
    const works = collectWorks({ root, baseBranch: config.baseBranch, cacheSeconds: HOOK_CACHE_SECONDS });
    const { others } = splitOwn(works, { branch: currentBranch() });
    const hard = findFileConflicts([rel], others, config.shared, selfNames()).filter((c) => c.severity === 'conflict');
    if (hard.length === 0) return;
    const owners = [...new Set(hard.map((c) => `${describeWork(c.work)}${c.work.url ? ` ${c.work.url}` : ''}`))];
    const reason = `scope-guard: ${rel} は次の作業が占有しています: ${owners.join(' / ')}。編集する前に担当者と調整してください（docs/team-workflow.md）。`;
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: config.mode === 'enforce' ? 'deny' : 'ask',
        permissionDecisionReason: reason,
      },
    }));
  } catch (error) {
    console.error(`scope-guard: 確認できませんでした（${error.message.split('\n')[0]}）。編集は続行します。`);
  }
}

function cmdCi() {
  const root = repoRoot();
  const config = loadConfig(root);
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const pr = event.pull_request;
  const works = collectWorks({ root, baseBranch: config.baseBranch, includeBranches: false });
  const { own, others } = splitOwn(works, { prNumber: pr.number, branch: pr.head.ref });
  const scope = parseScope(pr.body);
  const files = own?.files ?? [];
  const createdAt = new Date(pr.created_at);

  const errors = [];
  const notes = [];

  if (!scope) {
    errors.push('PR 本文に ```scope ブロックがありません。編集するパスを宣言してください（PR テンプレート参照）。');
  } else {
    const outside = findOutOfScope(files, scope);
    if (outside.length > 0) errors.push(`scope 外の変更があります: ${outside.join(', ')}`);
  }

  const seen = new Set();
  const overlapTargets = [];
  const prAuthor = new Set([pr.user.login]);
  for (const c of findFileConflicts(files, others, config.shared, prAuthor)) {
    const key = `${c.work.number}:${c.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    overlapTargets.push({ work: c.work, what: c.file, severity: c.severity });
  }
  if (scope) {
    for (const o of findScopeOverlaps(scope, others, config.shared, trackedFiles())) {
      const key = `${o.work.number}:${o.mine}~${o.other}`;
      if (seen.has(key)) continue;
      seen.add(key);
      overlapTargets.push({ work: o.work, what: `${o.mine} ⇔ ${o.other}`, severity: prAuthor.has(o.work.author) ? 'self' : 'conflict' });
    }
  }
  for (const t of overlapTargets) {
    const label = `${describeWork(t.work)}: ${t.what}`;
    if (t.severity === 'self') {
      notes.push(`同じ作者の ${label} と範囲が重なっています。マージ順に注意してください。`);
    } else if (t.severity === 'shared') {
      notes.push(`共有ファイルを ${label} と同時に変更しています。変更を最小限にし、PR に記載してください。`);
    } else if (new Date(t.work.createdAt) < createdAt) {
      errors.push(`先に作成された ${label} と範囲が重なっています。担当者と調整してください。`);
    } else {
      notes.push(`後から作成された ${label} と範囲が重なっています（先に作成されたこの PR が優先）。`);
    }
  }

  const enforce = config.mode === 'enforce';
  const summary = [
    `## scope-guard（モード: ${config.mode}）`,
    '',
    scope ? `宣言された scope: \`${scope.join('`, `')}\`` : '宣言された scope: なし',
    '',
    ...(errors.length ? ['### 要対応', ...errors.map((e) => `- ${e}`), ''] : []),
    ...(notes.length ? ['### 参考', ...notes.map((n) => `- ${n}`), ''] : []),
    ...(!errors.length && !notes.length ? ['他の作業との重なりはありません。'] : []),
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  for (const e of errors) console.log(`::${enforce ? 'error' : 'warning'}::${e}`);
  for (const n of notes) console.log(`::notice::${n}`);
  if (enforce && errors.length > 0) process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case 'status':
    cmdStatus();
    break;
  case 'check':
    cmdCheck(rest);
    break;
  case 'pre-commit':
    cmdPreCommit();
    break;
  case 'claude-hook':
    await cmdClaudeHook();
    break;
  case 'ci':
    cmdCi();
    break;
  default:
    console.error('使い方: node scripts/scope-guard/cli.mjs <status|check|pre-commit|claude-hook|ci>');
    process.exit(2);
}
