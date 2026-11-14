import { R, type C2D } from '../render/draw';
import type { Crossing, CrossingState } from './crossings';

/** Reduced motion keeps active bars horizontal and both lamps steady until fully open. */
export function crossingVisual(state: CrossingState, timeSeconds: number, reduced: boolean): { armDown: number; lamps: readonly [boolean, boolean] } {
  const alternate = Math.floor(timeSeconds * 2) % 2 === 0;
  return { armDown: reduced ? (state.blocked ? 1 : 0) : state.armDown,
    lamps: state.blocked ? (reduced ? [true, true] : [alternate, !alternate]) : [false, false] };
}

/** Original procedural pixel art, matching the existing ground signal colors. One pair spans an entrance. */
export function drawCrossingGate(c: C2D, crossing: Crossing, state: CrossingState, timeSeconds: number, reduced: boolean, south: boolean): void {
  const visual = crossingVisual(state, timeSeconds, reduced);
  const y = south ? crossing.southWaitY : crossing.northWaitY;
  const length = Math.ceil((crossing.right - crossing.left) / 2) + 2;
  const angle = (1 - visual.armDown) * Math.PI / 2;
  for (const [x, sign] of [[crossing.left - 1, 1], [crossing.right + 1, -1]]) {
    R(c, '#596e6a', x - 3, y - 3, 7, 4); R(c, '#c0bdae', x - 2, y - 3, 5, 1);
    R(c, '#425157', x - 1, y - 16, 3, 14);
    for (let n = 0; n < 4; n++) R(c, n % 2 ? '#425157' : '#e9c85d', x - 1, y - 15 + n * 3, 3, 3);
    R(c, '#283e42', x - 5, y - 18, 11, 5);
    for (let n = 0; n < 2; n++) {
      R(c, visual.lamps[n] ? '#db5f4c' : '#465658', x - 3 + n * 5, y - 17, 3, 3);
      if (visual.lamps[n]) R(c, '#f7b277', x - 2 + n * 5, y - 17, 1, 1);
    }
    // Paint integer pixels rather than rotate/rescale a texture, so the moving arm keeps crisp edges.
    for (let n = length; n >= 0; n--) {
      const bx = x + sign * Math.round(Math.cos(angle) * n), by = y - 8 - Math.round(Math.sin(angle) * n);
      R(c, '#425157', bx - 1, by - 1, 3, 4);
    }
    for (let n = 0; n <= length; n++) {
      const bx = x + sign * Math.round(Math.cos(angle) * n), by = y - 8 - Math.round(Math.sin(angle) * n);
      R(c, Math.floor(n / 5) % 2 ? '#425157' : '#e9c85d', bx, by, 1, 2);
    }
    R(c, '#e0dfc9', x - 1, y - 9, 3, 3);
  }
}
