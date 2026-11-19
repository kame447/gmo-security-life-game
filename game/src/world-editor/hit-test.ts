import type { AreaRuntime } from '../world/runtime';
import { objectSprite, characterSprite, type Sprite } from '../render/sprites';
import { feetAtTile } from '../core/coords';

const masks = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>();
export function spriteContains(sprite: Sprite, x: number, y: number): boolean {
  const px = Math.floor(x - sprite.ox), py = Math.floor(y - sprite.oy), c = sprite.canvas;
  if (px < 0 || py < 0 || px >= c.width || py >= c.height) return false;
  let pixels = masks.get(c);
  if (!pixels) { pixels = c.getContext('2d')!.getImageData(0,0,c.width,c.height).data; masks.set(c,pixels); }
  return pixels[(py * c.width + px) * 4 + 3] !== 0;
}
/** The same decal/depth order as the game; transparent sprite margins do not select. */
export function hitItem(area: AreaRuntime, x: number, y: number) {
  const items = [
    ...area.objects.map(o => ({ id: o.id!, table: 'objects' as const, sprite: objectSprite(o), x: o.x * 16, y: o.y * 16,
      depth: (o.y + o.h) * 16, decal: o.layer === 'decal' })),
    ...area.interactions.filter(i => i.kind === 'npc').map(i => ({ id: i.id, table: 'interactions' as const,
      sprite: characterSprite(i.sprite ?? 'friend',i.facing ?? 'down',0), ...feetAtTile(i.x,i.y), depth: feetAtTile(i.x,i.y).y, decal: false })),
  ].sort((a,b) => Number(b.decal) - Number(a.decal) || a.depth - b.depth);
  for (const item of items.reverse()) if (spriteContains(item.sprite,x-item.x,y-item.y)) return { id: item.id, table: item.table };
  return undefined;
}
