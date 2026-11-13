import { runSaveServerEntry } from './runtime.mjs';
import { startSaveServer } from './startup';

/** Bundle for Node before executing; a trusted backend module must be explicitly configured. */
export const runningServer = await runSaveServerEntry(startSaveServer);
