import { afterEach, describe, expect, it, vi } from 'vitest';
import { FURNITURE_ASSETS, FURNITURE_BINDINGS, FURNITURE_URLS, furnitureAsset } from '../src/render/furniture-images/catalog';
import { decodePng, FurnitureImageLoader, type DecodedFurnitureImage, type FurnitureImageResult } from '../src/render/furniture-images/loader';
import { paintFurnitureImage } from '../src/render/furniture-images/paint';
import { createClassroom, createKonbini } from '../src/world/interiors';
import { build, createServer, preview } from 'vite';

// This browser-oriented project intentionally has no @types/node dependency.
// Runtime imports keep the temporary-fixture adapter out of the browser type surface.
async function fixtureTools() {
  const fsModule: string = 'node:fs/promises', osModule: string = 'node:os', pathModule: string = 'node:path';
  const fs = await import(/* @vite-ignore */ fsModule) as {
    mkdtemp(prefix: string): Promise<string>;
    mkdir(dir: string, options: { recursive: boolean }): Promise<unknown>;
    copyFile(from: string, to: string): Promise<void>;
    writeFile(file: string, data: string | Uint8Array): Promise<void>;
    readdir(dir: string): Promise<string[]>;
    readFile(file: string): Promise<Uint8Array>;
    rm(dir: string, options: { recursive: boolean; force: boolean }): Promise<void>;
  };
  const os = await import(/* @vite-ignore */ osModule) as { tmpdir(): string };
  const path = await import(/* @vite-ignore */ pathModule) as {
    join(...parts: string[]): string; resolve(...parts: string[]): string;
    relative(from: string, to: string): string; sep: string;
  };
  return { ...fs, ...os, path };
}

const asset = FURNITURE_ASSETS[0];
const image: DecodedFurnitureImage = { source: {} as CanvasImageSource, width: 16, height: 16 };
const urls = { [asset.file]: '/assets/student-desk.png' };
afterEach(() => vi.unstubAllGlobals());

describe('furniture asset catalog', () => {
  it('binds all 21 supplied school PNG props; rebuilt konbini furnishings remain procedural', () => {
    const school = createClassroom().objects;
    const konbini = createKonbini().objects;
    expect(Object.keys(FURNITURE_BINDINGS)).toHaveLength(21);
    expect(FURNITURE_ASSETS).toHaveLength(5);
    for (const object of school) {
      const before = { ...object };
      expect(furnitureAsset(object), object.id).toBeDefined();
      expect(object).toEqual(before);
    }
    for (const object of konbini) {
      const before = { ...object };
      expect(furnitureAsset(object), object.id).toBeUndefined();
      expect(object).toEqual(before);
    }
    expect(new Set(FURNITURE_ASSETS.map(a => a.id)).size).toBe(FURNITURE_ASSETS.length);
    expect(new Set(FURNITURE_ASSETS.map(a => a.file)).size).toBe(FURNITURE_ASSETS.length);
  });
  it('does not assign artwork to unknown IDs or changed footprints', () => {
    expect(furnitureAsset({ id: 'home-family-interior-shelf-1-10', w: 2, h: 1 })).toBeUndefined();
    expect(furnitureAsset({ w: 1, h: 1 })).toBeUndefined();
    expect(furnitureAsset({ id: 'school-classroom-interior-sdesk-2-4', w: 2, h: 1 })).toBeUndefined();
  });
  it('allows absent PNGs without fabricated URLs', async () => {
    const decode = vi.fn();
    const loader = new FurnitureImageLoader(decode);
    expect(await loader.load(asset, {})).toEqual({ status: 'unavailable', reason: 'missing' });
    expect(decode).not.toHaveBeenCalled();
    for (const [file, url] of Object.entries(FURNITURE_URLS)) {
      expect(file).toMatch(/\.png$/);
      expect(typeof url).toBe('string');
    }
  });
});

