import type { SaveHttpServer } from '../src/save-server/http.mjs';
export const authConfig: { issuer: string; clientId: string; nowSeconds: number };
export interface TestSigner {
  jwks: { keys: Array<Record<string, unknown>> };
  token(claims?: Record<string, unknown>, header?: Record<string, unknown>): string;
}
export function signer(kid?: string): TestSigner;
export function listen(server: SaveHttpServer): Promise<string>;
export function close(server: SaveHttpServer): Promise<void>;
export function rawRequest(url: string, options?: {
  method?: string;
  headers?: Record<string, string | string[]> | string[];
  chunks?: Array<string | Uint8Array>;
  finish?: boolean;
}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: unknown }>;
