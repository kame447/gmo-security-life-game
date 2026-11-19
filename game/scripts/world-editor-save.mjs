import { fileURLToPath } from 'node:url';
import { constants } from 'node:fs';
import { lstat, open, readFile, readdir, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
const MAX_BYTES = 32 * 1024 * 1024;
const DIRECTORY = 'data/world/areas';
const AREA_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
async function layoutDirectory(root) {
    const directory = path.join(root, DIRECTORY);
    if (await realpath(directory) !== directory) throw new Error('配置フォルダーにシンボリックリンクは使えません');
    return directory;
}
async function snapshot(root) {
    const directory = await layoutDirectory(root), files = new Map();
    for (const name of (await readdir(directory)).filter(name => name.endsWith('.json')).sort()) {
        const areaId = name.slice(0, -5), file = path.join(directory, name);
        if (!AREA_ID.test(areaId)) throw new Error('配置ファイル名が不正です');
        const info = await lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error('配置ファイルが不正です');
        const bytes = await readFile(file), value = JSON.parse(bytes.toString('utf8'));
        if (value.areaId !== areaId) throw new Error('配置ファイル名とエリアが一致しません');
        files.set(areaId, { file, info, bytes });
    }
    return files;
}
async function unchanged(root, original) {
    const current = await snapshot(root);
    if (current.size !== original.size || [...original].some(([id, value]) => {
        const next = current.get(id);
        return !next || !next.bytes.equals(value.bytes) || next.info.ino !== value.info.ino || next.info.dev !== value.info.dev;
    })) throw new Error('ほかの編集で配置が変わりました。再読み込みしてください');
}
async function project(root, payload) {
    const server = await createServer({
        root,
        configFile: false,
        envFile: false,
        logLevel: 'silent',
        appType: 'custom',
        server: {
            middlewareMode: true,
            watch: null,
            hmr: false
        }
    });
    try {
        const { buildWorld } = await server.ssrLoadModule('/src/world/index.ts');
        const { prepareSave } = await server.ssrLoadModule('/src/world-editor/persistence.ts');
        return prepareSave(payload, buildWorld());
    } finally{
        await server.close();
    }
}
export async function previewLayout(root, payload) {
    root = await realpath(root);
    const original = await snapshot(root);
    const preview = await project(root, payload);
    await unchanged(root, original);
    return publicPlan(preview);
}
function publicPlan(prepared) {
    const targets = prepared.files.map(file => ({ areaId: file.areaId, path: file.relativePath, created: file.created }));
    return { target: targets.map(file => file.path).join('\n'), targets, summary: prepared.summary };
}

/** Trusted server-side callback only; HTTP/CLI never accept a file list or policy from JSON. */
export async function commitLayouts(root, prepare) {
    root = await realpath(root);
    const original = await snapshot(root), prepared = await prepare();
    const ids = new Set(), locks = [], temporary = new Set(), backups = new Set(), committed = [], cleanupErrors = [];
    let recoveryFailed = false;
    const files = prepared.files.map(file => {
        if (!AREA_ID.test(file.areaId) || ids.has(file.areaId) || file.relativePath !== `${DIRECTORY}/${file.areaId}.json` ||
            typeof file.text !== 'string' || Buffer.byteLength(file.text) > MAX_BYTES || JSON.parse(file.text).areaId !== file.areaId) throw new Error('保存先が不正です');
        ids.add(file.areaId);
        const previous = original.get(file.areaId), destination = path.join(root, file.relativePath);
        return { ...file, destination, previous, mode: previous ? previous.info.mode & 0o777 : 0o644,
            staged: `${destination}.${randomUUID()}.tmp`, backup: `${destination}.${randomUUID()}.backup` };
    }).sort((a, b) => a.areaId < b.areaId ? -1 : a.areaId > b.areaId ? 1 : 0);
    const stage = async (file, bytes, mode, owned, preserveMode = false) => {
        const handle = await open(file, 'wx', mode);
        owned.add(file);
        try {
            await handle.writeFile(bytes);
            if (preserveMode) await handle.chmod(mode);
            await handle.sync();
        }
        finally { await handle.close(); }
    };
    try {
        // Acquire every lock before creating any data/staging file. An EEXIST
        // lock is foreign and must never be removed by this transaction.
        for (const file of files) {
            const lockPath = `${file.destination}.lock`;
            const handle = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
            locks.push({ path: lockPath, handle });
        }
        await unchanged(root, original);
        for (const file of files) {
            if (file.previous) await stage(file.backup, file.previous.bytes, file.mode, backups, true);
            await stage(file.staged, file.text, file.mode, temporary, !!file.previous);
        }
        await unchanged(root, original);
        for (const file of files) {
            await rename(file.staged, file.destination);
            temporary.delete(file.staged);
            committed.push(file);
        }
    } catch (error) {
        const recoveryErrors = [];
        for (const file of [...committed].reverse()) {
            try {
                if (file.previous) { await rename(file.backup, file.destination); backups.delete(file.backup); }
                else await unlink(file.destination);
            } catch (recovery) { recoveryErrors.push(recovery); }
        }
        if (recoveryErrors.length) {
            recoveryFailed = true;
            throw new AggregateError([error, ...recoveryErrors], '保存を戻せませんでした。残したbackupファイルから復旧してください');
        }
        throw error;
    } finally{
        const clean = async action => { try { await action(); } catch (error) { if (error.code !== 'ENOENT') cleanupErrors.push(error.message); } };
        for (const file of temporary) await clean(() => unlink(file));
        if (!recoveryFailed) for (const file of backups) await clean(() => unlink(file));
        for (const lock of locks.reverse()) { await clean(() => lock.handle.close()); await clean(() => unlink(lock.path)); }
    }
    return { ...publicPlan(prepared), saved: true, ...(cleanupErrors.length ? { cleanupErrors } : {}) };
}
export async function applyLayout(root, payload) {
    return commitLayouts(root, () => project(root, payload));
}
export function worldEditorSavePlugin() {
    return {
        name: 'world-editor-save',
        apply: 'serve',
        configureServer (server) {
            server.middlewares.use(async (request, response, next)=>{
                const route = request.url?.split('?')[0];
                if (!route?.startsWith('/__world-editor/')) return next();
                const address = server.httpServer?.address();
                const enabled = server.config.server.host === '127.0.0.1' && address && typeof address === 'object';
                response.setHeader('Content-Type', 'application/json; charset=utf-8');
                const send = (status, value)=>{
                    response.statusCode = status;
                    response.end(JSON.stringify(value));
                };
                if (!enabled) return send(403, {
                    error: '保存は127.0.0.1の開発サーバーだけで使えます'
                });
                const origin = `http://127.0.0.1:${address.port}`;
                if (request.headers.host !== origin.slice(7)) return send(403, {
                    error: '不正な接続先です'
                });
                if (route === '/__world-editor/status' && request.method === 'GET') return send(200, {
                    enabled: true
                });
                if (![
                    '/__world-editor/preview',
                    '/__world-editor/save'
                ].includes(route) || request.method !== 'POST') return send(405, {
                    error: '不正な操作です'
                });
                if (request.headers.origin !== origin || request.headers['x-world-editor'] !== '1' || !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) return send(403, {
                    error: '同じ編集画面から保存してください'
                });
                try {
                    const chunks = [];
                    let bytes = 0;
                    for await (const chunk of request){
                        const b = Buffer.from(chunk);
                        bytes += b.length;
                        if (bytes > MAX_BYTES) throw new Error('保存データが32MiBを超えています');
                        chunks.push(b);
                    }
                    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                    const result = route.endsWith('/save') ? await applyLayout(server.config.root, body) : await previewLayout(server.config.root, body);
                    send(200, result);
                } catch (error) {
                    send(400, {
                        error: error.message
                    });
                }
            });
        }
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
try {
  const [command, input, ...extra] = process.argv.slice(2);
  if (!['preview','apply'].includes(command) || !input || extra.length) throw new Error('Usage: world-editor-save.mjs preview|apply <request.json>');
  const info = await lstat(input);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 32 * 1024 * 1024) throw new Error('Expected regular JSON file of at most 32 MiB');
  const payload = JSON.parse(await readFile(input,'utf8'));
  const root = fileURLToPath(new URL('..',import.meta.url));
  console.log(JSON.stringify(await (command === 'apply' ? applyLayout : previewLayout)(root,payload),null,2));
} catch (error) { console.error(`World editor: ${error.message}`); process.exitCode = 1; }

}
