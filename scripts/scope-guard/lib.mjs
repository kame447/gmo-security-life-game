// 作業範囲（scope）の宣言を解析し、他の作業との重なりを判定する純粋関数群。
// GitHub や git へのアクセスは github.mjs に分け、ここは単体テストできる形に保つ。

const SCOPE_BLOCK = /```scope[^\n]*\n([\s\S]*?)```/;

/** PR 本文の ```scope ブロックからパターンを取り出す。ブロックがなければ null。 */
export function parseScope(body) {
  const match = SCOPE_BLOCK.exec(body ?? '');
  if (!match) return null;
  return match[1]
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .map((line) => line.replace(/^[-*]\s+/, ''))
    .filter(Boolean)
    .map(normalizePattern);
}

export function normalizePattern(pattern) {
  let p = pattern.trim().replace(/^\.\//, '').replace(/^\//, '');
  if (p.endsWith('/')) p += '**';
  return p;
}

export function hasWildcard(pattern) {
  return /[*?]/.test(pattern);
}

const regexCache = new Map();

/** `**` は区切りを含む任意の文字列、`*` と `?` は区切りを含まない。 */
export function globToRegExp(pattern) {
  if (regexCache.has(pattern)) return regexCache.get(pattern);
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i++;
        if (pattern[i + 1] === '/') {
          i++;
          out += '(?:.*/)?';
        } else {
          out += '.*';
        }
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  const re = new RegExp(`^${out}$`);
  regexCache.set(pattern, re);
  return re;
}

export function matches(pattern, file) {
  return globToRegExp(pattern).test(file);
}

export function matchesAny(patterns, file) {
  return patterns.some((p) => matches(p, file));
}

/** ワイルドカードより前のディレクトリ部分。 */
export function staticPrefix(pattern) {
  const idx = pattern.search(/[*?]/);
  if (idx === -1) return pattern;
  const head = pattern.slice(0, idx);
  return head.slice(0, head.lastIndexOf('/') + 1);
}

/**
 * 二つのパターンが同じファイルを指しうるか。
 * 実在・変更済みのファイルで両方に一致するものがあれば重なりとし、
 * まだ存在しない新規ディレクトリ同士は静的な接頭辞で判定する。
 */
export function patternsOverlap(a, b, candidates) {
  if (!hasWildcard(a)) return matches(b, a) || a === b;
  if (!hasWildcard(b)) return matches(a, b);
  let aHit = false;
  let bHit = false;
  for (const file of candidates) {
    const ma = matches(a, file);
    const mb = matches(b, file);
    if (ma && mb) return true;
    aHit ||= ma;
    bHit ||= mb;
  }
  if (aHit && bHit) return false;
  const pa = staticPrefix(a);
  const pb = staticPrefix(b);
  return pa.startsWith(pb) || pb.startsWith(pa);
}

/**
 * 作業の占有範囲。宣言があれば宣言パターンと実際の変更ファイルの和、
 * 宣言がなければ実際の変更ファイルだけを占有範囲とする。
 */
export function claimPatterns(work) {
  const declared = work.scope ?? [];
  return [...new Set([...declared, ...(work.files ?? [])])];
}

/**
 * files それぞれについて、他の作業（works）の占有範囲との重なりを返す。
 * shared に一致するファイルは排他にせず severity: 'shared'、
 * 自分（self に含まれる作者）の別の作業との重なりは severity: 'self' として区別する。
 */
export function findFileConflicts(files, works, shared, self = new Set()) {
  const results = [];
  for (const file of files) {
    for (const work of works) {
      if (!matchesAny(claimPatterns(work), file)) continue;
      results.push({
        file,
        work,
        severity: self.has(work.author) ? 'self' : matchesAny(shared, file) ? 'shared' : 'conflict',
      });
    }
  }
  return results;
}

/** 宣言された範囲の外にある変更ファイル。 */
export function findOutOfScope(files, scope) {
  if (!scope) return [];
  return files.filter((f) => !matchesAny(scope, f));
}

/** 自分の宣言と他の作業の宣言・変更ファイルとの重なり。共有ファイルだけの重なりは除く。 */
export function findScopeOverlaps(ownScope, works, shared, trackedFiles) {
  const results = [];
  for (const work of works) {
    const theirs = claimPatterns(work);
    const candidates = [...trackedFiles, ...(work.files ?? [])];
    for (const mine of ownScope) {
      for (const other of theirs) {
        if (!patternsOverlap(mine, other, candidates)) continue;
        const both = candidates.filter((f) => matches(mine, f) && matches(other, f));
        if (both.length > 0 && both.every((f) => matchesAny(shared, f))) continue;
        if (both.length === 0 && !hasWildcard(mine) && matchesAny(shared, mine)) continue;
        results.push({ mine, other, work });
      }
    }
  }
  return results;
}

export function describeWork(work) {
  if (work.kind === 'pr') {
    return `PR #${work.number} (${work.author}, ${work.branch})${work.scope ? '' : ' [scope 未宣言]'}`;
  }
  return `ブランチ ${work.branch} (${work.author}, PR なし)`;
}
