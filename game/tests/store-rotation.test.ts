import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ObjectDef } from '../src/core/types';
import {
  canRotateObject,
  objectRotationReason,
  objectRotationRestrictionReason,
  objectRotationRule,
  objectRotationTargetReason,
  rotatedDimensions,
  rotatedObjectVariant,
  UNKNOWN_ROTATION_REASON,
} from '../src/render/furniture/rotation';
import {
  RETAIL_STORE_ROTATION_ENTRIES,
  STORE_FLOOR_REASON,
  STORE_WALL_SIDE_REASON,
  storeFurnishingSprite,
} from '../src/render/stores';
import { buildWorld } from '../src/world';
import { WorldEditorModel } from '../src/world-editor/model';
import { prepareSave } from '../src/world-editor/persistence';
import { assertInteriorEdit } from '../src/world-editor/policy';

class FakeCanvas {
  width = 0;
  height = 0;
  readonly rects: string[] = [];
  readonly ctx = new FakeCtx(this);
  getContext() {
    return this.ctx;
  }
}

class FakeCtx {
  fillStyle = '#000000';
  imageSmoothingEnabled = false;
  constructor(private readonly canvas: FakeCanvas) {}
  fillRect(x: number, y: number, w: number, h: number) {
    this.canvas.rects.push(`${x},${y},${w},${h}:${this.fillStyle}`);
  }
}

function renderKey(o: ObjectDef): { w: number; h: number; ox: number; oy: number; signature: string } {
  const sprite = storeFurnishingSprite(o);
  expect(sprite, `sprite missing for ${o.kind}/${o.facing}`).not.toBeNull();
  const canvas = sprite!.canvas as unknown as FakeCanvas;
  return {
    w: canvas.width,
    h: canvas.height,
    ox: sprite!.ox,
    oy: sprite!.oy,
    signature: `${canvas.width}x${canvas.height}@${sprite!.ox},${sprite!.oy}|${canvas.rects.join(';')}`,
  };
}

const RETAIL_SAMPLES: readonly { kind: string; w: number; h: number; styles?: readonly string[]; type: 'A' | 'B' | 'C2' }[] = [
  { kind: 'bookstore-counter', w: 2, h: 1, styles: ['', 'side'], type: 'A' },
  { kind: 'bookstore-tall-shelf', w: 4, h: 1, styles: ['a', 'b', 'c'], type: 'A' },
  { kind: 'bookstore-picture-shelf', w: 3, h: 2, type: 'A' },
  { kind: 'bookstore-flat-table', w: 3, h: 2, styles: ['novels', 'comics'], type: 'C2' },
  { kind: 'bookstore-magazine-rack', w: 3, h: 1, type: 'A' },
  { kind: 'candy-counter', w: 2, h: 1, type: 'A' },
  { kind: 'candy-box-rack', w: 3, h: 2, type: 'A' },
  { kind: 'candy-jar-stand', w: 3, h: 1, type: 'A' },
  { kind: 'candy-hanging-rack', w: 3, h: 1, type: 'B' },
  { kind: 'candy-low-bins', w: 3, h: 2, type: 'C2' },
  { kind: 'candy-bench', w: 2, h: 1, type: 'C2' },
  { kind: 'pharmacy-counter', w: 5, h: 1, styles: ['', 'side'], type: 'A' },
  { kind: 'pharmacy-med-shelf', w: 4, h: 1, type: 'A' },
  { kind: 'pharmacy-care-shelf', w: 4, h: 1, type: 'A' },
  { kind: 'pharmacy-low-care', w: 3, h: 1, type: 'C2' },
  { kind: 'pharmacy-daily-shelf', w: 3, h: 2, type: 'C2' },
  { kind: 'pharmacy-bench', w: 2, h: 1, type: 'C2' },
];

