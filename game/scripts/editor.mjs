/** Node 24+: shared TypeScript validators also run in the browser, without a second schema. */
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { diffDocuments, loadChangeSet, loadDocument, previewChangeSet, serializeChangeSet } from '../src/editor/index.ts';

// No patch field or CLI argument can select a different output file or execute code.
const gameRoot = fileURLToPath(new URL('..', import.meta.url));
const target = join(gameRoot, 'data', 'editor-prototype.json');
const MAX_JSON_BYTES = 32 * 1024 * 1024;

async function readJSONFile(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > MAX_JSON_BYTES) throw new Error('Expected a regular JSON file of at most 32 MiB');
  return readFile(path, 'utf8');
}
async function readSource() {
  if (await realpath(dirname(target)) !== dirname(target)) throw new Error('Editor data directory must not be a symlink');
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Editor data target must be a regular file, not a symlink');
  const text = await readJSONFile(target);
  return { text, info, document: loadDocument(text) };
}
async function apply(changes) {
  const source = await readSource();
  const preview = previewChangeSet(source.document, changes);
  if (preview.before === preview.after) { console.log('No data changes'); return; }
  const lockPath = `${target}.lock`;
  let lock;
  try { lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another editor apply holds the data lock; source was not changed');
    throw error;
  }
  const temporary = `${target}.${randomUUID()}.tmp`;
  let temporaryCreated = false;
  try {
    const current = await readSource();
    if (current.text !== source.text || current.info.ino !== source.info.ino || current.info.dev !== source.info.dev) throw new Error('Source changed during apply; source was not replaced');
    const file = await open(temporary, 'wx', source.info.mode & 0o777);
    temporaryCreated = true;
    try { await file.writeFile(preview.after, 'utf8'); await file.sync(); }
    finally { await file.close(); }
    // Catch ordinary manual edits that happened during validation/write. Cooperating applies use the lock.
    const latest = await readSource();
    if (latest.text !== source.text || latest.info.ino !== source.info.ino || latest.info.dev !== source.info.dev) throw new Error('Source changed during apply; source was not replaced');
    // Same-directory rename is the only commit point: failures above leave the original bytes intact.
    await rename(temporary, target);
    temporaryCreated = false;
    console.log('Applied game/data/editor-prototype.json');
  } finally {
    if (temporaryCreated) await unlink(temporary).catch(() => {});
    await lock.close();
    await unlink(lockPath);
  }
}

try {
  const [command, path, ...extra] = process.argv.slice(2);
  if (extra.length || !['validate', 'diff', 'preview', 'apply'].includes(command) ||
      (command === 'validate' ? path !== undefined : !path)) {
    throw new Error('Usage: npm run editor -- validate | diff <candidate.json> | preview <changes.json> | apply <changes.json>');
  }
  if (command === 'validate') {
    const { document } = await readSource();
    console.log(`Valid editor data: ${document.id} (${document.areas.length} areas)`);
  } else if (command === 'diff') {
    const { document } = await readSource();
    const next = loadDocument(await readJSONFile(path));
    process.stdout.write(serializeChangeSet(diffDocuments(document, next)));
  } else {
    const changes = loadChangeSet(await readJSONFile(path));
    if (command === 'apply') await apply(changes);
    else {
      const { document } = await readSource();
      const preview = previewChangeSet(document, changes);
      console.log(JSON.stringify({ target: 'game/data/editor-prototype.json', summary: preview.summary,
        before: JSON.parse(preview.before), after: JSON.parse(preview.after) }, null, 2));
    }
  }
} catch (error) {
  console.error(`Editor: ${error.message}`);
  process.exitCode = 1;
}
