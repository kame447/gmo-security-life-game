import type { AreaDef, FacilityDef, InteractionDef, ObjectDef, PortalDef } from '../core/types';
import { T } from './tiles';

/** 隣町の学校と職場。外観・出入口・屋内の名前を同じデータから組み立てる。 */
export const CAMPUS_PLACES = [
  { id: 'high-school', name: '隣町高校', areaId: 'high-school-interior', kind: 'school',
    building: { x: 3, y: 18, w: 10, h: 7 }, door: { x: 7, y: 24, w: 2 }, entry: { x: 9, y: 12 }, width: 20, height: 14 },
  { id: 'university', name: '隣町大学', areaId: 'university-interior', kind: 'school',
    building: { x: 3, y: 2, w: 12, h: 7 }, door: { x: 8, y: 8, w: 2 }, entry: { x: 11, y: 14 }, width: 24, height: 16 },
  { id: 'office', name: '会社', areaId: 'office-interior', kind: 'apartment',
    building: { x: 27, y: 22, w: 8, h: 7 }, door: { x: 31, y: 28 }, entry: { x: 10, y: 12 }, width: 22, height: 14 },
] as const;

export const CAMPUS_FACILITIES: readonly FacilityDef[] = CAMPUS_PLACES.map(place => ({
  id: place.id, name: place.name, areaId: 'town-neighbor', interior: 'full', state: 'open',
  ...(place.kind === 'school' ? { kind: 'school' as const } : {}),
}));

export const CAMPUS_BUILDINGS: readonly ObjectDef[] = CAMPUS_PLACES.map(place => ({
  id: `${place.id}-building`, kind: place.kind, ...place.building, solid: true,
  facilityId: place.id, ...(place.id === 'office' ? { style: '1' } : {}),
}));

export const CAMPUS_ENTRANCES: readonly PortalDef[] = CAMPUS_PLACES.map(place => ({
  id: `${place.id}-enter`, facilityId: place.id, from: { ...place.door },
  to: { areaId: place.areaId, ...place.entry, facing: 'up' },
}));

export const CAMPUS_SIGNS: readonly InteractionDef[] = CAMPUS_PLACES.map(place => ({
  id: `${place.id}-sign`, kind: 'sign', name: `${place.name}の案内`,
  x: place.building.x - 1, y: place.building.y + place.building.h, solid: true,
  eventKey: `campus.${place.id}.sign`, lines: [`${place.name}。正面の入口から入れる。`,
    place.id === 'office' ? '仕事の合間に、同僚と話してみよう。' : '授業の合間や放課後には、先生や友達と話してみよう。'],
}));

function campusRoom(place: typeof CAMPUS_PLACES[number]): AreaDef {
  const { width, height } = place;
  const ground = new Uint8Array(width * height).fill(T.FLOOR_CLASS);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x === 0 || x === width - 1 || y === height - 1) ground[y * width + x] = T.WALL_TOP;
    if (y === 0) ground[y * width + x] = T.WALL;
  }
  for (let x = place.entry.x; x <= place.entry.x + 1; x++) ground[(height - 1) * width + x] = T.MAT;
  return {
    id: place.areaId, name: place.id === 'high-school' ? `${place.name}の教室` : place.id === 'university' ? `${place.name}の講義室・交流室` : '会社のオフィス',
    kind: 'indoor', width, height, ground, objects: [], interactions: [],
    portals: [{ id: `${place.id}-exit`, facilityId: place.id, from: { x: place.entry.x, y: height - 1, w: 2 },
      to: { areaId: 'town-neighbor', x: place.door.x, y: place.door.y + 1, facing: 'down' } }],
  };
}

function furnish(area: AreaDef, kind: string, x: number, y: number, w = 1, h = 1, solid = true): void {
  area.objects.push({ id: `${area.id}-${kind}-${x}-${y}`, kind, x, y, w, h, solid, layer: solid ? 'sorted' : 'decal' });
}

function person(area: AreaDef, id: string, name: string, x: number, y: number, sprite: string, eventKey: string, lines: string[]): void {
  area.interactions.push({ id, kind: 'npc', name, x, y, solid: true, sprite, facing: 'down', eventKey, lines });
}

export function createHighSchool(): AreaDef {
  const area = campusRoom(CAMPUS_PLACES[0]);
  furnish(area, 'blackboard', 5, 0, 10, 1, false); furnish(area, 'tdesk', 8, 2, 2);
  for (const x of [3, 6, 10, 13, 16]) for (const y of [5, 8]) furnish(area, 'sdesk', x, y);
  furnish(area, 'bookshelf', 1, 10, 3); furnish(area, 'bookshelf', 15, 11, 3);
  furnish(area, 'window', 2, 0, 2, 1, false); furnish(area, 'window', 16, 0, 2, 1, false);
  person(area, 'high-school-teacher', '高校の先生', 12, 2, 'teacher', 'school.high.teacher', ['分からないところがあれば、放課後に一緒に考えよう。']);
  person(area, 'high-school-classmate', '高校のクラスメイト', 7, 6, 'classmate', 'school.high.friend', ['次の授業まで少し時間があるね。昼休み、一緒に過ごさない？']);
  person(area, 'high-school-clubmate', '部活の友達', 15, 9, 'friend', 'school.high.club', ['放課後の活動を、みんなで決めているところだよ。']);
  return area;
}

export function createUniversity(): AreaDef {
  const area = campusRoom(CAMPUS_PLACES[1]);
  furnish(area, 'blackboard', 3, 0, 10, 1, false); furnish(area, 'tdesk', 7, 2, 2);
  for (const x of [3, 7, 11]) for (const y of [5, 8]) furnish(area, 'table', x, y, 2);
  furnish(area, 'bookshelf', 16, 1, 5); furnish(area, 'table', 17, 5, 3, 2);
  furnish(area, 'sofa', 17, 10, 3); furnish(area, 'lowtable', 17, 12, 2);
  furnish(area, 'plant', 21, 11); furnish(area, 'window', 3, 0, 2, 1, false);
  person(area, 'university-professor', 'ゼミの先生', 10, 2, 'teacher', 'school.university.teacher', ['気になったことを、自分の問いにしてみよう。']);
  person(area, 'university-classmate', 'ゼミの友達', 16, 6, 'classmate', 'school.university.friend', ['共同発表のテーマを相談しているんだ。一緒に考えてくれる？']);
  person(area, 'university-circlemate', 'サークルの友達', 20, 11, 'friend', 'school.university.circle', ['空き時間には、ここでサークルの相談をしているよ。']);
  return area;
}

export function createOffice(): AreaDef {
  const area = campusRoom(CAMPUS_PLACES[2]);
  for (const x of [3, 7, 11]) for (const y of [3, 6]) furnish(area, 'desk', x, y, 2);
  furnish(area, 'bookshelf', 2, 1, 4); furnish(area, 'bookshelf', 15, 1, 4);
  furnish(area, 'table', 15, 6, 4, 2); furnish(area, 'sofa', 2, 10, 3);
  furnish(area, 'lowtable', 6, 10, 2); furnish(area, 'plant', 19, 11);
  furnish(area, 'window', 8, 0, 4, 1, false);
  person(area, 'office-colleague', '同僚', 10, 5, 'friend', 'office.colleague', ['少し休憩しよう。困ったことは一人で抱え込まなくていいよ。']);
  person(area, 'office-mentor', '先輩', 16, 9, 'teacher', 'office.mentor', ['仕事の進め方、一緒に振り返ってみようか。']);
  return area;
}

export const CAMPUS_AREA_FACTORIES: readonly (() => AreaDef)[] = [createHighSchool, createUniversity, createOffice];
