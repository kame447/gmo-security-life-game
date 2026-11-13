import { isSolidTile, neighbors, type AreaRuntime, type Point } from './runtime';

/** Four-neighbor BFS in tile coordinates; includes both endpoints. */
export function findPath(area: AreaRuntime, from: Point, to: Point): Point[] | null {
  if (isSolidTile(area, from.x, from.y) || isSolidTile(area, to.x, to.y)) return null;
  const first = from.y * area.width + from.x;
  const goal = to.y * area.width + to.x;
  const previous = new Int32Array(area.width * area.height).fill(-1);
  const queue = [first];
  previous[first] = first;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    if (index === goal) {
      const path: Point[] = [];
      for (let i = goal; ; i = previous[i]) {
        path.push({ x: i % area.width, y: Math.floor(i / area.width) });
        if (i === first) return path.reverse();
      }
    }
    for (const p of neighbors({ x: index % area.width, y: Math.floor(index / area.width) })) {
      if (isSolidTile(area, p.x, p.y)) continue;
      const i = p.y * area.width + p.x;
      if (previous[i] !== -1) continue;
      previous[i] = index;
      queue.push(i);
    }
  }
  return null;
}
