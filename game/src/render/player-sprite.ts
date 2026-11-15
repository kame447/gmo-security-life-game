/**
 * 主人公のドット絵。assets/images/characters/player/base/ の立ち絵（約24×47ドット）を
 * 探索用の 18×26 ドットに描き直したもの。画像は読み込まず、ドット単位の図案をコードで持つ。
 *
 * 図案は 1 文字 = 1 ドット。'.' は透明で、それ以外は palette() の記号に対応する。
 * 頭（13 行）・胴（9 行）・脚（4 行）を重ねて組み立て、髪型・服・色は外見の設定で差し替える。
 * 立ち絵の肩の緑の帯は服の一部として扱い、リュックは描かない（横向き・背面は背中を平らにする）。
 */
import type { Facing } from '../core/coords';
import type { PlayerAppearance } from '../core/appearance';
import type { C2D } from './draw';

export const PLAYER_W = 18;
export const PLAYER_H = 26;

export type View = 'front' | 'back' | 'side';
export type Grid = readonly string[];

const HEAD_X = 1;
const BODY_Y = 13;
const LEGS_Y = 22;

/** 頭：幅 16 × 13 行。キャンバスの x=1 から置く。 */
export const HEADS: Record<View, Record<string, Grid>> = {
  front: {
    short: [
      '......oo.oo.....',
      '....oohhohhoo...',
      '...ohhHhhhHhho..',
      '..ohHHhhhhHHhho.',
      '.ohhHhhhhhhhhdo.',
      '.ohhhhhhhhhhhdo.',
      '.ohhshhhshhshdo.',
      '.ohssssssssssho.',
      '.ohssewssewssho.',
      '.ohsbeesseebsho.',
      '..ossssmmsssso..',
      '...osssssssso...',
      '....oooSSooo....',
    ],
    bob: [
      '................',
      '.....oooooo.....',
      '...oohhHhhhhoo..',
      '..ohhHHhhhhhhho.',
      '.ohHhhhhhhhhhdo.',
      '.ohhhhhhhhhhhdo.',
      '.ohhhhhhhhhhhdo.',
      '.ohhsssssssshdo.',
      '.ohhsewssewshdo.',
      '.ohhbeesseebhdo.',
      '.ohhsssmmssshdo.',
      '.ohhossssssohdo.',
      '..oooooSSooooo..',
    ],
    tied: [
      '...........oo...',
      '.....oooooorRo..',
      '...oohhHhhhorrRo',
      '..ohhHHhhhhhoRo.',
      '.ohHhhhhhhhhhdoo',
      '.ohhhhhhhhhhhdhd',
      '.ohhshhhhhshhdhd',
      '.ohssssssssssohd',
      '.ohssewssewssohd',
      '.ohsbeesseebsodo',
      '..ossssmmsssso.o',
      '...osssssssso...',
      '....oooSSooo....',
    ],
  },
  back: {
    short: [
      '......oo.oo.....',
      '....oohhohhoo...',
      '...ohhHhhhHhho..',
      '..ohHHhhhhHHhho.',
      '.ohhHhhhhhhhhdo.',
      '.ohhhhhhHhhhhdo.',
      '.ohhhhhhhhhhhdo.',
      '.ohdhhhhhhhhddo.',
      '.ohdhhhhhhhhddo.',
      '..odhdhhdhhddo..',
      '..oSssssssssSo..',
      '...oSSssssSSo...',
      '....oooSSooo....',
    ],
    bob: [
      '................',
      '.....oooooo.....',
      '...oohhHhhhhoo..',
      '..ohhHHhhhhhhho.',
      '.ohHhhhhhhhhhdo.',
      '.ohhhhhhhhhhhdo.',
      '.ohhhhhHhhhhhdo.',
      '.ohhhhhhhhhhhdo.',
      '.ohdhhhhhhhhddo.',
      '.ohdhhhhhhhhddo.',
      '.ohdddhhhhdddho.',
      '.oooooSSSSooooo.',
      '....oooSSooo....',
    ],
    tied: [
      '......oo........',
      '....oorRoooo....',
      '...orrRohhHhoo..',
      '..ohoRoHHhhhhho.',
      '.ohHhoohhhhhhdo.',
      '.ohhhhhhhhhhhdo.',
      '.ohhhhhhHhhhhdo.',
      '.ohdhhhhhhhhddo.',
      '.ohdhhhhhhhhddo.',
      '..odhdhhdhhddo..',
      '..oSsssohossSo..',
      '...oSSsohoSSo...',
      '....oooodooo....',
    ],
  },
  side: {
    short: [
      '......oo.oo.....',
      '...oohhohhoo....',
      '..ohhhHhhhHho...',
      '.ohhHHhhhhhHho..',
      '.ohhhhhhhhhhhho.',
      '.ohhhhhhhhhhhho.',
      '.ohdhhhhhshhsho.',
      '.ohdhhhSsssssso.',
      '.ohddhSssssewso.',
      '.ohddhssssbeesso',
      '..odhhssssssmso.',
      '...oddosssssso..',
      '......ooSSoo....',
    ],
    bob: [
      '................',
      '....oooooo......',
      '..oohhHhhhoo....',
      '.ohhHHhhhhhHho..',
      '.ohhhhhhhhhhhho.',
      '.ohhhhhhhhhhhho.',
      '.ohdhhhhhhhhhho.',
      '.ohdhhhhSssssso.',
      '.ohddhhhsssewso.',
      '.ohddhhhssbeesso',
      '.ohddhhhssssmso.',
      '.oddddhooossso..',
      '..ooooooSSoo....',
    ],
    tied: [
      '.oo.............',
      'orRooooooo......',
      'oRrohhHhhhoo....',
      '.oohHHhhhhhHho..',
      '.ohhhhhhhhhhhho.',
      '.ohhhhhhhhhhhho.',
      'ohdhhhhhhshhsho.',
      'hdhdhhhSsssssso.',
      'hdoddhSssssewso.',
      'hdoddhssssbeesso',
      'doodhhssssssmso.',
      'o..oddosssssso..',
      '......ooSSoo....',
    ],
  },
};

