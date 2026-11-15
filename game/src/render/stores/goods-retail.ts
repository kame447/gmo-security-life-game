import { INK, MINT_DARK, R, SILVER, WHITE, type C2D, box } from './art';

// --- Bookstore items (8-13 px silhouettes) ---

const SPINE_COLORS = ['#c44c45', '#426ea6', '#5f9450', '#d8a644', '#865b9c', '#de7a3a', '#4d8d8f', '#b85c7e'];

/** Tightly packed vertical book spines with varied heights sitting on shelf ledge `y` (9-12px tall). */
export function drawSpineRow(c: C2D, x: number, y: number, count: number, seed = 0): void {
  for (let i = 0; i < count; i++) {
    const col = SPINE_COLORS[(i + seed) % SPINE_COLORS.length];
    const bx = x + i * 4;
    const h = 9 + ((i * 3 + seed) % 4);
    box(c, bx, y - h, 4, h, col);
    R(c, '#f6eed9', bx + 1, y - h + 2, 2, 2);
  }
}

/** Face-out illustrated book, comic, or magazine cover with spine edge (9x11 at top-left x, y). */
export function drawCoverBook(
  c: C2D,
  x: number,
  y: number,
  cover: string,
  art: string,
  banner = WHITE,
): void {
  box(c, x, y, 9, 11, cover);
  R(c, INK, x + 1, y + 1, 1, 9);
  R(c, banner, x + 2, y + 1, 6, 3);
  R(c, INK, x + 3, y + 2, 4, 1);
  R(c, art, x + 3, y + 5, 4, 4);
}

/** Flat-stacked pile of books (`平積み`) showing cover + thick white page block (12x10 anchored bottom-left x, y). */
export function drawFlatBookStack(c: C2D, x: number, y: number, topCover: string, accent: string, layers = 3): void {
  for (let i = 0; i < layers; i++) {
    const ly = y - (i + 1) * 2;
    R(c, INK, x, ly, 12, 2);
    R(c, i === layers - 1 ? topCover : WHITE, x + 1, ly, 10, 1);
  }
  const topY = y - layers * 2 - 5;
  box(c, x, topY, 12, 6, topCover);
  R(c, WHITE, x + 1, topY + 1, 10, 2);
  R(c, INK, x + 2, topY + 1, 7, 1);
  R(c, accent, x + 3, topY + 3, 6, 2);
}

/** Bookstore recommendation POP sign clip (`おすすめ!`) above flat stacks (8x8 at x, y). */
export function drawPopStand(c: C2D, x: number, y: number, bg = '#f5d44a'): void {
  R(c, INK, x + 3, y + 6, 2, 2);
  box(c, x, y, 8, 6, bg);
  R(c, '#d8453a', x + 1, y + 1, 6, 2);
  R(c, INK, x + 2, y + 4, 4, 1);
}

// --- Candy Shop (だがしや) items (9-15 px) ---

/** Transparent glass dagashi candy jar (`駄菓子瓶`) filled with colorful round sweets (9x11 at x, y). */
export function drawCandyJar(
  c: C2D,
  x: number,
  y: number,
  lid: string,
  candy1: string,
  candy2: string,
): void {
  R(c, INK, x + 2, y, 5, 3);
  R(c, lid, x + 3, y + 1, 3, 1);
  box(c, x, y + 2, 9, 9, '#d7eef6');
  R(c, '#ffffff', x + 1, y + 3, 1, 6);
  R(c, candy1, x + 2, y + 4, 3, 3);
  R(c, candy2, x + 5, y + 3, 3, 3);
  R(c, candy2, x + 2, y + 7, 3, 3);
  R(c, candy1, x + 5, y + 7, 3, 3);
}

/** Colorful oversized swirl lollipops arranged in a wooden stand (16x13 at x, y). */
export function drawLollipopStand(c: C2D, x: number, y: number): void {
  const colors = ['#eb5d75', '#42b3df', '#f4be36'];
  for (let i = 0; i < 3; i++) {
    const lx = x + i * 5;
    R(c, WHITE, lx + 2, y + 5, 1, 5);
    R(c, INK, lx + 1, y, 3, 1);
    R(c, INK, lx, y + 1, 5, 4);
    R(c, INK, lx + 1, y + 5, 3, 1);
    R(c, colors[i], lx + 1, y + 1, 3, 4);
    R(c, WHITE, lx + 2, y + 2, 1, 1);
    R(c, WHITE, lx + 1, y + 3, 1, 1);
  }
  box(c, x, y + 10, 15, 3, '#b07b48');
}

/** Pinched-neck glass Ramune soda bottle with blue marble stopper (5x11 anchored bottom-left x, y). */
export function drawRamuneBottle(c: C2D, x: number, y: number, liquid = '#7ed4f2'): void {
  R(c, INK, x + 1, y - 11, 3, 3);
  R(c, '#3276b8', x + 2, y - 10, 1, 1);
  R(c, INK, x, y - 8, 5, 8);
  R(c, liquid, x + 1, y - 7, 3, 6);
  R(c, WHITE, x + 1, y - 6, 1, 4);
  R(c, '#e85b48', x + 1, y - 4, 3, 2);
}

