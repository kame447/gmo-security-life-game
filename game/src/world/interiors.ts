import type { AreaDef, ObjectDef, PortalDef } from '../core/types';
import { LANDMARKS, STATION_ACCESS } from './landmarks';
import { STATION_FLOW_LAYOUT, STATION_FLOW_PLATFORMS } from './station-flow';
import { T } from './tiles';

/** 屋外から入ったときの屋内の到着位置。出口マットのすぐ北。 */
export const INTERIOR_ENTRIES = {
  home: { areaId: 'home-family-interior', x: 7, y: 10, facing: 'up' },
  // Arrive beside the stairs, not in front of them, so a held key cannot bounce the player straight back.
  /** 1階の階段から2階へ上がったときの位置（2階の階段の左横）。 */
  homeUpstairs: { areaId: 'home-family-2f', x: 7, y: 1, facing: 'left' },
  /** 2階の階段から1階へ降りたときの位置（1階の階段の右横）。 */
  homeDownstairs: { areaId: 'home-family-interior', x: 2, y: 1, facing: 'right' },
  classroom: { areaId: 'school-classroom-interior', x: 8, y: 10, facing: 'up' },
  konbini: { areaId: 'shop-konbini-interior', x: 6, y: 8, facing: 'up' },
  station: { ...STATION_ACCESS.entry },
} as const satisfies Record<string, PortalDef['to']>;

/** 屋内から出たときは、入った入口の前へ下向きで戻る。 */
const toTown = (front: { x: number; y: number }): PortalDef['to'] => ({ areaId: 'town-main', ...front, facing: 'down' });

function room(id: string, name: string, width: number, floor: number, height = 12): AreaDef {
  const ground = new Uint8Array(width * height).fill(floor);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x === 0 || x === width - 1 || y === height - 1) ground[y * width + x] = T.WALL_TOP;
    if (y === 0) ground[y * width + x] = T.WALL;
  }
  const door = Math.floor(width / 2) - 1;
  ground[(height - 1) * width + door] = ground[(height - 1) * width + door + 1] = T.MAT;
  return { id, name, kind: 'indoor', width, height, ground, objects: [], interactions: [], portals: [] };
}

function furnish(area: AreaDef, kind: string, x: number, y: number, w: number, h: number, solid = true, style?: string): void {
  const o: ObjectDef = {
    id: `${area.id}-${kind}-${x}-${y}`, kind, x, y, w, h, solid,
    ...(style ? { style } : {}),
    layer: solid ? 'sorted' : 'decal',
  };
  area.objects.push(o);
}

/** 自宅の1階。玄関・リビング・台所と、2階への階段（docs/features/story.md）。 */
export function createHome(): AreaDef {
  const a = room('home-family-interior', 'じぶんのいえ 1かい', 16, T.FLOOR_WOOD);
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 6; x++) a.ground[y * a.width + x] = T.FLOOR_TATAMI;
  // A partial partition leaves an open passage between the tatami room and family spaces.
  for (let y = 1; y <= 3; y++) a.ground[y * a.width + 7] = T.WALL_TOP;
  a.ground[4 * a.width + 7] = T.WALL;
  furnish(a, 'stairs', 1, 1, 1, 1, false);
  furnish(a, 'bookshelf', 6, 1, 1, 1); furnish(a, 'toybox', 1, 5, 1, 1);
  furnish(a, 'kitchen', 9, 1, 4, 1); furnish(a, 'fridge', 14, 1, 1, 1);
  furnish(a, 'table', 10, 3, 2, 2); furnish(a, 'tv', 1, 7, 2, 1);
  furnish(a, 'sofa', 1, 9, 3, 1); furnish(a, 'rug', 4, 7, 3, 2, false);
  furnish(a, 'lowtable', 5, 8, 2, 1); furnish(a, 'plant', 14, 9, 1, 1);
  furnish(a, 'window', 10, 0, 2, 1, false);
  a.portals = [
    { id: 'home-exit', from: { x: 7, y: 11, w: 2 }, to: toTown(LANDMARKS.homeFront), facilityId: 'home-family' },
    { id: 'home-stairs-up', from: { x: 1, y: 1 }, to: { ...INTERIOR_ENTRIES.homeUpstairs } },
  ];
  a.interactions = [
    { id: 'home-mother', kind: 'npc', name: 'おかあさん', x: 13, y: 4, sprite: 'mother', facing: 'left', solid: true, eventKey: 'home.mother', lines: ['おかえり！ てを あらったら、おやつにしよう。'] },
    { id: 'home-tablet', kind: 'object', name: 'かぞくのタブレット', x: 5, y: 8, w: 2, solid: true, eventKey: 'home.tablet', lines: ['みんなで つかう タブレットだ。つぎは なにを みようかな。'] },
  ];
  return a;
}

