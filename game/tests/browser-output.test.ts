import { describe, expect, it, vi } from 'vitest';

// Load Node-facing scripts without adding Node declarations to the browser project's tsconfig.
const { browserOutputDirectory } = await vi.importActual<{
  browserOutputDirectory(scriptName: string, env?: Record<string, string | undefined>): string;
}>('../scripts/browser-output.mjs');
const { tmpdir } = await vi.importActual<{ tmpdir(): string }>('node:os');
const { join, resolve } = await vi.importActual<{
  join(...paths: string[]): string;
  resolve(...paths: string[]): string;
}>('node:path');
const { mkdir, mkdtemp, readFile, rm, writeFile } = await vi.importActual<{
  mkdir(path: string, options: { recursive: boolean }): Promise<unknown>;
  mkdtemp(prefix: string): Promise<string>;
  readFile(path: string, encoding: string): Promise<string>;
  rm(path: string, options: { recursive: boolean; force: boolean }): Promise<unknown>;
  writeFile(path: string, contents: string): Promise<unknown>;
}>('node:fs/promises');

describe('browser evidence output', () => {
  it('keeps an explicit SLG_OUTPUT ahead of CI and temporary defaults', () => {
    expect(browserOutputDirectory('crossing', {
      SLG_OUTPUT: 'review/crossing', SLG_SHOTS: 'ci/crossing', RUNNER_TEMP: 'runner',
    })).toBe(resolve('review/crossing'));
  });

  it('uses SLG_SHOTS exactly so the workflow uploads summaries and images together', () => {
    expect(browserOutputDirectory('station', { SLG_SHOTS: 'ci/station', RUNNER_TEMP: 'runner' }))
      .toBe(resolve('ci/station'));
  });

  it('places separate script directories inside RUNNER_TEMP when no output override is set', () => {
    expect(browserOutputDirectory('e2e-crossing-gates', { RUNNER_TEMP: 'runner' }))
      .toBe(resolve('runner', 'slg-e2e', 'e2e-crossing-gates'));
    expect(browserOutputDirectory('e2e-station-main-integration', { RUNNER_TEMP: 'runner' }))
      .toBe(resolve('runner', 'slg-e2e', 'e2e-station-main-integration'));
  });

  it('falls back to the operating system temporary directory, including empty overrides', () => {
    const expected = resolve(tmpdir(), 'slg-e2e', 'station');
    expect(browserOutputDirectory('station', {})).toBe(expected);
    expect(browserOutputDirectory('station', { SLG_OUTPUT: '', SLG_SHOTS: '', RUNNER_TEMP: '' })).toBe(expected);
  });

  it('can write both E2E summaries underneath a runner temporary directory', async () => {
    const runner = await mkdtemp(join(tmpdir(), 'slg-browser-output-'));
    try {
      for (const name of ['e2e-crossing-gates', 'e2e-station-main-integration']) {
        const output = browserOutputDirectory(name, { RUNNER_TEMP: runner });
        await mkdir(output, { recursive: true });
        const summary = join(output, 'summary.json');
        await writeFile(summary, JSON.stringify({ name, passed: true }));
        expect(JSON.parse(await readFile(summary, 'utf8'))).toEqual({ name, passed: true });
      }
    } finally { await rm(runner, { recursive: true, force: true }); }
  });
});