/** 胴：幅 18 × 9 行。キャンバスの y=13 から置く。 */
export const BODIES: Record<View, Record<string, Grid>> = {
  front: {
    jacket: [
      '....oowwttwwoo....',
      '...ocgcwttwcgco...',
      '..occgcwyywcgcco..',
      '..occgcttttcgcco..',
      '..oCcgcyyyycgcCo..',
      '..oCcocttttcocCo..',
      '..osoCcttttcCoso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    shirt: [
      '....oowwsswwoo....',
      '...occwwsswwcco...',
      '..occoccWcccocco..',
      '..occoccccccocco..',
      '..oCcoccWcccocCo..',
      '..oCcoccccccocCo..',
      '..osooCCCCCCooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    overalls: [
      '....oottttttoo....',
      '...otctttttctto...',
      '..ottcttttttctto..',
      '..ottccccccccto...',
      '..oTtccWccWcctTo..',
      '..oTtccccccccTto..',
      '..osoccccccccoso..',
      '..ossoccccccosso..',
      '....occcCCccco....',
    ],
  },
  back: {
    jacket: [
      '....oocwwwwcoo....',
      '...occcwwwwccco...',
      '..occoccccccocco..',
      '..occoccccccocco..',
      '..oCcoccccccocCo..',
      '..oCcoccccccocCo..',
      '..osooCCCCCCooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    shirt: [
      '....ooccccccoo....',
      '...occcccccccco...',
      '..occoccccccocco..',
      '..occoccccccocco..',
      '..oCcoccccccocCo..',
      '..oCcoccccccocCo..',
      '..osooCCCCCCooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    overalls: [
      '....oottttttoo....',
      '...ottctttcttto...',
      '..otttctttcttto...',
      '..ottccccccccto...',
      '..oTtccccccccTto..',
      '..oTtccccccccTto..',
      '..osoccccccccoso..',
      '..ossoccccccosso..',
      '....occcCCccco....',
    ],
  },
  side: {
    jacket: [
      '......oowwtto.....',
      '......ocwwttco....',
      '......occCcyco....',
      '......ocoCcoto....',
      '......ocoCcoyo....',
      '......oCoCcoto....',
      '......oCosoctto...',
      '......oposoppo....',
      '......oppppPPo....',
    ],
    shirt: [
      '......oowwsso.....',
      '......occwwco.....',
      '......occCccco....',
      '......ocoCcoco....',
      '......ocoCcoco....',
      '......oCoCcoco....',
      '......oCosocco....',
      '......oposoppo....',
      '......oppppPPo....',
    ],
    overalls: [
      '......oottto......',
      '......ottcto......',
      '......ocoTtco.....',
      '......ocoTtco.....',
      '......ocoTtco.....',
      '......ocoTtco.....',
      '......ocosocco....',
      '......occscco.....',
      '......occccCCo....',
    ],
  },
};

