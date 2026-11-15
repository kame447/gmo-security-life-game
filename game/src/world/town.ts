import { hash2 } from '../core/coords';
import type { AreaDef, FacilityDef, ObjectDef } from '../core/types';
import { INTERIOR_ENTRIES } from './interiors';
import { LANDMARKS } from './landmarks';
import { isRoad, isSolidGround, T } from './tiles';

const shops = [
  ['greengrocer', 'やおや'], ['bookstore', 'ほんや'], ['candy', 'だがしや'],
  ['konbini', 'コンビニ'], ['bakery', 'パンや'], ['cafe', 'きっさてん'], ['pharmacy', 'くすりや'],
] as const;

export const FACILITIES: FacilityDef[] = [
  { id: 'home-family', kind: 'home', name: 'じぶんのいえ', areaId: 'town-main', interior: 'full', state: 'open' },
  { id: 'school', kind: 'school', name: 'しょうがっこう', areaId: 'town-main', interior: 'full', state: 'open' },
  { id: 'school-gym', kind: 'gym', name: 'たいいくかん', areaId: 'town-main', interior: 'background', state: 'open' },
  { id: 'station', kind: 'station', name: 'まちのえき', areaId: 'town-main', interior: 'interaction', state: 'open' },
  { id: 'park', kind: 'park', name: 'かわぞいこうえん', areaId: 'town-main', interior: 'interaction', state: 'open' },
  ...shops.map(([id, name]) => ({ id: `shop-${id}`, kind: id, name, areaId: 'town-main', interior: id === 'konbini' ? 'full' as const : 'interaction' as const, state: 'open' as const })),
];

