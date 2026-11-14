import { errorResponse, MAX_SAVE_WIRE_BYTES, SaveError, type ApiErrorCode, type HttpResponse } from '../save-api/contract';
import { SaveService, type SaveStorage } from '../save-api/server';
import { createSaveHttpServer, type SaveHttpServer, type SaveHttpServerOptions, type SaveHttpService } from './http.mjs';

/** Request-local observation preserves driver read errors swallowed by the existing service. */
export function createSaveHttpService(storage: SaveStorage, now: () => string = () => new Date().toISOString()): SaveHttpService {
  const operation = async (run: (service: SaveService) => Promise<HttpResponse>): Promise<HttpResponse> => {
    let readProblem: ApiErrorCode | undefined;
    const observed: SaveStorage = {
      async read(key) {
        try { return await storage.read(key); }
        catch (error) {
          if (error instanceof SaveError && (error.code === 'CORRUPT_SAVE' || error.code === 'UNSUPPORTED_VERSION')) {
            readProblem = error.code;
          }
          throw error;
        }
      },
      compareAndSwap: (key, expected, next) => storage.compareAndSwap(key, expected, next),
    };
    const response = await run(new SaveService(observed, now));
    return response.status === 503 && readProblem ? errorResponse(readProblem) : response;
  };
  return {
    read: (principal, slot) => operation(service => service.read(principal, slot)),
    write: (principal, slot, body) => operation(service => service.write(principal, slot, body)),
  };
}

/** Construction only: no listen(), credentials, SDK, AWS calls or browser imports. */
export function createSaveServer(options: Omit<SaveHttpServerOptions, 'service' | 'maxBodyBytes'> & {
  storage: SaveStorage;
  now?: () => string;
}): SaveHttpServer {
  return createSaveHttpServer({ service: createSaveHttpService(options.storage, options.now),
    verifyToken: options.verifyToken, healthPath: options.healthPath, receiveTimeoutMs: options.receiveTimeoutMs, maxBodyBytes: MAX_SAVE_WIRE_BYTES });
}
