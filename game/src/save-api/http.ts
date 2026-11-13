import { errorResponse, jsonText, MAX_SAVE_WIRE_BYTES, parseWriteRequest, SaveError, slotId,
  type HttpResponse, type WriteSaveRequest } from './contract';
import type { SaveRemote } from './repository';

export type SaveHttpProblem = 'NETWORK' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'TOO_LARGE';
/** Transport failures carry no token, response text or game data. */
export class SaveHttpError extends Error {
  constructor(readonly problem: SaveHttpProblem) { super(problem); }
}
export interface HttpSaveRemoteOptions {
  /** Return the current Cognito ID token, without the Bearer prefix. No token is cached. */
  getToken: () => string | null | undefined | Promise<string | null | undefined>;
  fetch?: typeof globalThis.fetch;
  /** Covers token acquisition, fetch and the entire response body. Default: 5 seconds. */
  timeoutMs?: number;
}

/** Same-origin transport only; JWT verification and response DTO validation live elsewhere. */
export class HttpSaveRemote implements SaveRemote {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  constructor(private readonly options: HttpSaveRemoteOptions) {
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 5000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2 ** 31 - 1) {
      throw new SaveError('INVALID_REQUEST');
    }
  }
  async read(slot: string): Promise<HttpResponse> {
    if (!slotId(slot)) return errorResponse('INVALID_REQUEST');
    return this.request('GET', slot);
  }
  async write(slot: string, request: WriteSaveRequest): Promise<HttpResponse> {
    if (!slotId(slot)) return errorResponse('INVALID_REQUEST');
    let body: string;
    try { body = jsonText(parseWriteRequest(request), MAX_SAVE_WIRE_BYTES); }
    catch (error) { return errorResponse(error instanceof SaveError ? error.code : 'INVALID_REQUEST'); }
    // Snapshot before awaiting a token. Retries never invent a new idempotency key.
    return this.request('PUT', slot, body);
  }
  private async request(method: 'GET' | 'PUT', slot: string, payload?: string): Promise<HttpResponse> {
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let body: ReadableStream<Uint8Array> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      controller.abort();
      // Cancellation must not hold up a timeout, even if an injected stream ignores it.
      void (reader ? reader.cancel() : body?.cancel())?.catch(() => undefined);
    };
    const run = async (): Promise<HttpResponse> => {
      const token = await this.options.getToken();
      if (controller.signal.aborted) throw new SaveHttpError('TIMEOUT');
      if (typeof token !== 'string' || !/^[A-Za-z0-9._~+/-]+=*$/.test(token)) {
        return errorResponse('UNAUTHENTICATED');
      }
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`, Accept: 'application/json', 'Cache-Control': 'no-store',
        ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
      };
      const response = await this.fetcher(`/api/saves/${slot}`, {
        method, headers, cache: 'no-store', credentials: 'omit', mode: 'same-origin', redirect: 'error',
        signal: controller.signal, ...(payload === undefined ? {} : { body: payload }),
      });
      body = response.body;
      if (controller.signal.aborted) { cancel(); throw new SaveHttpError('TIMEOUT'); }
      if (response.status < 200 || response.status > 599 || !body) throw new SaveHttpError('INVALID_RESPONSE');
      const declared = response.headers.get('Content-Length');
      if (declared !== null && /^\d+$/.test(declared) && Number(declared) > MAX_SAVE_WIRE_BYTES) {
        throw new SaveHttpError('TOO_LARGE');
      }
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      reader = body.getReader();
      try {
        for (;;) {
          const chunk = await reader.read();
          if (controller.signal.aborted) throw new SaveHttpError('TIMEOUT');
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > MAX_SAVE_WIRE_BYTES) throw new SaveHttpError('TOO_LARGE');
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); reader = undefined; }
      const contents = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { contents.set(chunk, offset); offset += chunk.byteLength; }
      try {
        return { status: response.status, body: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(contents)) as unknown };
      } catch { throw new SaveHttpError('INVALID_RESPONSE'); }
    };
    try {
      return await Promise.race([
        Promise.resolve().then(run),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { cancel(); reject(new SaveHttpError('TIMEOUT')); }, this.timeoutMs);
        }),
      ]);
    } catch (error) {
      cancel();
      throw error instanceof SaveHttpError ? error : new SaveHttpError('NETWORK');
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
}
