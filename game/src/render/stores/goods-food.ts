import { INK, R, SILVER, WHITE, type C2D, box } from './art';

// --- Bakery items ---

/** Mountain shokupan loaf sitting on shelf/tray (7x7 anchored bottom-left at x, y). */
export function drawShokupan(c: C2D, x: number, y: number): void {
  R(c, INK, x + 1, y - 7, 5, 1);
  R(c, INK, x, y - 6, 7, 6);
  R(c, '#bf702c', x + 1, y - 6, 5, 5);
  R(c, '#e6a552', x + 1, y - 5, 5, 1);
  R(c, '#f8e6bd', x + 2, y - 4, 3, 3);
}

/** Diagonal scored French baguette (8x6 anchored top-left at x, y). */
export function drawBaguette(c: C2D, x: number, y: number): void {
  R(c, INK, x + 4, y, 4, 3);
  R(c, INK, x + 2, y + 1, 5, 3);
  R(c, INK, x, y + 2, 5, 3);
  R(c, '#cf8430', x + 4, y + 1, 3, 1);
  R(c, '#e8a84e', x + 2, y + 2, 4, 1);
  R(c, '#cf8430', x + 1, y + 3, 3, 1);
  R(c, '#f7dd9c', x + 3, y + 2, 1, 1);
  R(c, '#f7dd9c', x + 5, y + 1, 1, 1);
}

/** Flaky golden croissant (7x5 at x, y). */
export function drawCroissant(c: C2D, x: number, y: number): void {
  R(c, INK, x + 1, y, 5, 2);
  R(c, INK, x, y + 1, 7, 3);
  R(c, '#c87725', x + 1, y + 1, 5, 2);
  R(c, '#ebb254', x + 2, y + 1, 3, 1);
  R(c, '#f6d17c', x + 3, y + 1, 1, 1);
  R(c, '#a85a1c', x + 1, y + 3, 1, 1);
  R(c, '#a85a1c', x + 5, y + 3, 1, 1);
}

/** Checkered dome melonpan (6x5 at x, y). */
export function drawMelonpan(c: C2D, x: number, y: number): void {
  R(c, INK, x + 1, y, 4, 1);
  R(c, INK, x, y + 1, 6, 4);
  R(c, '#e8bc62', x + 1, y + 1, 4, 3);
  R(c, '#f7dc94', x + 2, y + 1, 2, 1);
  R(c, '#ba8130', x + 2, y + 2, 1, 1);
  R(c, '#ba8130', x + 3, y + 3, 1, 1);
}

/** Sweet anpan / savory roll with center sesame/glaze mark (6x5 at x, y). */
export function drawRoundBun(c: C2D, x: number, y: number, curry = false): void {
  R(c, INK, x + 1, y, 4, 1);
  R(c, INK, x, y + 1, 6, 4);
  R(c, curry ? '#b96926' : '#c97834', x + 1, y + 1, 4, 3);
  R(c, curry ? '#e59a42' : '#eba455', x + 1, y + 1, 4, 1);
  R(c, curry ? '#f5cd78' : '#2e2b2e', x + 2, y + 2, 2, 1);
}

/** Triangle bakery sandwich slice (6x6 at x, y). */
export function drawSandwich(c: C2D, x: number, y: number): void {
  R(c, INK, x, y + 1, 6, 5);
  R(c, '#f5e8c2', x + 1, y + 1, 4, 4);
  R(c, '#63b450', x + 1, y + 3, 4, 1);
  R(c, '#ea7b78', x + 2, y + 2, 2, 1);
}

/** Strawberry shortcake slice (6x6 at x, y). */
export function drawShortcake(c: C2D, x: number, y: number): void {
  R(c, WHITE, x + 1, y + 2, 4, 3);
  R(c, '#f2d38c', x + 1, y + 4, 4, 1);
  R(c, '#e44b48', x + 2, y + 1, 2, 1);
  R(c, '#56a648', x + 3, y, 1, 1);
  R(c, '#e44b48', x + 1, y + 3, 4, 1);
}

// --- Greengrocer produce ---

/** Plump leafy cabbage (6x5 at x, y). */
export function drawCabbage(c: C2D, x: number, y: number): void {
  R(c, INK, x + 1, y, 4, 1);
  R(c, INK, x, y + 1, 6, 4);
  R(c, '#4b9c3d', x + 1, y + 1, 4, 3);
  R(c, '#7cd15e', x + 1, y + 1, 3, 2);
  R(c, '#b3eb8e', x + 2, y + 1, 2, 1);
}