describe('3店（ほんや・だがしや・くすりや）の什器回転と共通土台', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { createElement: () => new FakeCanvas() });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('17種すべてが設計どおりの回転規則で登録され、shop-floor は回せない物として登録される', () => {
    expect(RETAIL_STORE_ROTATION_ENTRIES.map(([k]) => k).sort()).toEqual(
      RETAIL_SAMPLES.map(s => s.kind).sort(),
    );

    const floorRule = objectRotationRule({ kind: 'shop-floor' });
    expect(floorRule).toBeDefined();
    expect(floorRule!.directions).toEqual(['down']);
    expect(canRotateObject({ kind: 'shop-floor' })).toBe(false);
    expect(objectRotationReason({ kind: 'shop-floor' })).toBe(STORE_FLOOR_REASON);
    expect(objectRotationRestrictionReason({ kind: 'shop-floor' })).toBe(STORE_FLOOR_REASON);
    expect(objectRotationRestrictionReason({ kind: 'unregistered-store-fixture' })).toBe(UNKNOWN_ROTATION_REASON);
    expect(() => rotatedObjectVariant({ kind: 'shop-floor', w: 12, h: 9 })).toThrow(STORE_FLOOR_REASON);

    for (const sample of RETAIL_SAMPLES) {
      const rule = objectRotationRule({ kind: sample.kind });
      expect(rule, sample.kind).toBeDefined();
      expect(canRotateObject({ kind: sample.kind }), sample.kind).toBe(true);
      expect(objectRotationReason({ kind: sample.kind }), sample.kind).toBe('');
      if (sample.type === 'B') {
        expect(rule!.directions).toEqual(['down', 'left', 'right']);
        expect(objectRotationTargetReason({ kind: sample.kind }, 'up')).toBe(STORE_WALL_SIDE_REASON);
        expect(objectRotationTargetReason({ kind: sample.kind }, 'left')).toBe('');
        expect(objectRotationRestrictionReason({ kind: sample.kind }), sample.kind).toBe(STORE_WALL_SIDE_REASON);
      } else {
        expect(rule!.directions).toEqual(['down', 'left', 'up', 'right']);
        expect(objectRotationTargetReason({ kind: sample.kind }, 'up')).toBe('');
        expect(objectRotationRestrictionReason({ kind: sample.kind }), sample.kind).toBe('');
      }
    }
  });

  it('全17種の down/未指定 が一致し、許可向きごとに適切な方向別絵を描く', () => {
    for (const sample of RETAIL_SAMPLES) {
      for (const style of sample.styles ?? ['']) {
        const base: ObjectDef = {
          id: `test-${sample.kind}`,
          kind: sample.kind,
          x: 1,
          y: 1,
          w: sample.w,
          h: sample.h,
          solid: true,
          ...(style ? { style } : {}),
        };
        const undefDown = renderKey(base);
        const explicitDown = renderKey({ ...base, facing: 'down' });
        expect(explicitDown.signature, `${sample.kind}:${style} down parity`).toBe(undefDown.signature);

        const leftDim = rotatedDimensions(base, 'left');
        const rightDim = rotatedDimensions(base, 'right');
        const upDim = rotatedDimensions(base, 'up');
        const left = renderKey({ ...base, facing: 'left', ...leftDim });
        const right = renderKey({ ...base, facing: 'right', ...rightDim });

        expect(left.signature, `${sample.kind}:${style} left vs down`).not.toBe(explicitDown.signature);
        expect(right.signature, `${sample.kind}:${style} right vs down`).not.toBe(explicitDown.signature);

        if (sample.type === 'A') {
          const up = renderKey({ ...base, facing: 'up', ...upDim });
          expect(up.signature, `${sample.kind}:${style} A up vs down`).not.toBe(explicitDown.signature);
          expect(left.signature, `${sample.kind}:${style} A left vs right`).not.toBe(right.signature);
          expect(left.oy, `${sample.kind} oy preserved`).toBe(explicitDown.oy);
        } else if (sample.type === 'B') {
          expect(left.signature, `${sample.kind} B left vs right`).not.toBe(right.signature);
          expect(left.oy, `${sample.kind} B oy preserved`).toBe(explicitDown.oy);
        } else {
          // C2: up shares front view, left & right share vertical view
          const up = renderKey({ ...base, facing: 'up', ...upDim });
          expect(up.signature, `${sample.kind} C2 up == down`).toBe(explicitDown.signature);
          expect(right.signature, `${sample.kind} C2 right == left`).toBe(left.signature);
          expect(left.oy, `${sample.kind} C2 oy preserved`).toBe(explicitDown.oy);
        }
      }
    }
  });

  it('candy-hanging-rack は down -> left -> right -> down で回り、up への変更は保存口と方針検査の両方で拒否される', () => {
    const world = buildWorld();
    const areaId = 'shop-candy-interior';
    const model = new WorldEditorModel(world);
    const rack = model.document.objects.find(o => o.areaId === areaId && o.kind === 'candy-hanging-rack')!;
    expect(rack).toBeDefined();

    // Verify 3-direction cycle
    const step1 = rotatedObjectVariant(rack);
    expect(step1).toEqual({ facing: 'left', w: rack.h, h: rack.w });
    const step2 = rotatedObjectVariant({ ...rack, ...step1 });
    expect(step2).toEqual({ facing: 'right', w: rack.h, h: rack.w });
    const step3 = rotatedObjectVariant({ ...rack, ...step2 });
    expect(step3).toEqual({ facing: 'down', w: rack.w, h: rack.h });

    // Reject 'up' in policy & model candidate
    const invalidUp = model.candidate({ ...rack, facing: 'up' });
    expect(() => assertInteriorEdit(model.document, invalidUp, areaId)).toThrow(STORE_WALL_SIDE_REASON);
    expect(model.issues(invalidUp)).toEqual([STORE_WALL_SIDE_REASON]);

    // Move slightly south so 1x3 rotated footprint stays on walkable floor, then rotate cleanly
    model.move(rack.id, 6, 3, areaId);
    model.rotate(rack.id, areaId);
    expect(model.object(rack.id, undefined, areaId)?.facing).toBe('left');
    expect(model.object(rack.id, undefined, areaId)?.w).toBe(1);
    expect(model.object(rack.id, undefined, areaId)?.h).toBe(3);

    model.rotate(rack.id, areaId);
    expect(model.object(rack.id, undefined, areaId)?.facing).toBe('right');

    const saved = prepareSave({ changes: model.session.exportChanges() }, world);
    expect(saved.files.map(f => f.areaId)).toEqual([areaId]);
  });

  it('だがしやの candy-hanging-rack を選んだとき・回したときに回転可能のまま型 B の理由を返す', () => {
    const world = buildWorld();
    const areaId = 'shop-candy-interior';
    const model = new WorldEditorModel(world);
    const rack = model.document.objects.find(o => o.areaId === areaId && o.kind === 'candy-hanging-rack')!;
    expect(rack).toBeDefined();

    // Selecting Type B keeps rotation enabled while exposing the wall-side restriction reason.
    expect(canRotateObject(rack)).toBe(true);
    expect(objectRotationReason(rack)).toBe('');
    expect(objectRotationRestrictionReason(rack)).toBe(STORE_WALL_SIDE_REASON);
    expect(model.protectedReason(rack.id)).toContain('あてくじとキャンディ');

    const observed: Array<{ facing: string; w: number; h: number; reason: string }> = [
      { facing: rack.facing ?? 'down', w: rack.w, h: rack.h, reason: objectRotationRestrictionReason(rack) },
    ];
    for (let step = 0; step < 3; step++) {
      model.rotate(rack.id, areaId);
      const updated = model.object(rack.id, undefined, areaId)!;
      observed.push({
        facing: updated.facing ?? 'down',
        w: updated.w,
        h: updated.h,
        reason: objectRotationRestrictionReason(updated),
      });
    }
    expect(observed).toEqual([
      { facing: 'down', w: 3, h: 1, reason: STORE_WALL_SIDE_REASON },
      { facing: 'left', w: 1, h: 3, reason: STORE_WALL_SIDE_REASON },
      { facing: 'right', w: 1, h: 3, reason: STORE_WALL_SIDE_REASON },
      { facing: 'down', w: 3, h: 1, reason: STORE_WALL_SIDE_REASON },
    ]);
  });

  it('3店の実配置で回転しても id・style・結び付きが保たれ、style 違いの見た目も維持される', () => {
    const world = buildWorld();
    const model = new WorldEditorModel(world);

    // Bookstore tall-shelf style:'b' & flat-table style:'comics' preserve style across rotation
    const tallB = model.document.objects.find(
      o => o.areaId === 'shop-bookstore-interior' && o.kind === 'bookstore-tall-shelf' && o.style === 'b',
    )!;
    const comics = model.document.objects.find(
      o => o.areaId === 'shop-bookstore-interior' && o.kind === 'bookstore-flat-table' && o.style === 'comics',
    )!;
    const counter = model.document.objects.find(
      o => o.areaId === 'shop-pharmacy-interior' && o.kind === 'pharmacy-counter' && o.style === 'side',
    )!;

    model.rotate(tallB.id, 'shop-bookstore-interior');
    const rotatedTall = model.object(tallB.id, undefined, 'shop-bookstore-interior')!;
    expect(rotatedTall.facing).toBe('left');
    expect(rotatedTall.w).toBe(1);
    expect(rotatedTall.h).toBe(4);
    expect(rotatedTall.style).toBe('b');

    model.rotate(comics.id, 'shop-bookstore-interior');
    const rotatedComics = model.object(comics.id, undefined, 'shop-bookstore-interior')!;
    expect(rotatedComics.facing).toBe('left');
    expect(rotatedComics.w).toBe(2);
    expect(rotatedComics.h).toBe(3);
    expect(rotatedComics.style).toBe('comics');

    // Distinct style renders differently even when rotated
    const novelRotated = { ...rotatedComics, style: 'novels' };
    expect(renderKey(rotatedComics).signature).not.toBe(renderKey(novelRotated).signature);

    // Pharmacy side counter rotates cleanly preserving style:'side' and 4x1 -> 1x4
    const nextCounter = rotatedObjectVariant(counter);
    const rotatedCounterCandidate = (() => {
      const area = model.document.areas.find(a => a.id === 'shop-pharmacy-interior')!;
      for (let y = 1; y < area.height - nextCounter.h; y++) {
        for (let x = 1; x < area.width - nextCounter.w; x++) {
          const cand = model.candidate({ ...counter, ...nextCounter, x, y });
          if (model.issues(cand).length === 0) return cand;
        }
      }
      throw new Error('No open rotated placement for pharmacy counter');
    })();
    model.commit(rotatedCounterCandidate);
    const rotatedCounter = model.object(counter.id, undefined, 'shop-pharmacy-interior')!;
    expect(rotatedCounter.facing).toBe('left');
    expect(rotatedCounter.w).toBe(1);
    expect(rotatedCounter.h).toBe(4);
    expect(rotatedCounter.style).toBe('side');

    const saved = prepareSave({ changes: model.session.exportChanges() }, world);
    expect(saved.files.map(f => f.areaId).sort()).toEqual(['shop-bookstore-interior', 'shop-pharmacy-interior']);
  });
});
