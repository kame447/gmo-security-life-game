import { INK, R, SILVER, WHITE, type C2D, box } from './art';

// --- Bakery items (8-14 px silhouettes with crisp dark outline) ---

/** Mountain shokupan loaf sitting on shelf/tray (10x10 anchored bottom-left at x, y). */
export function drawShokupan(c: C2D, x: number, y: number): void {
  // Twin dome mountain silhouette + thick toasted golden crust
  R(c, INK, x + 2, y - 10, 2, 1);
  R(c, INK, x + 6, y - 10, 2, 1);
  R(c, INK, x + 1, y - 9, 8, 9);
  R(c, '#c46f29', x + 2, y - 9, 2, 2);
  R(c, '#c46f29', x + 6, y - 9, 2, 2);
  R(c, '#d6893a', x + 2, y - 8, 6, 7);
  R(c, '#f8e6bd', x + 3, y - 6, 4, 4);
  R(c, '#e8b66c', x + 2, y - 2, 6, 1);
}

/** Diagonal scored French baguette (14x8 anchored top-left at x, y). */
export function drawBaguette(c: C2D, x: number, y: number): void {
  R(c, INK, x + 7, y, 6, 3);
  R(c, INK, x + 4, y + 1, 8, 4);
  R(c, INK, x + 1, y + 3, 8, 4);
  R(c, INK, x, y + 4, 5, 4);
  R(c, '#c47427', x + 8, y + 1, 4, 1);
  R(c, '#e59d42', x + 5, y + 2, 6, 2);
  R(c, '#d88832', x + 2, y + 4, 6, 2);
  R(c, '#c47427', x + 1, y + 5, 3, 2);
  // Three signature pale flour slash scores (クープ)
  R(c, '#faecc4', x + 9, y + 1, 2, 1);
  R(c, '#faecc4', x + 6, y + 3, 2, 1);
  R(c, '#faecc4', x + 3, y + 5, 2, 1);
}

/** Flaky crescent croissant with curved horn ends (11x8 anchored top-left at x, y). */
export function drawCroissant(c: C2D, x: number, y: number): void {
  R(c, INK, x + 3, y, 5, 2);
  R(c, INK, x + 1, y + 1, 9, 4);
  R(c, INK, x, y + 3, 11, 3);
  R(c, INK, x, y + 6, 3, 2);
  R(c, INK, x + 8, y + 6, 3, 2);
  R(c, '#c7721f', x + 1, y + 3, 9, 3);
  R(c, '#c7721f', x + 1, y + 6, 1, 1);
  R(c, '#c7721f', x + 9, y + 6, 1, 1);
  R(c, '#eda949', x + 3, y + 1, 5, 4);
  R(c, '#f8d784', x + 4, y + 1, 3, 2);
  // Segment ribs along curved crescent
  R(c, '#964e15', x + 3, y + 2, 1, 3);
  R(c, '#964e15', x + 7, y + 2, 1, 3);
}

/** Checkered dome melonpan with diamond cookie crust grid (9x8 at x, y). */
export function drawMelonpan(c: C2D, x: number, y: number): void {
  R(c, INK, x + 2, y, 5, 1);
  R(c, INK, x + 1, y + 1, 7, 2);
  R(c, INK, x, y + 2, 9, 6);
  R(c, '#e8bc62', x + 1, y + 2, 7, 5);
  R(c, '#f7dd94', x + 2, y + 1, 5, 2);
  // Crisp checkered lattice score lines
  R(c, '#a86b24', x + 3, y + 1, 1, 5);
  R(c, '#a86b24', x + 5, y + 1, 1, 5);
  R(c, '#a86b24', x + 1, y + 3, 7, 1);
  R(c, '#a86b24', x + 1, y + 5, 7, 1);
}

/** Glazed anpan or crunchy golden curry-pan (9x8 at x, y). */
export function drawRoundBun(c: C2D, x: number, y: number, curry = false): void {
  R(c, INK, x + 2, y, 5, 1);
  R(c, INK, x + 1, y + 1, 7, 2);
  R(c, INK, x, y + 2, 9, 6);
  R(c, curry ? '#c26d28' : '#c97530', x + 1, y + 2, 7, 5);
  R(c, curry ? '#eab04d' : '#ea9e4e', x + 2, y + 1, 5, 2);
  if (curry) {
    R(c, '#f7d683', x + 3, y + 3, 2, 1);
    R(c, '#f7d683', x + 5, y + 4, 2, 1);
  } else {
    R(c, '#2e2b2e', x + 3, y + 2, 3, 2);
    R(c, '#f4d9ad', x + 4, y + 2, 1, 1);
  }
}