/** 自宅の2階。主人公の部屋で、新しく始めると、ここのベッドの横で目を覚ます。外への出口はなく、階段で1階へ降りる。 */
export function createHomeUpstairs(): AreaDef {
  const a = room('home-family-2f', 'じぶんのへや（2かい）', 10, T.FLOOR_WOOD, 8);
  // room() makes a door mat on the bottom wall; the upstairs room has no outside door.
  for (let x = 1; x < a.width - 1; x++) a.ground[(a.height - 1) * a.width + x] = T.WALL_TOP;
  for (let y = 4; y <= 6; y++) for (let x = 1; x <= 4; x++) a.ground[y * a.width + x] = T.FLOOR_TATAMI;
  furnish(a, 'bed', 1, 1, 2, 3); furnish(a, 'desk', 4, 1, 2, 1);
  furnish(a, 'bookshelf', 3, 1, 1, 1); furnish(a, 'window', 4, 0, 2, 1, false);
  furnish(a, 'rug', 2, 5, 3, 2, false); furnish(a, 'plant', 1, 6, 1, 1);
  furnish(a, 'stairs', 8, 1, 1, 1, false);
  a.portals = [{ id: 'home-stairs-down', from: { x: 8, y: 1 }, to: { ...INTERIOR_ENTRIES.homeDownstairs } }];
  a.interactions = [
    { id: 'home-study-desk', kind: 'object', name: 'がくしゅうづくえ', x: 4, y: 1, w: 2, solid: true, eventKey: 'home.desk', lines: ['えんぴつと ノートを そろえた。しゅくだいも がんばろう。'] },
    { id: 'home-bed', kind: 'object', name: 'ベッド', x: 1, y: 1, w: 2, h: 3, solid: true, eventKey: 'home.bed', lines: ['ふかふかの ベッドだ。けさも ここで めを さました。'] },
  ];
  return a;
}

export function createClassroom(): AreaDef {
  const a = room('school-classroom-interior', 'きょうしつ', 18, T.FLOOR_CLASS);
  furnish(a, 'blackboard', 5, 0, 8, 1, false); furnish(a, 'tdesk', 8, 2, 2, 1);
  for (const x of [2, 5, 8, 11, 14]) for (const y of [4, 6, 8]) furnish(a, 'sdesk', x, y, 1, 1);
  furnish(a, 'shelf', 1, 10, 2, 1); furnish(a, 'shelf', 14, 10, 2, 1);
  furnish(a, 'window', 2, 0, 2, 1, false); furnish(a, 'window', 14, 0, 2, 1, false);
  a.portals = [{ id: 'school-exit', from: { x: 8, y: 11, w: 2 }, to: toTown(LANDMARKS.schoolDoorFront), facilityId: 'school' }];
  a.interactions = [
    { id: 'school-teacher', kind: 'npc', name: 'せんせい', x: 10, y: 2, sprite: 'teacher', facing: 'down', solid: true, eventKey: 'school.teacher', lines: ['おはよう。きょうも いろんなことを みつけようね。'] },
    { id: 'school-classmate', kind: 'npc', name: 'クラスのともだち', x: 12, y: 6, sprite: 'classmate', facing: 'left', solid: true, eventKey: 'school.classmate', lines: ['ほうかご、こうえんで あそぼうよ！'] },
  ];
  return a;
}

