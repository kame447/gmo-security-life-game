/**
 * 座標変換の一元化（docs/features/map.md「座標系と変換規則の一元化」）。
 * - エリア座標: 北西 (0,0)、東 +X、南 +Y。単位はピクセル。
 * - タイル座標: エリア座標を TILE で割った整数。
 * - チャンク座標: タイル座標を CHUNK_TILES で割った非負整数。
 * 数値はプロトタイプでの提案値（要検証）。docs/decisions/0003 を参照。
 */
export const TILE = 16;
export const CHUNK_TILES = 16;
export const CHUNK_PX = TILE * CHUNK_TILES;

export type Facing = 'up' | 'down' | 'left' | 'right';

export const DIR: Record<Facing, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export const pxToTile = (p: number): number => Math.floor(p / TILE);
export const tileToPx = (t: number): number => t * TILE;
export const tileToChunk = (t: number): number => Math.floor(t / CHUNK_TILES);

/** タイル (tx,ty) に立つときの足元基準点（中央下寄り）。 */
export function feetAtTile(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + 14 };
}

/** 例: town-main/chunk-x000-y001 */
export function chunkId(areaId: string, cx: number, cy: number): string {
  const p = (n: number) => String(n).padStart(3, '0');
  return `${areaId}/chunk-x${p(cx)}-y${p(cy)}`;
}

/** 決定的な疑似乱数 0..1（タイルの模様や区画の割り付けに使う。Math.random は使わない）。 */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((seed | 0) + 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