/** Hanging strip of bright 10-yen dagashi snack pouches (7x15 at x, y). */
export function drawHangingSnacks(c: C2D, x: number, y: number, cols: string[]): void {
  R(c, INK, x + 3, y, 1, 15);
  for (let i = 0; i < cols.length; i++) {
    box(c, x, y + 1 + i * 5, 7, 5, cols[i]);
    R(c, WHITE, x + 1, y + 2 + i * 5, 4, 1);
    R(c, '#f6d85a', x + 2, y + 4 + i * 5, 2, 1);
  }
}

/** Retro red & gold dagashi prize-pull lottery board (`当てくじ`) (11x11 at x, y). */
export function drawKujiBoard(c: C2D, x: number, y: number): void {
  box(c, x, y, 11, 11, '#f0d562');
  R(c, '#d4483a', x + 1, y + 1, 9, 3);
  R(c, WHITE, x + 3, y + 2, 5, 1);
  for (let py = y + 5; py <= y + 8; py += 2) {
    for (let px = x + 2; px <= x + 8; px += 2) {
      R(c, '#4b7ec2', px, py, 1, 1);
    }
  }
}

// --- Pharmacy & Daily Goods items (8-11 px) ---

/** Crisp medical cross emblem (5x5 at x, y). */
export function drawCross(c: C2D, x: number, y: number, color = MINT_DARK): void {
  R(c, color, x + 2, y, 1, 5);
  R(c, color, x, y + 2, 5, 1);
}

/** Labeled OTC medicine carton with bold dose stripe & pill icon (8x8 at x, y). */
export function drawMedBox(c: C2D, x: number, y: number, accent: string): void {
  box(c, x, y, 8, 8, WHITE);
  R(c, accent, x + 1, y + 1, 6, 3);
  R(c, WHITE, x + 2, y + 2, 2, 1);
  R(c, '#d7e5e1', x + 1, y + 5, 6, 2);
}

/** Silver metallic tablet blister pack (`PTPシート`) with capsules (8x9 at x, y). */
export function drawPillBlister(c: C2D, x: number, y: number, pillColor = '#5ab0e2'): void {
  box(c, x, y, 8, 9, SILVER);
  for (let py = y + 2; py <= y + 6; py += 2) {
    R(c, pillColor, x + 2, py, 2, 1);
    R(c, pillColor, x + 5, py, 2, 1);
  }
}

/** Heavy white First-Aid kit box with carry handle & bold crimson cross (11x9 at x, y). */
export function drawFirstAidBox(c: C2D, x: number, y: number): void {
  R(c, INK, x + 3, y, 5, 2);
  box(c, x, y + 1, 11, 8, WHITE);
  R(c, '#d93f3b', x + 5, y + 2, 1, 5);
  R(c, '#d93f3b', x + 3, y + 4, 5, 1);
}

/** Stacked 5-pack pastel tissue boxes with oval slot (10x8 at x, y). */
export function drawTissuePack(c: C2D, x: number, y: number, topCol: string, bottomCol: string): void {
  box(c, x, y + 4, 10, 4, bottomCol);
  box(c, x, y, 10, 5, topCol);
  R(c, WHITE, x + 2, y + 1, 6, 2);
  R(c, INK, x + 3, y + 2, 4, 1);
}

/** Wrapped clear pack of snowy toilet paper rolls (9x9 at x, y). */
export function drawToiletRolls(c: C2D, x: number, y: number): void {
  // Translucent sky-blue film pack containing 2x2 stacked white tissue rolls
  box(c, x, y, 9, 9, '#bfe6f7');
  R(c, WHITE, x + 1, y + 1, 3, 3);
  R(c, WHITE, x + 5, y + 1, 3, 3);
  R(c, '#7ec2e6', x + 4, y + 1, 1, 7);
  R(c, WHITE, x + 1, y + 5, 3, 3);
  R(c, WHITE, x + 5, y + 5, 3, 3);
  R(c, '#7ec2e6', x + 1, y + 4, 7, 1);
  R(c, '#c9b394', x + 2, y + 2, 1, 1);
  R(c, '#c9b394', x + 6, y + 2, 1, 1);
}

/** Pump dispenser shampoo / sanitizer bottle with nozzle (6x10 at x, y). */
export function drawPumpBottle(c: C2D, x: number, y: number, color: string): void {
  R(c, WHITE, x + 1, y, 4, 1);
  R(c, SILVER, x + 2, y + 1, 2, 2);
  box(c, x, y + 3, 6, 7, color);
  R(c, WHITE, x + 1, y + 5, 4, 3);
  R(c, '#ffffff80', x + 1, y + 4, 1, 5);
}