/** Triangle bakery sandwich wedge with lettuce, tomato & egg layers (10x9 at x, y). */
export function drawSandwich(c: C2D, x: number, y: number): void {
  for (let row = 0; row < 9; row++) {
    const rw = Math.min(10, 3 + row);
    R(c, INK, x, y + row, rw, 1);
  }
  for (let row = 1; row < 8; row++) {
    const rw = Math.min(8, 1 + row);
    R(c, '#f8efd6', x + 1, y + row, rw, 1);
  }
  R(c, '#56ab48', x + 2, y + 4, 4, 1);
  R(c, '#e04c42', x + 2, y + 5, 5, 1);
  R(c, '#f5d24c', x + 2, y + 6, 6, 1);
}

/** Strawberry shortcake wedge with crimson berry & cream stripe (9x9 at x, y). */
export function drawShortcake(c: C2D, x: number, y: number): void {
  R(c, '#56a648', x + 3, y, 2, 1);
  R(c, '#e43f3d', x + 2, y + 1, 4, 2);
  R(c, INK, x, y + 3, 9, 6);
  R(c, WHITE, x + 1, y + 3, 7, 2);
  R(c, '#f2cc7e', x + 1, y + 5, 7, 3);
  R(c, '#e44b48', x + 1, y + 6, 7, 1);
  R(c, WHITE, x + 2, y + 3, 4, 1);
}

// --- Greengrocer produce (8-13 px) ---

/** Plump layered green cabbage with pale outer leaf ribs (10x9 at x, y). */
export function drawCabbage(c: C2D, x: number, y: number): void {
  R(c, INK, x + 3, y, 4, 1);
  R(c, INK, x + 1, y + 1, 8, 6);
  R(c, INK, x, y + 2, 10, 4);
  R(c, INK, x + 2, y + 7, 6, 1);
  R(c, '#3d8f34', x + 1, y + 2, 8, 4);
  R(c, '#3d8f34', x + 2, y + 6, 6, 1);
  R(c, '#70c958', x + 2, y + 1, 6, 5);
  R(c, '#aef089', x + 3, y + 2, 2, 2);
  R(c, '#aef089', x + 5, y + 3, 2, 2);
  R(c, '#2d6e26', x + 2, y + 5, 2, 1);
  R(c, '#2d6e26', x + 6, y + 4, 2, 1);
}

/** Tapered orange carrot with feathery green leafy crown (12x7 at x, y). */
export function drawCarrot(c: C2D, x: number, y: number): void {
  R(c, '#3e8c35', x + 8, y, 3, 2);
  R(c, '#5cbc49', x + 9, y + 1, 3, 3);
  R(c, INK, x + 3, y + 2, 6, 4);
  R(c, INK, x, y + 3, 4, 3);
  R(c, '#df611d', x + 1, y + 4, 7, 1);
  R(c, '#f58c38', x + 3, y + 3, 5, 2);
  R(c, '#ffb866', x + 5, y + 3, 2, 1);
}

/** Long snowy-white daikon radish with leafy green rosette top (13x7 at x, y). */
export function drawDaikon(c: C2D, x: number, y: number): void {
  R(c, '#3d8e38', x + 9, y, 3, 2);
  R(c, '#63c053', x + 9, y + 1, 4, 4);
  R(c, INK, x, y + 2, 10, 4);
  R(c, '#cfd6c7', x + 1, y + 3, 8, 2);
  R(c, '#f9f9f2', x + 2, y + 3, 7, 1);
  R(c, '#b9d693', x + 8, y + 3, 1, 2);
}

/** Plump ruby tomato with green star calyx & highlight (9x8 at x, y). */
export function drawTomato(c: C2D, x: number, y: number): void {
  R(c, '#3d8f38', x + 3, y, 3, 2);
  R(c, INK, x + 1, y + 1, 7, 7);
  R(c, INK, x, y + 2, 9, 5);
  R(c, '#cc2c26', x + 1, y + 2, 7, 5);
  R(c, '#f05f48', x + 2, y + 2, 4, 3);
  R(c, '#5cb54b', x + 3, y + 1, 3, 1);
  R(c, WHITE, x + 2, y + 3, 1, 1);
}

/** Glossy purple teardrop eggplant with green spiky calyx cap (8x9 at x, y). */
export function drawEggplant(c: C2D, x: number, y: number): void {
  R(c, '#4b983b', x + 3, y, 2, 2);
  R(c, INK, x + 1, y + 2, 6, 7);
  R(c, INK, x, y + 4, 8, 4);
  R(c, '#562478', x + 1, y + 3, 6, 5);
  R(c, '#562478', x + 2, y + 8, 4, 1);
  R(c, '#66b550', x + 2, y + 2, 4, 2);
  R(c, '#9a5bc2', x + 2, y + 4, 2, 3);
}