export function createKonbini(): AreaDef {
  const a = room('shop-konbini-interior', 'コンビニ', 14, T.FLOOR_CLASS, 10);
  furnish(a, 'shop-floor', 1, 1, 12, 8, false, 'tile');
  furnish(a, 'shop-rug', 5, 7, 4, 1, false, 'konbini');
  furnish(a, 'konbini-cooler', 1, 1, 4, 1, true, 'drinks');
  furnish(a, 'konbini-cooler', 5, 1, 4, 1, true, 'chilled-food');
  furnish(a, 'konbini-magazine', 9, 1, 4, 1);
  // Two vertical shelf columns create north-south convenience aisles distinct from island layouts
  furnish(a, 'konbini-snack-shelf', 2, 3, 2, 2);
  furnish(a, 'konbini-daily-shelf', 2, 5, 2, 2);
  furnish(a, 'konbini-food-shelf', 5, 3, 2, 2);
  furnish(a, 'konbini-food-shelf', 5, 5, 2, 2);
  furnish(a, 'konbini-ice-freezer', 11, 6, 2, 1);
  furnish(a, 'konbini-counter', 8, 3, 2, 1);
  furnish(a, 'konbini-counter', 11, 3, 2, 1, true, 'side');
  a.portals = [{ id: 'konbini-exit', from: { x: 6, y: 9, w: 2 }, to: toTown(LANDMARKS.konbiniDoorFront), facilityId: 'shop-konbini' }];
  a.interactions = [
    { id: 'konbini-clerk', kind: 'npc', name: 'てんいんさん', x: 10, y: 3, sprite: 'clerk', facing: 'down', solid: true, eventKey: 'shopping.konbini.clerk', lines: ['いらっしゃいませ。おやつも のみものも あるよ。ゆっくり みてね。'] },
    { id: 'konbini-snacks', kind: 'object', name: 'おかしのたな', x: 2, y: 3, w: 2, h: 2, solid: true, eventKey: 'shopping.konbini.snacks', lines: ['あまい おかしと、しょっぱい おかし。どっちも おいしそう！'] },
    { id: 'konbini-drinks', kind: 'object', name: 'のみもののケース', x: 1, y: 1, w: 4, solid: true, eventKey: 'shopping.konbini.drinks', lines: ['おちゃに ジュース、ぎゅうにゅう。つめたく ひえているよ。'] },
  ];
  return a;
}

/**
 * 島式1面2線の構内。北の線が下り、南の線が上り（定義は rail-geometry.ts）。
 * 入口 → 改札（南）→ 構内通路が南の線を渡る → ホーム（北から edge・のりば・ホーム）。
 * 静止した列車は置かない。列車は発車・到着の演出のときだけ描く。
 */
export function createStation(): AreaDef {
  const a = room(STATION_ACCESS.areaId, 'まちのえき こうない', 36, T.PLAZA, 18);
  const f = STATION_FLOW_LAYOUT;
  for (let x = 0; x < a.width; x++) {
    // 線路は1本で、部屋の左右の端まで連続する。列車は部屋の端から出入りする。
    a.ground[f.trackY * a.width + x] = T.RAIL;
    if (x === 0 || x === a.width - 1) continue;
    for (let y = 1; y < f.northFenceY; y++) a.ground[y * a.width + x] = T.VOID;
    a.ground[f.northFenceY * a.width + x] = T.RAIL_FENCE;
    for (let y = f.platformTop; y <= f.platformBottom; y++) a.ground[y * a.width + x] = T.PLATFORM;
    a.ground[f.gateY * a.width + x] = T.RAIL_FENCE;
  }
  for (const x of f.gateXs) a.ground[f.gateY * a.width + x] = T.TICKET_GATE;
  for (const p of STATION_FLOW_PLATFORMS.slice(0, 1)) a.ground[p.sign.y * a.width + p.sign.x] = T.BOARDING_SIGN;
  furnish(a, 'bench', 3, 6, 3, 1); furnish(a, 'bench', 27, 6, 3, 1);
  a.portals = [{ id: STATION_ACCESS.exitPortalId, from: { x: 17, y: 17, w: 2 },
    to: toTown(LANDMARKS.stationFront), facilityId: STATION_ACCESS.stationId }];
  a.interactions = [
    // 改札（2タイル）。操作の対象が solid なので、行き先を決める操作を通らずにホームへは入れない。
    { id: 'station-ticket', kind: 'object', name: 'かいさつ', x: f.gateXs[0], y: f.gateY, w: 2, solid: true, eventKey: 'station.ticket',
      lines: ['きっぷを とおすところだ。きょうは まちを たんけんしよう。'] },
    ...STATION_FLOW_PLATFORMS.slice(0, 1).map(p => ({ id: p.sign.interactionId, eventKey: p.sign.eventKey, x: p.sign.x, y: p.sign.y, kind: 'sign' as const, name: 'のりば', solid: true, lines: ['ここが でんしゃの のりばだ。'] })),
  ];
  return a;
}