/** Bright orange carrot with green stalk (6x4 at x, y). */
export function drawCarrot(c: C2D, x: number, y: number): void {
  R(c, '#4da13f', x + 4, y, 2, 2);
  R(c, '#e76821', x + 1, y + 1, 3, 2);
  R(c, '#f7953c', x + 2, y + 1, 2, 1);
  R(c, '#d85519', x, y + 2, 2, 1);
}

/** Long crisp white daikon radish with leafy top (7x4 at x, y). */
export function drawDaikon(c: C2D, x: number, y: number): void {
  R(c, '#4ea643', x + 5, y, 2, 3);
  R(c, '#83cf68', x + 5, y + 1, 1, 1);
  R(c, '#c9d2c4', x, y + 1, 5, 2);
  R(c, '#f7f7ef', x + 1, y + 1, 4, 1);
}

/** Glossy red tomato (5x5 at x, y). */
export function drawTomato(c: C2D, x: number, y: number): void {
  R(c, '#3e8e38', x + 2, y, 1, 1);
  R(c, '#d4362c', x, y + 1, 5, 4);
  R(c, '#f26b54', x + 1, y + 1, 2, 2);
  R(c, WHITE, x + 1, y + 1, 1, 1);
}

/** Deep purple eggplant (4x5 at x, y). */
export function drawEggplant(c: C2D, x: number, y: number): void {
  R(c, '#4c943d', x + 1, y, 2, 1);
  R(c, '#5f2b7d', x, y + 1, 4, 4);
  R(c, '#8d50b0', x + 1, y + 2, 1, 2);
}

/** Crisp cucumber (5x3 at x, y). */
export function drawCucumber(c: C2D, x: number, y: number): void {
  R(c, '#357b33', x, y + 1, 5, 2);
  R(c, '#63b552', x + 1, y + 1, 3, 1);
}

/** Mikan orange (4x4 at x, y). */
export function drawMikan(c: C2D, x: number, y: number): void {
  R(c, '#e6781f', x, y, 4, 4);
  R(c, '#faa642', x + 1, y, 2, 2);
  R(c, '#478f3c', x + 1, y, 1, 1);
}

/** Ruby apple (4x4 at x, y). */
export function drawApple(c: C2D, x: number, y: number): void {
  R(c, '#c92e2e', x, y + 1, 4, 3);
  R(c, '#ed5b54', x + 1, y + 1, 2, 1);
  R(c, '#684429', x + 2, y, 1, 1);
}

/** Banana bunch (6x4 at x, y). */
export function drawBananas(c: C2D, x: number, y: number): void {
  R(c, '#7a5828', x + 2, y, 2, 1);
  R(c, '#e6b828', x + 1, y + 1, 4, 2);
  R(c, '#fae05e', x + 2, y + 1, 3, 2);
  R(c, '#e6b828', x, y + 2, 5, 2);
}

/** Retro dial hanging/pan scale for greengrocer counter (7x8 anchored bottom-left at x, y). */
export function drawScale(c: C2D, x: number, y: number): void {
  R(c, SILVER, x + 1, y - 8, 5, 1);
  R(c, INK, x + 3, y - 7, 1, 1);
  box(c, x + 1, y - 6, 5, 6, '#e2e5de');
  R(c, WHITE, x + 2, y - 5, 3, 3);
  R(c, '#c8483c', x + 3, y - 4, 1, 2);
}

// --- Cafe items ---

/** Hot coffee cup on saucer with rising steam (6x6 anchored top-left at x, y). */
export function drawCoffeeCup(c: C2D, x: number, y: number, steam = true): void {
  if (steam) {
    R(c, 'rgba(255,255,255,0.75)', x + 2, y, 1, 1);
    R(c, 'rgba(255,255,255,0.6)', x + 3, y + 1, 1, 1);
  }
  R(c, WHITE, x + 1, y + 2, 4, 3);
  R(c, '#56311d', x + 2, y + 2, 2, 1);
  R(c, WHITE, x + 5, y + 3, 1, 1);
  R(c, '#d6dbd8', x, y + 5, 6, 1);
}

