import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ObjectDef } from '../src/core/types';
import { objectRotationRule, rotatedObjectVariant } from '../src/render/furniture/rotation';
import { objectSprite } from '../src/render/sprites';
import {
  storeFurnishingSprite,
  storeRotationRule,
} from '../src/render/stores';
import {
  effectiveObjectFacing,
  FOOD_STORE_ROTATION_ENTRIES,
  STORE_ROTATE_ALL_RULE,
  STORE_RUG_RULE,
  STORE_SIDE_AND_FRONT_RULE,
  STORE_WALL_SIDE_REASON,
} from '../src/render/stores/rotation';
import { AREA_FACTORIES, buildWorld } from '../src/world';
import { initialLayout, layoutArea, parseAreaLayout } from '../src/world/layouts/codec';
import { toRuntime } from '../src/world/runtime';
import { WorldEditorModel } from '../src/world-editor/model';
import { prepareSave } from '../src/world-editor/persistence';
import { assertInteriorEdit } from '../src/world-editor/policy';

class Canvas {
  width = 320;
  height = 240;
  pixels: string[] = [];
  readonly context = new Context(this);
  getContext() {
    return this.context;
  }
  data(): string[] {
    const size = this.width * this.height;
    if (this.pixels.length !== size) {
      this.pixels = new Array<string>(size).fill('');
    }
    return this.pixels;
  }
}

class Context {
  fillStyle = '#000000';
  imageSmoothingEnabled = true;
  constructor(private readonly canvas: Canvas) {}
  clearRect(x: number, y: number, w: number, h: number) {
    this.paint(x, y, w, h, '');
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.paint(x, y, w, h, this.fillStyle);
  }
  private paint(x: number, y: number, w: number, h: number, color: string) {
    const data = this.canvas.data();
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.canvas.width, Math.floor(x + w));
    const y1 = Math.min(this.canvas.height, Math.floor(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        data[py * this.canvas.width + px] = color;
      }
    }
  }
}

const raster = (canvas: HTMLCanvasElement): string[] => (canvas as unknown as Canvas).data();

interface FixtureSpec {
  kind: string;
  w: number;
  h: number;
  style?: string;
}

const DIRECTIONAL_FIXTURES: readonly FixtureSpec[] = [
  // Bakery
  { kind: 'bakery-bread-rack', w: 2, h: 1 },
  { kind: 'bakery-bread-rack', w: 2, h: 1, style: 'loaves' },
  { kind: 'bakery-pastry-table', w: 2, h: 1 },
  { kind: 'bakery-pastry-table', w: 3, h: 1, style: 'baguettes' },
  { kind: 'bakery-tray-stand', w: 2, h: 1 },
  { kind: 'bakery-counter', w: 2, h: 1 },
  { kind: 'bakery-counter', w: 2, h: 1, style: 'side' },
  // Greengrocer
  { kind: 'greengrocer-produce-stand', w: 4, h: 1 },
  { kind: 'greengrocer-produce-stand', w: 3, h: 2, style: 'roots' },
  { kind: 'greengrocer-fruit-table', w: 3, h: 1 },
  { kind: 'greengrocer-basket-rack', w: 2, h: 1 },
  { kind: 'greengrocer-chill-case', w: 2, h: 1 },
  { kind: 'greengrocer-counter', w: 2, h: 1 },
  // Cafe (cafe-plant is Type C1, tested separately)
  { kind: 'cafe-brew-bar', w: 4, h: 1 },
  { kind: 'cafe-counter', w: 2, h: 1 },
  { kind: 'cafe-counter', w: 2, h: 1, style: 'side' },
  { kind: 'cafe-table', w: 2, h: 1, style: 'coffee-cake' },
  { kind: 'cafe-table', w: 2, h: 1, style: 'morning-toast' },
  { kind: 'cafe-table', w: 2, h: 1, style: 'teapot' },
  { kind: 'cafe-table', w: 2, h: 1, style: 'soda' },
  { kind: 'cafe-chair', w: 1, h: 1 },
  { kind: 'cafe-sofa', w: 3, h: 1 },
  { kind: 'cafe-menu-board', w: 1, h: 1 },
  // Konbini
  { kind: 'konbini-cooler', w: 3, h: 1 },
  { kind: 'konbini-cooler', w: 3, h: 1, style: 'chilled-food' },
  { kind: 'konbini-magazine', w: 3, h: 1 },
  { kind: 'konbini-snack-shelf', w: 2, h: 1 },
  { kind: 'konbini-snack-shelf', w: 3, h: 2 },
  { kind: 'konbini-food-shelf', w: 2, h: 1 },
  { kind: 'konbini-food-shelf', w: 3, h: 2 },
  { kind: 'konbini-daily-shelf', w: 2, h: 1 },
  { kind: 'konbini-daily-shelf', w: 3, h: 2 },
  { kind: 'konbini-ice-freezer', w: 2, h: 1 },
  { kind: 'konbini-counter', w: 2, h: 1 },
  { kind: 'konbini-counter', w: 2, h: 1, style: 'side' },
];