describe('shared image loader', () => {
  it('shares pending and completed loads by URL, even across asset IDs', async () => {
    let finish!: (value: DecodedFurnitureImage) => void;
    const decode = vi.fn(() => new Promise<DecodedFurnitureImage>(resolve => { finish = resolve; }));
    const loader = new FurnitureImageLoader(decode);
    const first = loader.load(asset, urls);
    const second = loader.load({ ...asset, id: 'another-desk', file: 'alias.png' }, { 'alias.png': urls[asset.file] });
    await Promise.resolve();
    expect(decode).toHaveBeenCalledTimes(1);
    finish(image);
    expect(await first).toEqual({ status: 'ready', image });
    expect(await second).toEqual(await first);
    await loader.load(asset, urls);
    expect(decode).toHaveBeenCalledTimes(1);
  });
  it.each(['HTTP 404', 'broken PNG', 'decode failed'])('caches failure: %s', async error => {
    const decode = vi.fn().mockRejectedValue(new Error(error));
    const loader = new FurnitureImageLoader(decode);
    for (let i = 0; i < 2; i++) expect(await loader.load(asset, urls)).toEqual({ status: 'unavailable', reason: 'load' });
    expect(decode).toHaveBeenCalledTimes(1);
  });
  it('handles a synchronous decoder exception', async () => {
    const loader = new FurnitureImageLoader(() => { throw new Error('no DOM'); });
    expect(await loader.load(asset, urls)).toEqual({ status: 'unavailable', reason: 'load' });
  });
  it('validates dimensions per request without poisoning a shared decode', async () => {
    const decode = vi.fn().mockResolvedValue(image);
    const loader = new FurnitureImageLoader(decode);
    for (const dimensions of [{ width: 32 }, { height: 32 }, { width: 0 }, { width: NaN }]) {
      expect(await loader.load({ ...asset, ...dimensions }, urls)).toEqual({ status: 'unavailable', reason: 'dimensions' });
    }
    expect(await loader.load(asset, urls)).toEqual({ status: 'ready', image });
    expect(decode).toHaveBeenCalledTimes(1);
  });
});

describe('browser PNG decoder', () => {
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function browser(bytes = png, failure = false) {
    const decode = vi.fn(async () => { if (failure) throw new Error('decode failed'); });
    const revoke = vi.fn();
    const create = vi.fn(() => 'blob:fixture');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes.buffer })));
    vi.stubGlobal('Image', class { src = ''; naturalWidth = 16; naturalHeight = 16; decode = decode; });
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    return { decode, revoke, create };
  }
  it('awaits decoding, reports intrinsic size and releases its blob URL', async () => {
    const { decode, revoke } = browser();
    expect(await decodePng('/desk.png')).toMatchObject({ width: 16, height: 16, source: { src: 'blob:fixture' } });
    expect(decode).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:fixture');
  });
  it('releases blob URLs after decoding fails', async () => {
    const { revoke } = browser(png, true);
    await expect(decodePng('/broken.png')).rejects.toThrow('decode failed');
    expect(revoke).toHaveBeenCalledWith('blob:fixture');
  });
  it('rejects non-PNG content before constructing an image', async () => {
    const { create, decode } = browser(Uint8Array.from([60, 104, 116, 109, 108]));
    await expect(decodePng('/not-found.png')).rejects.toThrow('Not a PNG');
    expect(create).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
  });
  it('rejects HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(decodePng('/missing.png')).rejects.toThrow('404');
  });
});

describe('safe canvas replacement', () => {
  // Store actual bytes so transparent replacement and rollback are observable.
  function canvas(initial: number) {
    let pixels = Uint8ClampedArray.from([initial, 0, 0, initial]);
    const context = {
      imageSmoothingEnabled: true,
      save: vi.fn(), restore: vi.fn(),
      drawImage: vi.fn(() => { pixels = Uint8ClampedArray.from([0, 0, 0, 0]); }),
      getImageData: vi.fn(() => ({ data: pixels.slice() } as ImageData)),
      putImageData: vi.fn((data: ImageData) => { pixels = data.data.slice(); }),
    };
    return { target: { width: 16, height: 16, getContext: () => context } as unknown as HTMLCanvasElement,
      context, pixels: () => [...pixels] };
  }
  const ready: FurnitureImageResult = { status: 'ready', image };
  it('replaces transparent pixels, preserves the canvas and disables interpolation on staging', () => {
    const live = canvas(255), stage = canvas(0);
    expect(paintFurnitureImage(live.target, ready, () => stage.target)).toBe(true);
    expect(live.pixels()).toEqual([0, 0, 0, 0]);
    expect(stage.context.imageSmoothingEnabled).toBe(false);
    expect(live.target.width).toBe(16);
    expect(live.context.save).toHaveBeenCalledTimes(1);
    expect(live.context.restore).toHaveBeenCalledTimes(1);
  });
  it.each(['missing', 'load', 'dimensions'] as const)('does not touch fallback for %s', reason => {
    const live = canvas(255), factory = vi.fn();
    expect(paintFurnitureImage(live.target, { status: 'unavailable', reason }, factory)).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect(live.pixels()).toEqual([255, 0, 0, 255]);
  });
  it('rejects target size mismatch before drawing', () => {
    const live = canvas(255); live.target.width = 32;
    expect(paintFurnitureImage(live.target, ready, vi.fn())).toBe(false);
    expect(live.pixels()).toEqual([255, 0, 0, 255]);
  });
  it.each(['drawImage', 'getImageData'] as const)('retains fallback when staging %s fails', method => {
    const live = canvas(255), stage = canvas(0);
    stage.context[method].mockImplementationOnce(() => { throw new Error('staging failed'); });
    expect(paintFurnitureImage(live.target, ready, () => stage.target)).toBe(false);
    expect(live.context.putImageData).not.toHaveBeenCalled();
    expect(live.pixels()).toEqual([255, 0, 0, 255]);
  });
  it('restores the fallback if the commit fails after overwriting pixels', () => {
    const live = canvas(255), stage = canvas(0);
    const put = live.context.putImageData.getMockImplementation()!;
    live.context.putImageData.mockImplementationOnce(data => { put(data); throw new Error('commit failed'); });
    expect(paintFurnitureImage(live.target, ready, () => stage.target)).toBe(false);
    expect(live.pixels()).toEqual([255, 0, 0, 255]);
    expect(live.context.restore).toHaveBeenCalledTimes(1);
  });
  it('retains fallback if staging or live canvas has no context', () => {
    const live = canvas(255);
    const empty = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(paintFurnitureImage(live.target, ready, () => empty)).toBe(false);
    expect(paintFurnitureImage({ ...live.target, getContext: () => null } as HTMLCanvasElement, ready, () => canvas(0).target)).toBe(false);
    expect(live.pixels()).toEqual([255, 0, 0, 255]);
  });
});

