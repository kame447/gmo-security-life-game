import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ObjectDef } from '../src/core/types';
import { assembleEditorWorld } from '../src/editor/runtime';
import { FURNITURE } from '../src/render/furniture/catalog';
import { furnitureSprite } from '../src/render/furniture/sprites';
import {
  canRotateObject,
  FOUR_DIRECTIONS,
  LEGACY_ROTATION_RULES,
  objectRotationReason,
  objectRotationRule,
  rotatedDimensions,
  rotatedObjectVariant,
  uprightDimensions,
  WALL_ROTATION_REASON,
} from '../src/render/furniture/rotation';
import { STORE_WALL_SIDE_REASON } from '../src/render/stores';
import { objectSprite } from '../src/render/sprites';
import { AREA_FACTORIES, buildWorld, validateWorld } from '../src/world';
import { layoutArea, parseAreaLayout } from '../src/world/layouts/codec';
import { WorldEditorModel } from '../src/world-editor/model';
import { prepareSave } from '../src/world-editor/persistence';
import { assertInteriorEdit } from '../src/world-editor/policy';

class Canvas {
  width = 320; height = 240; clientWidth = 320; clientHeight = 240;
  pixels = new Uint32Array(0);
  readonly context = new Context(this);
  getContext() { return this.context; }
  data() {
    if (this.pixels.length !== this.width * this.height) this.pixels = new Uint32Array(this.width * this.height);
    return this.pixels;
  }
}
class Context {
  fillStyle = '#000000'; imageSmoothingEnabled = true;
  constructor(private readonly canvas: Canvas) {}
  clearRect(x: number, y: number, w: number, h: number) {
    const data = this.canvas.data();
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.canvas.height, y + h); py++) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.canvas.width, x + w); px++) data[py * this.canvas.width + px] = 0;
    }
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const color = Number.parseInt(this.fillStyle.slice(1).padEnd(8, 'f'), 16) >>> 0;
    const data = this.canvas.data();
    for (let py = Math.max(0, Math.floor(y)); py < Math.min(this.canvas.height, y + h); py++) {
      for (let px = Math.max(0, Math.floor(x)); px < Math.min(this.canvas.width, x + w); px++) data[py * this.canvas.width + px] = color;
    }
  }
}

beforeAll(() => vi.stubGlobal('document', { createElement: () => new Canvas() }));
afterAll(() => vi.unstubAllGlobals());
const raster = (canvas: HTMLCanvasElement) => (canvas as unknown as Canvas).data();

function findClearSpot(model: WorldEditorModel, areaId: string, objectId: string): { x: number; y: number } {
  const area = model.document.areas.find(a => a.id === areaId)!;
  const current = model.object(objectId, undefined, areaId)!;
  const upright = uprightDimensions(current);
  const sideways = { w: upright.h, h: upright.w };
  const spanW = Math.max(upright.w, sideways.w);
  const spanH = Math.max(upright.h, sideways.h);
  const others = model.document.objects.filter(o => o.areaId === areaId && o.id !== objectId && o.solid);
  const arrivals = model.document.portals.filter(p => p.to.areaId === areaId).map(p => p.to);
  const exits = model.document.portals.filter(p => p.areaId === areaId).map(p => p.from);
  for (let y = 1; y <= area.height - spanH - 1; y++) {
    for (let x = 1; x <= area.width - spanW - 1; x++) {
      if (current.solid && others.some(o => x < o.x + o.w && x + spanW > o.x && y < o.y + o.h && y + spanH > o.y)) continue;
      if (current.solid && arrivals.some(p => p.x >= x && p.x < x + spanW && p.y >= y && p.y < y + spanH)) continue;
      if (current.solid && exits.some(p => x < p.x + (p.w ?? 1) && x + spanW > p.x && y <= p.y && y + spanH > p.y)) continue;
      if (model.issues(model.candidate({ ...current, x, y, facing: 'left', ...sideways })).length) continue;
      return { x, y };
    }
  }
  throw new Error(`No rotatable position found for ${areaId}/${objectId}`);
}

