import { createServer } from 'node:http';
import { IdTokenError } from './jwt.mjs';

const failure = (status, code) => ({ status, body: { error: { code } } });
const RECEIVE_TIMEOUT_MS = 5000;
class BodyError extends Error {
  constructor(status, code) { super(code); this.response = failure(status, code); }
}
function readJson(request, limit) {
  const length = request.headers['content-length'];
  if (length !== undefined && Number(length) > limit) throw new BodyError(413, 'TOO_LARGE');
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] ?? '') ||
      (request.headers['content-encoding'] !== undefined && request.headers['content-encoding'] !== 'identity')) {
    throw new BodyError(400, 'INVALID_REQUEST');
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    const cleanup = () => {
      request.off('data', data); request.off('end', end); request.off('error', error); request.off('aborted', aborted);
    };
    const fail = problem => { cleanup(); request.pause(); reject(problem); };
    const error = () => fail(new BodyError(400, 'INVALID_REQUEST'));
    const aborted = () => error();
    const data = chunk => {
      bytes += chunk.length;
      if (bytes > limit) { fail(new BodyError(413, 'TOO_LARGE')); return; }
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try { resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes)))); }
      catch { reject(new BodyError(400, 'INVALID_REQUEST')); }
    };
    request.on('data', data); request.once('end', end); request.once('error', error); request.once('aborted', aborted);
  });
}

/** Node-only transport; service and signature verification are supplied by the caller. */
export function createSaveHttpServer({ service, verifyToken, maxBodyBytes, healthPath = '/api/health' }) {
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1 || !/^\/api\/[a-z0-9/_-]+$/.test(healthPath)) {
    throw new Error('INVALID_SERVER_CONFIGURATION');
  }
  const server = createServer({ requestTimeout: RECEIVE_TIMEOUT_MS, headersTimeout: RECEIVE_TIMEOUT_MS, connectionsCheckingInterval: 1000 }, (request, response) => {
    const reply = (result, headers = {}) => {
      if (response.destroyed || response.writableEnded) return;
      // Do not keep an unread/oversized body alive on this connection.
      if (!request.complete) { request.pause(); response.setHeader('Connection', 'close'); }
      response.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store', ...headers });
      response.end(JSON.stringify(result.body));
    };
    // Node stops its connection-checking interval when server.close() starts. Keep
    // the same body receive budget alive for active requests during that drain.
    const receiveDeadline = setTimeout(() => {
      if (!request.complete && !request.destroyed) reply(failure(400, 'INVALID_REQUEST'));
    }, RECEIVE_TIMEOUT_MS);
    receiveDeadline.unref();
    const clearReceiveDeadline = () => clearTimeout(receiveDeadline);
    request.once('end', clearReceiveDeadline);
    request.once('close', clearReceiveDeadline);
    response.once('close', clearReceiveDeadline);
    const handle = async () => {
      // Compare the raw path, without URL dot-segment normalization or trusting Host.
      const path = (request.url ?? '').split('?')[0];
      if (path === healthPath) {
        reply(request.method === 'GET' ? { status: 200, body: { ok: true } } : failure(405, 'METHOD_NOT_ALLOWED'),
          request.method === 'GET' ? {} : { Allow: 'GET' });
        return;
      }
      const match = /^\/api\/saves\/([^/]+)$/.exec(path);
      if (!match) { reply(failure(404, 'NOT_FOUND')); return; }
      if (request.method !== 'GET' && request.method !== 'PUT') {
        reply(failure(405, 'METHOD_NOT_ALLOWED'), { Allow: 'GET, PUT' }); return;
      }
      // Duplicate Authorization fields must not be silently reduced to the first value.
      let count = 0;
      for (let i = 0; i < request.rawHeaders.length; i += 2) {
        if (request.rawHeaders[i].toLowerCase() === 'authorization') count++;
      }
      const authorization = request.headers.authorization;
      const bearer = typeof authorization === 'string' && /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization);
      if (count !== 1 || !bearer) { reply(failure(401, 'UNAUTHENTICATED')); return; }
      let principal;
      try { principal = await verifyToken(bearer[1]); }
      catch (error) {
        reply(error instanceof IdTokenError && error.code === 'UNAUTHENTICATED' ?
          failure(401, 'UNAUTHENTICATED') : failure(503, 'UNAVAILABLE')); return;
      }
      if (request.destroyed) return;
      // Never pass other JWT claims or request fields as authorization flags.
      const subject = { sub: principal.sub };
      const result = request.method === 'GET' ? await service.read(subject, match[1]) :
        await service.write(subject, match[1], await readJson(request, maxBodyBytes));
      reply(result);
    };
    void handle().catch(error => reply(error instanceof BodyError ? error.response : failure(503, 'UNAVAILABLE')));
  });
  server.on('clientError', (error, socket) => {
    if (!socket.writable) return;
    const status = error.code === 'HPE_HEADER_OVERFLOW' ? 431 : 400;
    const body = JSON.stringify({ error: { code: 'INVALID_REQUEST' } });
    socket.end(`HTTP/1.1 ${status} ${status === 431 ? 'Request Header Fields Too Large' : 'Bad Request'}\r\n` +
      `Connection: close\r\nCache-Control: no-store\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  });
  return server;
}
