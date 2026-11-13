import type { SaveStorage } from '../save-api/server';
import { DynamoSaveStorage, type DynamoSaveClient } from '../save-api/dynamodb';
import { SaveStartupError, type SaveServerConfig } from './config.mjs';
import { createCognitoIdTokenVerifier } from './jwt.mjs';
import { listenSaveServer, type RunningSaveServer, type SignalSource } from './lifecycle.mjs';
import { createSaveServer } from './service';

/** A trusted deployment module supplies clients and owns their configuration/credentials. */
export interface SaveServerBackend {
  storage: SaveStorage;
  getJwks: () => unknown | Promise<unknown>;
  /** Runs after in-flight requests finish, or after a listen/initialization failure. */
  close?: () => void | Promise<void>;
}
export interface SaveBackendDrivers {
  /** Use the entry's driver so typed storage errors share the service's module identity. */
  createDynamoStorage(client: DynamoSaveClient): SaveStorage;
}
export type SaveBackendFactory = (config: SaveServerConfig, drivers: SaveBackendDrivers) => SaveServerBackend | Promise<SaveServerBackend>;

/** No SDK or memory fallback: both storage and trusted key acquisition must be explicit. */
export async function startSaveServer(config: SaveServerConfig, createBackend: SaveBackendFactory,
  options: { signals?: SignalSource } = {}): Promise<RunningSaveServer> {
  let backend: SaveServerBackend | undefined;
  try {
    if (typeof createBackend !== 'function') throw new SaveStartupError('BACKEND_INITIALIZATION_FAILED');
    backend = await createBackend(config, Object.freeze({
      createDynamoStorage: (client: DynamoSaveClient) => new DynamoSaveStorage(client, config.tableName),
    }));
    if (!backend || typeof backend.storage?.read !== 'function' || typeof backend.storage.compareAndSwap !== 'function' ||
        typeof backend.getJwks !== 'function' || (backend.close !== undefined && typeof backend.close !== 'function')) {
      throw new SaveStartupError('BACKEND_INITIALIZATION_FAILED');
    }
    const owned = backend;
    const verifyToken = createCognitoIdTokenVerifier({ issuer: config.issuer, clientId: config.clientId,
      getJwks: () => owned.getJwks() });
    const server = createSaveServer({ storage: owned.storage, verifyToken, healthPath: config.healthPath });
    return await listenSaveServer(server, config, { signals: options.signals, dispose: () => owned.close?.() });
  } catch (error) {
    try { await backend?.close?.(); } catch { /* Never expose a provider's error text. */ }
    throw error instanceof SaveStartupError ? error : new SaveStartupError('BACKEND_INITIALIZATION_FAILED');
  }
}
