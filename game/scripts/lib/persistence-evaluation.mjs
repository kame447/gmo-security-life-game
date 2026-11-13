/** Evaluation only: fixed source import, no browser/listener, temporary caches/artifacts only. */
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const gameRoot = fileURLToPath(new URL('../..', import.meta.url));
// Ignore TMPDIR overrides: this evaluation must never write under a source directory.
export async function temporaryDirectory() { return mkdtemp(join(await realpath('/tmp'), 'slg-persistence-evaluation-')); }

/** The legacy world uses extensionless TS imports; Vite's existing SSR loader resolves them. */
export async function loadEvaluationWorld() {
  const temporary = await temporaryDirectory();
  let server;
  try {
    server = await createServer({ root: gameRoot, configFile: false, envFile: false, cacheDir: join(temporary, 'vite'),
      logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] } });
    const { buildWorld } = await server.ssrLoadModule('/src/world/index.ts');
    return buildWorld();
  } finally {
    if (server) await server.close();
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function readEvaluationJSON(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 32 * 1024 * 1024) throw new Error('Expected a regular JSON file of at most 32 MiB');
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeEvaluationArtifacts(report, baseline) {
  const directory = await temporaryDirectory();
  try {
    await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await writeFile(join(directory, 'baseline.json'), JSON.stringify(baseline, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    if (report.candidate) await writeFile(join(directory, 'candidate.json'), JSON.stringify(report.candidate, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
