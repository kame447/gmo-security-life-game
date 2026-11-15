#!/usr/bin/env node
/**
 * Map consistency & placement audit tool across any game/ tree or git commit.
 *
 * Usage:
 *   node scripts/audit-map-consistency.mjs                     # audit current game/
 *   node scripts/audit-map-consistency.mjs --json              # JSON output
 *   node scripts/audit-map-consistency.mjs --compare 8c9e1a8,2f5325e,4db4bd8
 *   node scripts/audit-map-consistency.mjs --ref 8c9e1a8 --screenshots /tmp/audit-shots
 *   node scripts/audit-map-consistency.mjs --fail-on-error     # exit 1 if fixable issues exist
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_GAME_DIR = path.resolve(SCRIPT_DIR, '..');
const FORBIDDEN_PORTS = new Set([
  5201, 5288, 5296, 5297, 5299, 5308, 5350, 5358, 5359,
  5396, 5397, 5420, 5421, 5444, 5445, 5448, 5460,
]);

const TILE = 16;
const HITBOX = { halfW: 5, h: 8 };

const T_NAMES = new Map([
  [0, 'VOID'], [1, 'GRASS'], [2, 'ASPHALT'], [3, 'LANE_H'], [4, 'LANE_V'],
  [5, 'ZEBRA_H'], [6, 'ZEBRA_V'], [7, 'SIDEWALK'], [8, 'PLAZA'], [9, 'WATER'],
  [10, 'BANK'], [11, 'BRIDGE'], [12, 'DIRT'], [13, 'PARKPATH'], [14, 'RAIL'],
  [15, 'CROSSING'], [16, 'PLATFORM'], [17, 'FENCE'], [18, 'HEDGE'],
  [19, 'FLOOR_WOOD'], [20, 'FLOOR_TATAMI'], [21, 'FLOOR_CLASS'], [22, 'WALL'],
  [23, 'WALL_TOP'], [24, 'MAT'], [25, 'SAND'], [26, 'GARDEN'], [27, 'PARKING'],
  [28, 'RAIL_BRIDGE'], [29, 'RAIL_FENCE'], [30, 'TICKET_GATE'],
  [31, 'PLATFORM_EDGE'], [32, 'BOARDING_SIGN'], [33, 'CROSSING_SIGNAL'],
  [34, 'SWITCH_WS_A'], [35, 'SWITCH_WS_B'], [36, 'SWITCH_WN_C'], [37, 'SWITCH_WN_D'],
  [38, 'SWITCH_EN_D'], [39, 'SWITCH_EN_C'], [40, 'SWITCH_ES_B'], [41, 'SWITCH_ES_A'],
  [42, 'RAIL_GUARD'],
]);

const ROAD_TILES = new Set([2, 3, 4, 5, 6]); // ASPHALT, LANE_H, LANE_V, ZEBRA_H, ZEBRA_V
const ZEBRA_TILES = new Set([5, 6]);
const WATER_TILES = new Set([9, 10]); // WATER, BANK
const RAIL_TILES = new Set([14, 15, 28, 29, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42]);
const WALL_TILES = new Set([22, 23]);
const PAVED_TILES = new Set([2, 3, 4, 5, 6, 7, 8, 11, 13, 15, 16, 24, 27]);
const BUILDING_KINDS = new Set(['house', 'apartment', 'shop', 'school', 'gym', 'station']);

function tileName(id) {
  return T_NAMES.get(id) ?? `TILE_${id}`;
}

function rectsOverlap(a, b) {
  const aw = a.w ?? 1, ah = a.h ?? 1;
  const bw = b.w ?? 1, bh = b.h ?? 1;
  return a.x < b.x + bw && a.x + aw > b.x && a.y < b.y + bh && a.y + ah > b.y;
}

function sameRect(a, b) {
  return a.x === b.x && a.y === b.y && (a.w ?? 1) === (b.w ?? 1) && (a.h ?? 1) === (b.h ?? 1);
}

function rectTiles(r) {
  const w = r.w ?? 1, h = r.h ?? 1;
  const out = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) out.push({ x: r.x + dx, y: r.y + dy });
  }
  return out;
}

function canStandTileCenter(area, tx, ty) {
  const px = tx * TILE + TILE / 2;
  const py = ty * TILE + 14;
  if (px - HITBOX.halfW < 0 || px + HITBOX.halfW > area.width * TILE ||
      py - HITBOX.h < 0 || py > area.height * TILE) return false;
  const left = Math.floor((px - HITBOX.halfW) / TILE);
  const right = Math.ceil((px + HITBOX.halfW) / TILE) - 1;
  const top = Math.floor((py - HITBOX.h) / TILE);
  const bottom = Math.ceil(py / TILE) - 1;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (area.solid[y * area.width + x]) return false;
    }
  }
  return true;
}

function bfsComponent(area, startX, startY) {
  const visited = new Set();
  const isSolid = (x, y) => x < 0 || y < 0 || x >= area.width || y >= area.height || area.solid[y * area.width + x] !== 0;
  if (isSolid(startX, startY)) return visited;
  const q = [{ x: startX, y: startY }];
  visited.add(startY * area.width + startX);
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = p.x + dx, ny = p.y + dy;
      if (isSolid(nx, ny)) continue;
      const idx = ny * area.width + nx;
      if (visited.has(idx)) continue;
      visited.add(idx);
      q.push({ x: nx, y: ny });
    }
  }
  return visited;
}

function findTilePath(area, from, to) {
  const isSolid = (x, y) => x < 0 || y < 0 || x >= area.width || y >= area.height || area.solid[y * area.width + x] !== 0;
  if (isSolid(from.x, from.y) || isSolid(to.x, to.y)) return null;
  const start = from.y * area.width + from.x;
  const goal = to.y * area.width + to.x;
  if (start === goal) return [from];
  const prev = new Map([[start, -1]]);
  const q = [from];
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = p.x + dx, ny = p.y + dy;
      if (isSolid(nx, ny)) continue;
      const idx = ny * area.width + nx;
      if (prev.has(idx)) continue;
      prev.set(idx, p.y * area.width + p.x);
      if (idx === goal) {
        const path = [];
        for (let cur = goal; cur !== -1; cur = prev.get(cur)) {
          path.push({ x: cur % area.width, y: Math.floor(cur / area.width) });
        }
        return path.reverse();
      }
      q.push({ x: nx, y: ny });
    }
  }
  return null;
}

async function bundleAndLoadWorld(gameDir) {
  const workTmp = await mkdtemp(path.join(tmpdir(), 'slg-audit-bundle-'));
  try {
    const worldEntry = path.join(gameDir, 'src/world/index.ts');
    const networkEntry = path.join(gameDir, 'src/travel/network.ts');
    const hasNetwork = existsSync(networkEntry);
    const wrapperPath = path.join(workTmp, 'entry.ts');
    const wrapperLines = [
      `export * as worldMod from ${JSON.stringify(worldEntry)};`,
      hasNetwork ? `export * as networkMod from ${JSON.stringify(networkEntry)};` : `export const networkMod = null;`,
    ];
    await writeFile(wrapperPath, wrapperLines.join('\n'));
    const outFile = path.join(workTmp, 'bundle.mjs');
    await esbuild({
      entryPoints: [wrapperPath],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: outFile,
      logLevel: 'silent',
    });
    const mod = await import(pathToFileURL(outFile).href);
    return { worldMod: mod.worldMod, networkMod: mod.networkMod };
  } finally {
    await rm(workTmp, { recursive: true, force: true });
  }
}

async function extractGitTree(gitRoot, ref) {
  const dir = await mkdtemp(path.join(tmpdir(), `slg-tree-${ref.replace(/[^a-zA-Z0-9_-]/g, '_')}-`));
  const tarBytes = execFileSync('git', ['-C', gitRoot, 'archive', ref, 'game'], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync('tar', ['-xf', '-', '-C', dir], { input: tarBytes });
  const gameDir = path.join(dir, 'game');
  const nm = path.join(DEFAULT_GAME_DIR, 'node_modules');
  if (existsSync(nm) && !existsSync(path.join(gameDir, 'node_modules'))) {
    await symlink(nm, path.join(gameDir, 'node_modules'));
  }
  return { tempRoot: dir, gameDir };
}

function classifyOwner(areaId, x, y, w = 1, h = 1, context = {}) {
  if (areaId === 'town-neighbor' || areaId === 'station-main-interior' || areaId === 'station-neighbor-interior') {
    return 'stations';
  }
  if (areaId.startsWith('shop-') && areaId !== 'shop-konbini-interior') {
    return 'shops-33';
  }
  if (context.facilityId === 'station' || context.portalId?.startsWith('station-') || context.interactionId?.startsWith('station-') && context.interactionId !== 'station-busstop') {
    return 'stations';
  }
  if (context.portalId && /-(enter|exit)$/.test(context.portalId) && !['home-enter', 'home-exit', 'school-enter', 'school-exit', 'konbini-enter', 'konbini-exit', 'station-enter', 'station-exit'].includes(context.portalId)) {
    return 'shops-33';
  }
  if (areaId === 'town-main') {
    const yEnd = y + h - 1;
    // Station/rail/crossing zone in PR #59 (y >= 80) or old station tiles (x=12..44, y=59..64 in main, x=6..50 y=68..73 rail in main)
    if (y >= 80 || yEnd >= 80) return 'stations';
    if (context.touchesRailOrCrossing) return 'stations';
    if (context.kind === 'station' || context.kind === 'train') return 'stations';
    // In 8c9e1a8 (before #35/#36), old rail was y=68..73, old station x=12..44 y=59..63
    if (context.legacyStationArea) return 'stations';
  }
  return 'map-fix';
}

export async function auditGameDir(gameDir, label = 'working-tree') {
  const { worldMod, networkMod } = await bundleAndLoadWorld(gameDir);
  const world = worldMod.buildWorld();
  const railLinks = networkMod?.TRAIN_NETWORK?.railLinks ? networkMod.TRAIN_NETWORK.railLinks() : undefined;
  const validateErrors = worldMod.validateWorld(world, railLinks ? { railLinks } : undefined);

  const findings = [];
  let seq = 0;
  const addFinding = (f) => {
    seq++;
    findings.push({ seq, tree: label, ...f });
  };

  for (const err of validateErrors) {
    addFinding({
      id: `validate:${err}`,
      areaId: 'world',
      severity: 'error',
      category: 'validate-world',
      owner: err.includes('station') ? 'stations' : 'map-fix',
      x: world.start.x, y: world.start.y, w: 1, h: 1,
      summary: `validateWorld failed: ${err}`,
      evidence: err,
    });
  }

  // Reachability across world portals (+ rail links + station ticket gates) from world.start
  const worldReach = new Map([...world.areas].map(([id]) => [id, new Set()]));
  {
    const departures = new Map();
    const addDep = (from, to) => {
      const key = `${from.areaId}:${from.x}:${from.y}`;
      const list = departures.get(key) ?? [];
      list.push(to);
      departures.set(key, list);
    };
    for (const link of railLinks ?? []) addDep(link.from, link.to);
    if (typeof worldMod.getStationFlow === 'function' && Array.isArray(worldMod.STATION_FLOW_IDS)) {
      for (const sid of worldMod.STATION_FLOW_IDS) {
        const flow = worldMod.getStationFlow(sid);
        if (flow?.gate && flow?.platforms?.[0]?.boardTile) {
          addDep({ areaId: flow.gate.areaId, x: flow.gate.front.x, y: flow.gate.front.y }, flow.platforms[0].boardTile);
          addDep({ areaId: flow.gate.areaId, x: flow.gate.inside.x, y: flow.gate.inside.y }, { areaId: flow.gate.areaId, x: flow.gate.outside.x, y: flow.gate.outside.y });
        }
      }
    }
    const queue = [];
    const visit = (areaId, x, y) => {
      const a = world.areas.get(areaId);
      const seen = worldReach.get(areaId);
      if (!a || !seen || x < 0 || y < 0 || x >= a.width || y >= a.height || a.solid[y * a.width + x]) return;
      const idx = y * a.width + x;
      if (seen.has(idx)) return;
      seen.add(idx);
      queue.push({ areaId, x, y });
    };
    visit(world.start.areaId, world.start.x, world.start.y);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      const a = world.areas.get(p.areaId);
      const portal = a.portalAt.get(p.y * a.width + p.x);
      if (portal) {
        visit(portal.to.areaId, portal.to.x, portal.to.y);
        continue;
      }
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        visit(p.areaId, p.x + dx, p.y + dy);
      }
      for (const to of departures.get(`${p.areaId}:${p.x}:${p.y}`) ?? []) {
        visit(to.areaId, to.x, to.y);
      }
    }
  }

  for (const [areaId, area] of world.areas) {
    const groundAt = (x, y) => (x < 0 || y < 0 || x >= area.width || y >= area.height ? 0 : area.ground[y * area.width + x]);
    const isSolid = (x, y) => x < 0 || y < 0 || x >= area.width || y >= area.height || area.solid[y * area.width + x] !== 0;

    // 1. Check objects placed on road, sidewalk, parkpath, rail, water, bank, hedge/fence, or indoor walls
    for (const o of area.objects) {
      const tiles = rectTiles(o);
      const tileIds = [...new Set(tiles.map(t => groundAt(t.x, t.y)))];
      const onRoad = tiles.filter(t => ROAD_TILES.has(groundAt(t.x, t.y)));
      const onBridge = tiles.filter(t => groundAt(t.x, t.y) === 11);
      const onRail = tiles.filter(t => RAIL_TILES.has(groundAt(t.x, t.y)));
      const onWater = tiles.filter(t => WATER_TILES.has(groundAt(t.x, t.y)) || groundAt(t.x, t.y) === 0);
      const onSidewalk = tiles.filter(t => groundAt(t.x, t.y) === 7);
      const onParkpath = tiles.filter(t => groundAt(t.x, t.y) === 13);
      const onHedgeOrFence = tiles.filter(t => groundAt(t.x, t.y) === 17 || groundAt(t.x, t.y) === 18);
      const onWall = tiles.filter(t => WALL_TILES.has(groundAt(t.x, t.y)));

      if (onRoad.length > 0 && o.solid !== false) {
        addFinding({
          id: `${areaId}:object-on-road:${o.id ?? o.kind}@${o.x},${o.y}`,
          areaId,
          severity: 'error',
          category: 'object-on-road',
          owner: classifyOwner(areaId, o.x, o.y, o.w, o.h, { kind: o.kind, facilityId: o.facilityId }),
          x: o.x, y: o.y, w: o.w, h: o.h,
          summary: `${o.kind} (${o.id ?? 'anon'}) placed on road surface (${onRoad.map(t => `${t.x},${t.y}:${tileName(groundAt(t.x, t.y))}`).join(', ')})`,
          evidence: `object=${JSON.stringify(o)}, roadTiles=${onRoad.length}`,
        });
      }
      if (onBridge.length > 0 && o.solid !== false) {
        addFinding({
          id: `${areaId}:object-on-bridge:${o.id ?? o.kind}@${o.x},${o.y}`,
          areaId,
          severity: 'error',
          category: 'object-on-road',
          owner: classifyOwner(areaId, o.x, o.y, o.w, o.h, { kind: o.kind, facilityId: o.facilityId }),
          x: o.x, y: o.y, w: o.w, h: o.h,
          summary: `${o.kind} (${o.id ?? 'anon'}) placed on bridge`,
          evidence: `object=${JSON.stringify(o)}`,
        });
      }
      if (onRail.length > 0 && !(o.kind === 'train' && o.solid === false)) {
        addFinding({
          id: `${areaId}:object-on-rail:${o.id ?? o.kind}@${o.x},${o.y}`,
          areaId,
          severity: 'error',
          category: 'object-on-rail-or-water',
          owner: classifyOwner(areaId, o.x, o.y, o.w, o.h, { kind: o.kind, facilityId: o.facilityId, touchesRailOrCrossing: true }),
          x: o.x, y: o.y, w: o.w, h: o.h,
          summary: `${o.kind} (${o.id ?? 'anon'}) overlaps rail/crossing tile (${tileName(groundAt(onRail[0].x, onRail[0].y))})`,
          evidence: `object=${JSON.stringify(o)}`,
        });
      }
      if (onWater.length > 0) {
        addFinding({
          id: `${areaId}:object-on-water:${o.id ?? o.kind}@${o.x},${o.y}`,
          areaId,
          severity: 'error',
          category: 'object-on-rail-or-water',
          owner: classifyOwner(areaId, o.x, o.y, o.w, o.h, { kind: o.kind, facilityId: o.facilityId }),
          x: o.x, y: o.y, w: o.w, h: o.h,
          summary: `${o.kind} (${o.id ?? 'anon'}) overlaps water/bank/void`,
          evidence: `tiles=${tileIds.map(tileName).join(',')}`,
        });
      }
      if (onHedgeOrFence.length > 0 && o.solid !== false) {
        addFinding({
          id: `${areaId}:object-on-hedge-or-fence:${o.id ?? o.kind}@${o.x},${o.y}`,
          areaId,
          severity: 'error',
          category: 'solid-overlap',
          owner: classifyOwner(areaId, o.x, o.y, o.w, o.h, { kind: o.kind, facilityId: o.facilityId }),
          x: o.x, y: o.y, w: o.w, h: o.h,
          summary: `${o.kind} (${o.id ?? 'anon'}) overlaps ${onHedgeOrFence.map(t => `${t.x},${t.y}:${tileName(groundAt(t.x, t.y))}`).join(', ')}`,
          evidence: `object=${JSON.stringify(o)}`,
        });
      }
      if (onParkpath.length > 0 && o.solid !== false) {
        addFinding({
          id: `${areaId}:object-on-parkpath:${o.id ?? o.kind}@${o.x},${o.y}`,
          areaId,
          severity: 'error',
          category: 'object-on-sidewalk',
          owner: classifyOwner(areaId, o.x, o.y, o.w, o.h, { kind: o.kind, facilityId: o.facilityId }),
          x: o.x, y: o.y, w: o.w, h: o.h,
          summary: `${o.kind} (${o.id ?? 'anon'}) placed on PARKPATH (${onParkpath.map(t => `${t.x},${t.y}`).join(', ')})`,
          evidence: `object=${JSON.stringify(o)}`,
        });
      }
      if (o.solid && o.w === 1 && o.h === 1 && !BUILDING_KINDS.has(o.kind)) {
        const plugsVerticalAlley =
          !isSolid(o.x, o.y - 1) && isSolid(o.x - 1, o.y - 1) && isSolid(o.x + 1, o.y - 1) &&
          !isSolid(o.x, o.y - 2) && isSolid(o.x - 1, o.y - 2) && isSolid(o.x + 1, o.y - 2);
        const plugsSouthAlley =
          !isSolid(o.x, o.y + 1) && isSolid(o.x - 1, o.y + 1) && isSolid(o.x + 1, o.y + 1) &&
          !isSolid(o.x, o.y + 2) && isSolid(o.x - 1, o.y + 2) && isSolid(o.x + 1, o.y + 2);
        if (plugsVerticalAlley || plugsSouthAlley) {
          addFinding({
            id: `${areaId}:alley-blocked:${o.id ?? o.kind}@${o.x},${o.y}`,
            areaId,
            severity: 'warning',
            category: 'entrance-access',
            owner: classifyOwner(areaId, o.x, o.y, o.w, o.h, { kind: o.kind, facilityId: o.facilityId }),
            x: o.x, y: o.y, w: o.w, h: o.h,
            summary: `${o.kind} (${o.id ?? 'anon'}) plugs 1-tile alley at (${o.x},${o.y})`,
            evidence: `object=${JSON.stringify(o)}`,
          });
        }
      }
      if (onSidewalk.length > 0 && o.solid) {
        // Check whether it cuts sidewalk continuity (blocks 1-tile sidewalk) or is a tree/building on sidewalk
        const isBlockingSidewalk = onSidewalk.some(t => {
          const leftWalk = groundAt(t.x - 1, t.y) === 7 && !isSolid(t.x - 1, t.y);
          const rightWalk = groundAt(t.x + 1, t.y) === 7 && !isSolid(t.x + 1, t.y);
          const upBlock = isSolid(t.x, t.y - 1) || ROAD_TILES.has(groundAt(t.x, t.y - 1));
          const downBlock = isSolid(t.x, t.y + 1) || ROAD_TILES.has(groundAt(t.x, t.y + 1));
          const upWalk = groundAt(t.x, t.y - 1) === 7 && !isSolid(t.x, t.y - 1);
          const downWalk = groundAt(t.x, t.y + 1) === 7 && !isSolid(t.x, t.y + 1);
          const leftBlock = isSolid(t.x - 1, t.y) || ROAD_TILES.has(groundAt(t.x - 1, t.y));
          const rightBlock = isSolid(t.x + 1, t.y) || ROAD_TILES.has(groundAt(t.x + 1, t.y));
          return (leftWalk && rightWalk && upBlock && downBlock) || (upWalk && downWalk && leftBlock && rightBlock);
        });
        addFinding({
          id: `${areaId}:object-on-sidewalk:${o.id ?? o.kind}@${o.x},${o.y}`,
          areaId,
          severity: isBlockingSidewalk || o.kind === 'tree' || BUILDING_KINDS.has(o.kind) ? 'error' : 'warning',
          category: 'object-on-sidewalk',
          owner: classifyOwner(areaId, o.x, o.y, o.w, o.h, { kind: o.kind, facilityId: o.facilityId }),
          x: o.x, y: o.y, w: o.w, h: o.h,
          summary: `${o.kind} (${o.id ?? 'anon'}) placed on SIDEWALK${isBlockingSidewalk ? ' (blocks 1-tile sidewalk)' : ''}`,
          evidence: `object=${JSON.stringify(o)}, blocksSidewalk=${isBlockingSidewalk}`,
        });
      }
      if (area.def.kind === 'indoor' && onWall.length > 0 && o.solid) {
        addFinding({
          id: `${areaId}:solid-on-wall:${o.id ?? o.kind}@${o.x},${o.y}`,
          areaId,
          severity: 'error',
          category: 'object-on-rail-or-water',
          owner: classifyOwner(areaId, o.x, o.y, o.w, o.h, { kind: o.kind }),
          x: o.x, y: o.y, w: o.w, h: o.h,
          summary: `Solid indoor ${o.kind} (${o.id ?? 'anon'}) placed on wall tile`,
          evidence: `object=${JSON.stringify(o)}`,
        });
      }
    }

    // Check interactions placed on road / rail / water / sidewalk / hedge
    for (const inter of area.interactions) {
      const tiles = rectTiles(inter);
      const onRoad = tiles.filter(t => ROAD_TILES.has(groundAt(t.x, t.y)));
      const onRail = tiles.filter(t => RAIL_TILES.has(groundAt(t.x, t.y)));
      const onWater = tiles.filter(t => WATER_TILES.has(groundAt(t.x, t.y)) || groundAt(t.x, t.y) === 0);
      const onSidewalk = tiles.filter(t => groundAt(t.x, t.y) === 7);
      const onHedgeOrFence = tiles.filter(t => groundAt(t.x, t.y) === 17 || groundAt(t.x, t.y) === 18);
      if (onRoad.length > 0) {
        addFinding({
          id: `${areaId}:interaction-on-road:${inter.id}@${inter.x},${inter.y}`,
          areaId,
          severity: 'error',
          category: 'object-on-road',
          owner: classifyOwner(areaId, inter.x, inter.y, inter.w, inter.h, { interactionId: inter.id }),
          x: inter.x, y: inter.y, w: inter.w ?? 1, h: inter.h ?? 1,
          summary: `Interaction ${inter.id} (${inter.kind}) on road surface`,
          evidence: `interaction=${inter.id} at (${inter.x},${inter.y})`,
        });
      }
      if (onRail.length > 0) {
        addFinding({
          id: `${areaId}:interaction-on-rail:${inter.id}@${inter.x},${inter.y}`,
          areaId,
          severity: 'error',
          category: 'object-on-rail-or-water',
          owner: classifyOwner(areaId, inter.x, inter.y, inter.w, inter.h, { interactionId: inter.id, touchesRailOrCrossing: true }),
          x: inter.x, y: inter.y, w: inter.w ?? 1, h: inter.h ?? 1,
          summary: `Interaction ${inter.id} (${inter.kind}) on rail/crossing`,
          evidence: `interaction=${inter.id}`,
        });
      }
      if (onWater.length > 0) {
        addFinding({
          id: `${areaId}:interaction-on-water:${inter.id}@${inter.x},${inter.y}`,
          areaId,
          severity: 'error',
          category: 'object-on-rail-or-water',
          owner: classifyOwner(areaId, inter.x, inter.y, inter.w, inter.h, { interactionId: inter.id }),
          x: inter.x, y: inter.y, w: inter.w ?? 1, h: inter.h ?? 1,
          summary: `Interaction ${inter.id} (${inter.kind}) on water/bank`,
          evidence: `interaction=${inter.id}`,
        });
      }
      if (onHedgeOrFence.length > 0) {
        addFinding({
          id: `${areaId}:interaction-on-hedge:${inter.id}@${inter.x},${inter.y}`,
          areaId,
          severity: 'error',
          category: 'solid-overlap',
          owner: classifyOwner(areaId, inter.x, inter.y, inter.w, inter.h, { interactionId: inter.id }),
          x: inter.x, y: inter.y, w: inter.w ?? 1, h: inter.h ?? 1,
          summary: `Interaction ${inter.id} (${inter.kind}) overlaps ${onHedgeOrFence.map(t => `${t.x},${t.y}:${tileName(groundAt(t.x, t.y))}`).join(', ')}`,
          evidence: `interaction=${inter.id}`,
        });
      }
      if (onSidewalk.length > 0 && inter.kind === 'npc') {
        addFinding({
          id: `${areaId}:npc-on-sidewalk:${inter.id}@${inter.x},${inter.y}`,
          areaId,
          severity: 'warning',
          category: 'object-on-sidewalk',
          owner: classifyOwner(areaId, inter.x, inter.y, inter.w, inter.h, { interactionId: inter.id }),
          x: inter.x, y: inter.y, w: inter.w ?? 1, h: inter.h ?? 1,
          summary: `NPC ${inter.id} standing on sidewalk`,
          evidence: `interaction=${inter.id} at (${inter.x},${inter.y})`,
        });
      }
    }

    // 2. Entity footprint overlaps (based on solid occupancy / footprint, preserving intentional decals & prop+interaction pairs)
    for (let i = 0; i < area.objects.length; i++) {
      const a = area.objects[i];
      for (let j = i + 1; j < area.objects.length; j++) {
        const b = area.objects[j];
        if (!rectsOverlap(a, b)) continue;
        // Intentional decorative layer overlaps: e.g. rug under furniture indoors
        const intentionalDecal = (!a.solid && b.solid && a.kind === 'rug') || (!b.solid && a.solid && b.kind === 'rug');
        if (intentionalDecal) continue;
        const severity = (a.solid && b.solid) ? 'error' : 'warning';
        addFinding({
          id: `${areaId}:object-overlap:${a.id ?? a.kind}+${b.id ?? b.kind}@${Math.max(a.x, b.x)},${Math.max(a.y, b.y)}`,
          areaId,
          severity,
          category: 'solid-overlap',
          owner: classifyOwner(areaId, Math.max(a.x, b.x), Math.max(a.y, b.y), 1, 1, { kind: a.kind, facilityId: a.facilityId ?? b.facilityId }),
          x: Math.max(a.x, b.x), y: Math.max(a.y, b.y),
          w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
          h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
          summary: `Objects overlap: ${a.id ?? a.kind} (${a.x},${a.y} ${a.w}x${a.h}, solid=${a.solid}) vs ${b.id ?? b.kind} (${b.x},${b.y} ${b.w}x${b.h}, solid=${b.solid})`,
          evidence: `A=${JSON.stringify(a)} B=${JSON.stringify(b)}`,
        });
      }
    }

    // Object vs Interaction overlaps
    for (const o of area.objects) {
      for (const inter of area.interactions) {
        if (!rectsOverlap(o, inter)) continue;
        // Same-entity visual prop + interaction trigger (non-npc) or floor decal (rug) under furniture is intentional
        if (inter.kind !== 'npc' && (sameRect(o, inter) || (!o.solid && o.kind === 'rug'))) continue;
        addFinding({
          id: `${areaId}:obj-inter-overlap:${o.id ?? o.kind}+${inter.id}@${inter.x},${inter.y}`,
          areaId,
          severity: 'error',
          category: 'solid-overlap',
          owner: classifyOwner(areaId, inter.x, inter.y, inter.w, inter.h, { interactionId: inter.id, facilityId: o.facilityId }),
          x: inter.x, y: inter.y, w: inter.w ?? 1, h: inter.h ?? 1,
          summary: `Object ${o.id ?? o.kind} overlaps interaction ${inter.id} (${inter.kind})`,
          evidence: `object=${JSON.stringify(o)}, interaction=${inter.id}`,
        });
      }
    }

    // Interaction vs Interaction overlaps
    for (let i = 0; i < area.interactions.length; i++) {
      const a = area.interactions[i];
      for (let j = i + 1; j < area.interactions.length; j++) {
        const b = area.interactions[j];
        if (!rectsOverlap(a, b)) continue;
        addFinding({
          id: `${areaId}:inter-overlap:${a.id}+${b.id}@${Math.max(a.x, b.x)},${Math.max(a.y, b.y)}`,
          areaId,
          severity: 'error',
          category: 'solid-overlap',
          owner: classifyOwner(areaId, a.x, a.y, a.w, a.h, { interactionId: a.id }),
          x: a.x, y: a.y, w: a.w ?? 1, h: a.h ?? 1,
          summary: `Interactions overlap: ${a.id} vs ${b.id}`,
          evidence: `A=${a.id} B=${b.id}`,
        });
      }
    }

    // Portal vs Object/Interaction/Portal overlaps
    for (const p of area.def.portals) {
      const pr = { x: p.from.x, y: p.from.y, w: p.from.w ?? 1, h: 1 };
      for (const o of area.objects) {
        if (!o.solid || !rectsOverlap(pr, o)) continue;
        const isOwnBottomDoor = o.facilityId && o.facilityId === p.facilityId && p.from.y === o.y + o.h - 1;
        if (isOwnBottomDoor) continue;
        addFinding({
          id: `${areaId}:portal-obj-overlap:${p.id}+${o.id ?? o.kind}@${p.from.x},${p.from.y}`,
          areaId,
          severity: 'error',
          category: 'solid-overlap',
          owner: classifyOwner(areaId, p.from.x, p.from.y, pr.w, 1, { portalId: p.id, facilityId: p.facilityId }),
          x: p.from.x, y: p.from.y, w: pr.w, h: 1,
          summary: `Portal ${p.id} overlaps unrelated solid object ${o.id ?? o.kind}`,
          evidence: `portal=${JSON.stringify(p)}`,
        });
      }
      for (const inter of area.interactions) {
        if (!rectsOverlap(pr, inter)) continue;
        addFinding({
          id: `${areaId}:portal-inter-overlap:${p.id}+${inter.id}@${p.from.x},${p.from.y}`,
          areaId,
          severity: 'error',
          category: 'solid-overlap',
          owner: classifyOwner(areaId, p.from.x, p.from.y, pr.w, 1, { portalId: p.id, interactionId: inter.id }),
          x: p.from.x, y: p.from.y, w: pr.w, h: 1,
          summary: `Portal ${p.id} overlaps interaction ${inter.id}`,
          evidence: `portal=${p.id}, interaction=${inter.id}`,
        });
      }
    }

    // 3. Outdoor road / sidewalk / crossing / bridge / district continuity
    if (area.def.kind === 'outdoor') {
      // 3a. District coverage
      const missingDistrictTiles = [];
      for (let y = 0; y < area.height; y++) {
        for (let x = 0; x < area.width; x++) {
          if (!area.def.districts?.some(d => x >= d.x && y >= d.y && x < d.x + d.w && y < d.y + d.h)) {
            missingDistrictTiles.push({ x, y });
          }
        }
      }
      if (missingDistrictTiles.length > 0) {
        const minX = Math.min(...missingDistrictTiles.map(t => t.x));
        const maxX = Math.max(...missingDistrictTiles.map(t => t.x));
        const minY = Math.min(...missingDistrictTiles.map(t => t.y));
        const maxY = Math.max(...missingDistrictTiles.map(t => t.y));
        addFinding({
          id: `${areaId}:district-coverage:${minX},${minY}-${maxX},${maxY}`,
          areaId,
          severity: 'warning',
          category: 'road-discontinuity',
          owner: classifyOwner(areaId, minX, minY, maxX - minX + 1, maxY - minY + 1),
          x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1,
          summary: `${missingDistrictTiles.length} tiles have no district assignment (bounds x:${minX}..${maxX}, y:${minY}..${maxY})`,
          evidence: `count=${missingDistrictTiles.length}`,
        });
      }

      // 3b. Road network connectivity (carriageway + road bridges + road crossings)
      const isRoadNetworkTile = (x, y) => {
        const g = groundAt(x, y);
        if (ROAD_TILES.has(g)) return true;
        if (g === 11) { // BRIDGE
          // Road bridge if adjacent to road or another road bridge
          return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ROAD_TILES.has(groundAt(x + dx, y + dy)));
        }
        if (g === 15) { // CROSSING
          return ROAD_TILES.has(groundAt(x, y - 1)) || ROAD_TILES.has(groundAt(x, y + 1)) ||
            ROAD_TILES.has(groundAt(x - 1, y)) || ROAD_TILES.has(groundAt(x + 1, y));
        }
        return false;
      };
      // Expand bridge/crossing transitivity
      const roadSet = new Set();
      for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) {
        if (ROAD_TILES.has(groundAt(x, y))) roadSet.add(y * area.width + x);
      }
      let changed = true;
      while (changed) {
        changed = false;
        for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) {
          const idx = y * area.width + x;
          if (roadSet.has(idx)) continue;
          const g = groundAt(x, y);
          if (g !== 11 && g !== 15) continue;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const nx = x + dx, ny = y + dy;
            return nx >= 0 && ny >= 0 && nx < area.width && ny < area.height && roadSet.has(ny * area.width + nx);
          })) {
            roadSet.add(idx);
            changed = true;
          }
        }
      }
      // Check road connected components
      const roadVisited = new Set();
      const roadComponents = [];
      for (const idx of roadSet) {
        if (roadVisited.has(idx)) continue;
        const comp = [];
        const q = [idx];
        roadVisited.add(idx);
        for (let i = 0; i < q.length; i++) {
          const cur = q[i];
          const cx = cur % area.width, cy = Math.floor(cur / area.width);
          comp.push({ x: cx, y: cy });
          for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= area.width || ny >= area.height) continue;
            const nIdx = ny * area.width + nx;
            if (roadSet.has(nIdx) && !roadVisited.has(nIdx)) {
              roadVisited.add(nIdx);
              q.push(nIdx);
            }
          }
        }
        roadComponents.push(comp);
      }
      if (roadComponents.length > 1) {
        roadComponents.sort((a, b) => b.length - a.length);
        for (let c = 1; c < roadComponents.length; c++) {
          const sample = roadComponents[c][0];
          addFinding({
            id: `${areaId}:road-disconnected:${sample.x},${sample.y}`,
            areaId,
            severity: 'error',
            category: 'road-discontinuity',
            owner: classifyOwner(areaId, sample.x, sample.y, 1, 1, { touchesRailOrCrossing: true }),
            x: sample.x, y: sample.y, w: 1, h: 1,
            summary: `Disconnected road component (${roadComponents[c].length} tiles) starting at (${sample.x},${sample.y})`,
            evidence: `componentSize=${roadComponents[c].length}`,
          });
        }
      }

      // 3c. Check carriageway dead-ends / abrupt terminations (roads ending internally without touching boundary, plaza, or another road)
      // Specifically detect road rows/cols that end against GRASS/RAIL_GUARD/WATER/RAIL internally.
      for (let y = 1; y < area.height - 1; y++) {
        for (let x = 1; x < area.width - 1; x++) {
          if (!ROAD_TILES.has(groundAt(x, y))) continue;
          const isHorizRun = ROAD_TILES.has(groundAt(x - 1, y)) && !ROAD_TILES.has(groundAt(x + 1, y)) && groundAt(x + 1, y) !== 11 && groundAt(x + 1, y) !== 15;
          const isVertRun = ROAD_TILES.has(groundAt(x, y - 1)) && !ROAD_TILES.has(groundAt(x, y + 1)) && groundAt(x, y + 1) !== 11 && groundAt(x, y + 1) !== 15;
          // Check east/south ends where a 2+ wide carriageway stops abruptly into grass/rail_guard/water (ignoring SIDEWALK/PLAZA border of T-junctions)
          if (isHorizRun && groundAt(x + 1, y) !== 7 && groundAt(x + 1, y) !== 8) {
            addFinding({
              id: `${areaId}:road-east-deadend:${x},${y}`,
              areaId,
              severity: 'warning',
              category: 'road-discontinuity',
              owner: classifyOwner(areaId, x, y),
              x, y, w: 1, h: 1,
              summary: `Road terminates abruptly east into ${tileName(groundAt(x + 1, y))} at (${x},${y})`,
              evidence: `next=${tileName(groundAt(x + 1, y))}`,
            });
          }
          if (isVertRun && groundAt(x, y + 1) !== 7 && groundAt(x, y + 1) !== 8) {
            const touchingRail = RAIL_TILES.has(groundAt(x, y + 1)) || RAIL_TILES.has(groundAt(x, y + 2));
            addFinding({
              id: `${areaId}:road-south-deadend:${x},${y}`,
              areaId,
              severity: touchingRail ? 'error' : 'warning',
              category: 'road-discontinuity',
              owner: classifyOwner(areaId, x, y, 1, 1, { touchesRailOrCrossing: touchingRail }),
              x, y, w: 1, h: 1,
              summary: `Road terminates abruptly south into ${tileName(groundAt(x, y + 1))} at (${x},${y})`,
              evidence: `next=${tileName(groundAt(x, y + 1))}`,
            });
          }
        }
      }

      // 3d. Check zebra crosswalk integrity (ZEBRA_H / ZEBRA_V flanked properly and unobstructed)
      for (let y = 0; y < area.height; y++) {
        for (let x = 0; x < area.width; x++) {
          const g = groundAt(x, y);
          if (!ZEBRA_TILES.has(g)) continue;
          if (g === 5) { // ZEBRA_H runs N-S across an E-W street? Wait: ZEBRA_H has horizontal stripes stacked vertically for crossing N-S!
            const n = groundAt(x, y - 1), s = groundAt(x, y + 1);
            const hasSidewalkOrZebra = (t) => t === 5 || t === 7 || t === 8 || t === 13;
            if (!hasSidewalkOrZebra(n) && !ROAD_TILES.has(n)) {
              addFinding({
                id: `${areaId}:zebra-north-break:${x},${y}`,
                areaId,
                severity: 'warning',
                category: 'road-discontinuity',
                owner: classifyOwner(areaId, x, y),
                x, y, w: 1, h: 1,
                summary: `Crosswalk ZEBRA_H at (${x},${y}) meets ${tileName(n)} to the north`,
                evidence: `north=${tileName(n)}`,
              });
            }
            if (!hasSidewalkOrZebra(s) && !ROAD_TILES.has(s)) {
              addFinding({
                id: `${areaId}:zebra-south-break:${x},${y}`,
                areaId,
                severity: 'warning',
                category: 'road-discontinuity',
                owner: classifyOwner(areaId, x, y),
                x, y, w: 1, h: 1,
                summary: `Crosswalk ZEBRA_H at (${x},${y}) meets ${tileName(s)} to the south`,
                evidence: `south=${tileName(s)}`,
              });
            }
          }
        }
      }

      // 3e. Check sidewalk continuity along roads (sidewalk overwritten by non-sidewalk/non-plaza/non-road/non-parkpath or 1-tile break)
      for (let y = 1; y < area.height - 1; y++) {
        for (let x = 1; x < area.width - 1; x++) {
          const g = groundAt(x, y);
          if (g !== 7) continue; // SIDEWALK
          // Check horizontal sidewalk gap: sidewalk at (x-1,y) and (x+1,y) -> already sidewalk here, what about neighbor that is NOT sidewalk?
          // Better: check any tile adjacent to road that is GRASS/GARDEN/HEDGE/FENCE while flanked by SIDEWALK on both sides along the road!
        }
      }
      for (let y = 1; y < area.height - 1; y++) {
        for (let x = 1; x < area.width - 1; x++) {
          const g = groundAt(x, y);
          if (g === 7 || ROAD_TILES.has(g) || g === 8 || g === 11 || g === 15 || WATER_TILES.has(g) || RAIL_TILES.has(g)) continue;
          const adjRoad = ROAD_TILES.has(groundAt(x, y - 1)) || ROAD_TILES.has(groundAt(x, y + 1)) ||
            ROAD_TILES.has(groundAt(x - 1, y)) || ROAD_TILES.has(groundAt(x + 1, y));
          if (!adjRoad) continue;
          const horizSidewalkGap = groundAt(x - 1, y) === 7 && groundAt(x + 1, y) === 7;
          const vertSidewalkGap = groundAt(x, y - 1) === 7 && groundAt(x, y + 1) === 7;
          if (horizSidewalkGap || vertSidewalkGap) {
            addFinding({
              id: `${areaId}:sidewalk-gap:${x},${y}`,
              areaId,
              severity: g === 13 ? 'info' : 'error',
              category: 'road-discontinuity',
              owner: classifyOwner(areaId, x, y),
              x, y, w: 1, h: 1,
              summary: `Sidewalk interrupted by ${tileName(g)} at (${x},${y})`,
              evidence: `tile=${tileName(g)}, horizGap=${horizSidewalkGap}, vertGap=${vertSidewalkGap}`,
            });
          }
        }
      }

      // 3f. Check BRIDGE ends connected to walkable ground
      for (let y = 0; y < area.height; y++) {
        for (let x = 0; x < area.width; x++) {
          if (groundAt(x, y) !== 11) continue;
          if (isSolid(x, y)) {
            addFinding({
              id: `${areaId}:bridge-solid:${x},${y}`,
              areaId,
              severity: 'error',
              category: 'road-discontinuity',
              owner: classifyOwner(areaId, x, y),
              x, y, w: 1, h: 1,
              summary: `Bridge tile at (${x},${y}) is solid`,
              evidence: `solid=1`,
            });
          }
          // Every bridge tile must have at least 2 walkable non-water neighbors (or bridge neighbor)
          const walkN = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dy]) => !isSolid(x + dx, y + dy)).length;
          if (walkN < 2) {
            addFinding({
              id: `${areaId}:bridge-blocked:${x},${y}`,
              areaId,
              severity: 'error',
              category: 'road-discontinuity',
              owner: classifyOwner(areaId, x, y),
              x, y, w: 1, h: 1,
              summary: `Bridge tile at (${x},${y}) has fewer than 2 walkable neighbors (${walkN})`,
              evidence: `walkNeighbors=${walkN}`,
            });
          }
        }
      }
    }

    // 4. Building door fronts & paved/walkable approach checks
    const startPoint = areaId === world.start.areaId ? world.start
      : area.def.portals[0]?.to ? null : null;
    const areaStart = areaId === world.start.areaId
      ? { x: world.start.x, y: world.start.y }
      : [...(worldReach.get(areaId) ?? [])].map(idx => ({ x: idx % area.width, y: Math.floor(idx / area.width) }))[0];

    const areaReach = worldReach.get(areaId) ?? new Set();
    const buildings = area.objects.filter(o => BUILDING_KINDS.has(o.kind));
    for (const b of buildings) {
      const doorX = b.kind === 'school' ? b.x + Math.floor(b.w / 2) - 1 : b.x + Math.floor(b.w / 2);
      const doorW = b.kind === 'school' ? 2 : 1;
      const frontY = b.y + b.h;
      for (let dx = 0; dx < doorW; dx++) {
        const fx = doorX + dx;
        const fy = frontY;
        const groundTile = groundAt(fx, fy);
        const solidFront = isSolid(fx, fy);
        const standable = !solidFront && canStandTileCenter(area, fx, fy);
        const reachable = !solidFront && areaReach.has(fy * area.width + fx);
        const isStationOld = areaId === 'town-main' && b.kind === 'station';
        const owner = classifyOwner(areaId, fx, fy, 1, 1, { kind: b.kind, facilityId: b.facilityId });
        if (solidFront || !standable || !reachable) {
          addFinding({
            id: `${areaId}:door-blocked:${b.id ?? b.kind}@${fx},${fy}`,
            areaId,
            severity: 'error',
            category: 'entrance-access',
            owner,
            x: fx, y: fy, w: 1, h: 1,
            summary: `Building ${b.id ?? b.kind} door front (${fx},${fy}) is ${solidFront ? 'SOLID' : !standable ? 'NOT STANDABLE' : 'UNREACHABLE'} (ground=${tileName(groundTile)})`,
            evidence: `building=${b.id ?? b.kind}, solid=${solidFront}, standable=${standable}, reachable=${reachable}`,
          });
        } else if (!PAVED_TILES.has(groundTile) && groundTile !== 12 && !isStationOld) {
          // Check if door front sits on unpaved grass/garden without paved approach
          addFinding({
            id: `${areaId}:door-unpaved:${b.id ?? b.kind}@${fx},${fy}`,
            areaId,
            severity: 'warning',
            category: 'entrance-access',
            owner,
            x: fx, y: fy, w: 1, h: 1,
            summary: `Building ${b.id ?? b.kind} door front (${fx},${fy}) is on ${tileName(groundTile)} (not paved)`,
            evidence: `building=${b.id ?? b.kind}, ground=${tileName(groundTile)}`,
          });
        } else {
          // Check if door front has a paved connection to a road/sidewalk/plaza/parkpath
          // Flood over paved tiles from (fx, fy) to see if it connects to main road/sidewalk/plaza network
          if (area.def.kind === 'outdoor') {
            let touchesPavedNetwork = false;
            const visited = new Set([fy * area.width + fx]);
            const q = [{ x: fx, y: fy }];
            for (let qi = 0; qi < q.length; qi++) {
              const cur = q[qi];
              const g = groundAt(cur.x, cur.y);
              if (ROAD_TILES.has(g) || g === 7 || g === 8 || g === 12) { touchesPavedNetwork = true; break; }
              for (const [ddx, ddy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
                const nx = cur.x + ddx, ny = cur.y + ddy;
                if (nx < 0 || ny < 0 || nx >= area.width || ny >= area.height || isSolid(nx, ny)) continue;
                const ng = groundAt(nx, ny);
                if (!PAVED_TILES.has(ng) && ng !== 12) continue;
                const nIdx = ny * area.width + nx;
                if (visited.has(nIdx)) continue;
                visited.add(nIdx);
                q.push({ x: nx, y: ny });
              }
            }
            if (!touchesPavedNetwork) {
              addFinding({
                id: `${areaId}:door-no-paved-approach:${b.id ?? b.kind}@${fx},${fy}`,
                areaId,
                severity: 'warning',
                category: 'entrance-access',
                owner,
                x: fx, y: fy, w: 1, h: 1,
                summary: `Building ${b.id ?? b.kind} door front (${fx},${fy}) paved tile (${tileName(groundTile)}) does not connect to street/sidewalk/plaza`,
                evidence: `building=${b.id ?? b.kind}, ground=${tileName(groundTile)}`,
              });
            }
          }
        }
      }
    }

    // 5. Portal reachability & roundtrip consistency
    for (const p of area.def.portals) {
      const doorTiles = [];
      for (let dx = 0; dx < (p.from.w ?? 1); dx++) doorTiles.push({ x: p.from.x + dx, y: p.from.y });
      const anyReached = doorTiles.some(t => areaReach.has(t.y * area.width + t.x));
      if (!anyReached) {
        addFinding({
          id: `${areaId}:portal-unreachable:${p.id}`,
          areaId,
          severity: 'error',
          category: 'entrance-access',
          owner: classifyOwner(areaId, p.from.x, p.from.y, p.from.w ?? 1, 1, { portalId: p.id, facilityId: p.facilityId }),
          x: p.from.x, y: p.from.y, w: p.from.w ?? 1, h: 1,
          summary: `Portal ${p.id} is unreachable from start`,
          evidence: `portal=${JSON.stringify(p)}`,
        });
      }
      const destArea = world.areas.get(p.to.areaId);
      if (!destArea || destArea.solid[p.to.y * destArea.width + p.to.x] !== 0) {
        addFinding({
          id: `${areaId}:portal-solid-dest:${p.id}`,
          areaId,
          severity: 'error',
          category: 'entrance-access',
          owner: classifyOwner(areaId, p.from.x, p.from.y, p.from.w ?? 1, 1, { portalId: p.id, facilityId: p.facilityId }),
          x: p.from.x, y: p.from.y, w: p.from.w ?? 1, h: 1,
          summary: `Portal ${p.id} destination (${p.to.areaId}:${p.to.x},${p.to.y}) is solid or missing`,
          evidence: `to=${JSON.stringify(p.to)}`,
        });
      }
    }

    // 6. Interaction accessibility
    for (const inter of area.interactions) {
      let accessible = false;
      for (const t of rectTiles(inter)) {
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const nx = t.x + dx, ny = t.y + dy;
          if (nx < 0 || ny < 0 || nx >= area.width || ny >= area.height) continue;
          const idx = ny * area.width + nx;
          if (!area.solid[idx] && !area.portalAt.has(idx) && areaReach.has(idx)) {
            accessible = true;
            break;
          }
        }
        if (accessible) break;
      }
      if (!accessible) {
        addFinding({
          id: `${areaId}:interaction-unreachable:${inter.id}`,
          areaId,
          severity: 'error',
          category: 'entrance-access',
          owner: classifyOwner(areaId, inter.x, inter.y, inter.w, inter.h, { interactionId: inter.id }),
          x: inter.x, y: inter.y, w: inter.w ?? 1, h: inter.h ?? 1,
          summary: `Interaction ${inter.id} (${inter.name}) has no reachable adjacent tile`,
          evidence: `interaction=${inter.id}`,
        });
      }
    }

    // 7. Unreachable walkable pockets
    const unreachedPockets = [];
    const pocketSeen = new Set();
    for (let y = 0; y < area.height; y++) {
      for (let x = 0; x < area.width; x++) {
        const idx = y * area.width + x;
        if (area.solid[idx] || areaReach.has(idx) || pocketSeen.has(idx)) continue;
        const comp = bfsComponent(area, x, y);
        for (const k of comp) pocketSeen.add(k);
        const pts = [...comp].map(k => ({ x: k % area.width, y: Math.floor(k / area.width) }));
        unreachedPockets.push(pts);
      }
    }
    for (const pts of unreachedPockets) {
      const sample = pts[0];
      const touchesRail = pts.some(t => RAIL_TILES.has(groundAt(t.x, t.y - 1)) || RAIL_TILES.has(groundAt(t.x, t.y + 1)));
      addFinding({
        id: `${areaId}:isolated-walkable:${sample.x},${sample.y}`,
        areaId,
        severity: 'warning',
        category: 'road-discontinuity',
        owner: classifyOwner(areaId, sample.x, sample.y, 1, 1, { touchesRailOrCrossing: touchesRail }),
        x: sample.x, y: sample.y, w: 1, h: 1,
        summary: `Isolated walkable pocket of ${pts.length} tile(s) at (${sample.x},${sample.y})`,
        evidence: `tiles=${pts.slice(0, 6).map(t => `(${t.x},${t.y})`).join(',')}${pts.length > 6 ? '...' : ''}`,
      });
    }
  }

  // Summary counts
  const byCategory = {};
  const byOwner = {};
  const bySeverity = {};
  for (const f of findings) {
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    byOwner[f.owner] = (byOwner[f.owner] ?? 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
  }

  return { tree: label, gameDir, summary: { total: findings.length, bySeverity, byCategory, byOwner }, findings };
}

async function findAllowedFreePort() {
  for (let port = 5480; port <= 5590; port++) {
    if (FORBIDDEN_PORTS.has(port)) continue;
    const ok = await new Promise(resolve => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
    });
    if (ok) return port;
  }
  throw new Error('No free allowed port found in 5480..5590');
}

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`Server timed out: ${url}`);
}

async function captureScreenshots(gameDir, findings, outDir) {
  const { chromium } = await import('playwright');
  await mkdir(outDir, { recursive: true });
  const port = await findAllowedFreePort();
  const viteBin = path.join(DEFAULT_GAME_DIR, 'node_modules/.bin/vite');
  const server = spawn(viteBin, ['--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: gameDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLogs = '';
  server.stdout.on('data', d => { serverLogs += d.toString(); });
  server.stderr.on('data', d => { serverLogs += d.toString(); });
  const url = `http://127.0.0.1:${port}/?review=1`;
  let browser;
  try {
    await waitForHttp(url);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__slg?.game && !!window.__slg?.renderer);

    const captured = [];
    for (const f of findings) {
      if (f.areaId === 'world') continue;
      const fileName = `${String(f.seq).padStart(3, '0')}-${f.areaId}-${f.category}-${f.x}-${f.y}.png`;
      const outPath = path.join(outDir, fileName);
      await page.evaluate(({ areaId, x, y, w, h, label }) => {
        const { game, renderer } = window.__slg;
        const area = game.world.areas.get(areaId);
        if (!area) return;
        const px = (x + (w ?? 1) / 2) * 16;
        const py = (y + (h ?? 1) / 2) * 16 + 6;
        game.player = { areaId, x: px, y: py, facing: 'down' };
        renderer.draw(game, performance.now() / 1000);

        // Draw lightweight DOM target box aligned to exact tile bounds without mutating game canvas
        let overlay = document.getElementById('__audit_box');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = '__audit_box';
          overlay.style.position = 'fixed';
          overlay.style.pointerEvents = 'none';
          overlay.style.border = '3px solid #ff2d55';
          overlay.style.background = 'rgba(255, 45, 85, 0.15)';
          overlay.style.boxSizing = 'border-box';
          overlay.style.zIndex = '99999';
          const badge = document.createElement('div');
          badge.id = '__audit_badge';
          badge.style.position = 'fixed';
          badge.style.top = '8px';
          badge.style.left = '8px';
          badge.style.padding = '4px 8px';
          badge.style.background = 'rgba(20, 20, 28, 0.88)';
          badge.style.color = '#fff';
          badge.style.font = 'bold 12px monospace';
          badge.style.zIndex = '99999';
          document.body.appendChild(overlay);
          document.body.appendChild(badge);
        }
        const { camX, camY, zoom } = renderer.stats;
        const dpr = window.devicePixelRatio || 1;
        const scale = zoom / dpr;
        overlay.style.left = `${(x * 16 - camX) * scale}px`;
        overlay.style.top = `${(y * 16 - camY) * scale}px`;
        overlay.style.width = `${(w ?? 1) * 16 * scale}px`;
        overlay.style.height = `${(h ?? 1) * 16 * scale}px`;
        document.getElementById('__audit_badge').textContent = label;
      }, { ...f, label: `[${f.tree}] #${f.seq} ${f.owner} | ${f.category} | ${f.areaId} (${f.x},${f.y})` });
      await page.waitForTimeout(80);
      await page.screenshot({ path: outPath });
      f.screenshot = outPath;
      captured.push(outPath);
    }
    return captured;
  } catch (err) {
    throw new Error(`Screenshot capture failed: ${err.message}\nVite logs:\n${serverLogs}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
  }
}

function formatMarkdown(results) {
  const lines = ['# Map Consistency Audit Report', ''];
  for (const r of results) {
    lines.push(`## Tree: \`${r.tree}\` (${r.summary.total} findings)`);
    lines.push(`- By severity: ${JSON.stringify(r.summary.bySeverity)}`);
    lines.push(`- By owner: ${JSON.stringify(r.summary.byOwner)}`);
    lines.push(`- By category: ${JSON.stringify(r.summary.byCategory)}`);
    lines.push('');
    lines.push('| # | Owner | Severity | Category | Area | Tile (x,y w×h) | Summary | Evidence | Image |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const f of r.findings) {
      const img = f.screenshot ? path.basename(f.screenshot) : '-';
      lines.push(`| ${f.seq} | ${f.owner} | ${f.severity} | ${f.category} | \`${f.areaId}\` | (${f.x},${f.y}) ${f.w ?? 1}×${f.h ?? 1} | ${f.summary.replace(/\|/g, '\\|')} | ${f.evidence.replace(/\|/g, '\\|')} | ${img} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const opts = { json: false, failOnError: false, compare: null, ref: null, root: null, screenshots: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--fail-on-error') opts.failOnError = true;
    else if (a === '--compare') opts.compare = argv[++i]?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
    else if (a === '--ref') opts.ref = argv[++i];
    else if (a === '--root') opts.root = path.resolve(argv[++i]);
    else if (a === '--screenshots') opts.screenshots = path.resolve(argv[++i]);
    else if (a === '--out') opts.out = path.resolve(argv[++i]);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const gitRoot = execFileSync('git', ['-C', DEFAULT_GAME_DIR, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const targets = opts.compare
    ? opts.compare.map(ref => ({ type: 'ref', ref }))
    : opts.ref
      ? [{ type: 'ref', ref: opts.ref }]
      : [{ type: 'dir', dir: opts.root ?? DEFAULT_GAME_DIR, label: opts.root ? path.basename(opts.root) : 'HEAD-working' }];

  const results = [];
  for (const target of targets) {
    let extracted = null;
    try {
      const gameDir = target.type === 'ref'
        ? (extracted = await extractGitTree(gitRoot, target.ref)).gameDir
        : target.dir;
      const label = target.type === 'ref' ? target.ref : target.label;
      const result = await auditGameDir(gameDir, label);
      if (opts.screenshots) {
        const shotDir = opts.compare ? path.join(opts.screenshots, label) : opts.screenshots;
        await captureScreenshots(gameDir, result.findings, shotDir);
      }
      results.push(result);
    } finally {
      if (extracted) await rm(extracted.tempRoot, { recursive: true, force: true });
    }
  }

  if (opts.out) {
    await mkdir(opts.out, { recursive: true });
    await writeFile(path.join(opts.out, 'audit.json'), JSON.stringify(results, null, 2));
    await writeFile(path.join(opts.out, 'audit.md'), formatMarkdown(results));
  }

  if (opts.json) {
    console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  } else {
    console.log(formatMarkdown(results));
  }

  if (opts.failOnError) {
    const fixableErrors = results.flatMap(r => r.findings).filter(f => f.owner === 'map-fix' && f.severity === 'error');
    if (fixableErrors.length > 0) process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