/** Pure, deterministic map data. Reference PNG is a design reference, never a runtime asset. */
export function createTown(): AreaDef {
  const width = 128, height = 80;
  const ground = new Uint8Array(width * height).fill(T.GRASS);
  const objects: ObjectDef[] = [];
  const at = (x: number, y: number) => ground[y * width + x];
  const rect = (x: number, y: number, w: number, h: number, tile: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) ground[yy * width + xx] = tile;
  };
  const object = (kind: string, x: number, y: number, w: number, h: number, style?: string, solid = true, facilityId?: string) => {
    objects.push({ id: `town-${kind}-${x}-${y}`, kind, x, y, w, h, style, solid, facilityId,
      layer: solid ? 'sorted' : 'decal' });
  };
  const horizontal = [[9, 2, 128], [23, 2, 82], [38, 3, 128], [55, 3, 82], [76, 3, 128]];
  const vertical = [[26, 3, 0, 58], [44, 2, 9, 41], [62, 2, 9, 41], [79, 3, 9, 79], [56, 2, 55, 79], [125, 3, 0, 80]];
  horizontal.forEach(([y, h, w]) => rect(0, y, w, h, T.ASPHALT));
  vertical.forEach(([x, w, y, end]) => rect(x, y, w, end - y, T.ASPHALT));
  const roadMask = ground.slice();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (at(x, y) !== T.GRASS) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height && roadMask[(y + dy) * width + x + dx] === T.ASPHALT) ground[y * width + x] = T.SIDEWALK;
    }
  }
  // Markings stop at junctions; crossings flank each junction instead of painting its center.
  horizontal.forEach(([y, h, w]) => {
    if (h === 3) for (let x = 0; x < w; x++) {
      if (!vertical.some(([vx, vw, vy, end]) => x >= vx - 1 && x <= vx + vw && y >= vy && y < end)) rect(x, y + 1, 1, 1, T.LANE_H);
    }
  });
  vertical.forEach(([x, w, y, end]) => {
    if (w === 3) for (let yy = y; yy < end; yy++) {
      if (!horizontal.some(([hy, hh, hw]) => yy >= hy - 1 && yy <= hy + hh && x < hw)) rect(x + 1, yy, 1, 1, T.LANE_V);
    }
    horizontal.forEach(([hy, hh, hw]) => {
      if (hy < y || hy >= end || x >= hw) return;
      if (x > 0) rect(x - 1, hy, 1, hh, T.ZEBRA_H);
      if (x + w < hw) rect(x + w, hy, 1, hh, T.ZEBRA_H);
      if (hy > y) rect(x, hy - 1, w, 1, T.ZEBRA_V);
      if (hy + hh < end) rect(x, hy + hh, w, 1, T.ZEBRA_V);
    });
  });
  const water = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      ground[yy * width + xx] = isRoad(at(xx, yy)) || at(xx, yy) === T.BRIDGE ? T.BRIDGE : T.WATER;
    }
  };
  water(84, 0, 5, 46); water(84, 44, 37, 5); water(116, 44, 5, 36);
  rect(100, 41, 2, 14, T.PARKPATH); rect(100, 44, 2, 5, T.BRIDGE);
  for (let y = 70; y <= 73; y++) for (let x = 0; x < width; x++) {
    // Water stays a river; only roads become level crossings.
    if (at(x, y) !== T.WATER) ground[y * width + x] = isRoad(at(x, y)) ? T.CROSSING : T.RAIL;
  }
  rect(6, 68, 45, 2, T.PLATFORM);
  object('train', 18, 71, 16, 2, undefined, false);

  // Two rows share a narrow garden/lane in deep blocks. Short frontages remain one row.
  const blocks = [
    ...[[1, 7], [12, 21], [26, 36]].flatMap(([y, end]) => [[1, 24], [30, 42], [47, 60], [65, 77]].map(([x, right]) => [x, y, right, end])),
    [90, 1, 123, 7], [1, 42, 24, 53], [30, 42, 77, 45],
  ];
  for (const [left, top, right, bottom] of blocks) {
    const depth = bottom - top + 1;
    const rows = depth >= 10 ? [top, bottom - 3] : [top];
    for (let row = 0; row < rows.length; row++) {
      const rowTop = rows[row], maxH = rows.length === 2 ? (row === 0 ? 5 : 4) : Math.min(6, depth);
      let x = left + (row === 1 ? Math.floor(hash2(left, top, 42) * 2) : 0);
      while (x + 4 <= right) {
        const r = hash2(x, rowTop, 5);
        // Tall northern rows compensate for the four-tile southern rows, which fit houses only.
        const apartment = maxH >= 5 && r >= 0.45 && r < 0.85;
        const w = apartment ? 6 + Math.floor(hash2(x, rowTop, 3) * 2) : 5 + Math.floor(hash2(x, rowTop, 9) * 2);
        const h = apartment ? Math.min(6, maxH) : Math.min(maxH, 4 + Math.floor(hash2(x, rowTop, 8) * 2));
        if (x + w - 1 > right) break;
        // Reserve the entire home garden independently of procedural neighbors.
        if (top === 26 && x <= 39 && x + w > 31) { x = 40; continue; }
        const y = rowTop;
        if (r < 0.85) {
          object(apartment ? 'apartment' : 'house', x, y, w, h, String(Math.floor(hash2(x, y, 13) * (apartment ? 4 : 5))));
          // Leave the shop-back lane and street sidewalks intact at the block edge.
          if (y + h <= bottom) rect(x, y + h, w, 1, T.GARDEN);
          const door = x + Math.floor(w / 2);
          rect(door, y + h, 1, 1, T.PARKPATH);
          if (y + h <= bottom && y + h !== rows[1] - 1 && w >= 6 && hash2(x, y, 21) < 0.5) object('car', x, y + h, 2, 1, String(Math.floor(hash2(x, y) * 4)));
        } else {
          rect(x, rowTop, w, maxH, T.GARDEN);
          if (r <= 0.93) {
            rect(x, rowTop, w, 2, T.PARKING);
            object('car', x + 1, rowTop + 1, 2, 1, String(Math.floor(hash2(x, rowTop) * 4)));
          }
          else object('tree', x + 1, rowTop + 1, 1, 1, 'green');
        }
        // One-tile breaks and irregular hedge fragments soften the street grid.
        if (x + w <= right) {
          rect(x + w, rowTop + 1, 1, Math.max(1, h - 2), T.HEDGE);
          object('tree', x + w, rowTop, 1, 1, hash2(x, rowTop) > 0.7 ? 'dark' : 'green');
        }
        x += w + 1;
      }
    }
    if (rows.length === 2) {
      for (let x = left; x <= right; x++) {
        if (top === 26 && x >= 31 && x <= 39) continue;
        rect(x, rows[1] - 1, 1, 1, T.PARKPATH);
      }
    }
  }
  rect(31, 26, 9, 11, T.GARDEN);
  rect(31, 26, 9, 1, T.HEDGE); rect(31, 36, 9, 1, T.HEDGE);
  rect(31, 26, 1, 11, T.HEDGE); rect(39, 26, 1, 11, T.HEDGE);
  rect(35, 32, 1, 5, T.PARKPATH);
  object('house', 32, 27, 6, 5, '1', true, 'home-family');
  object('flowerbed', 32, 34, 2, 1, undefined, false);
  // Slivers beside the reserved family lot are neighboring gardens, not broad vacant grass.
  rect(30, 26, 1, 8, T.GARDEN); rect(40, 26, 3, 10, T.GARDEN);
  object('tree', 30, 27, 1, 1, 'green'); object('tree', 30, 31, 1, 1, 'dark');
  object('tree', 41, 27, 1, 1, 'green'); object('tree', 42, 30, 1, 1, 'green');
  object('flowerbed', 40, 31, 2, 1, undefined, false);

  rect(30, 46, 48, 1, T.PARKPATH);
  shops.forEach(([style], i) => object('shop', 30 + i * 7, 47, 6, 6, style, true, `shop-${style}`));
  // The one-tile gaps between shop footprints are paved alleys connecting both sides.
  rect(30, 47, 48, 7, T.PLAZA);
  rect(2, 59, 53, 9, T.PLAZA);
  object('station', 12, 59, 33, 5, undefined, true, 'station');
  object('busstop', 50, 61, 1, 1);
  object('vending', 50, 53, 1, 1);
  object('board', 30, 34, 2, 1);
  object('postbox', 41, 36, 1, 1);
  object('shop', 60, 59, 6, 6, 'cafe'); object('house', 70, 59, 5, 4, '3');
  object('apartment', 70, 64, 6, 5, '2'); rect(60, 66, 7, 3, T.PARKING);
  object('car', 61, 67, 2, 1, '2');

  rect(90, 12, 33, 1, T.HEDGE);
  rect(90, 13, 1, 23, T.FENCE); rect(122, 13, 1, 23, T.FENCE);
  rect(90, 35, 33, 1, T.FENCE); rect(100, 35, 3, 2, T.SIDEWALK);
  rect(91, 21, 31, 14, T.DIRT);
  object('school', 94, 13, 20, 7, undefined, true, 'school');
  object('gym', 115, 14, 6, 7, undefined, true, 'school-gym');
  object('track', 98, 23, 16, 9, undefined, false);
  object('goal', 94, 26, 1, 2); object('goal', 118, 26, 1, 2);
  [92, 120].forEach(x => { object('tree', x, 17, 1, 1, 'cherry'); object('tree', x, 33, 1, 1, 'cherry'); });

  rect(83, 58, 10, 2, T.PARKPATH); rect(93, 55, 11, 8, T.PARKPATH);
  rect(104, 61, 8, 7, T.SAND);
  object('gazebo', 96, 56, 4, 3, undefined, true, 'park');
  object('slide', 106, 64, 2, 2); object('swing', 106, 61, 3, 1);
  object('bench', 92, 63, 2, 1); object('bench', 102, 58, 2, 1);
  object('lamp', 92, 57, 1, 1); object('lamp', 103, 62, 1, 1);
  for (let x = 86; x <= 113; x += 3) for (const y of [51, 68]) {
    if (x === 101) continue;
    object('tree', x, y, 1, 1, hash2(x, y, 11) > 0.7 ? 'cherry' : 'green');
  }
  for (let y = 53; y <= 66; y += 3) {
    object('tree', 85, y, 1, 1, 'green'); object('tree', 113, y, 1, 1, 'cherry');
  }
  // Sparse roadside trees: avoid roads, sidewalks, bridges and the walking landmarks.
  for (let x = 1; x < 125; x += 3) if (at(x, 0) === T.GRASS) object('tree', x, 0, 1, 1, 'dark');
  const beforeBank = ground.slice();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (at(x, y) !== T.GRASS && at(x, y) !== T.SIDEWALK) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height && beforeBank[(y + dy) * width + x + dx] === T.WATER) ground[y * width + x] = T.BANK;
    }
  }
  const buildings = objects.filter(o => ['house', 'apartment', 'shop', 'school', 'gym', 'station'].includes(o.kind));
  const doorFront = (x: number, y: number, w = 1) => buildings.some(b => y === b.y + b.h && x <= b.x + Math.floor(b.w / 2) && x + w > b.x + Math.floor(b.w / 2));
  // Decorations stay off door fronts and the one-tile continuous sidewalk y54.
  const decorate = (kind: string, x: number, y: number, w = 1, style?: string) => {
    if (doorFront(x, y, w) || Object.values(LANDMARKS).some(p => p.y === y && p.x >= x && p.x < x + w)) return;
    for (let xx = x; xx < x + w; xx++) {
      if (isSolidGround(at(xx, y)) || objects.some(o => o.solid && xx >= o.x && xx < o.x + o.w && y >= o.y && y < o.y + o.h)) return;
    }
    object(kind, x, y, w, 1, style);
  };
  for (let x = 3; x < 78; x += 7) {
    decorate('tree', x, 36, 1, 'green'); decorate('tree', x + 2, 42, 1, 'green');
    decorate('tree', x, 59, 1, hash2(x, 59) > 0.75 ? 'cherry' : 'green');
  }
  for (const x of [30, 44, 58, 72]) decorate('lamp', x, 53);
  decorate('bench', 38, 53, 2);
  for (const [x, y] of [[5, 61], [8, 66], [48, 66], [53, 60], [67, 61], [77, 67]]) decorate('tree', x, y, 1, 'green');
  decorate('bench', 4, 65, 2); decorate('bench', 41, 66, 2);
  decorate('lamp', 9, 64); decorate('lamp', 46, 66);
  for (let y = 14; y < 68; y += 8) {
    decorate(y % 3 === 0 ? 'lamp' : 'tree', 82, y, 1, 'cherry');
    decorate('tree', 123, y + 1, 1, 'cherry');
  }
  for (const x of [88, 95, 103, 111]) decorate(x === 103 ? 'lamp' : 'tree', x, 69, 1, 'cherry');
  return {
    id: 'town-main', name: 'いつものまち', kind: 'outdoor', width, height, ground, objects,
    districts: [
      { id: 'town-residential-west', name: 'じゅうたくがい', x: 0, y: 0, w: 84, h: 41 },
      { id: 'town-center', name: 'えきまえ・しょうてんがい', x: 0, y: 41, w: 84, h: 39 },
      { id: 'town-school-north', name: 'がっこうのまわり', x: 84, y: 0, w: 44, h: 42 },
      { id: 'town-riverside-park', name: 'かわぞいこうえん', x: 84, y: 42, w: 44, h: 38 },
    ],
    portals: [
      { id: 'home-enter', from: { x: 35, y: 31 }, to: { ...INTERIOR_ENTRIES.home }, facilityId: 'home-family' },
      { id: 'school-enter', from: { x: 103, y: 19, w: 2 }, to: { ...INTERIOR_ENTRIES.classroom }, facilityId: 'school' },
      { id: 'konbini-enter', from: { x: 54, y: 52 }, to: { ...INTERIOR_ENTRIES.konbini }, facilityId: 'shop-konbini' },
    ],
    interactions: [
      { id: 'neighbor-grandma', kind: 'npc', name: 'きんじょのおばあさん', x: 40, y: 33, sprite: 'grandma', facing: 'left', solid: true, eventKey: 'neighborhood.grandma', lines: ['おかえり。きょうも がっこう、たのしかった？'] },
      { id: 'neighborhood-board', kind: 'sign', name: 'まちのけいじばん', x: 30, y: 34, w: 2, solid: true, eventKey: 'neighborhood.board', lines: ['こんどの にちようびは、こうえんの おそうじだって。'] },
      { id: 'neighborhood-cat', kind: 'npc', name: 'ねこ', x: 42, y: 36, sprite: 'cat', facing: 'down', solid: true, eventKey: 'neighborhood.cat', lines: ['にゃあ。ひなたで のんびりしている。'] },
      { id: 'school-guard', kind: 'npc', name: 'みまもりのひと', x: 104, y: 36, sprite: 'guard', facing: 'left', solid: true, eventKey: 'school.guard', lines: ['おはよう！ くるまを よくみて わたろうね。'] },
      { id: 'park-friend', kind: 'npc', name: 'ともだち', x: 100, y: 61, sprite: 'friend', facing: 'left', solid: true, eventKey: 'park.friend', lines: ['いっしょに あそぼう！ なにして あそぶ？'] },
      { id: 'park-slide', kind: 'object', name: 'すべりだい', x: 106, y: 64, w: 2, h: 2, solid: true, eventKey: 'park.slide', lines: ['てっぺんから、かわと でんしゃが みえるよ。'] },
      { id: 'candy-shopkeeper', kind: 'npc', name: 'だがしやさん', x: 48, y: 53, sprite: 'shopkeeper', facing: 'down', solid: true, eventKey: 'shopping.candy', lines: ['いらっしゃい。きょうの おやつは どれにする？'] },
      { id: 'station-staff', kind: 'npc', name: 'えきいんさん', x: 32, y: 65, sprite: 'staff', facing: 'left', solid: true, eventKey: 'station.staff', lines: ['でんしゃは もうすぐ くるよ。きいろい せんの うちがわで まってね。'] },
      { id: 'station-ticket', kind: 'object', name: 'かいさつ', x: 28, y: 63, solid: true, eventKey: 'station.ticket', lines: ['きっぷを とおすところだ。きょうは まちを たんけんしよう。'] },
      { id: 'shopping-vending', kind: 'object', name: 'じどうはんばいき', x: 50, y: 53, solid: true, eventKey: 'shopping.vending', lines: ['つめたい のみものが ならんでいる。どれにしようかな。'] },
      { id: 'neighborhood-postbox', kind: 'object', name: 'ポスト', x: 41, y: 36, solid: true, eventKey: 'neighborhood.postbox', lines: ['おてがみは ここから たびにでるんだね。'] },
      { id: 'station-busstop', kind: 'sign', name: 'バスてい', x: 50, y: 61, solid: true, eventKey: 'station.busstop', lines: ['つぎの バスは、えきから としょかんまで いくんだって。'] },
    ],
  };
}