describe('legacy and indoor rotation contract', () => {
  it('verifies every object in every indoor area is either rotatable floor furniture or an explained wall item', () => {
    const world = buildWorld();
    const factories = new Map(AREA_FACTORIES.map(create => { const def = create(); return [def.id, def]; }));
    const indoorAreas = [...world.areas.values()].filter(area => area.def.kind === 'indoor');
    expect(indoorAreas.map(area => area.def.id).sort()).toEqual([
      'home-family-interior',
      'school-classroom-interior',
      'shop-bakery-interior',
      'shop-bookstore-interior',
      'shop-cafe-interior',
      'shop-candy-interior',
      'shop-greengrocer-interior',
      'shop-konbini-interior',
      'shop-pharmacy-interior',
    ]);

    const model = new WorldEditorModel(world);
    // All food-store kinds and `shop-rug` (`fixtures-food.ts`) are now registered in `FOOD_STORE_ROTATION_ENTRIES`.
    const PENDING_FOOD_STORE_KINDS: readonly string[] = [];
    const unregisteredKinds = new Set<string>();

    for (const area of indoorAreas) {
      const areaId = area.def.id;
      const doc = model.document;
      for (const baseObj of area.def.objects) {
        const o = model.object(baseObj.id!, undefined, areaId)!;
        const rule = objectRotationRule(o);
        if (!rule) {
          expect(PENDING_FOOD_STORE_KINDS, `${areaId}/${o.id} (${o.kind})`).toContain(o.kind);
          unregisteredKinds.add(o.kind);
          continue;
        }

        if (rule.directions.length <= 1) {
          expect(rule.directions).toEqual(['down']);
          expect(canRotateObject(o)).toBe(false);
          expect(objectRotationReason(o)).toBe(rule.reason);
          expect(() => model.rotate(o.id, areaId)).toThrow(rule.reason);

          const fixedTarget = doc.objects.find(item => item.id === o.id)!;
          const prevFacing = fixedTarget.facing;
          for (const badFacing of ['left', 'up', 'right'] as const) {
            fixedTarget.facing = badFacing;
            expect(() => assertInteriorEdit(model.initial, doc, areaId)).toThrow(rule.reason);
          }
          fixedTarget.facing = prevFacing;
          continue;
        }

        expect(canRotateObject(o), `${areaId}/${o.id}`).toBe(true);
        expect(objectRotationReason(o)).toBe('');
        const expectedDirs = rule.directions;
        if (rule.placement === 'rug') {
          expect(expectedDirs).toEqual(['down', 'left']);
        } else if (expectedDirs.length === 3) {
          expect(expectedDirs).toEqual(['down', 'left', 'right']);
          expect(rule.reason).toBe(STORE_WALL_SIDE_REASON);
        } else {
          expect(expectedDirs).toEqual(FOUR_DIRECTIONS);
        }

        // Verify disallowed facings (e.g. 'up' for Type B) are rejected by interior policy.
        const target = doc.objects.find(item => item.id === o.id)!;
        const linked = doc.interactions.filter(i => i.objectId === o.id);
        for (const badFacing of FOUR_DIRECTIONS.filter(d => !expectedDirs.includes(d))) {
          const prevFacing = target.facing;
          target.facing = badFacing;
          expect(() => assertInteriorEdit(model.initial, doc, areaId)).toThrow(rule.reason || undefined);
          target.facing = prevFacing;
        }

        // Verify rotation metadata, full facing cycle, and interior policy for every permitted direction.
        const startFacing = expectedDirs.includes(o.facing ?? 'down') ? (o.facing ?? 'down') : expectedDirs[0];
        const startIndex = expectedDirs.indexOf(startFacing);
        for (let step = 1; step <= expectedDirs.length; step++) {
          const nextVariant = rotatedObjectVariant(target);
          const expectedDir = expectedDirs[(startIndex + step) % expectedDirs.length];
          const expectedSize = rotatedDimensions(o, expectedDir);
          expect(nextVariant.facing).toBe(expectedDir);
          expect([nextVariant.w, nextVariant.h]).toEqual([expectedSize.w, expectedSize.h]);
          Object.assign(target, nextVariant);
          for (const link of linked) Object.assign(link, { x: target.x, y: target.y, w: target.w, h: target.h });
          expect(() => assertInteriorEdit(model.initial, doc, areaId)).not.toThrow();
        }
        expect(target.id).toBe(o.id);
        expect(target.kind).toBe(o.kind);
        expect(target.catalogId).toBe(o.catalogId);
        expect(target.facing).toBe(startFacing);
        target.facing = o.facing;
      }
    }
    expect([...unregisteredKinds].sort()).toEqual([...PENDING_FOOD_STORE_KINDS].sort());

    // Exercise full WorldEditorModel rotation cycles + save/reload roundtrip across classroom, home, and retail stores.
    const cycleTargets: [string, string][] = [
      ['home-family-interior', 'home-family-interior-toybox-1-5'],
      ['home-family-interior', 'home-family-interior-plant-14-9'],
      ['home-family-interior', 'home-family-interior-lowtable-5-8'],
      ['school-classroom-interior', 'school-classroom-interior-tdesk-8-2'],
      ['school-classroom-interior', 'school-classroom-interior-sdesk-2-8'],
      ['school-classroom-interior', 'school-classroom-interior-shelf-1-10'],
      ['shop-bookstore-interior', 'shop-bookstore-interior-back-books-west'],
      ['shop-bookstore-interior', 'shop-bookstore-interior-magazines'],
      ['shop-bookstore-interior', 'shop-bookstore-interior-picture-books'],
      ['shop-pharmacy-interior', 'shop-pharmacy-interior-counter'],
    ];
    for (const [areaId, id] of cycleTargets) {
      const o = model.object(id, undefined, areaId)!;
      try {
        model.rotate(id, areaId);
      } catch {
        const spot = findClearSpot(model, areaId, id);
        model.move(id, spot.x, spot.y, areaId);
        model.rotate(id, areaId);
      }
      const afterFirst = model.object(id, undefined, areaId)!;
      expect(afterFirst.facing).toBe('left');
      for (const linked of model.document.interactions.filter(i => i.objectId === id)) {
        expect({ x: linked.x, y: linked.y, w: linked.w, h: linked.h }).toEqual({
          x: afterFirst.x, y: afterFirst.y, w: afterFirst.w, h: afterFirst.h,
        });
      }
      expect(afterFirst.id).toBe(o.id);
      expect(afterFirst.kind).toBe(o.kind);
      expect(afterFirst.catalogId).toBe(o.catalogId);
    }

    const plan = prepareSave({ changes: model.session.exportChanges() }, world);
    expect(plan.files.map(f => f.areaId).sort()).toEqual([
      'home-family-interior',
      'school-classroom-interior',
      'shop-bookstore-interior',
      'shop-pharmacy-interior',
    ]);
    for (const [areaId, id] of cycleTargets) {
      const savedObj = model.object(id, undefined, areaId)!;
      const file = plan.files.find(f => f.areaId === areaId)!;
      const reloadedDef = layoutArea(parseAreaLayout(JSON.parse(file.text), factories.get(areaId)!), factories.get(areaId)!);
      expect(reloadedDef.objects.find(item => item.id === id)).toMatchObject({
        id, kind: savedObj.kind, facing: savedObj.facing, x: savedObj.x, y: savedObj.y, w: savedObj.w, h: savedObj.h,
      });
    }
    expect(validateWorld(assembleEditorWorld(model.document))).toEqual([]);

    for (const [areaId, id] of cycleTargets) {
      const o = model.object(id, undefined, areaId)!;
      const expectedDirs = objectRotationRule(o)!.directions;
      for (let step = 2; step <= expectedDirs.length; step++) {
        model.rotate(id, areaId);
        const updated = model.object(id, undefined, areaId)!;
        expect(updated.facing).toBe(expectedDirs[step % expectedDirs.length]);
        expect(updated.id).toBe(o.id);
        expect(updated.kind).toBe(o.kind);
        expect(updated.catalogId).toBe(o.catalogId);
      }
    }
  }, 15000);

  it('keeps home catalog floor furniture 4-directional and window-wall explained', () => {
    for (const entry of FURNITURE) {
      const dummy: ObjectDef = {
        id: `test-${entry.id}`, kind: entry.id, catalogId: entry.id,
        x: 1, y: 1, w: entry.variants[0].w, h: entry.variants[0].h, solid: entry.solid, layer: entry.layer,
      };
      if (entry.placement === 'floor') {
        expect(entry.variants.map(v => v.facing), entry.id).toEqual(FOUR_DIRECTIONS);
        expect(objectRotationReason(dummy)).toBe('');
      } else if (entry.placement === 'wall') {
        expect(entry.variants.map(v => v.facing)).toEqual(['down']);
        expect(objectRotationReason(dummy)).toBe(WALL_ROTATION_REASON);
      } else {
        expect(entry.variants.map(v => v.facing)).toEqual(['down', 'left']);
        expect(objectRotationReason(dummy)).toBe('');
      }
    }
  });

  it('draws 4 distinct directions for legacy indoor kinds while preserving down pixel parity with 0135f63', () => {
    const legacyFixtures: { kind: string; w: number; h: number }[] = [
      { kind: 'shopshelf', w: 2, h: 1 },
      { kind: 'cooler', w: 2, h: 1 },
      { kind: 'magazine', w: 2, h: 1 },
      { kind: 'counter', w: 3, h: 1 },
      { kind: 'tdesk', w: 2, h: 1 },
      { kind: 'sdesk', w: 1, h: 1 },
      { kind: 'shelf', w: 2, h: 1 },
      { kind: 'bench', w: 2, h: 1 },
      { kind: 'bed', w: 2, h: 3 },
      { kind: 'desk', w: 2, h: 1 },
      { kind: 'lowtable', w: 2, h: 1 },
      { kind: 'table', w: 2, h: 2 },
      { kind: 'bookshelf', w: 1, h: 1 },
      { kind: 'sofa', w: 2, h: 1 },
      { kind: 'tv', w: 2, h: 1 },
      { kind: 'kitchen', w: 4, h: 1 },
      { kind: 'fridge', w: 1, h: 1 },
      { kind: 'toybox', w: 1, h: 1 },
      { kind: 'plant', w: 1, h: 1 },
      { kind: 'rug', w: 3, h: 2 },
    ];

    for (const fixture of legacyFixtures) {
      const rule = LEGACY_ROTATION_RULES.get(fixture.kind)!;
      expect(rule, fixture.kind).toBeDefined();
      const base: ObjectDef = { id: `legacy-${fixture.kind}`, kind: fixture.kind, x: 2, y: 2, w: fixture.w, h: fixture.h, solid: true };
      expect(furnitureSprite(base)).toBeUndefined();

      const unrotated = objectSprite(base);
      const down = objectSprite({ ...base, facing: 'down' });
      expect(down).toBe(unrotated);

      const rasters = rule.directions.map(facing => {
        const size = rotatedDimensions(base, facing);
        const sprite = objectSprite({ ...base, facing, ...size });
        expect(sprite.ox).toBe(0);
        expect(sprite.oy).toBe(0);
        expect(sprite.canvas.width).toBe(size.w * 16);
        expect(sprite.canvas.height).toBe(size.h * 16);
        const pixels = raster(sprite.canvas);
        expect(pixels.some(p => (p & 255) !== 0), `${fixture.kind}/${facing}`).toBe(true);
        return [...pixels].join(',');
      });
      expect(new Set(rasters).size, fixture.kind).toBe(rule.directions.length);
    }

    // Rear views hide front-facing details such as cooler glass, shelf goods, magazine covers, and tv screen.
    const hasColor = (kind: string, w: number, h: number, facing: 'down' | 'up', hex: number) =>
      raster(objectSprite({ kind, x: 0, y: 0, w, h, facing, solid: true }).canvas).includes(hex >>> 0);
    expect(hasColor('cooler', 2, 1, 'down', 0x9ebfc2ff)).toBe(true);
    expect(hasColor('cooler', 2, 1, 'up', 0x9ebfc2ff)).toBe(false);
    expect(hasColor('shopshelf', 2, 1, 'down', 0xc77d5aff)).toBe(true);
    expect(hasColor('shopshelf', 2, 1, 'up', 0xc77d5aff)).toBe(false);
    expect(hasColor('magazine', 2, 1, 'down', 0x8aadb0ff)).toBe(true);
    expect(hasColor('magazine', 2, 1, 'up', 0x8aadb0ff)).toBe(false);
    expect(hasColor('tv', 2, 1, 'down', 0x7a9fa6ff)).toBe(true);
    expect(hasColor('tv', 2, 1, 'up', 0x7a9fa6ff)).toBe(false);
  });

  it('supports shared kind-lookup rotation for upcoming store fixtures (#33) and style-preserving legacy objects', () => {
    const customShelf: ObjectDef = {
      id: 'shop-greengrocer-shopshelf-2-4',
      kind: 'shopshelf',
      style: 'greengrocer',
      x: 2, y: 4, w: 3, h: 1, solid: true,
    };
    const left = rotatedObjectVariant(customShelf);
    expect(left).toEqual({ facing: 'left', w: 1, h: 3 });
    const up = rotatedObjectVariant({ ...customShelf, ...left });
    expect(up).toEqual({ facing: 'up', w: 3, h: 1 });
    const right = rotatedObjectVariant({ ...customShelf, ...up });
    expect(right).toEqual({ facing: 'right', w: 1, h: 3 });
    const backDown = rotatedObjectVariant({ ...customShelf, ...right });
    expect(backDown).toEqual({ facing: 'down', w: 3, h: 1 });

    // Confirm rotated retail store fixtures & classroom desks rotate through model + undo cleanly.
    const model = new WorldEditorModel(buildWorld());
    model.rotate('school-classroom-interior-sdesk-2-8', 'school-classroom-interior');
    model.rotate('shop-bookstore-interior-magazines', 'shop-bookstore-interior');
    model.rotate('shop-bookstore-interior-picture-books', 'shop-bookstore-interior');
    expect(model.object('school-classroom-interior-sdesk-2-8', undefined, 'school-classroom-interior')?.facing).toBe('left');
    expect(model.object('shop-bookstore-interior-magazines', undefined, 'shop-bookstore-interior')).toMatchObject({ facing: 'left', w: 1, h: 3 });
    expect(model.object('shop-bookstore-interior-picture-books', undefined, 'shop-bookstore-interior')).toMatchObject({ facing: 'left', w: 2, h: 3 });
    expect(model.document.interactions.find(i => i.id === 'shop-bookstore-interior-magazines-inspect')).toMatchObject({ x: 2, y: 8, w: 1, h: 3 });
    expect(model.document.interactions.find(i => i.id === 'shop-bookstore-interior-picture-books-inspect')).toMatchObject({ x: 2, y: 4, w: 2, h: 3 });
    model.session.undo();
    const restoredBooks = model.object('shop-bookstore-interior-picture-books', undefined, 'shop-bookstore-interior')!;
    expect(restoredBooks.facing ?? 'down').toBe('down');
    expect(restoredBooks).toMatchObject({ w: 3, h: 2 });
  });
});
