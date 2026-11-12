import type { AreaDef, ObjectDef } from '../core/types';
import { T } from './tiles';

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

function furnish(area: AreaDef, kind: string, x: number, y: number, w: number, h: number, solid = true): void {
  const o: ObjectDef = { id: `${area.id}-${kind}-${x}-${y}`, kind, x, y, w, h, solid, layer: solid ? 'sorted' : 'decal' };
  area.objects.push(o);
}

export function createHome(): AreaDef {
  const a = room('home-family-interior', 'じぶんのいえ', 16, T.FLOOR_WOOD);
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 6; x++) a.ground[y * a.width + x] = T.FLOOR_TATAMI;
  // A partial partition leaves an open passage between the bedroom and family spaces.
  for (let y = 1; y <= 3; y++) a.ground[y * a.width + 7] = T.WALL_TOP;
  a.ground[4 * a.width + 7] = T.WALL;
  furnish(a, 'bed', 1, 1, 2, 3); furnish(a, 'desk', 4, 1, 2, 1);
  furnish(a, 'bookshelf', 6, 1, 1, 1); furnish(a, 'toybox', 1, 5, 1, 1);
  furnish(a, 'kitchen', 9, 1, 4, 1); furnish(a, 'fridge', 14, 1, 1, 1);
  furnish(a, 'table', 10, 3, 2, 2); furnish(a, 'tv', 1, 7, 2, 1);
  furnish(a, 'sofa', 1, 9, 3, 1); furnish(a, 'rug', 4, 7, 3, 2, false);
  furnish(a, 'lowtable', 5, 8, 2, 1); furnish(a, 'plant', 14, 9, 1, 1);
  furnish(a, 'window', 10, 0, 2, 1, false);
  a.portals = [{ id: 'home-exit', from: { x: 7, y: 11, w: 2 }, to: { areaId: 'town-main', x: 35, y: 32, facing: 'down' }, facilityId: 'home-family' }];
  a.interactions = [
    { id: 'home-mother', kind: 'npc', name: 'おかあさん', x: 13, y: 4, sprite: 'mother', facing: 'left', solid: true, eventKey: 'home.mother', lines: ['おかえり！ てを あらったら、おやつにしよう。'] },
    { id: 'home-tablet', kind: 'object', name: 'かぞくのタブレット', x: 5, y: 8, w: 2, solid: true, eventKey: 'home.tablet', lines: ['みんなで つかう タブレットだ。つぎは なにを みようかな。'] },
    { id: 'home-study-desk', kind: 'object', name: 'がくしゅうづくえ', x: 4, y: 1, w: 2, solid: true, eventKey: 'home.desk', lines: ['えんぴつと ノートを そろえた。しゅくだいも がんばろう。'] },
  ];
  return a;
}

export function createClassroom(): AreaDef {
  const a = room('school-classroom-interior', 'きょうしつ', 18, T.FLOOR_CLASS);
  furnish(a, 'blackboard', 5, 0, 8, 1, false); furnish(a, 'tdesk', 8, 2, 2, 1);
  for (const x of [2, 5, 8, 11, 14]) for (const y of [4, 6, 8]) furnish(a, 'sdesk', x, y, 1, 1);
  furnish(a, 'shelf', 1, 10, 2, 1); furnish(a, 'shelf', 14, 10, 2, 1);
  furnish(a, 'window', 2, 0, 2, 1, false); furnish(a, 'window', 14, 0, 2, 1, false);
  a.portals = [{ id: 'school-exit', from: { x: 8, y: 11, w: 2 }, to: { areaId: 'town-main', x: 103, y: 20, facing: 'down' }, facilityId: 'school' }];
  a.interactions = [
    { id: 'school-teacher', kind: 'npc', name: 'せんせい', x: 10, y: 2, sprite: 'teacher', facing: 'down', solid: true, eventKey: 'school.teacher', lines: ['おはよう。きょうも いろんなことを みつけようね。'] },
    { id: 'school-classmate', kind: 'npc', name: 'クラスのともだち', x: 12, y: 6, sprite: 'classmate', facing: 'left', solid: true, eventKey: 'school.classmate', lines: ['ほうかご、こうえんで あそぼうよ！'] },
  ];
  return a;
}

export function createKonbini(): AreaDef {
  const a = room('shop-konbini-interior', 'コンビニ', 14, T.FLOOR_CLASS, 10);
  furnish(a, 'cooler', 1, 1, 2, 1); furnish(a, 'cooler', 4, 1, 2, 1);
  furnish(a, 'magazine', 9, 1, 2, 1);
  for (const x of [2, 6]) for (const y of [4, 6]) furnish(a, 'shopshelf', x, y, 2, 1);
  furnish(a, 'counter', 9, 4, 3, 1);
  a.portals = [{ id: 'konbini-exit', from: { x: 6, y: 9, w: 2 }, to: { areaId: 'town-main', x: 54, y: 53, facing: 'down' }, facilityId: 'shop-konbini' }];
  a.interactions = [
    { id: 'konbini-clerk', kind: 'npc', name: 'てんいんさん', x: 10, y: 3, sprite: 'clerk', facing: 'left', solid: true, eventKey: 'shopping.konbini.clerk', lines: ['いらっしゃいませ。おやつも のみものも あるよ。ゆっくり みてね。'] },
    { id: 'konbini-snacks', kind: 'object', name: 'おかしのたな', x: 2, y: 4, w: 2, solid: true, eventKey: 'shopping.konbini.snacks', lines: ['あまい おかしと、しょっぱい おかし。どっちも おいしそう！'] },
    { id: 'konbini-drinks', kind: 'object', name: 'のみもののケース', x: 1, y: 1, w: 2, solid: true, eventKey: 'shopping.konbini.drinks', lines: ['おちゃに ジュース、ぎゅうにゅう。つめたく ひえているよ。'] },
  ];
  return a;
}
