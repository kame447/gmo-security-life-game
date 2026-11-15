import { afterEach, describe, expect, it, vi } from 'vitest';
import { feetAtTile } from '../src/core/coords';
import { createHome, createClassroom, createKonbini } from '../src/world/interiors';
import { LANDMARKS as GENERATED_LANDMARKS, START as GENERATED_START } from '../src/world/landmarks';
import { resolveLandmarks, START_PORTAL_ID } from '../src/world/landmark-resolve';
import { initialLayout, type AreaLayout } from '../src/world/layouts/codec';
import { createTown } from '../src/world/town';

const fixedNames = ['schoolGate', 'stationFront', 'parkPlaza', 'shoppingStreet'] as const;

/** Viteの読み込み口だけをfixtureに置き換え、実際の配置codecとWorld組み立てを通す。 */
async function worldWithLayouts(layouts: AreaLayout[]) {
  vi.resetModules();
  const { AREA_LAYOUTS } = await import('../src/world/layouts');
  AREA_LAYOUTS.splice(0, AREA_LAYOUTS.length, ...layouts);
  return import('../src/world');
}

function homeMovedSouth(): AreaLayout[] {
  const town = initialLayout(createTown(), 'createTown');
  const home = initialLayout(createHome(), 'createHome');
  town.objects.find(object => object.facilityId === 'home-family')!.y++;
  town.portals.find(portal => portal.id === 'home-enter')!.from.y++;
  home.portals.find(portal => portal.id === START_PORTAL_ID)!.to.y++;
  return [town, home];
}

afterEach(() => {
  vi.resetModules();
});

describe('配置から導く目印と開始位置', () => {
  it('配置ファイルが無い場合は、公開する目印と開始位置が生成用の定数と一致する（S2-12）', async () => {
    const sources = [createTown(), createHome(), createClassroom(), createKonbini()];
    expect(resolveLandmarks(sources)).toEqual(GENERATED_LANDMARKS);
    const { LANDMARKS, START, buildWorld, validateWorld, AREA_FACTORIES } = await worldWithLayouts([]);
    expect(LANDMARKS).toEqual(GENERATED_LANDMARKS);
    expect(START).toEqual(GENERATED_START);
    const world = buildWorld();
    expect(world.start).toEqual(START);
    expect(validateWorld(world)).toEqual([]);
    expect([...world.areas.values()].map(area => area.def)).toEqual(AREA_FACTORIES.map(create => create()));
  });

  it('3つのドア前は出口のtoから導き、固定の4点と入力は変えない', () => {
    const sources = [createTown(), createHome(), createClassroom(), createKonbini()];
    const expected = {
      homeFront: { x: 35, y: 33 },
      schoolDoorFront: { x: 102, y: 20 },
      konbiniDoorFront: { x: 53, y: 53 },
    };
    for (const [id, point] of [['home-exit', expected.homeFront], ['school-exit', expected.schoolDoorFront], ['konbini-exit', expected.konbiniDoorFront]] as const) {
      const exit = sources.flatMap(area => area.portals).find(portal => portal.id === id)!;
      Object.assign(exit.to, point);
    }
    const before = structuredClone(sources);
    const resolved = resolveLandmarks(sources);
    expect(resolved).toEqual({ ...GENERATED_LANDMARKS, ...expected });
    expect(sources).toEqual(before);
    resolved.homeFront.y++;
    resolved.schoolGate.x++;
    expect(sources).toEqual(before);
    expect(GENERATED_LANDMARKS.schoolGate).toEqual({ x: 101, y: 36 });
  });

  it('家を1マス南へ動かした配置で公開値・新規開始・リセットが(35,33)になる（S2-5）', async () => {
    const fixture = homeMovedSouth();
    const before = structuredClone(fixture);
    const { LANDMARKS, START, buildWorld, validateWorld } = await worldWithLayouts(fixture);
    expect(LANDMARKS.homeFront).toEqual({ x: 35, y: 33 });
    expect(START).toEqual({ ...GENERATED_START, x: 35, y: 33 });
    for (const name of fixedNames) expect(LANDMARKS[name]).toEqual(GENERATED_LANDMARKS[name]);
    const world = buildWorld();
    expect(world.start).toEqual(START);
    expect(world.areas.get('home-family-interior')!.def.portals[0].to).toEqual(START);
    expect(validateWorld(world)).toEqual([]);
    const { Game } = await import('../src/session/game');
    const game = new Game(world);
    const expected = { areaId: START.areaId, ...feetAtTile(35, 33), facing: START.facing };
    expect(game.player).toEqual(expected);
    game.player.x++;
    game.reset();
    expect(game.player).toEqual(expected);
    const invalidPosition = { ...game.serialize(), x: -16 };
    expect(new Game(world, { save: invalidPosition }).player).toEqual(expected);
    expect(fixture).toEqual(before);
    expect(GENERATED_LANDMARKS.homeFront).toEqual({ x: 35, y: 32 });
    const { PERF_ROUTES } = await import('./fixtures/perf-routes');
    expect(PERF_ROUTES.diagonalChunks.points[0]).toEqual(LANDMARKS.homeFront);
  });

  it('年代差分が出口を閉じても、配置から導いた開始位置は変わらない', async () => {
    const { START, buildWorld, CHILDHOOD_VARIANT } = await worldWithLayouts(homeMovedSouth());
    const world = buildWorld({ ...CHILDHOOD_VARIANT, disabledPortals: ['home-exit'], facilityStates: { school: 'closed' } });
    expect(world.start).toEqual(START);
    expect(world.start).toMatchObject({ x: 35, y: 33 });
    expect(world.areas.get('home-family-interior')!.def.portals).toEqual([]);
    expect(world.areas.get('school-classroom-interior')!.def.portals).toEqual([]);
    world.start.y++;
    expect(START.y).toBe(33);
    expect(buildWorld().start).toEqual(START);
  });
});
