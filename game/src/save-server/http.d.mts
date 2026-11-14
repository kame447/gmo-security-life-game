import type { AuthenticatedPrincipal } from '../save-api/server';
import type { HttpResponse } from '../save-api/contract';

export interface SaveHttpService {
  read(principal: AuthenticatedPrincipal, slot: string): Promise<HttpResponse>;
  write(principal: AuthenticatedPrincipal, slot: string, body: unknown): Promise<HttpResponse>;
}
/** Structural subset of node:http Server; avoids adding @types/node to the browser project. */
export interface SaveHttpServer {
  listen(port: number, host: string, callback: () => void): this;
  close(callback: (error?: Error) => void): this;
  closeAllConnections(): void;
  address(): { port: number; address: string; family: string } | string | null;
}
export interface SaveHttpServerOptions {
  service: SaveHttpService;
  verifyToken: (token: string) => Promise<{ sub: string }>;
  maxBodyBytes: number;
  healthPath?: string;
  /** Receive deadline in ms (positive integer). Default 5000; for tests to shorten. */
  receiveTimeoutMs?: number;
}
export function createSaveHttpServer(options: SaveHttpServerOptions): SaveHttpServer;