/** Crisp emerald cucumber with bumpy ridges (10x5 at x, y). */
export function drawCucumber(c: C2D, x: number, y: number): void {
  R(c, INK, x, y + 1, 10, 4);
  R(c, '#2d752e', x + 1, y + 2, 8, 2);
  R(c, '#5eb54e', x + 2, y + 2, 6, 1);
  R(c, '#99e083', x + 3, y + 2, 1, 1);
  R(c, '#99e083', x + 6, y + 2, 1, 1);
}

/** Bright mikan orange with green leaf (8x8 at x, y). */
export function drawMikan(c: C2D, x: number, y: number): void {
  R(c, '#478f3c', x + 4, y, 3, 2);
  R(c, INK, x + 1, y + 1, 6, 7);
  R(c, INK, x, y + 2, 8, 5);
  R(c, '#e6731a', x + 1, y + 2, 6, 5);
  R(c, '#fba63e', x + 2, y + 2, 4, 3);
  R(c, '#ffd68a', x + 2, y + 3, 1, 1);
}

/** Indented ruby apple with stem & leaf (8x9 at x, y). */
export function drawApple(c: C2D, x: number, y: number): void {
  R(c, '#684429', x + 3, y, 1, 2);
  R(c, '#4ea342', x + 4, y + 1, 2, 1);
  R(c, INK, x + 1, y + 2, 6, 1);
  R(c, INK, x, y + 3, 8, 4);
  R(c, INK, x + 1, y + 7, 6, 2);
  R(c, '#c4272b', x + 1, y + 3, 6, 4);
  R(c, '#c4272b', x + 2, y + 7, 4, 1);
  R(c, '#ed5b54', x + 1, y + 3, 2, 3);
  R(c, WHITE, x + 2, y + 3, 1, 1);
}

/** Curved three-finger yellow banana bunch (11x8 at x, y). */
export function drawBananas(c: C2D, x: number, y: number): void {
  R(c, '#7a5828', x + 7, y, 2, 2);
  R(c, INK, x + 4, y + 1, 6, 3);
  R(c, INK, x + 2, y + 3, 7, 3);
  R(c, INK, x, y + 4, 8, 4);
  R(c, '#e6b422', x + 5, y + 2, 4, 2);
  R(c, '#fae05e', x + 3, y + 3, 5, 2);
  R(c, '#e6b422', x + 1, y + 5, 6, 2);
  R(c, '#fae05e', x + 2, y + 5, 4, 1);
  R(c, '#9c6e18', x + 4, y + 4, 3, 1);
  R(c, '#6e4918', x + 1, y + 6, 1, 1);
}

/** Retro greengrocer dial pan scale (9x10 anchored bottom-left at x, y). */
export function drawScale(c: C2D, x: number, y: number): void {
  R(c, SILVER, x + 1, y - 10, 7, 1);
  R(c, INK, x + 4, y - 9, 1, 1);
  box(c, x + 1, y - 8, 7, 8, '#dce2d8');
  R(c, WHITE, x + 2, y - 7, 5, 4);
  R(c, '#c8483c', x + 4, y - 6, 1, 3);
}

// --- Cafe items (8-16 px) ---

/** Hot ceramic coffee cup with C-handle, saucer & rising steam (9x9 at x, y). */
export function drawCoffeeCup(c: C2D, x: number, y: number, steam = true): void {
  if (steam) {
    R(c, 'rgba(255,255,255,0.8)', x + 2, y, 1, 2);
    R(c, 'rgba(255,255,255,0.65)', x + 5, y + 1, 1, 2);
  }
  R(c, INK, x + 1, y + 3, 7, 5);
  R(c, WHITE, x + 2, y + 3, 4, 4);
  R(c, '#542e1b', x + 3, y + 4, 2, 1);
  R(c, WHITE, x + 7, y + 4, 1, 2);
  R(c, '#d8ddda', x, y + 8, 9, 1);
}

/** Tall retro melon cream soda glass with vanilla scoop, cherry & straw (8x12 at x, y). */
export function drawMelonSoda(c: C2D, x: number, y: number): void {
  R(c, WHITE, x + 5, y, 1, 4);
  R(c, '#e43f3d', x + 3, y + 1, 2, 2);
  R(c, INK, x + 1, y + 2, 6, 10);
  R(c, WHITE, x + 2, y + 3, 4, 2);
  R(c, '#34b564', x + 2, y + 5, 4, 5);
  R(c, '#8ce8a2', x + 3, y + 6, 1, 3);
  R(c, '#e6eef2', x + 2, y + 10, 4, 2);
}

/** Thick golden morning buttered toast served on white plate (11x8 at x, y). */
export function drawToastPlate(c: C2D, x: number, y: number): void {
  R(c, INK, x, y + 2, 11, 6);
  R(c, WHITE, x + 1, y + 3, 9, 4);
  box(c, x + 2, y, 7, 6, '#b77434');
  R(c, '#f8e2b5', x + 3, y + 1, 5, 4);
  R(c, '#f5d242', x + 4, y + 2, 3, 2);
}