/** Melon cream soda tall glass with ice cream scoop & cherry (5x8 at x, y). */
export function drawMelonSoda(c: C2D, x: number, y: number): void {
  R(c, '#e44242', x + 2, y, 1, 1);
  R(c, WHITE, x + 1, y + 1, 3, 2);
  R(c, '#3cb568', x + 1, y + 3, 3, 4);
  R(c, '#83e29a', x + 2, y + 3, 1, 3);
  R(c, '#d7e7ea', x + 1, y + 7, 3, 1);
}

/** Thick buttered cafe morning toast on plate (7x5 at x, y). */
export function drawToastPlate(c: C2D, x: number, y: number): void {
  R(c, WHITE, x, y + 1, 7, 4);
  R(c, '#b77434', x + 1, y, 5, 4);
  R(c, '#f6dfb2', x + 2, y + 1, 3, 2);
  R(c, '#f7d64c', x + 3, y + 1, 1, 1);
}

/** Custard pudding with caramel crown (5x5 at x, y). */
export function drawPudding(c: C2D, x: number, y: number): void {
  R(c, SILVER, x, y + 4, 5, 1);
  R(c, '#6e3418', x + 1, y + 1, 3, 1);
  R(c, '#f6cb52', x + 1, y + 2, 3, 2);
  R(c, '#df433e', x + 2, y, 1, 1);
}

/** Stainless espresso machine with dual portafilters & warming tray (15x13 at x, y). */
export function drawEspressoMachine(c: C2D, x: number, y: number): void {
  box(c, x, y + 1, 15, 12, '#8b959e');
  R(c, SILVER, x + 1, y + 2, 13, 3);
  R(c, WHITE, x + 2, y, 3, 2);
  R(c, WHITE, x + 6, y, 3, 2);
  R(c, '#333b44', x + 2, y + 6, 11, 5);
  // Two espresso brew heads
  R(c, SILVER, x + 3, y + 5, 3, 2);
  R(c, INK, x + 5, y + 6, 2, 1);
  R(c, SILVER, x + 9, y + 5, 3, 2);
  R(c, INK, x + 11, y + 6, 2, 1);
  // Cups resting on drip grate
  R(c, WHITE, x + 3, y + 9, 3, 2);
  R(c, WHITE, x + 9, y + 9, 3, 2);
  R(c, '#d44c3c', x + 12, y + 3, 1, 1);
}

/** Glass coffee siphon brewer on wood stand (8x12 at x, y). */
export function drawSiphon(c: C2D, x: number, y: number): void {
  R(c, '#7c5030', x + 1, y + 10, 6, 2);
  R(c, '#a3d3df', x + 2, y + 5, 4, 4);
  R(c, '#57331e', x + 2, y + 6, 4, 3);
  R(c, '#cbe7ef', x + 2, y + 1, 4, 3);
  R(c, '#6a4024', x + 2, y + 3, 4, 1);
  R(c, SILVER, x + 3, y + 4, 2, 1);
}

// --- Konbini food & drinks ---

/** Triangle rice ball (onigiri) wrapped in dark nori (5x5 at x, y). */
export function drawOnigiri(c: C2D, x: number, y: number): void {
  R(c, WHITE, x + 2, y, 1, 1);
  R(c, WHITE, x + 1, y + 1, 3, 3);
  R(c, WHITE, x, y + 3, 5, 2);
  R(c, '#29342d', x + 1, y + 2, 3, 3);
  R(c, '#e45845', x + 2, y + 1, 1, 1);
}

/** Divided rectangular konbini bento tray (7x5 at x, y). */
export function drawBento(c: C2D, x: number, y: number): void {
  box(c, x, y, 7, 5, '#3b4048');
  R(c, WHITE, x + 1, y + 1, 2, 3);
  R(c, '#d95344', x + 1, y + 2, 1, 1);
  R(c, '#e8a243', x + 4, y + 1, 2, 1);
  R(c, '#63b454', x + 4, y + 3, 2, 1);
}

/** Colorful foil potato chip / snack pouch (5x6 at x, y). */
export function drawSnackBag(c: C2D, x: number, y: number, body: string, stripe: string): void {
  box(c, x, y, 5, 6, body);
  R(c, stripe, x + 1, y + 2, 3, 2);
}

/** Cup ramen container (5x5 at x, y). */
export function drawCupNoodle(c: C2D, x: number, y: number, stripe: string): void {
  R(c, INK, x, y, 5, 5);
  R(c, WHITE, x + 1, y + 1, 3, 3);
  R(c, stripe, x + 1, y + 2, 3, 1);
}
