import type { SaveHttpServer } from './http.mjs';
import type { SaveServerConfig } from './config.mjs';
export interface SignalSource {
  on(signal: 'SIGTERM' | 'SIGINT', callback: () => void): unknown;
  off(signal: 'SIGTERM' | 'SIGINT', callback: () => void): unknown;
}
export interface RunningSaveServer {
  readonly server: SaveHttpServer;
  readonly address: Readonly<{ host: string; port: number }>;
  readonly closed: Promise<void>;
  stop(): Promise<void>;
}
export function listenSaveServer(server: SaveHttpServer, config: SaveServerConfig, options?: {
  signals?: SignalSource;
  dispose?: () => void | Promise<void>;
}): Promise<RunningSaveServer>;
