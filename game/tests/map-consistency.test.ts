import { beforeAll, describe, expect, it } from 'vitest';
import { buildWorld, findPath, isSolidTile, LANDMARKS } from '../src/world';
import { isRoad, T } from '../src/world/tiles';
import { TRAIN_NETWORK } from '../src/travel/network';

interface AuditFinding {
  id: string;
  areaId: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  owner: 'map-fix' | 'stations' | 'shops-33';
  x: number;
  y: number;
  w?: number;
  h?: number;
  summary: string;
}

interface AuditReport {
  tree: string;
  summary: {
    total: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    byOwner: Record<string, number>;
  };
  findings: AuditFinding[];
}

const SCRIPT_URL = new URL('../scripts/audit-map-consistency.mjs', import.meta.url).href;
const GAME_DIR = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');

describe('map consistency audit and placement invariants', () => {
  let report: AuditReport;

  beforeAll(async () => {
    const mod = await import(/* @vite-ignore */ SCRIPT_URL) as {
      auditGameDir: (dir: string, label?: string) => Promise<AuditReport>;
    };
    report = await mod.auditGameDir(GAME_DIR, 'working-tree');
  });

  it('passes world validation and produces zero map-fix errors', () => {
    const validateErrors = report.findings.filter(f => f.category === 'validate-world');
    expect(validateErrors).toEqual([]);

    const mapFixErrors = report.findings.filter(f => f.owner === 'map-fix' && f.severity === 'error');
    expect(mapFixErrors).toEqual([]);
  });

  it('keeps every building door front on a paved or connected approach in map-fix areas', () => {
    const unapproachedDoors = report.findings.filter(
      f => f.owner === 'map-fix' && (f.id.includes(':door-unpaved:') || f.id.includes(':door-no-paved-approach:') || f.id.includes(':door-blocked:')),
    );
    expect(unapproachedDoors).toEqual([]);
  });

  it('keeps roadways, sidewalks, crosswalks and park paths unobstructed in town-main', () => {
    const town = buildWorld().areas.get('town-main')!;
    for (const obj of town.objects) {
      if (!obj.solid || obj.kind === 'train') continue;
      for (let dy = 0; dy < obj.h; dy++) {
        for (let dx = 0; dx < obj.w; dx++) {
          const tile = town.ground[(obj.y + dy) * town.width + (obj.x + dx)];
          expect(isRoad(tile), `${obj.id} on road tile`).toBe(false);
          expect(tile, `${obj.id} on sidewalk`).not.toBe(T.SIDEWALK);
          expect(tile, `${obj.id} on bridge`).not.toBe(T.BRIDGE);
        }
      }
    }

    // Specific fixed corridors remain open and walkable
    for (const [x, y] of [
      [26, 42], [45, 36], [82, 14], [82, 22], [82, 30], [82, 38],
      [82, 46], [82, 54], [82, 62], [85, 58], [85, 59], [123, 39],
    ] as const) {
      expect(isSolidTile(town, x, y), `(${x},${y}) walkable`).toBe(false);
    }
  });

  it('keeps neighborhood board, school trees, cafe/house/apartment and school entrance valid', () => {
    const town = buildWorld().areas.get('town-main')!;

    // Board no longer overlaps home west hedge (31,34) and is inspectable from y=37 sidewalk
    const board = town.objects.find(o => o.kind === 'board');
    expect(board).toMatchObject({ x: 37, y: 36, w: 2, h: 1 });
    expect(town.ground[36 * town.width + 37]).toBe(T.GRASS);
    expect(town.ground[36 * town.width + 38]).toBe(T.GRASS);
    expect(town.interactions.find(i => i.id === 'neighborhood-board')).toMatchObject({ x: 37, y: 36, w: 2 });
    expect(findPath(town, LANDMARKS.homeFront, { x: 37, y: 37 })).not.toBeNull();

    // School gym cherry tree does not overlap gym footprint (115..120, 14..20)
    const gym = town.objects.find(o => o.id === 'town-gym-115-14')!;
    for (const tree of town.objects.filter(o => o.kind === 'tree')) {
      const overlapsGym = tree.x < gym.x + gym.w && tree.x + tree.w > gym.x && tree.y < gym.y + gym.h && tree.y + tree.h > gym.y;
      expect(overlapsGym, `${tree.id} overlaps gym`).toBe(false);
    }

    // Paved entrances for school, cafe, southeast house and apartment
    expect(town.ground[20 * town.width + 103]).toBe(T.PARKPATH);
    expect(town.ground[20 * town.width + 104]).toBe(T.PARKPATH);
    expect(town.ground[65 * town.width + 63]).toBe(T.PARKPATH);
    expect(town.ground[63 * town.width + 72]).toBe(T.PARKPATH);
    expect(town.ground[71 * town.width + 73]).toBe(T.PARKPATH);
  });

  it('preserves konbini, shopping street, station and rail navigation invariants', () => {
    const world = buildWorld();
    const town = world.areas.get('town-main')!;
    const konbini = town.objects.find(o => o.facilityId === 'shop-konbini');
    expect(konbini).toMatchObject({ id: 'town-shop-51-47', x: 60, y: 67, w: 6, h: 6 });
    expect(town.def.portals.find(p => p.id === 'konbini-enter')?.from).toEqual({ x: 63, y: 72 });
    expect(findPath(town, LANDMARKS.homeFront, LANDMARKS.konbiniDoorFront)).not.toBeNull();
    expect(town.interactions.find(i => i.id === 'shopping-vending')).toMatchObject({ x: 50, y: 53 });
    expect(TRAIN_NETWORK.railLinks().length).toBeGreaterThan(0);
  });
});
