import type { SaveServerConfig } from './config.mjs';
import type { RunningSaveServer } from './lifecycle.mjs';
import type { SaveBackendFactory } from './startup';
export function runSaveServerEntry(start: (config: SaveServerConfig, createBackend: SaveBackendFactory) => Promise<RunningSaveServer>,
  options?: {
    environment?: Readonly<Record<string, string | undefined>>;
    report?: (event: string) => unknown;
    fail?: () => void;
  }): Promise<RunningSaveServer | undefined>;
