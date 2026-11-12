import { hash2, TILE } from '../core/coords';
import { isRoad, T } from '../world/tiles';
import { R, type C2D } from './draw';

/** World coordinates seed every mark, so baking a different chunk cannot change it. */
export function drawGroundTile(c: C2D, t: number, px: number, py: number, tx: number, ty: number, nb: (dx: number, dy: number) => number): void {
  const r = (color: string, x: number, y: number, w = 1, h = 1) => R(c, color, px + x, py + y, w, h);
  const base = (color: string) => r(color, 0, 0, TILE, TILE);
  const grain = (colors: readonly string[], count: number, seed: number, wide = false) => {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(hash2(tx * TILE + i, ty, seed) * 15);
      const y = Math.floor(hash2(tx, ty * TILE + i, seed + 1) * 16);
      r(colors[i % colors.length], x, y, wide ? 2 : 1);
    }
  };
  const grass = () => {
    base('#9cce72');
    grain(['#8fc568', '#aad77d', '#82b95f', '#b8df88'], 15, 7, true);
    const x = 2 + Math.floor(hash2(tx, ty, 3) * 11);
    const y = 3 + Math.floor(hash2(tx, ty, 4) * 10);
    r('#70aa54', x, y, 1, 2); r('#b8de8b', x + 1, y + 1);
  };
  const asphalt = () => {
    base('#87919c');
    grain(['#939da5', '#7d8791', '#a0a7ac'], 17, 21);
  };
  const stone = (color: string, light: string, joint: string, step: number) => {
    base(color);
    for (let y = 0; y < 16; y += step) {
      r(joint, 0, y, 16, 1);
      const shift = ((ty * 16 + y) / step % 2) * (step / 2);
      for (let x = -step + shift; x < 16; x += step) {
        if (x >= 0) r(joint, x, y, 1, step);
        r(light, Math.max(0, x + 1), y + 1, Math.min(step - 1, 16 - Math.max(0, x + 1)), 1);
      }
    }
    grain([light, color], 5, 39);
  };
  const rail = (crossing: boolean) => {
    if (crossing) asphalt();
    else { base('#a6a89c'); grain(['#898f87', '#c0bdae', '#959b91'], 30, 42); }
    for (let x = 1; x < 16; x += 6) {
      r('#796c5a', x, 1, 3, 14); r('#a08a6c', x, 2, 1, 12);
    }
    for (const y of [3, 11]) {
      r('#596970', 0, y, 16, 3); r('#e0e4df', 0, y, 16, 1);
    }
    if (crossing) {
      r('#c6bd9f', 0, 6, 16, 4);
      r('#e5d6af', 0, 6, 16, 1);
      if (nb(-1, 0) !== T.CROSSING) for (let y = 0; y < 16; y += 4) r(y % 8 ? '#e9c85d' : '#535b5c', 0, y, 2, 4);
      if (nb(1, 0) !== T.CROSSING) for (let y = 0; y < 16; y += 4) r(y % 8 ? '#e9c85d' : '#535b5c', 14, y, 2, 4);
    }
  };

  switch (t) {
    case T.GRASS: grass(); break;
    case T.ASPHALT: asphalt(); break;
    case T.LANE_H:
    case T.LANE_V:
      asphalt();
      if (t === T.LANE_H) { if (tx % 2 === 0) r('#f6ebc4', 0, 7, 12, 2); }
      else if (ty % 2 === 0) r('#f6ebc4', 7, 0, 2, 12);
      break;
    case T.ZEBRA_H:
    case T.ZEBRA_V:
      asphalt();
      for (let i = 1; i < 16; i += 4) {
        if (t === T.ZEBRA_H) r('#f6f1db', 2, i, 12, 2);
        else r('#f6f1db', i, 2, 2, 12);
      }
      break;
    case T.SIDEWALK:
      stone('#d9d1bd', '#ece5d2', '#bcb9ab', 8);
      // Curbs face the road, rather than outlining every individual tile.
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (!isRoad(nb(dx, dy)) && nb(dx, dy) !== T.CROSSING) continue;
        if (dx) { r('#f8efdb', dx < 0 ? 0 : 13, 0, 3, 16); r('#a6a69a', dx < 0 ? 0 : 15, 0, 1, 16); }
        else { r('#f8efdb', 0, dy < 0 ? 0 : 13, 16, 3); r('#a6a69a', 0, dy < 0 ? 0 : 15, 16, 1); }
      }
      break;
    case T.PLAZA: stone('#d5a78c', '#e9c5a5', '#b88f7b', 4); break;
    case T.PARKPATH: stone('#d7cfb8', '#eee3c9', '#b7b9a4', 8); break;
    case T.WATER:
      base('#5aafcf');
      for (let y = 1; y < 16; y += 6) {
        const x = Math.floor(hash2(tx, ty * 16 + y, 61) * 10);
        r('#7dc7dd', x, y, 5, 1); r('#4c9dbf', (x + 6) % 12, y + 2, 4, 1);
      }
      if (nb(-1, 0) !== T.WATER && nb(-1, 0) !== T.BRIDGE) r('#448ca8', 0, 0, 3, 16);
      if (nb(0, -1) !== T.WATER && nb(0, -1) !== T.BRIDGE) r('#448ca8', 0, 0, 16, 3);
      if (nb(1, 0) !== T.WATER && nb(1, 0) !== T.BRIDGE) r('#76c4d7', 14, 0, 2, 16);
      if (nb(0, 1) !== T.WATER && nb(0, 1) !== T.BRIDGE) r('#76c4d7', 0, 14, 16, 2);
      break;
    case T.BANK:
      stone('#98a9a4', '#c7d0bb', '#748d8e', 4);
      // Railings follow the water edge; no seam is drawn between bank tiles.
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const neighbor = nb(dx, dy);
        if (neighbor !== T.WATER) continue;
        if (dx) { const x = dx < 0 ? 2 : 12; r('#5b7f7b', x, 0, 2, 16); for (const y of [1, 9]) { r('#e1e7cf', x - 1, y, 4, 2); r('#547575', x - 1, y + 2, 2, 3); } }
        else { const y = dy < 0 ? 2 : 12; r('#5b7f7b', 0, y, 16, 2); for (const x of [1, 9]) { r('#e1e7cf', x, y - 1, 2, 2); r('#547575', x, y + 1, 2, 3); } }
      }
      break;
    case T.BRIDGE: {
      base('#b99e78');
      // Find the river beside the deck, even from the middle of a wide bridge.
      // Checking only immediate BRIDGE neighbors mistakes a two-wide footbridge for an east-west road.
      let waterX = 99, waterY = 99;
      for (let d = 1; d <= 8; d++) {
        if (waterX === 99 && (nb(-d, 0) === T.WATER || nb(d, 0) === T.WATER)) waterX = d;
        if (waterY === 99 && (nb(0, -d) === T.WATER || nb(0, d) === T.WATER)) waterY = d;
      }
      const horizontal = waterY < waterX || (waterY === waterX && (isRoad(nb(-1, 0)) || isRoad(nb(1, 0))));
      for (let n = 0; n < 16; n += 4) {
        if (horizontal) { r('#8e806a', n, 0, 1, 16); r('#d8c6a0', n + 1, 0, 1, 16); }
        else { r('#8e806a', 0, n, 16, 1); r('#d8c6a0', 0, n + 1, 16, 1); }
      }
      const sides = horizontal ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
      for (const [dx, dy] of sides) {
        if (nb(dx, dy) === T.BRIDGE) continue;
        if (horizontal) { const y = dy < 0 ? 0 : 13; r('#5e7e7a', 0, y, 16, 3); r('#e2e3c9', 0, y, 16, 1); r('#e2e3c9', 2, y, 2, 3); r('#e2e3c9', 12, y, 2, 3); }
        else { const x = dx < 0 ? 0 : 13; r('#5e7e7a', x, 0, 3, 16); r('#e2e3c9', x, 0, 1, 16); r('#e2e3c9', x, 2, 3, 2); r('#e2e3c9', x, 12, 3, 2); }
      }
      break;
    }
    case T.DIRT: base('#dfba85'); grain(['#edcf9b', '#cda771', '#eac58e'], 22, 78, true); break;
    case T.SAND: base('#eed69f'); grain(['#dec089', '#f9e5b6', '#d8bb82'], 22, 81); break;
    case T.RAIL: rail(false); break;
    case T.CROSSING: rail(true); break;
    case T.PLATFORM:
      stone('#c7c7b7', '#e0dfc9', '#b0b4a7', 8);
      if (nb(0, 1) === T.RAIL) {
        r('#f2cf65', 0, 9, 16, 4);
        for (let x = 1; x < 16; x += 3) { r('#c7a24a', x, 10); r('#ffe29a', x, 12); }
        r('#f8f0d5', 0, 14, 16, 1); r('#778782', 0, 15, 16, 1);
      }
      break;
    case T.FENCE: {
      grass();
      const vertical = nb(0, -1) === T.FENCE || nb(0, 1) === T.FENCE;
      const horizontal = nb(-1, 0) === T.FENCE || nb(1, 0) === T.FENCE || !vertical;
      if (vertical) {
        r('#587f75', 3, 0, 1, 16); r('#c4d5b5', 4, 0, 1, 16); r('#587f75', 11, 0, 1, 16);
        for (let y = 0; y < 16; y += 4) {
          r('#779887', 4, y, 7, 1);
          r('#91ac99', 6, y + 1, 1, 2); r('#91ac99', 9, y + 2, 1, 2);
        }
      }
      if (horizontal) {
        r('#587f75', 0, 4, 16, 2); r('#c4d5b5', 0, 4, 16, 1); r('#587f75', 0, 11, 16, 1);
        for (let x = 0; x < 16; x += 4) {
          r('#779887', x, 5, 1, 7);
          r('#91ac99', x + 1, 7, 2, 1); r('#91ac99', x + 2, 9, 2, 1);
        }
      }
      r('#456d62', 6, 3, 3, 12); r('#c5d3b3', 6, 2, 3, 2);
      break;
    }
    case T.HEDGE:
      base('#6eaa5d'); r('#4a8952', 0, 12, 16, 4); r('#8fbe68', 0, 0, 16, 3);
      grain(['#aad578', '#5c9c55', '#85b861', '#bedf87'], 28, 92, true); break;
    case T.GARDEN:
      grass();
      for (let i = 0; i < 3; i++) {
        const x = 2 + Math.floor(hash2(tx + i, ty, 98) * 11), y = 2 + Math.floor(hash2(tx, ty + i, 99) * 9);
        r('#4a9959', x + 1, y + 2, 1, 3); r(['#f3e6a2', '#e898ae', '#f6f0d2'][i], x, y, 3, 2); r('#e8b963', x + 1, y + 1);
      }
      break;
    case T.PARKING:
      asphalt(); r('#f4edda', 0, 0, 1, 16);
      if (ty % 2 === 0) r('#f4edda', 0, 0, 16, 1);
      if (nb(1, 0) !== T.PARKING) r('#f4edda', 15, 0, 1, 16);
      break;
    case T.FLOOR_WOOD:
      base('#d8b384');
      for (let y = 0; y < 16; y += 4) {
        r('#bc936a', 0, y, 16, 1); r('#e8c89b', 0, y + 1, 16, 1);
        const x = ((ty * 4 + y / 4) % 2) * 8; r('#bd956d', x, y, 1, 4);
      }
      grain(['#cea578', '#e3be90'], 9, 111, true); break;
    case T.FLOOR_TATAMI:
      base('#c8cf91');
      for (let y = 1; y < 16; y += 2) r('#b6c385', 1, y, 14, 1);
      r('#6e9474', 0, 0, 2, 16); r('#86a27c', 14, 0, 2, 16); r('#dce0a9', 2, 0, 12, 1); break;
    case T.FLOOR_CLASS:
      base('#d6b48b');
      for (let y = 0; y < 16; y += 8) for (let x = 0; x < 16; x += 8) {
        r('#bfa17d', x, y, 8, 1); r('#e8c99d', x, y + 1, 8, 1);
        for (let n = 3; n < 8; n += 3) {
          if ((tx + ty + x / 8 + y / 8) % 2) r('#c7a780', x + n, y + 2, 1, 6);
          else r('#c7a780', x, y + n, 8, 1);
        }
      }
      break;
    case T.WALL:
      base('#f1e5c8'); r('#fff3d8', 0, 0, 16, 2); r('#dbcbb1', 0, 9, 16, 1);
      r('#a58c70', 0, 12, 16, 4); r('#c1a383', 0, 12, 16, 1); r('#897c68', 0, 15, 16, 1); break;
    case T.WALL_TOP:
      base('#b7ad99'); r('#d4cbb5', 0, 0, 16, 2);
      if (nb(0, 1) !== T.WALL_TOP) r('#938c7c', 0, 14, 16, 2);
      grain(['#c3b9a3', '#a9a08e'], 7, 123); break;
    case T.MAT:
      base('#c49e78'); r('#8c8e75', 1, 1, 14, 14); r('#c6ba8b', 2, 2, 12, 12);
      for (let y = 3; y < 14; y += 2) r('#ac9f73', 3, y, 10, 1);
      r('#e0d1a0', 3, 2, 10, 1); break;
    case T.VOID:
    default:
      base('#1b1922'); grain(['#201e27', '#18171f'], 8, 131); break;
  }
}
