import { makeCanvas } from '../draw';
import { objectSprite } from '../sprites';
import { outdoorById } from './catalog';

/** Whole legacy sprite, with nearest-neighbor reduction for buildings and integer enlargement for props. */
export function outdoorThumbnail(id: string, size: number): HTMLCanvasElement {
  const entry = outdoorById(id);
  if (!entry) throw new Error(`Unknown outdoor object: ${id}`);
  if (!Number.isSafeInteger(size) || size < 1) throw new RangeError('Thumbnail size must be a positive integer');
  const sprite = objectSprite({ kind: entry.kind, style: entry.style, w: entry.w, h: entry.h,
    x: 0, y: 0, solid: entry.solid, layer: entry.layer });
  const fit = size / Math.max(sprite.canvas.width, sprite.canvas.height);
  const zoom = fit >= 1 ? Math.floor(fit) : fit;
  const width = Math.max(1, Math.floor(sprite.canvas.width * zoom));
  const height = Math.max(1, Math.floor(sprite.canvas.height * zoom));
  const [canvas, context] = makeCanvas(size, size);
  context.drawImage(sprite.canvas, Math.floor((size - width) / 2), Math.floor((size - height) / 2), width, height);
  return canvas;
}
