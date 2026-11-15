import { INK, MINT_DARK, R, SILVER, WHITE, type C2D, box } from './art';

// --- Bookstore items ---

const SPINE_COLORS = ['#c44c45', '#426ea6', '#5f9450', '#d8a644', '#865b9c', '#de7a3a', '#4d8d8f', '#b85c7e'];

/** Tightly packed vertical/leaning book spines sitting on shelfledge at bottom `y`. */
export function drawSpineRow(c: C2D, x: number, y: number, count: number, seed = 0): void {
  for (let i = 0; i < count; i++) {
    const col = SPINE_COLORS[(i + seed) % SPINE_COLORS.length];
    const bx = x + i * 3;
    const h = 7 + ((i * 5 + seed) % 3);
    box(c, bx, y - h, 3, h, col);
    R(c, '#f4ebd5', bx + 1, y - h + 2, 1, 1);
  }
}

/** Face-out illustrated book or magazine cover (7x9 at top-left x, y). */
export function drawCoverBook(
  c: C2D,
  x: number,
  y: number,
  cover: string,
  art: string,
  banner = WHITE,
): void {
  box(c, x, y, 7, 9, cover);
  R(c, banner, x + 1, y + 1, 5, 2);
  R(c, art, x + 2, y + 4, 3, 3);
}

/** Flat-stacked pile of books (`平積み`) showing cover + white page block (9x7 anchored bottom-left at x, y). */
export function drawFlatBookStack(c: C2D, x: number, y: number, topCover: string, accent: string, layers = 3): void {
  for (let i = 0; i < layers; i++) {
    const ly = y - (i + 1) * 2;
    R(c, INK, x, ly, 9, 2);
    R(c, i === layers - 1 ? topCover : WHITE, x + 1, ly, 7, 1);
  }
  const topY = y - layers * 2 - 4;
  box(c, x, topY, 9, 5, topCover);
  R(c, WHITE, x + 1, topY + 1, 7, 1);
  R(c, accent, x + 2, topY + 2, 5, 2);
}

/** Yellow/red bookstore recommendation POP clip (`おすすめ!`) above a pile (6x6 at x, y). */
export function drawPopStand(c: C2D, x: number, y: number, bg = '#f5d44a'): void {
  R(c, INK, x + 2, y + 4, 2, 2);
  box(c, x, y, 6, 5, bg);
  R(c, '#d8453a', x + 1, y + 1, 4, 1);
  R(c, INK, x + 1, y + 3, 3, 1);
}

// --- Candy Shop (だがしや) items ---

/** Transparent glass candy jar (`駄菓子瓶`) filled with colorful sweets (7x8 at x, y). */
export function drawCandyJar(
  c: C2D,
  x: number,
  y: number,
  lid: string,
  candy1: string,
  candy2: string,
): void {
  R(c, INK, x + 1, y, 5, 2);
  R(c, lid, x + 2, y, 3, 1);
  box(c, x, y + 2, 7, 6, '#d9eef5');
  R(c, '#ffffff', x + 1, y + 3, 1, 3);
  R(c, candy1, x + 2, y + 4, 2, 2);
  R(c, candy2, x + 4, y + 3, 2, 2);
  R(c, candy2, x + 1, y + 5, 2, 2);
  R(c, candy1, x + 3, y + 5, 3, 2);
}

/** Colorful swirl lollipops arranged in a small stand (9x8 at x, y). */
export function drawLollipopStand(c: C2D, x: number, y: number): void {
  const colors = ['#eb5d75', '#52b8df', '#f4c542'];
  for (let i = 0; i < 3; i++) {
    const lx = x + i * 3;
    R(c, WHITE, lx + 1, y + 3, 1, 3);
    R(c, INK, lx, y, 3, 3);
    R(c, colors[i], lx + 1, y + 1, 1, 1);
  }
  box(c, x, y + 6, 9, 2, '#b07b48');
}

/** Hanging strip of small colorful dagashi snack pouches (5x12 at x, y). */
export function drawHangingSnacks(c: C2D, x: number, y: number, cols: string[]): void {
  R(c, INK, x + 2, y, 1, 12);
  for (let i = 0; i < cols.length; i++) {
    box(c, x, y + 1 + i * 4, 5, 4, cols[i]);
    R(c, WHITE, x + 1, y + 2 + i * 4, 2, 1);
  }
}

/** Retro cardboard/wood prize-pull board (`当てくじ`) (8x8 at x, y). */
export function drawKujiBoard(c: C2D, x: number, y: number): void {
  box(c, x, y, 8, 8, '#f0d562');
  R(c, '#d4483a', x + 1, y + 1, 6, 2);
  for (let py = y + 4; py <= y + 6; py += 2) {
    for (let px = x + 2; px <= x + 5; px += 2) {
      R(c, '#5886c4', px, py, 1, 1);
    }
  }
}

// --- Pharmacy & Konbini Daily Goods items ---

/** Crisp medical cross emblem (5x5 at x, y). */
export function drawCross(c: C2D, x: number, y: number, color = MINT_DARK): void {
  R(c, color, x + 2, y, 1, 5);
  R(c, color, x, y + 2, 5, 1);
}

/** Labeled medicine box on pharmacy shelf (6x5 at x, y). */
export function drawMedBox(c: C2D, x: number, y: number, accent: string): void {
  box(c, x, y, 6, 5, WHITE);
  R(c, accent, x + 1, y + 1, 4, 2);
  R(c, '#d7e2df', x + 1, y + 3, 4, 1);
}

/** Silver pill blister pack (`PTPシート`) (5x6 at x, y). */
export function drawPillBlister(c: C2D, x: number, y: number, pillColor = '#5ab0e2'): void {
  box(c, x, y, 5, 6, SILVER);
  R(c, pillColor, x + 1, y + 1, 1, 1);
  R(c, pillColor, x + 3, y + 1, 1, 1);
  R(c, pillColor, x + 1, y + 3, 1, 1);
  R(c, pillColor, x + 3, y + 3, 1, 1);
}

/** First-aid kit box with cross (8x6 at x, y). */
export function drawFirstAidBox(c: C2D, x: number, y: number): void {
  box(c, x, y, 8, 6, WHITE);
  R(c, '#d94842', x + 3, y + 1, 2, 4);
  R(c, '#d94842', x + 2, y + 2, 4, 2);
}

/** Stacked 5-pack or dual pastel tissue boxes (7x6 at x, y). */
export function drawTissuePack(c: C2D, x: number, y: number, topCol: string, bottomCol: string): void {
  box(c, x, y + 3, 7, 3, bottomCol);
  box(c, x, y, 7, 4, topCol);
  R(c, WHITE, x + 2, y + 1, 3, 1);
}

/** Multi-roll toilet paper bag (6x6 at x, y). */
export function drawToiletRolls(c: C2D, x: number, y: number): void {
  box(c, x, y, 6, 6, '#d9eff8');
  R(c, WHITE, x + 1, y + 1, 2, 2);
  R(c, WHITE, x + 3, y + 1, 2, 2);
  R(c, WHITE, x + 1, y + 3, 4, 2);
  R(c, '#e8789a', x + 2, y + 4, 2, 1);
}

/** Pump shampoo / soap bottle (4x7 at x, y). */
export function drawPumpBottle(c: C2D, x: number, y: number, color: string): void {
  R(c, WHITE, x + 1, y, 2, 1);
  R(c, SILVER, x + 1, y + 1, 1, 1);
  box(c, x, y + 2, 4, 5, color);
  R(c, WHITE, x + 1, y + 3, 2, 2);
}
