import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TILE } from '../src/core/coords';
import { STORE_CONTACTS } from '../src/data/stores';
import { Renderer } from '../src/render/renderer';
import { objectSprite } from '../src/render/sprites';
import { buildWorld, type AreaRuntime } from '../src/world';

interface MarkerPoint {
  x: number;
  y: number;
  feetX: number;
  feetY: number;
}

function stubCanvasGlobals(): () => void {
  const originalDocument = globalThis.document;
  const originalPath2D = globalThis.Path2D;
  const makeFakeCanvas = (width = 1, height = 1) => {
    const context = {
      fillStyle: '#000000',
      imageSmoothingEnabled: false,
      font: '',
      textBaseline: 'top',
      fillRect: () => {},
      clearRect: () => {},
      translate: () => {},
      scale: () => {},
      fillText: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      setTransform: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      rect: () => {},
      clip: () => {},
      drawImage: () => {},
    };
    return {
      width,
      height,
      style: {} as Record<string, string>,
      clientWidth: width,
      clientHeight: height,
      getContext: () => context,
    };
  };
  globalThis.document = {
    createElement: () => makeFakeCanvas(),
  } as unknown as Document;
  globalThis.Path2D = class {
    rect(): void {}
  } as unknown as typeof Path2D;
  return () => {
    globalThis.document = originalDocument;
    globalThis.Path2D = originalPath2D;
  };
}

function markersFor(renderer: Renderer, area: AreaRuntime): MarkerPoint[] {
  const index = (renderer as unknown as { index: (a: AreaRuntime) => { markers: MarkerPoint[] } }).index(area);
  return index.markers;
}

describe('interaction marker anchoring', () => {
  let restore = () => {};

  beforeEach(() => {
    restore = stubCanvasGlobals();
  });

  afterEach(() => {
    restore();
  });

  it('skips non-solid decal backgrounds when anchoring inspection markers across all seven stores', () => {
    const world = buildWorld();
    const canvas = document.createElement('canvas');
    const renderer = new Renderer(canvas);
    let nonNpcCount = 0;

    for (const contact of STORE_CONTACTS) {
      const area = world.areas.get(contact.interiorAreaId)!;
      const markers = markersFor(renderer, area);
      expect(markers).toHaveLength(area.interactions.length);
      area.interactions.forEach((interaction, i) => {
        if (interaction.kind === 'npc') return;
        nonNpcCount++;
        const solidMatch = area.objects.find(
          o => !(o.layer === 'decal' && !o.solid)
            && interaction.x >= o.x && interaction.x < o.x + o.w
            && interaction.y >= o.y && interaction.y < o.y + o.h,
        );
        expect(solidMatch, `${area.def.id}/${interaction.id}`).toBeDefined();
        expect(solidMatch!.kind).not.toBe('shop-floor');
        expect(solidMatch!.kind).not.toBe('shop-rug');
        expect(markers[i]).toEqual({
          x: interaction.x * TILE + (interaction.w ?? 1) * TILE / 2,
          y: solidMatch!.y * TILE + objectSprite(solidMatch!).oy - 9,
          feetX: interaction.x * TILE + (interaction.w ?? 1) * TILE / 2,
          feetY: (interaction.y + (interaction.h ?? 1)) * TILE - 2,
        });
      });
    }
    expect(nonNpcCount).toBeGreaterThanOrEqual(17);
  });

  it('restores exact pre-floor marker y coordinates for cafe, konbini, greengrocer, pharmacy and home', () => {
    const world = buildWorld();
    const renderer = new Renderer(document.createElement('canvas'));

    const byId = (areaId: string) => {
      const area = world.areas.get(areaId)!;
      const markers = markersFor(renderer, area);
      return new Map(area.interactions.map((interaction, i) => [interaction.id, markers[i]]));
    };

    const cafe = byId('shop-cafe-interior');
    expect(cafe.get('shop-cafe-interior-brew-bar-inspect')).toMatchObject({ x: 48, y: -7 });
    expect(cafe.get('shop-cafe-interior-cake-case-inspect')).toMatchObject({ x: 120, y: -3 });
    expect(cafe.get('shop-cafe-interior-table-north-west-inspect')).toMatchObject({ x: 64, y: 50 });
    expect(cafe.get('shop-cafe-interior-table-north-east-inspect')).toMatchObject({ x: 144, y: 50 });
    expect(cafe.get('shop-cafe-interior-table-south-west-inspect')).toMatchObject({ x: 64, y: 114 });
    expect(cafe.get('shop-cafe-interior-table-south-east-inspect')).toMatchObject({ x: 144, y: 114 });
    expect(cafe.get('shop-cafe-interior-menu-board-inspect')).toMatchObject({ x: 104, y: 162 });

    const konbini = byId('shop-konbini-interior');
    expect(konbini.get('konbini-snacks')).toMatchObject({ x: 48, y: 39 });
    expect(konbini.get('konbini-drinks')).toMatchObject({ x: 48, y: -9 });

    const pharmacy = byId('shop-pharmacy-interior');
    expect(pharmacy.get('shop-pharmacy-interior-medicine-inspect')).toMatchObject({ x: 48, y: -9 });
    expect(pharmacy.get('shop-pharmacy-interior-daily-goods-inspect')).toMatchObject({ x: 56, y: 103 });
    expect(pharmacy.get('shop-pharmacy-interior-first-aid-inspect')).toMatchObject({ x: 200, y: 115 });

    const greengrocer = byId('shop-greengrocer-interior');
    expect(greengrocer.get('shop-greengrocer-interior-cooler-inspect')).toMatchObject({ x: 40, y: -9 });
    expect(greengrocer.get('shop-greengrocer-interior-vegetables-inspect')).toMatchObject({ x: 40, y: 55 });
    expect(greengrocer.get('shop-greengrocer-interior-baskets-inspect')).toMatchObject({ x: 40, y: 99 });
    expect(greengrocer.get('shop-greengrocer-interior-crates-inspect')).toMatchObject({ x: 216, y: 55 });
    expect(greengrocer.get('shop-greengrocer-interior-fruit-inspect')).toMatchObject({ x: 216, y: 87 });
    const fruitObj = world.areas.get('shop-greengrocer-interior')!.objects.find(o => o.id === 'shop-greengrocer-interior-fruit')!;
    expect(objectSprite(fruitObj).oy).toBe(0);

    const home = byId('home-family-interior');
    expect(home.get('home-tablet')).toMatchObject({ x: 96, y: 119 });
  });

  it('keeps floor decals first in object draw order when present', () => {
    const world = buildWorld();
    for (const areaId of ['shop-konbini-interior', 'shop-greengrocer-interior', 'shop-cafe-interior', 'shop-pharmacy-interior']) {
      const area = world.areas.get(areaId)!;
      expect(area.objects[0]).toMatchObject({ kind: 'shop-floor', layer: 'decal', solid: false });
    }
  });
});