const C2_GLASS_CASES: readonly FixtureSpec[] = [
  { kind: 'bakery-showcase', w: 2, h: 1 },
  { kind: 'bakery-showcase', w: 3, h: 2 },
  { kind: 'cafe-cake-case', w: 3, h: 1 },
];

describe('food-store fixtures & shop-rug rotation (Step 2)', () => {
  beforeAll(() => vi.stubGlobal('document', { createElement: () => new Canvas() }));
  afterAll(() => vi.unstubAllGlobals());

  it('registers all 27 food-store kinds and shop-rug with expected Type A / B / C1 / C2 / rug policies', () => {
    expect(FOOD_STORE_ROTATION_ENTRIES).toHaveLength(27);
    expect(storeRotationRule('bakery-oven')).toBe(STORE_SIDE_AND_FRONT_RULE);
    expect(storeRotationRule('shop-rug')).toBe(STORE_RUG_RULE);

    for (const [kind, rule] of FOOD_STORE_ROTATION_ENTRIES) {
      expect(objectRotationRule({ kind })).toEqual(rule);
      if (kind !== 'bakery-oven' && kind !== 'shop-rug') {
        expect(rule, `${kind} should use STORE_ROTATE_ALL_RULE`).toBe(STORE_ROTATE_ALL_RULE);
      }
    }
  });

  it('renders distinct sprites across all 4 facings and preserves oy & style for Type A and C2 fixtures', () => {
    for (const spec of DIRECTIONAL_FIXTURES) {
      const base: ObjectDef = {
        kind: spec.kind,
        x: 0,
        y: 0,
        w: spec.w,
        h: spec.h,
        solid: true,
        ...(spec.style ? { style: spec.style } : {}),
      };
      const tag = `${spec.kind}:${spec.style ?? ''}(${spec.w}x${spec.h})`;
      const down = storeFurnishingSprite({ ...base, facing: 'down' })!;
      const up = storeFurnishingSprite({ ...base, facing: 'up' })!;
      const left = storeFurnishingSprite({ ...base, facing: 'left', w: spec.h, h: spec.w })!;
      const right = storeFurnishingSprite({ ...base, facing: 'right', w: spec.h, h: spec.w })!;

      expect(down, `${tag} down`).not.toBeNull();
      expect(up, `${tag} up`).not.toBeNull();
      expect(left, `${tag} left`).not.toBeNull();
      expect(right, `${tag} right`).not.toBeNull();

      expect(up.oy, `${tag} up oy`).toBe(down.oy);
      expect(left.oy, `${tag} left oy`).toBe(down.oy);
      expect(right.oy, `${tag} right oy`).toBe(down.oy);

      expect(down.canvas.width, `${tag} down width`).toBe(spec.w * 16);
      expect(left.canvas.width, `${tag} left width`).toBe(spec.h * 16);
      expect(left.canvas.height - left.oy === down.canvas.height - down.oy || spec.h !== spec.w, tag).toBeTruthy();

      expect(raster(up.canvas), `${tag} up vs down`).not.toEqual(raster(down.canvas));
      expect(raster(right.canvas), `${tag} right vs left`).not.toEqual(raster(left.canvas));

      // Also verify objectSprite cache distinguishes down vs up for identical dimensions
      const cachedDown = objectSprite({ ...base, facing: 'down' });
      const cachedUp = objectSprite({ ...base, facing: 'up' });
      expect(cachedUp, `${tag} cache up != down`).not.toBe(cachedDown);
    }
  });

  it('renders C2 glass showcases with up == down and right == left pixel-for-pixel', () => {
    for (const spec of C2_GLASS_CASES) {
      const base: ObjectDef = {
        kind: spec.kind,
        x: 0,
        y: 0,
        w: spec.w,
        h: spec.h,
        solid: true,
      };
      const tag = `${spec.kind}(${spec.w}x${spec.h})`;
      const down = storeFurnishingSprite({ ...base, facing: 'down' })!;
      const up = storeFurnishingSprite({ ...base, facing: 'up' })!;
      const left = storeFurnishingSprite({ ...base, facing: 'left', w: spec.h, h: spec.w })!;
      const right = storeFurnishingSprite({ ...base, facing: 'right', w: spec.h, h: spec.w })!;

      expect(down, `${tag} down`).not.toBeNull();
      expect(up, `${tag} up`).not.toBeNull();
      expect(left, `${tag} left`).not.toBeNull();
      expect(right, `${tag} right`).not.toBeNull();

      expect(up.oy, `${tag} up oy`).toBe(down.oy);
      expect(left.oy, `${tag} left oy`).toBe(down.oy);
      expect(right.oy, `${tag} right oy`).toBe(down.oy);

      expect(down.canvas.width, `${tag} down width`).toBe(spec.w * 16);
      expect(up.canvas.width, `${tag} up width`).toBe(spec.w * 16);
      expect(left.canvas.width, `${tag} left width`).toBe(spec.h * 16);
      expect(right.canvas.width, `${tag} right width`).toBe(spec.h * 16);

      expect(raster(up.canvas), `${tag} up == down`).toEqual(raster(down.canvas));
      expect(raster(right.canvas), `${tag} right == left`).toEqual(raster(left.canvas));
      expect(raster(left.canvas), `${tag} left != down`).not.toEqual(raster(down.canvas));

      // Verify objectSprite cache matches direct sprites for all 4 facings
      expect(raster(objectSprite({ ...base, facing: 'up' }).canvas)).toEqual(raster(objectSprite({ ...base, facing: 'down' }).canvas));
      expect(raster(objectSprite({ ...base, facing: 'right', w: spec.h, h: spec.w }).canvas)).toEqual(
        raster(objectSprite({ ...base, facing: 'left', w: spec.h, h: spec.w }).canvas),
      );
    }
  });

  it('keeps cafe-plant visually identical across all 4 facings (Type C1) and handles bakery-oven Type B policy', () => {
    const plantBase: ObjectDef = { kind: 'cafe-plant', x: 0, y: 0, w: 1, h: 1, solid: true };
    const plantPixels = (['down', 'left', 'up', 'right'] as const).map((facing) =>
      raster(storeFurnishingSprite({ ...plantBase, facing })!.canvas),
    );
    expect(plantPixels[1]).toEqual(plantPixels[0]);
    expect(plantPixels[2]).toEqual(plantPixels[0]);
    expect(plantPixels[3]).toEqual(plantPixels[0]);

    const ovenBase: ObjectDef = { kind: 'bakery-oven', x: 1, y: 1, w: 3, h: 1, solid: true };
    const ovenDown = storeFurnishingSprite({ ...ovenBase, facing: 'down' })!;
    const ovenLeft = storeFurnishingSprite({ ...ovenBase, facing: 'left', w: 1, h: 3 })!;
    const ovenRight = storeFurnishingSprite({ ...ovenBase, facing: 'right', w: 1, h: 3 })!;
    expect(ovenLeft.oy).toBe(ovenDown.oy);
    expect(ovenRight.oy).toBe(ovenDown.oy);
    expect(raster(ovenRight.canvas)).not.toEqual(raster(ovenLeft.canvas));

    // Type B rotation cycle: down -> left -> right -> down; 'up' rejected
    const v1 = rotatedObjectVariant(ovenBase)!;
    expect(v1).toEqual({ facing: 'left', w: 1, h: 3 });
    const v2 = rotatedObjectVariant({ ...ovenBase, ...v1 })!;
    expect(v2).toEqual({ facing: 'right', w: 1, h: 3 });
    const v3 = rotatedObjectVariant({ ...ovenBase, ...v2 })!;
    expect(v3).toEqual({ facing: 'down', w: 3, h: 1 });
  });

  it('enforces bakery-oven Type B rejection and preserves style across food stores in WorldEditorModel', () => {
    const world = buildWorld();
    const model = new WorldEditorModel(world);
    const oven = model.document.objects.find((o) => o.areaId === 'shop-bakery-interior' && o.kind === 'bakery-oven')!;
    expect(oven).toBeDefined();

    const invalidDoc = structuredClone(model.document);
    const target = invalidDoc.objects.find((o) => o.id === oven.id && o.areaId === 'shop-bakery-interior')!;
    target.facing = 'up';
    expect(() => assertInteriorEdit(model.document, invalidDoc, 'shop-bakery-interior')).toThrow(STORE_WALL_SIDE_REASON);

    const snackShelf = model.document.objects.find(
      (o) => o.areaId === 'shop-konbini-interior' && o.kind === 'konbini-snack-shelf',
    )!;
    model.rotate(snackShelf.id, 'shop-konbini-interior');
    const rotated = model.object(snackShelf.id, undefined, 'shop-konbini-interior')!;
    expect(rotated.facing).toBe('left');
    expect(rotated.w).toBe(snackShelf.h);
    expect(rotated.h).toBe(snackShelf.w);
    expect(rotated.id).toBe(snackShelf.id);
    expect(rotated.style).toBe(snackShelf.style);
  });

  it('rotates shop-rug between down and left with swapped dimensions across styles', () => {
    for (const style of ['bakery', 'bookstore', 'cafe', 'greengrocer', 'candy', 'pharmacy', 'konbini']) {
      const rugDown: ObjectDef = { kind: 'shop-rug', style, x: 0, y: 0, w: 4, h: 1, solid: false, layer: 'decal' };
      const next = rotatedObjectVariant(rugDown)!;
      expect(next, style).toEqual({ facing: 'left', w: 1, h: 4 });
      const back = rotatedObjectVariant({ ...rugDown, ...next })!;
      expect(back, style).toEqual({ facing: 'down', w: 4, h: 1 });

      const sDown = storeFurnishingSprite(rugDown)!;
      const sLeft = storeFurnishingSprite({ ...rugDown, ...next })!;
      expect(sDown.canvas.width).toBe(64);
      expect(sDown.canvas.height).toBe(16);
      expect(sLeft.canvas.width).toBe(16);
      expect(sLeft.canvas.height).toBe(64);
      expect(raster(sLeft.canvas)).not.toEqual(raster(sDown.canvas));
    }
  });
});

