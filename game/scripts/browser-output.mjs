import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

/** Honor explicit output locations, including the directory collected by Browser E2E CI. */
export function browserOutputDirectory(scriptName, env = process.env) {
  return resolve(env.SLG_OUTPUT || env.SLG_SHOTS || resolve(env.RUNNER_TEMP || tmpdir(), 'slg-e2e', scriptName));
}
