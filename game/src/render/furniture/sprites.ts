import { TILE } from '../../core/coords';
import type { ObjectDef } from '../../core/types';
import { makeCanvas, R } from '../draw';
import type { Sprite } from '../sprites';
import { furnitureVariant } from './catalog';
import { drawChair, drawRug, drawSofa } from './art';

const sprites = new Map<string, Sprite>();

/** Catalog artwork has a fixed footprint and never stretches to an object's dimensions. */
export function furnitureSprite(o: Pick<ObjectDef, 'catalogId' | 'facing'>): Sprite | undefined {
  if (!o.catalogId) return undefined;
  const variant = furnitureVariant(o.catalogId, o.facing);
  if (!variant) return undefined;
  const key = `${o.catalogId}:${variant.facing}`;
  const cached = sprites.get(key); if (cached) return cached;
  const [canvas, c] = makeCanvas(variant.w * TILE, variant.h * TILE + variant.overhang);
  switch (o.catalogId) {
    case 'chair-wood': drawChair(c, variant.facing); break;
    case 'sofa-2seat': drawSofa(c, variant.facing); break;
    case 'rug-large': drawRug(c, canvas.width, canvas.height); break;
    default: return undefined;
  }
  const sprite = { canvas, ox: 0, oy: -variant.overhang };
  sprites.set(key, sprite);
  return sprite;
}

/** The thumbnail reuses the game sprite at a fitting integer scale, centered in the frame. */
export function furnitureThumbnail(id: string, size = 48, background = '#d8b384'): HTMLCanvasElement {
  if (!Number.isSafeInteger(size) || size < 1) throw new RangeError('Thumbnail size must be a positive integer');
  const sprite = furnitureSprite({ catalogId: id });
  if (!sprite) throw new Error(`Unknown furniture: ${id}`);
  const [canvas, c] = makeCanvas(size, size);
  R(c, background, 0, 0, size, size);
  const zoom = Math.max(1, Math.min(2, Math.floor(size / Math.max(sprite.canvas.width, sprite.canvas.height))));
  const width = sprite.canvas.width * zoom, height = sprite.canvas.height * zoom;
  c.drawImage(sprite.canvas, Math.floor((size - width) / 2), Math.floor((size - height) / 2), width, height);
  return canvas;
}
