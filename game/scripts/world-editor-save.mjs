import { fileURLToPath } from 'node:url';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
const MAX_BYTES = 32 * 1024 * 1024;
const FILE = 'data/world/areas/home-family-interior.json';
async function source(root) {
    const file = path.join(root, FILE), directory = path.dirname(file);
    if (await realpath(directory) !== directory) throw new Error('配置フォルダーにシンボリックリンクは使えません');
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error('配置ファイルが不正です');
    return {
        file,
        info,
        text: await readFile(file, 'utf8')
    };
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
    await source(root);
    const preview = await project(root, payload);
    return {
        target: preview.relativePath,
        summary: preview.summary
    };
}
export async function applyLayout(root, payload) {
    root = await realpath(root);
    const original = await source(root), lockPath = `${original.file}.lock`;
    const lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    const temporary = `${original.file}.${randomUUID()}.tmp`;
    let created = false;
    const unchanged = async ()=>{
        const current = await source(root);
        if (current.text !== original.text || current.info.ino !== original.info.ino || current.info.dev !== original.info.dev) throw new Error('ほかの編集で配置が変わりました。再読み込みしてください');
    };
    try {
        await unchanged();
        const preview = await project(root, payload);
        if (preview.relativePath !== FILE) throw new Error('保存先が不正です');
        await unchanged();
        if (preview.text !== original.text) {
            const file = await open(temporary, 'wx', original.info.mode & 0o777);
            created = true;
            try {
                await file.writeFile(preview.text);
                await file.sync();
            } finally{
                await file.close();
            }
            await unchanged();
            await rename(temporary, original.file);
            created = false;
        }
        return {
            target: preview.relativePath,
            summary: preview.summary,
            saved: true
        };
    } finally{
        if (created) await unlink(temporary).catch(()=>{});
        await lock.close();
        await unlink(lockPath);
    }
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
