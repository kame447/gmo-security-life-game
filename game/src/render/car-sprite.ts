/**
 * 駐車中の車のドット絵（2×1 タイル = 32×16、右向き）。NPC と同じく 1 文字 = 1 ドットの図案で持つ。
 * 斜め上から見た形にして、屋根・肩の面を明るく、側面を下へ行くほど暗くし、足元に影を落とす。
 */
import type { C2D } from './draw';
import { paint, type Grid, type Palette } from './player-sprite';

export const CAR_W = 32;
export const CAR_H = 16;

/** 車体：幅 32 × 13 行。y=0 から置く。 */
export const CAR_BODY: Grid = [
  '.........oooooooooooo...........',
  '........oLLLLLLLLLLLLo..........',
  '.......oLLLLLLLLLLLLLLo.........',
  '......ogwgggggocgwgggggo........',
  '.....oggggggggocggggggggo.......',
  '..oLLLoccccccccocccccccccoLLLo..',
  '.oLLLLLLLLLLLLLLLLLLLLLLLLLLLLo.',
  'occcccccccccccccocccccccccccccyo',
  'orccccccccccccccocccccccccccccco',
  'oCCCCCCCCCCCCCCCoCCCCCCCCCCCCCCo',
  'oCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCo',
  'oDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDo',
  '.oooooooooooooooooooooooooooooo.',
];

/** タイヤ：幅 6 × 5 行。車体の下端に重ねる。 */
export const CAR_WHEEL: Grid = [
  '.oooo.',
  'okkkko',
  'okKKko',
  'okkkko',
  '.oooo.',
];

/** 車体の色の候補。配置データの style（0〜3）で選ぶ。 */
export const CAR_COLORS: readonly { L: string; c: string; C: string; D: string }[] = [
  { L: '#f1f0e0', c: '#dddcc5', C: '#bdbca5', D: '#8f8e7b' },
  { L: '#94b5c9', c: '#6b91a9', C: '#557a91', D: '#3f5c6e' },
  { L: '#d38f7c', c: '#b56d5a', C: '#975646', D: '#714035' },
  { L: '#a5b6b4', c: '#7e9290', C: '#677a78', D: '#4d5c5a' },
];

const FIXED: Palette = {
  o: '#39414a', g: '#5f8fa3', w: '#d3e8ec', k: '#2f3438', K: '#a9b2b6', y: '#fff1b4', r: '#d0574b',
};

export function carPalette(style: number): Palette {
  return { ...FIXED, ...CAR_COLORS[((style % CAR_COLORS.length) + CAR_COLORS.length) % CAR_COLORS.length] };
}

export function drawCar(c: C2D, style: number): void {
  c.fillStyle = '#1d24301f';
  c.fillRect(3, 14, CAR_W - 6, 2);
  const colors = carPalette(style);
  paint(c, CAR_BODY, colors, 0, 0);
  paint(c, CAR_WHEEL, colors, 4, 11);
  paint(c, CAR_WHEEL, colors, CAR_W - 10, 11);
}
