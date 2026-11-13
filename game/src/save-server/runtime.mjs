import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readSaveServerConfig, SaveStartupError } from './config.mjs';

/** CLI adapter: import a deliberately named local factory; never auto-select a backend. */
export async function runSaveServerEntry(start, { environment = process.env,
  report = event => process.stderr.write(`${event}\n`), fail = () => { process.exitCode = 1; } } = {}) {
  try {
    const config = readSaveServerConfig(environment);
    const path = environment.SAVE_API_BACKEND_MODULE;
    if (typeof path !== 'string' || !isAbsolute(path) || !path.endsWith('.mjs') || /[\r\n\0]/.test(path)) {
      throw new SaveStartupError('INVALID_CONFIGURATION', ['SAVE_API_BACKEND_MODULE']);
    }
    let factory;
    try { factory = (await import(pathToFileURL(path).href)).createBackend; }
    catch { throw new SaveStartupError('BACKEND_MODULE_FAILED'); }
    if (typeof factory !== 'function') throw new SaveStartupError('BACKEND_MODULE_FAILED');
    const running = await start(config, factory);
    report('SAVE_API_STARTED');
    void running.closed.then(() => report('SAVE_API_STOPPED'), () => { report('STOP_FAILED'); fail(); });
    return running;
  } catch (error) {
    // Only this module's fixed, sanitized categories/field names reach the output.
    report(error instanceof SaveStartupError ? new SaveStartupError(error.code, error.fields).message : 'BACKEND_INITIALIZATION_FAILED');
    fail();
    return undefined;
  }
}