/** Retro pedestal custard pudding with dark caramel cap & cherry (9x8 at x, y). */
export function drawPudding(c: C2D, x: number, y: number): void {
  R(c, '#e43f3d', x + 3, y, 2, 1);
  R(c, INK, x + 1, y + 1, 7, 6);
  R(c, '#632f16', x + 2, y + 1, 5, 2);
  R(c, '#f6cb52', x + 2, y + 3, 5, 3);
  R(c, SILVER, x, y + 7, 9, 1);
}

/** Stainless espresso machine with dual portafilters & warming cups (16x15 at x, y). */
export function drawEspressoMachine(c: C2D, x: number, y: number): void {
  box(c, x, y + 2, 16, 13, '#8b959e');
  R(c, SILVER, x + 1, y + 3, 14, 3);
  R(c, WHITE, x + 2, y, 4, 2);
  R(c, WHITE, x + 7, y, 4, 2);
  R(c, '#333b44', x + 2, y + 7, 12, 6);
  R(c, SILVER, x + 3, y + 6, 4, 2);
  R(c, INK, x + 5, y + 7, 2, 1);
  R(c, SILVER, x + 9, y + 6, 4, 2);
  R(c, INK, x + 11, y + 7, 2, 1);
  R(c, WHITE, x + 3, y + 10, 4, 3);
  R(c, WHITE, x + 9, y + 10, 4, 3);
  R(c, '#d44c3c', x + 13, y + 4, 2, 1);
}

/** Twin-bulb glass siphon coffee brewer on wooden stand (9x14 at x, y). */
export function drawSiphon(c: C2D, x: number, y: number): void {
  R(c, '#7c5030', x + 1, y + 12, 7, 2);
  box(c, x + 2, y + 6, 5, 6, '#9bcdd9');
  R(c, '#57331e', x + 3, y + 8, 3, 3);
  box(c, x + 2, y, 5, 5, '#cce8f0');
  R(c, '#6a4024', x + 3, y + 3, 3, 1);
  R(c, SILVER, x + 3, y + 5, 3, 1);
}

// --- Konbini items (8-11 px) ---

/** Triangular konbini rice ball wrapped in dark nori & filling top badge (8x8 at x, y). */
export function drawOnigiri(c: C2D, x: number, y: number): void {
  R(c, INK, x + 2, y, 4, 2);
  R(c, INK, x + 1, y + 2, 6, 3);
  R(c, INK, x, y + 4, 8, 4);
  R(c, WHITE, x + 3, y + 1, 2, 2);
  R(c, WHITE, x + 2, y + 2, 4, 3);
  R(c, WHITE, x + 1, y + 4, 6, 3);
  // Wide dark crispy nori wrap across lower base
  R(c, '#24332a', x + 1, y + 4, 6, 3);
  R(c, '#e45845', x + 3, y + 2, 2, 1);
}

/** Partitioned lacquered konbini bento lunch tray (11x8 at x, y). */
export function drawBento(c: C2D, x: number, y: number): void {
  box(c, x, y, 11, 8, '#383e46');
  // Snowy steamed rice half with pickled plum
  R(c, WHITE, x + 1, y + 1, 4, 6);
  R(c, '#d9453c', x + 2, y + 3, 2, 2);
  // Divided golden & fresh green main dishes
  R(c, '#e8a243', x + 6, y + 1, 4, 3);
  R(c, '#5fb552', x + 6, y + 5, 4, 2);
  R(c, INK, x + 5, y + 1, 1, 6);
}

/** Crimped puffed foil potato chip / snack pouch (8x9 at x, y). */
export function drawSnackBag(c: C2D, x: number, y: number, body: string, stripe: string): void {
  R(c, INK, x, y, 8, 2);
  R(c, INK, x + 1, y + 2, 6, 5);
  R(c, INK, x, y + 7, 8, 2);
  R(c, body, x + 1, y + 1, 6, 7);
  R(c, stripe, x + 2, y + 3, 4, 3);
  R(c, WHITE, x + 3, y + 2, 2, 1);
}

/** Tapered instant cup ramen container with wide lid & graphic band (8x9 at x, y). */
export function drawCupNoodle(c: C2D, x: number, y: number, stripe: string): void {
  R(c, INK, x, y, 8, 2);
  R(c, INK, x + 1, y + 2, 6, 7);
  R(c, WHITE, x + 1, y + 1, 6, 1);
  R(c, WHITE, x + 2, y + 2, 4, 6);
  R(c, stripe, x + 2, y + 4, 4, 2);
  R(c, '#d6b04d', x + 2, y + 3, 4, 1);
}
