import type { Facing } from '../../core/coords';
import { makeCanvas } from '../draw';
import { characterSprite } from '../sprites';
import { isPersonId } from './catalog';

/** A fresh, transparent thumbnail of the exact frame-zero game sprite, at integer scale. */
export function personThumbnail(id: string, facing: Facing, size: number): HTMLCanvasElement {
  if (!isPersonId(id)) throw new Error(`Unknown person: ${id}`);
  if (!Number.isSafeInteger(size) || size < 1) throw new RangeError('Thumbnail size must be a positive integer');
  const sprite = characterSprite(id, facing, 0);
  const zoom = Math.floor(size / Math.max(sprite.canvas.width, sprite.canvas.height));
  if (zoom < 1) throw new RangeError('Thumbnail size must fit the complete person sprite');
  const [canvas, context] = makeCanvas(size, size);
  const width = sprite.canvas.width * zoom, height = sprite.canvas.height * zoom;
  context.drawImage(sprite.canvas, Math.floor((size - width) / 2), Math.floor((size - height) / 2), width, height);
  return canvas;
}
