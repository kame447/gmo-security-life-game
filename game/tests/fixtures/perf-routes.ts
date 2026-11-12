/**
 * 性能計測（scripts/perf.mjs）とテストで使う、屋外の固定経路。
 * Fixed outdoor waypoints for real-input performance measurement, never timing claims.
 */
import { LANDMARKS } from '../../src/world/landmarks';

export const PERF_ROUTES: Record<string, { name: string; points: { x: number; y: number }[] }> = {
  straightRoad: { name: 'かんせんどうろのちょくせん', points: [{ x: 12, y: 39 }, { x: 78, y: 39 }] },
  corners: { name: 'じゅうたくがいのかど', points: [{ x: 29, y: 11 }, { x: 43, y: 11 }, { x: 43, y: 22 }, { x: 29, y: 22 }, { x: 29, y: 11 }, { x: 43, y: 11 }] },
  crosswalk: { name: 'こうさてんのおうだんほどう', points: [{ x: 25, y: 37 }, { x: 25, y: 41 }, { x: 29, y: 41 }, { x: 29, y: 37 }] },
  bridge: { name: 'かわをわたってがっこうへ', points: [{ x: 78, y: 39 }, { x: 94, y: 39 }, { ...LANDMARKS.schoolGate }] },
  footbridge: { name: 'ほこうしゃばしからこうえんへ', points: [{ x: 100, y: 41 }, { x: 100, y: 54 }, { ...LANDMARKS.parkPlaza }] },
  diagonalChunks: { name: 'いえからえきまえのチャンクきょうかい', points: [{ ...LANDMARKS.homeFront }, { x: 35, y: 39 }, { x: 29, y: 39 }, { x: 29, y: 58 }, { x: 46, y: 58 }, { x: 46, y: 65 }, { ...LANDMARKS.stationFront }] },
};