describe('Vite assets outside game root', () => {
  it.each([false, true])('serves and builds the production catalog (PNG supplied: %s)', async supplied => {
    const { mkdtemp, mkdir, copyFile, writeFile, readdir, readFile, rm, tmpdir, path } = await fixtureTools();
    // Isolated repository layout: never create a fixture inside the real assets/.
    const fixture = await mkdtemp(path.join(tmpdir(), 'slg-furniture-'));
    const root = path.join(fixture, 'game');
    const moduleDir = path.join(root, 'src/render/furniture-images');
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII='), c => c.charCodeAt(0));
    try {
      await mkdir(moduleDir, { recursive: true });
      await mkdir(path.join(root, 'src/core'), { recursive: true });
      await copyFile('src/render/furniture-images/catalog.ts', path.join(moduleDir, 'catalog.ts'));
      await copyFile('src/core/coords.ts', path.join(root, 'src/core/coords.ts'));
      // Force ESM for temporary fixtures even on hosts with a different package ancestry.
      await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
      if (supplied) {
        const dir = path.join(fixture, 'assets/images/objects/props/interiors/school');
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, 'student-desk.png'), png);
      }
      const config = { root, configFile: false as const, base: './', logLevel: 'silent' as const };
      const server = await createServer({ ...config, server: { host: '127.0.0.1', port: 0 } });
      try {
        await server.listen();
        await server.transformRequest('/src/render/furniture-images/catalog.ts');
        const module = await server.ssrLoadModule('/src/render/furniture-images/catalog.ts');
        const urls = module.FURNITURE_URLS as Record<string, string>;
        expect(Object.keys(urls)).toHaveLength(supplied ? 1 : 0);
        if (supplied) {
          const response = await fetch(new URL(urls[asset.file], server.resolvedUrls!.local[0]));
          expect(response.status).toBe(200);
          expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
        }
      } finally { await server.close(); }
      await build({ ...config, build: { minify: false, rollupOptions: {
        input: path.join(moduleDir, 'catalog.ts'), preserveEntrySignatures: 'strict',
      } } });
      const dir = path.join(root, 'dist/assets');
      const files = await readdir(dir);
      const images = files.filter(file => file.endsWith('.png'));
      expect(images).toHaveLength(supplied ? 1 : 0);
      if (supplied) {
        expect(new Uint8Array(await readFile(path.join(dir, images[0])))).toEqual(png);
        const serving = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
        try {
          const response = await fetch(new URL(`assets/${images[0]}`, serving.resolvedUrls!.local[0]));
          expect(response.status).toBe(200);
          expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
        } finally { await new Promise<void>((resolve, reject) => serving.httpServer.close((error?: Error | null) => error ? reject(error) : resolve())); }
      }
    } finally {
      // Only remove the exact mkdtemp child, checked against the intended temp directory.
      const relative = path.relative(path.resolve(tmpdir()), path.resolve(fixture));
      if (!relative.startsWith('slg-furniture-') || relative.includes(path.sep)) throw new Error('Unsafe fixture cleanup');
      await rm(fixture, { recursive: true, force: true });
    }
  }, 30000);
});