describe('cafe-chair facing migration and #23 JSON roundtrip (Step 3)', () => {
  beforeAll(() => vi.stubGlobal('document', { createElement: () => new Canvas() }));
  afterAll(() => vi.unstubAllGlobals());

  it('uses facing on all 8 cafe chairs in shop-cafe-interior while matching legacy style visuals pixel-for-pixel', () => {
    const world = buildWorld();
    const cafeDef = world.areas.get('shop-cafe-interior')!.def;
    const chairs = cafeDef.objects.filter((o) => o.kind === 'cafe-chair');
    expect(chairs).toHaveLength(8);

    for (const chair of chairs) {
      expect(chair.style).toBeUndefined();
      expect(['left', 'right']).toContain(chair.facing);

      const expectedDir = chair.id!.endsWith('-l') ? 'right' : 'left';
      expect(chair.facing).toBe(expectedDir);

      const currentSprite = objectSprite(chair);
      const legacySprite = storeFurnishingSprite({
        kind: 'cafe-chair',
        style: expectedDir,
        x: chair.x,
        y: chair.y,
        w: 1,
        h: 1,
        solid: true,
      })!;
      expect(raster(currentSprite.canvas)).toEqual(raster(legacySprite.canvas));
      expect(currentSprite.oy).toBe(legacySprite.oy);
    }
  });

  it('rotates cafe-chair across all 4 facings and roundtrips through #23 layout save JSON', () => {
    const world = buildWorld();
    const model = new WorldEditorModel(world);
    const areaId = 'shop-cafe-interior';
    const targetId = 'shop-cafe-interior-chair-nw-l';
    const initial = model.object(targetId, undefined, areaId)!;
    expect(initial.facing).toBe('right');

    // Rotate step by step: right -> down -> left -> up -> right
    const seen = new Set<string>();
    for (const nextDir of ['down', 'left', 'up', 'right'] as const) {
      model.rotate(targetId, areaId);
      const updated = model.object(targetId, undefined, areaId)!;
      expect(updated.facing).toBe(nextDir);
      seen.add(JSON.stringify(raster(objectSprite(updated).canvas)));
    }
    expect(seen.size).toBe(4);

    // Rotate once more to 'down', then save and roundtrip via prepareSave -> parseAreaLayout -> layoutArea
    model.rotate(targetId, areaId);
    expect(model.object(targetId, undefined, areaId)!.facing).toBe('down');

    const prepared = prepareSave({ changes: model.session.exportChanges() }, world);
    const savedCafe = prepared.files.find((f) => f.areaId === areaId);
    expect(savedCafe).toBeDefined();

    const generatedCafe = AREA_FACTORIES.map((f) => f()).find((a) => a.id === areaId)!;
    const parsed = parseAreaLayout(JSON.parse(savedCafe!.text), generatedCafe);
    const reloaded = layoutArea(parsed, generatedCafe);
    const reloadedChair = reloaded.objects.find((o) => o.id === targetId)!;
    expect(reloadedChair.facing).toBe('down');
    expect(reloadedChair.style).toBeUndefined();
    expect(raster(objectSprite(reloadedChair).canvas)).toEqual(
      raster(objectSprite(model.object(targetId, undefined, areaId)!).canvas),
    );
  });

  it('preserves legacy style-only cafe-chair layouts and lets explicit facing take precedence', () => {
    const legacyRight: ObjectDef = {
      id: 'legacy-chair',
      kind: 'cafe-chair',
      style: 'right',
      x: 2,
      y: 4,
      w: 1,
      h: 1,
      solid: true,
    };
    const facingRight: ObjectDef = {
      id: 'facing-chair',
      kind: 'cafe-chair',
      facing: 'right',
      x: 2,
      y: 4,
      w: 1,
      h: 1,
      solid: true,
    };
    expect(raster(objectSprite(legacyRight).canvas)).toEqual(raster(objectSprite(facingRight).canvas));

    // When a legacy chair with style='right' is given facing='up', facing overrides style
    const overridden = objectSprite({ ...legacyRight, facing: 'up' });
    const pureUp = objectSprite({ ...facingRight, facing: 'up' });
    expect(raster(overridden.canvas)).toEqual(raster(pureUp.canvas));
    expect(raster(overridden.canvas)).not.toEqual(raster(objectSprite(legacyRight).canvas));

    // Roundtrip a saved layout file carrying a legacy style-only chair through parseAreaLayout + layoutArea
    const generatedCafe = AREA_FACTORIES.map((f) => f()).find((a) => a.id === 'shop-cafe-interior')!;
    const legacyLayout = initialLayout(generatedCafe, 'test');
    legacyLayout.objects = legacyLayout.objects.map((o) => {
      if (o.id !== 'shop-cafe-interior-chair-nw-l') return o;
      const { facing: _dropped, ...withoutFacing } = o;
      return { ...withoutFacing, style: 'up' };
    });
    const parsedLegacy = parseAreaLayout(legacyLayout, generatedCafe);
    const restoredLegacy = layoutArea(parsedLegacy, generatedCafe);
    const chair = restoredLegacy.objects.find((o) => o.id === 'shop-cafe-interior-chair-nw-l')!;
    expect(chair.facing).toBeUndefined();
    expect(chair.style).toBe('up');
    expect(raster(objectSprite(chair).canvas)).toEqual(raster(pureUp.canvas));
  });

  it('resolves effective facing and starts first rotation from legacy style in real layout JSON while letting explicit facing win', () => {
    // 1. Direct helper precedence contract
    expect(effectiveObjectFacing({ kind: 'cafe-chair', style: 'left' })).toBe('left');
    expect(effectiveObjectFacing({ kind: 'cafe-chair', style: 'right' })).toBe('right');
    expect(effectiveObjectFacing({ kind: 'cafe-chair', style: 'up' })).toBe('up');
    expect(effectiveObjectFacing({ kind: 'cafe-chair', style: 'down' })).toBe('down');
    expect(effectiveObjectFacing({ kind: 'cafe-chair', style: 'left', facing: 'up' })).toBe('up');
    expect(effectiveObjectFacing({ kind: 'cafe-chair', style: 'right', facing: 'down' })).toBe('down');
    expect(effectiveObjectFacing({ kind: 'cafe-chair' })).toBe('down');
    expect(effectiveObjectFacing({ kind: 'bakery-counter', style: 'side' })).toBe('down');

    // Explicit facing overrides legacy style when computing next rotation step
    expect(rotatedObjectVariant({ kind: 'cafe-chair', style: 'left', facing: 'up', w: 1, h: 1 })).toEqual({
      facing: 'right',
      w: 1,
      h: 1,
    });

    // 2. Real pre-migration layout JSON (with stale source fingerprint + 8 style-only cafe chairs + up/down controls)
    const generatedCafe = AREA_FACTORIES.map((f) => f()).find((a) => a.id === 'shop-cafe-interior')!;
    const legacyLayout = initialLayout(generatedCafe, 'legacy-editor');
    legacyLayout.source.fingerprint = `sha256:${'0'.repeat(64)}`;
    legacyLayout.objects = legacyLayout.objects.map((o) => {
      if (o.kind !== 'cafe-chair') return o;
      const { facing: _dropped, ...withoutFacing } = o;
      if (o.id === 'shop-cafe-interior-chair-sw-l') return { ...withoutFacing, style: 'up' };
      if (o.id === 'shop-cafe-interior-chair-sw-r') return { ...withoutFacing, style: 'down' };
      return { ...withoutFacing, style: o.id.endsWith('-l') ? 'right' : 'left' };
    });

    const parsedLegacy = parseAreaLayout(legacyLayout, generatedCafe);
    const restoredCafe = layoutArea(parsedLegacy, generatedCafe);
    const legacyWorld = buildWorld();
    legacyWorld.areas.set('shop-cafe-interior', toRuntime(restoredCafe));

    const model = new WorldEditorModel(legacyWorld);
    const firstRotations: Array<[string, string, string]> = [
      ['shop-cafe-interior-chair-nw-l', 'right', 'down'],
      ['shop-cafe-interior-chair-nw-r', 'left', 'up'],
      ['shop-cafe-interior-chair-sw-l', 'up', 'right'],
      ['shop-cafe-interior-chair-sw-r', 'down', 'left'],
    ];

    for (const [id, legacyStyle, expectedNext] of firstRotations) {
      const before = model.object(id, undefined, 'shop-cafe-interior')!;
      expect(before.facing).toBeUndefined();
      expect(before.style).toBe(legacyStyle);
      expect(raster(objectSprite(before).canvas)).toEqual(
        raster(storeFurnishingSprite({ ...before, facing: legacyStyle as 'left' | 'right' | 'up' | 'down' })!.canvas),
      );

      model.rotate(id, 'shop-cafe-interior');
      const after = model.object(id, undefined, 'shop-cafe-interior')!;
      expect(after.facing, `${id} first rotation from style=${legacyStyle}`).toBe(expectedNext);
      expect(after.style).toBe(legacyStyle);
      expect(raster(objectSprite(after).canvas)).toEqual(
        raster(storeFurnishingSprite({ kind: 'cafe-chair', facing: expectedNext as 'left' | 'right' | 'up' | 'down', x: 0, y: 0, w: 1, h: 1, solid: true })!.canvas),
      );
    }

    // Complete full rotation on legacy chair-nw-r (left -> up -> right -> down -> left)
    // and ensure 'down' is not poisoned by the earlier 'left' cache entry.
    for (const nextDir of ['right', 'down', 'left'] as const) {
      model.rotate('shop-cafe-interior-chair-nw-r', 'shop-cafe-interior');
      const updated = model.object('shop-cafe-interior-chair-nw-r', undefined, 'shop-cafe-interior')!;
      expect(updated.facing).toBe(nextDir);
      expect(raster(objectSprite(updated).canvas)).toEqual(
        raster(storeFurnishingSprite({ kind: 'cafe-chair', facing: nextDir, x: 0, y: 0, w: 1, h: 1, solid: true })!.canvas),
      );
    }

    // 3. Save roundtrip from a matching-fingerprint legacy-chair layout keeps saving format intact
    const currentLayout = initialLayout(generatedCafe, 'test');
    currentLayout.objects = currentLayout.objects.map((o) => {
      if (o.kind !== 'cafe-chair') return o;
      const { facing: _dropped, ...withoutFacing } = o;
      return { ...withoutFacing, style: o.id.endsWith('-l') ? 'right' : 'left' };
    });
    const saveWorld = buildWorld();
    saveWorld.areas.set('shop-cafe-interior', toRuntime(layoutArea(parseAreaLayout(currentLayout, generatedCafe), generatedCafe)));
    const saveModel = new WorldEditorModel(saveWorld);
    saveModel.rotate('shop-cafe-interior-chair-nw-r', 'shop-cafe-interior');
    const saved = prepareSave({ changes: saveModel.session.exportChanges() }, saveWorld);
    const savedCafe = saved.files.find((f) => f.areaId === 'shop-cafe-interior')!;
    expect(savedCafe).toBeDefined();
    const reloaded = layoutArea(parseAreaLayout(JSON.parse(savedCafe.text), generatedCafe), generatedCafe);
    const reloadedChair = reloaded.objects.find((o) => o.id === 'shop-cafe-interior-chair-nw-r')!;
    expect(reloadedChair.facing).toBe('up');
    expect(reloadedChair.style).toBe('left');
    expect(raster(objectSprite(reloadedChair).canvas)).toEqual(
      raster(storeFurnishingSprite({ kind: 'cafe-chair', facing: 'up', x: 0, y: 0, w: 1, h: 1, solid: true })!.canvas),
    );
  });
});