interface Palette { [token: string]: string }

const HAIR: Record<string, string> = {
  brown: '#8a4f2c', black: '#35302f', 'dark-brown': '#5c3a25', gold: '#d2a24c', auburn: '#a5472e',
};
const OUTFIT: Record<string, string> = {
  blue: '#3e64b0', red: '#c4554b', green: '#4f8f58', yellow: '#d6a73a', purple: '#8a64a8',
};

function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (v: number) => Math.round(factor >= 0 ? v + (255 - v) * factor : v * (1 + factor));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function palette(a: PlayerAppearance): Palette {
  const hair = HAIR[a.hairColor] ?? HAIR.brown;
  const coat = OUTFIT[a.outfitColor] ?? OUTFIT.blue;
  const pants = a.outfit === 'overalls' ? coat : '#c9a062';
  return {
    o: '#3b2318',
    h: hair, H: shade(hair, 0.28), d: shade(hair, -0.3),
    s: '#f7c99e', S: '#dfa47a', b: '#ef9d88',
    e: '#2b1a14', w: '#fbf8f0', m: '#c0574d',
    c: coat, C: shade(coat, -0.28), L: shade(coat, 0.35),
    W: '#f1e3a6',
    t: '#f6f2e6', T: '#d9d3c2', y: '#f0b134',
    g: '#76a548', G: '#5a8a3a',
    p: pants, P: shade(pants, -0.22),
    r: '#e2566a', R: '#b33a4c',
    x: '#f6f4ee', k: shade(coat, -0.1), K: '#f2f2ee',
  };
}

function viewOf(facing: Facing): View {
  return facing === 'up' ? 'back' : facing === 'down' ? 'front' : 'side';
}

/** タイプB は正面・背面で胴の中央 2 列を詰め、肩幅を 2 ドット細くする。横向きは厚みを保つ。 */
export function slim(grid: Grid): Grid {
  return grid.map(row => `.${row.slice(0, 8)}${row.slice(10)}.`);
}

function paint(c: C2D, grid: Grid, colors: Palette, x0: number, y0: number): void {
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colors[row[x]];
      if (!color) continue;
      c.fillStyle = color;
      c.fillRect(x0 + x, y0 + y, 1, 1);
    }
  });
}

/**
 * 脚。step は歩行の位相（-1・0・1）。上がった足は 1 ドット短く描く。
 * 正面・背面は左右の脚、横向きは前後の脚として並べる。
 */
function legs(c: C2D, view: View, step: number, colors: Palette, bareLegs: boolean): void {
  const skin = bareLegs ? 's' : 'p';
  const leg = (x: number, lift: number, w = 4) => {
    const top = LEGS_Y + lift;
    const inner = skin.repeat(w - 2), sock = 'x'.repeat(w - 2);
    const rows = lift > 0
      ? [`o${sock}o`, `o${'k'.repeat(w - 1)}o`.slice(0, w + 1), 'o'.repeat(w + 1)]
      : [`o${inner}o`, `o${sock}o`, `o${'k'.repeat(w - 1)}o`.slice(0, w + 1), 'o'.repeat(w + 1)];
    paint(c, rows.slice(0, PLAYER_H - top), colors, x, lift > 0 ? LEGS_Y : top);
  };
  if (view === 'side') {
    const back = step === 0 ? 7 : 6 - step, front = step === 0 ? 9 : 9 + step;
    leg(back, step === 0 ? 0 : 1);
    leg(front, 0);
  } else {
    leg(5, step < 0 ? 1 : 0);
    leg(9, step > 0 ? 1 : 0);
  }
}

export function drawPlayer(c: C2D, a: PlayerAppearance, facing: Facing, frame: 0 | 1 | 2): void {
  const view = viewOf(facing);
  const colors = palette(a);
  const step = frame === 1 ? -1 : frame === 2 ? 1 : 0;
  if (facing === 'left') { c.translate(PLAYER_W, 0); c.scale(-1, 1); }
  legs(c, view, step, colors, a.outfit !== 'overalls');
  const body = BODIES[view][a.outfit] ?? BODIES[view].jacket;
  paint(c, a.silhouette === 'type-b' && view !== 'side' ? slim(body) : body, colors, 0, BODY_Y);
  paint(c, HEADS[view][a.hairStyle] ?? HEADS[view].short, colors, HEAD_X, 0);
}
