import type { Facing } from '../../core/coords';
import {
  CREAM,
  GLASS,
  GLASS_HI,
  INK,
  MINT_LIGHT,
  SILVER,
  StoreSprite,
  TILE,
  WHITE,
  WOOD_CREAM,
  WOOD_DARK,
  WOOD_LIGHT,
  WOOD_MID,
  box,
  displayTable,
  drawBottle,
  floorShadow,
  glassSheen,
  makeCanvas,
  priceCard,
  R,
  shelfCabinet,
  shopCompactMat,
  shopCounter,
  shopFlatMat,
  shopRug,
  woodCrate,
  wovenBasket,
  type C2D,
  type ObjectDef,
} from './art';
import {
  drawApple,
  drawBaguette,
  drawBananas,
  drawBento,
  drawCabbage,
  drawCarrot,
  drawCoffeeCup,
  drawCroissant,
  drawCucumber,
  drawCupNoodle,
  drawDaikon,
  drawEggplant,
  drawEspressoMachine,
  drawMelonSoda,
  drawMelonpan,
  drawMikan,
  drawOnigiri,
  drawPudding,
  drawRoundBun,
  drawSandwich,
  drawScale,
  drawShokupan,
  drawShortcake,
  drawSiphon,
  drawSnackBag,
  drawToastPlate,
  drawTomato,
} from './goods-food';
import { drawCoverBook, drawTissuePack } from './goods-retail';
import {
  drawCabinetBack,
  drawCabinetSide,
  drawCounterBack,
  drawCounterSide,
  drawMachineBack,
  drawSideProfile,
  rotatedCwContext,
  uprightTileHeight,
} from './rotation-art';
import { effectiveObjectFacing } from './rotation';

function drawDirectional(
  c: C2D,
  w: number,
  facing: Facing,
  drawDown: () => void,
  drawUp: () => void,
  drawLeft: (ctx: C2D) => void,
): void {
  if (facing === 'down') {
    drawDown();
  } else if (facing === 'up') {
    drawUp();
  } else {
    drawSideProfile(c, w, facing, drawLeft);
  }
}

function sprite(w: number, h: number, oy: number, paint: (c: C2D) => void): StoreSprite {
  const [canvas, c] = makeCanvas(w, h);
  paint(c);
  return { canvas, ox: 0, oy };
}

// === Bakery ===

function drawBakeryOven(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 2, w, totalH - 3, '#b55f45');
  R(c, '#8d4330', 2, 3, w - 4, 5);
  for (let bx = 3; bx < w - 5; bx += 7) {
    R(c, '#c87356', bx, 9, 5, 3);
    R(c, '#c87356', bx + 3, 13, 4, 3);
  }
  box(c, 5, 13, w - 10, 14, '#3b2824');
  R(c, '#d96926', 6, 14, w - 12, 12);
  R(c, '#f8b24c', 7, 17, w - 14, 8);
  drawCroissant(c, 8, 17);
  if (w >= 40) drawRoundBun(c, w - 18, 17, false);
  R(c, SILVER, 6, 28, w - 12, 1);
}

function drawBakeryBreadRack(c: C2D, w: number, totalH: number, style: string): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, WOOD_DARK, '#f2dfc0', WOOD_MID, 0);
  R(c, '#c89b55', innerX + 1, tier1Y - 2, innerW - 2, 2);
  if (style === 'loaves') {
    for (let x = innerX + 2; x + 10 <= innerX + innerW - 1; x += 12) {
      drawShokupan(c, x, tier1Y - 1);
    }
    for (let x = innerX + 2; x + 14 <= innerX + innerW - 1; x += 16) {
      drawBaguette(c, x, tier2Y - 9);
    }
  } else {
    for (let x = innerX + 2; x + 11 <= innerX + innerW - 1; x += 13) {
      drawCroissant(c, x, tier1Y - 9);
    }
    for (let x = innerX + 2; x + 9 <= innerX + innerW - 1; x += 11) {
      drawMelonpan(c, x, tier2Y - 9);
    }
  }
  priceCard(c, innerX + 1, tier1Y + 1, '#c96f2a');
}

function drawBakeryPastryTable(c: C2D, w: number, h: number, style: string): void {
  displayTable(c, w, h, WOOD_CREAM, WOOD_MID, WOOD_LIGHT, h - 7);
  const half = Math.floor((w - 6) / 2);
  const topH = h >= 28 ? 19 : 10;
  // Left rattan pastry tray
  box(c, 2, 2, half, topH, '#b87f44');
  R(c, '#f8edd8', 3, 3, half - 2, topH - 2);
  if (style === 'baguettes') {
    drawBaguette(c, 4, 3);
    if (topH >= 16) drawBaguette(c, 5, 11);
  } else {
    drawCroissant(c, 4, 3);
    if (half >= 24) drawCroissant(c, 15, 3);
    if (topH >= 16) {
      drawMelonpan(c, 4, 12);
      if (half >= 24) drawMelonpan(c, 14, 12);
    }
  }

  // Right tray
  const rx = 4 + half;
  const rw = w - rx - 2;
  box(c, rx, 2, rw, topH, '#b87f44');
  R(c, '#f8edd8', rx + 1, 3, rw - 2, topH - 2);
  if (style === 'baguettes') {
    drawShokupan(c, rx + 2, 13);
    if (topH >= 16) drawRoundBun(c, rx + 4, 13, false);
  } else {
    drawRoundBun(c, rx + 2, 3, false);
    if (rw >= 22) drawRoundBun(c, rx + 12, 3, true);
    if (topH >= 16) {
      drawCroissant(c, rx + 2, 12);
      if (rw >= 22) drawRoundBun(c, rx + 13, 12, false);
    }
  }
  // Silver bakery tongs + yellow POP card
  R(c, SILVER, w - 7, 1, 1, 5);
  R(c, INK, w - 6, 1, 1, 4);
  priceCard(c, 4, h - 6, '#c96f2a');
}

function drawBakeryShowcase(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 1, w, totalH - 2, WOOD_MID);
  const glassH = totalH - 9;
  box(c, 2, 2, w - 4, glassH, GLASS);
  R(c, '#edf8fb', 3, 3, w - 6, 4);
  const midShelf = 2 + Math.floor(glassH / 2);
  R(c, WHITE, 3, midShelf, w - 6, 1);
  for (let x = 4; x + 10 <= w - 4; x += 13) {
    drawSandwich(c, x, 3);
  }
  for (let x = 4; x + 9 <= w - 4; x += 12) {
    drawShortcake(c, x, midShelf + 1);
  }
  glassSheen(c, 2, 2, w - 4, glassH);
}

function drawBakeryTrayStand(c: C2D, w: number, totalH: number): void {
  displayTable(c, w, totalH, '#dfc18d', WOOD_MID, WOOD_LIGHT, totalH - 7);
  for (let i = 0; i < 3; i++) {
    box(c, 3, 6 - i * 2, 10, 4, '#c88340');
  }
  if (w >= 28) {
    wovenBasket(c, 15, 2, w - 18, 9);
    drawCroissant(c, 16, 2);
  }
}

function drawBakeryCounter(c: C2D, w: number, h: number, style = ''): void {
  const isSide = style === 'side';
  shopCounter(c, w, h, WOOD_CREAM, WOOD_MID, '#cf7d3e', isSide ? -1 : w - 12, '#4f4640');
  if (isSide) {
    wovenBasket(c, 4, 3, 11, 8);
    drawCroissant(c, 4, 2);
    if (w >= 32) {
      box(c, w - 11, 2, 8, 9, '#c89b5e');
      R(c, '#a8783e', w - 10, 3, 6, 2);
    }
    return;
  }
  box(c, 3, 2, 8, 9, '#c89b5e');
  R(c, '#a8783e', 4, 3, 6, 2);
  if (w >= 32) {
    // Keep 3px clear gap before the register outline at x = w - 12
    box(c, 13, 5, 5, 5, '#faecd2');
  }
}

// === Greengrocer ===

function drawProduceStand(c: C2D, w: number, totalH: number, style: string): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 1, w, totalH - 2, WOOD_DARK);
  R(c, WOOD_MID, 1, 2, w - 2, totalH - 5);
  const crateH = Math.floor((totalH - 7) / 2);
  const half = Math.floor((w - 5) / 2);
  woodCrate(c, 2, 2, half, crateH);
  woodCrate(c, 3 + half, 2, w - half - 5, crateH);
  woodCrate(c, 2, 3 + crateH, half, crateH);
  woodCrate(c, 3 + half, 3 + crateH, w - half - 5, crateH);

  if (style === 'roots') {
    for (let x = 3; x + 12 <= 2 + half; x += 13) drawDaikon(c, x, 3);
    for (let x = 4 + half; x + 12 <= w - 3; x += 12) drawCarrot(c, x, 4);
    for (let x = 3; x + 8 <= 2 + half; x += 9) drawEggplant(c, x, 4 + crateH);
    for (let x = 4 + half; x + 10 <= w - 3; x += 11) drawCucumber(c, x, 6 + crateH);
  } else {
    for (let x = 3; x + 10 <= 2 + half; x += 10) drawCabbage(c, x, 3);
    for (let x = 4 + half; x + 9 <= w - 3; x += 10) drawTomato(c, x, 4);
    for (let x = 3; x + 11 <= 2 + half; x += 11) drawCarrot(c, x, 5 + crateH);
    for (let x = 4 + half; x + 8 <= w - 3; x += 9) drawEggplant(c, x, 4 + crateH);
  }
  priceCard(c, 3, totalH - 6, '#3d9942');
}

function drawFruitTable(c: C2D, w: number, h: number): void {
  displayTable(c, w, h, '#c79656', WOOD_DARK, WOOD_CREAM, h - 7);
  const third = Math.floor((w - 6) / 3);
  const basketH = h >= 28 ? 19 : 9;

  wovenBasket(c, 2, 2, third, basketH);
  drawApple(c, 3, 2);
  if (basketH >= 15) drawApple(c, 5, 11);

  wovenBasket(c, 3 + third, 2, third, basketH);
  drawMikan(c, 4 + third, 3);
  if (basketH >= 15) drawMikan(c, 5 + third, 12);

  const rx = 4 + third * 2;
  wovenBasket(c, rx, 2, w - rx - 2, basketH);
  drawBananas(c, rx + 1, 3);
  if (basketH >= 15) drawBananas(c, rx + 1, 12);
}

function drawBasketRack(c: C2D, w: number, totalH: number): void {
  displayTable(c, w, totalH, WOOD_LIGHT, WOOD_MID, WOOD_CREAM, totalH - 7);
  const cols = 2;
  const bw = Math.floor((w - 6) / cols);
  for (let i = 0; i < cols; i++) {
    const bx = 2 + i * (bw + 2);
    wovenBasket(c, bx, 2, bw, totalH - 10);
    if (i === 0) {
      drawCabbage(c, bx + 2, 3);
      drawTomato(c, bx + bw - 10, 4);
    } else {
      drawEggplant(c, bx + 2, 3);
      drawCucumber(c, bx + bw - 11, 5);
    }
  }
}

function drawGreengrocerChillCase(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#4b9b56', GLASS, '#e8f5eb', 0);
  R(c, GLASS_HI, innerX, 2, innerW, 2);
  for (let x = innerX + 2; x + 10 <= innerX + innerW; x += 12) {
    drawCabbage(c, x, tier1Y - 9);
  }
  for (let x = innerX + 2; x + 13 <= innerX + innerW; x += 15) {
    drawDaikon(c, x, tier2Y - 8);
  }
  glassSheen(c, innerX, 2, innerW, totalH - 6);
}

function drawGreengrocerCounter(c: C2D, w: number, h: number): void {
  shopCounter(c, w, h, WOOD_CREAM, '#7c5334', '#4e9643', w - 12, '#5c665d');
  drawScale(c, 2, 11);
  if (w >= 32) {
    wovenBasket(c, 12, 3, 9, 8);
    drawMikan(c, 12, 2);
  }
}

// === Cafe ===

function drawCafeBrewBar(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 12, w, totalH - 13, '#583823');
  R(c, '#a06a41', 1, 13, w - 2, 5);
  R(c, '#83512d', 1, 18, w - 2, 2);
  drawEspressoMachine(c, 3, 0);
  if (w >= 36) drawSiphon(c, 22, 1);
  if (w >= 50) {
    box(c, w - 19, 4, 7, 9, '#6e4228');
    R(c, '#d7ad73', w - 18, 6, 5, 2);
    drawCoffeeCup(c, w - 11, 5, true);
  }
}

function drawCafeCakeCase(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 2, w, totalH - 3, '#5f3b26');
  const glassH = totalH - 8;
  box(c, 2, 3, w - 4, glassH, GLASS);
  R(c, '#f1f9fc', 3, 4, w - 6, 4);
  const mid = 3 + Math.floor(glassH / 2);
  R(c, WHITE, 3, mid, w - 6, 1);
  for (let x = 4; x + 9 <= w - 4; x += 12) {
    drawShortcake(c, x, 3);
    drawPudding(c, x, mid + 1);
  }
  glassSheen(c, 2, 3, w - 4, glassH);
}

function drawCafeCounter(c: C2D, w: number, h: number, style = ''): void {
  const isSide = style === 'side';
  shopCounter(c, w, h, '#b87d4b', '#5a3824', '#396d54', isSide ? -1 : w - 12, '#4f463e');
  drawCoffeeCup(c, 3, 2, true);
  if (w >= 32) {
    R(c, '#f6d06a', 14, 1, 5, 4);
    R(c, '#7c5a32', 15, 5, 3, 5);
    if (isSide) drawCoffeeCup(c, w - 10, 2, true);
  }
}

function drawCafeTable(c: C2D, w: number, totalH: number, style: string): void {
  displayTable(c, w, totalH, '#c98e53', '#6f472a', '#e3b47a', Math.max(11, totalH - 7));
  const cx = Math.floor(w / 2);
  if (style === 'morning-toast') {
    drawToastPlate(c, 2, 3);
    drawCoffeeCup(c, Math.max(14, w - 11), 2, true);
  } else if (style === 'soda') {
    drawMelonSoda(c, 3, 0);
    if (w >= 24) drawPudding(c, w - 11, 3);
  } else if (style === 'teapot') {
    box(c, cx - 4, 2, 8, 6, '#e8efe9');
    R(c, '#6ba484', cx - 3, 4, 6, 2);
    if (w >= 26) {
      drawCoffeeCup(c, 2, 2, false);
      drawCoffeeCup(c, w - 11, 2, false);
    }
  } else {
    drawCoffeeCup(c, 2, 2, true);
    if (w >= 24) drawShortcake(c, w - 11, 2);
  }
}

function drawCafeChair(c: C2D, w: number, totalH: number, dir: string): void {
  floorShadow(c, 2, totalH - 2, w - 4, 2);
  const seat = '#963b42';
  const hi = '#bf565d';
  if (dir === 'right') {
    box(c, 2, 2, 4, totalH - 4, WOOD_DARK);
    box(c, 5, 7, 8, 9, seat);
    R(c, hi, 6, 8, 6, 2);
    R(c, INK, 11, totalH - 4, 2, 3);
  } else if (dir === 'left') {
    box(c, w - 6, 2, 4, totalH - 4, WOOD_DARK);
    box(c, 3, 7, 8, 9, seat);
    R(c, hi, 4, 8, 6, 2);
    R(c, INK, 3, totalH - 4, 2, 3);
  } else if (dir === 'up') {
    box(c, 3, 4, 10, 8, seat);
    R(c, hi, 4, 5, 8, 2);
    box(c, 2, 11, 12, 6, WOOD_MID);
    R(c, WOOD_LIGHT, 3, 12, 10, 2);
    R(c, INK, 3, totalH - 3, 2, 2);
    R(c, INK, w - 5, totalH - 3, 2, 2);
  } else {
    box(c, 2, 1, 12, 7, WOOD_MID);
    R(c, WOOD_LIGHT, 3, 2, 10, 2);
    box(c, 3, 7, 10, 8, seat);
    R(c, hi, 4, 8, 8, 2);
    R(c, INK, 3, totalH - 4, 2, 3);
    R(c, INK, 11, totalH - 4, 2, 3);
  }
}

function drawCafeSofa(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 1, w, totalH - 3, '#722830');
  R(c, '#9a3b45', 2, 2, w - 4, 6);
  box(c, 2, 9, w - 4, totalH - 12, '#aa454e');
  R(c, '#722830', Math.floor(w / 2), 9, 1, totalH - 13);
  box(c, 0, 5, 3, totalH - 7, WOOD_DARK);
  box(c, w - 3, 5, 3, totalH - 7, WOOD_DARK);
}

function drawCafeMenuBoard(c: C2D, totalH: number): void {
  floorShadow(c, 2, totalH - 2, 12, 2);
  box(c, 2, 1, 12, totalH - 3, WOOD_MID);
  R(c, '#293933', 3, 2, 10, totalH - 7);
  R(c, '#f4e8bf', 5, 4, 6, 1);
  R(c, '#8fd1a8', 4, 7, 7, 1);
  drawCoffeeCup(c, 3, 9, false);
}

function drawCafePlant(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 2, totalH - 2, w - 4, 2);
  box(c, 3, totalH - 9, w - 6, 7, '#b56143');
  R(c, '#d17b5b', 2, totalH - 10, w - 4, 2);
  R(c, '#2e693a', 2, 4, w - 4, 10);
  R(c, '#479450', 4, 1, w - 8, 9);
  R(c, '#6fbe6c', 5, 3, 5, 3);
  R(c, '#6fbe6c', w - 9, 6, 4, 3);
}

// === Konbini ===

function drawKonbiniCooler(c: C2D, w: number, totalH: number, style: string): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#4b9e8d', '#d9eef5', '#f2f7f8', 0);
  R(c, '#2e7d6d', 1, 1, w - 2, 2);
  if (style === 'chilled-food') {
    for (let x = innerX + 2; x + 8 <= innerX + innerW; x += 10) {
      drawOnigiri(c, x, tier1Y - 9);
    }
    for (let x = innerX + 2; x + 11 <= innerX + innerW; x += 13) {
      drawBento(c, x, tier2Y - 9);
    }
  } else {
    const drinks: [string, string][] = [
      ['#51a847', '#2b6b28'],
      ['#3986d6', '#ffffff'],
      ['#e04a3f', '#f4c542'],
      ['#e59230', '#4f993e'],
      ['#4c88c4', '#ffffff'],
    ];
    let idx = 0;
    for (let x = innerX + 2; x + 5 <= innerX + innerW; x += 7) {
      const [body, cap] = drinks[idx++ % drinks.length];
      drawBottle(c, x, tier1Y, body, cap);
      const [b2, c2] = drinks[(idx + 2) % drinks.length];
      drawBottle(c, x, tier2Y, b2, c2);
    }
  }
  glassSheen(c, innerX, 3, innerW, totalH - 7);
}

function drawKonbiniMagazine(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#458e7f', '#eff5f2', SILVER, 0);
  const covers: [string, string][] = [
    ['#e56558', '#f6db6b'],
    ['#4f8cd6', '#f2efe6'],
    ['#6bb45b', '#e66b85'],
    ['#e8aa45', '#4c679c'],
  ];
  let idx = 0;
  for (let x = innerX + 2; x + 9 <= innerX + innerW; x += 11) {
    const [cov, art] = covers[idx++ % covers.length];
    drawCoverBook(c, x, tier1Y - 11, cov, art);
    const [cov2, art2] = covers[(idx + 1) % covers.length];
    drawCoverBook(c, x, tier2Y - 11, cov2, art2);
  }
}

function drawKonbiniSnackShelf(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#4d7f76', CREAM, WHITE, 0);
  const bags: [string, string][] = [
    ['#ebd047', '#d84539'],
    ['#df4f45', '#f7f1db'],
    ['#54a84e', '#f4d352'],
    ['#5589d6', '#ffffff'],
  ];
  let i = 0;
  const step = innerW <= 30 ? 9 : 10;
  const start = innerW <= 30 ? innerX + 1 : innerX + 2;
  for (let x = start; x + 8 <= innerX + innerW; x += step) {
    const [b1, s1] = bags[i++ % bags.length];
    drawSnackBag(c, x, tier1Y - 9, b1, s1);
    const [b2, s2] = bags[(i + 2) % bags.length];
    drawSnackBag(c, x, tier2Y - 9, b2, s2);
  }
  R(c, '#f2c849', innerX, tier1Y, innerW, 1);
  R(c, '#f2c849', innerX, tier2Y, innerW, 1);
}

function drawKonbiniFoodShelf(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#5b7285', CREAM, WHITE, 0);
  const stripes = ['#d9453a', '#4f9952', '#e8962e', '#4c76c2'];
  let i = 0;
  const step = innerW <= 30 ? 9 : 10;
  const start = innerW <= 30 ? innerX + 1 : innerX + 2;
  for (let x = start; x + 8 <= innerX + innerW; x += step) {
    drawCupNoodle(c, x, tier1Y - 9, stripes[i++ % stripes.length]);
    drawRoundBun(c, x, tier2Y - 8, i % 2 === 1);
  }
}

function drawKonbiniDailyShelf(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#548296', '#edf4f7', WHITE, 0);
  for (let x = innerX + 2; x + 10 <= innerX + innerW; x += 12) {
    drawTissuePack(c, x, tier1Y - 8, x % 2 === 0 ? '#7ac6e8' : '#f295b0', '#f5c768');
  }
  const pads = ['#4a7ac9', '#4f9d69', '#e5a23c', '#cf5c55'];
  let i = 0;
  for (let x = innerX + 2; x + 7 <= innerX + innerW; x += 8) {
    box(c, x, tier2Y - 8, 7, 8, pads[i++ % pads.length]);
    R(c, WHITE, x + 2, tier2Y - 7, 3, 3);
  }
}

function drawKonbiniIceFreezer(c: C2D, w: number, h: number): void {
  floorShadow(c, 1, h - 2, w - 2, 2);
  box(c, 0, 1, w, h - 2, '#d5e6ed');
  box(c, 2, 2, w - 4, h - 5, GLASS);
  const pops = ['#f288a4', '#6ec3ea', '#f5d25c', '#6e452d'];
  let i = 0;
  for (let x = 3; x + 5 <= w - 3; x += 6) {
    box(c, x, 4, 5, 8, pops[i++ % pops.length]);
    R(c, WHITE, x + 1, 5, 2, 3);
  }
  glassSheen(c, 2, 2, w - 4, h - 5);
}

function drawKonbiniCounter(c: C2D, w: number, h: number, style = ''): void {
  const isSide = style === 'side';
  // Left-side checkout carries register next to clerk; right side holds steamer & coffee
  shopCounter(c, w, h, WHITE, '#e5ebe9', '#399679', isSide ? -1 : w - 12, '#4c5761');
  R(c, '#ea823a', 1, 18, w - 2, 1);
  if (!isSide) {
    box(c, 4, 4, 9, 6, '#7cb89a');
    R(c, WHITE, 5, 5, 7, 2);
    return;
  }
  // Nikuman hot steamer case
  box(c, 4, 1, 9, 10, '#f6dfb0');
  R(c, '#f8b959', 5, 2, 7, 8);
  R(c, WHITE, 6, 3, 2, 2);
  R(c, WHITE, 9, 3, 2, 2);
  R(c, WHITE, 6, 6, 2, 2);
  R(c, WHITE, 9, 6, 2, 2);
  if (w >= 30) {
    // Self-serve hot coffee tower
    box(c, w - 11, 0, 8, 11, '#394048');
    R(c, '#95d4c2', w - 10, 1, 6, 3);
    R(c, WHITE, w - 8, 6, 3, 4);
  }
}

function drawShopFloor(c: C2D, w: number, h: number, style: string): void {
  if (style === 'doma') {
    R(c, '#9fa29b', 0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      for (let x = 0; x < w; x += 8) {
        const hash = ((x >> 3) * 7 + (y >> 3) * 13) % 5;
        if (hash === 0) R(c, '#959891', x + 1, y + 2, 4, 3);
        else if (hash === 2) R(c, '#acafa7', x + 3, y + 4, 3, 2);
        else if (hash === 4) R(c, '#8c8f88', x + 5, y + 1, 2, 2);
      }
    }
    return;
  }
  if (style === 'dark-wood') {
    R(c, '#784f32', 0, 0, w, h);
    for (let y = 0; y < h; y += 4) {
      R(c, '#623e25', 0, y, w, 1);
      if (((y >> 2) & 1) === 0) R(c, '#86593a', 0, y + 2, w, 1);
      const offset = ((y >> 2) % 2) * 8;
      for (let x = offset; x < w; x += 16) R(c, '#623e25', x, y, 1, 4);
    }
    return;
  }
  // Light square ceramic tile for konbini ('tile') and pharmacy ('tile-mint')
  const mint = style === 'tile-mint';
  const base = mint ? '#ecf5f2' : '#eef3f1';
  const alt = mint ? '#e5f0ec' : '#e8eeec';
  const grout = mint ? '#cee0da' : '#d6dfdc';
  R(c, base, 0, 0, w, h);
  for (let y = 0; y < h; y += 8) {
    for (let x = 0; x < w; x += 8) {
      if ((((x >> 3) + (y >> 3)) & 1) === 1) R(c, alt, x, y, 8, 8);
      R(c, grout, x, y, 8, 1);
      R(c, grout, x, y, 1, 8);
    }
  }
}

function drawShopRug(c: C2D, w: number, h: number, style: string): void {
  if (style === 'bakery') shopRug(c, w, h, '#e8c494', '#b87640', '#faecd2');
  else if (style === 'bookstore') shopRug(c, w, h, '#b86258', '#683c36', '#e6c88a');
  else if (style === 'cafe') shopRug(c, w, h, '#8f3a40', '#5a2228', '#d9b583');
  else if (style === 'greengrocer') shopCompactMat(c, w, h, '#bfd6a3', '#528e4b', '#f2ecd2');
  else if (style === 'candy') shopCompactMat(c, w, h, '#e8a278', '#c84b44', '#fae38a');
  else if (style === 'pharmacy') shopFlatMat(c, w, h, MINT_LIGHT, '#4c9984', WHITE);
  else shopFlatMat(c, w, h, '#cbe5dc', '#3d9986', '#e9f6f2');
}

function drawShopRugDir(c: C2D, w: number, h: number, facing: Facing, style: string): void {
  if (facing === 'left') {
    drawShopRug(rotatedCwContext(c, w), h, w, style);
    return;
  }
  drawShopRug(c, w, h, style);
}

// === Directional food store drawers (up / left / right; down delegates verbatim to baseline) ===

function drawBakeryOvenDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawBakeryOven(c, w, totalH),
    () => {
      floorShadow(c, 1, totalH - 2, w - 2, 2);
      box(c, 0, 2, w, totalH - 3, '#b55f45');
      R(c, '#8d4330', 2, 3, w - 4, 5);
      for (let by = 9; by < totalH - 5; by += 8) {
        for (let bx = 3; bx < w - 5; bx += 7) {
          R(c, '#c87356', bx, by, 5, 3);
          R(c, '#c87356', bx + 3, by + 4, 4, 3);
        }
      }
      R(c, '#5c6670', 4, totalH - 7, w - 8, 3);
    },
    (ctx) => {
      floorShadow(ctx, 1, totalH - 2, w - 2, 2);
      box(ctx, 0, 2, w, totalH - 3, '#b55f45');
      R(ctx, '#8d4330', 2, 3, w - 4, 5);
      R(ctx, '#9e4c36', w - 6, 3, 4, totalH - 6);
      for (let by = 9; by < totalH - 6; by += 8) {
        for (let bx = 2; bx + 4 <= w - 6; bx += 6) {
          R(ctx, '#c87356', bx, by, 4, 3);
        }
      }
      const mouthY = Math.min(totalH - 16, Math.max(11, Math.floor((totalH - 12) / 2)));
      box(ctx, 0, mouthY, Math.min(8, w - 5), 12, '#3b2824');
      R(ctx, '#d96926', 0, mouthY + 1, Math.min(7, w - 6), 10);
      R(ctx, '#f8b24c', 1, mouthY + 3, Math.min(5, w - 8), 6);
      R(ctx, SILVER, 2, mouthY + 13, Math.min(6, w - 6), 1);
    },
  );
}

function drawBakeryBreadRackDir(c: C2D, w: number, totalH: number, facing: Facing, style: string): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawBakeryBreadRack(c, w, totalH, style),
    () => drawCabinetBack(c, w, totalH, WOOD_DARK, '#f2dfc0', WOOD_MID),
    (ctx) =>
      drawCabinetSide(ctx, w, totalH, WOOD_DARK, '#cfa775', '#f2dfc0', WOOD_MID, WOOD_DARK, 0, (sctx, ix, iw, y1, y2) => {
        if (iw >= 14) {
          if (style === 'loaves') {
            drawShokupan(sctx, ix + 1, y1 - 1);
            drawBaguette(sctx, ix + 1, y2 - 9);
          } else {
            drawCroissant(sctx, ix + 1, y1 - 9);
            drawMelonpan(sctx, ix + 1, y2 - 9);
          }
        } else if (style === 'loaves') {
          box(sctx, ix + 1, y1 - 8, 6, 7, '#d89b55');
          R(sctx, '#f2cc88', ix + 2, y1 - 7, 4, 3);
          box(sctx, ix + 1, y2 - 5, 7, 4, '#c8803c');
          R(sctx, '#e8b36d', ix + 2, y2 - 4, 5, 1);
        } else {
          box(sctx, ix + 1, y1 - 6, 7, 5, '#d88b3a');
          R(sctx, '#f2b868', ix + 2, y1 - 5, 5, 2);
          box(sctx, ix + 1, y2 - 6, 6, 5, '#e2a34f');
          R(sctx, '#f7cf86', ix + 2, y2 - 5, 4, 2);
        }
        priceCard(sctx, ix, y1 + 1, '#c96f2a');
      }),
  );
}

function drawBakeryPastryTableDir(c: C2D, w: number, h: number, facing: Facing, style: string): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawBakeryPastryTable(c, w, h, style),
    () => {
      displayTable(c, w, h, WOOD_CREAM, WOOD_MID, WOOD_LIGHT, h - 7);
      const half = Math.floor((w - 6) / 2);
      const topH = h >= 28 ? 19 : 10;
      const rx = 4 + half;
      const rw = w - rx - 2;
      // Left tray becomes opposite side when rotated 180
      box(c, 2, 2, half, topH, '#b87f44');
      R(c, '#f8edd8', 3, 3, half - 2, topH - 2);
      if (style === 'baguettes') {
        drawShokupan(c, 4, 13);
        if (topH >= 16) drawRoundBun(c, 6, 13, false);
      } else {
        drawRoundBun(c, 4, 3, false);
        if (half >= 22) drawRoundBun(c, 14, 3, true);
        if (topH >= 16) drawCroissant(c, 4, 12);
      }
      box(c, rx, 2, rw, topH, '#b87f44');
      R(c, '#f8edd8', rx + 1, 3, rw - 2, topH - 2);
      if (style === 'baguettes') {
        drawBaguette(c, rx + 2, 3);
        if (topH >= 16) drawBaguette(c, rx + 3, 11);
      } else {
        drawCroissant(c, rx + 2, 3);
        if (topH >= 16) drawMelonpan(c, rx + 2, 12);
      }
      R(c, SILVER, 6, 1, 1, 5);
      R(c, INK, 5, 1, 1, 4);
      priceCard(c, w - 11, h - 6, '#c96f2a');
    },
    (ctx) => {
      displayTable(ctx, w, h, WOOD_CREAM, WOOD_MID, WOOD_LIGHT, h - 7);
      const trayW = w - 4;
      const trayH = Math.max(8, Math.floor((h - 9) / 2));
      box(ctx, 2, 2, trayW, trayH, '#b87f44');
      R(ctx, '#f8edd8', 3, 3, trayW - 2, trayH - 2);
      const by2 = 3 + trayH;
      const trayH2 = Math.max(8, h - by2 - 4);
      box(ctx, 2, by2, trayW, trayH2, '#b87f44');
      R(ctx, '#f8edd8', 3, by2 + 1, trayW - 2, trayH2 - 2);
      if (style === 'baguettes') {
        drawShokupan(ctx, 3, 4);
        drawRoundBun(ctx, 3, by2 + 2, false);
      } else {
        drawMelonpan(ctx, 3, 3);
        drawRoundBun(ctx, 3, by2 + 2, true);
      }
      R(ctx, SILVER, 2, 1, 1, 5);
      R(ctx, INK, 3, 1, 1, 4);
      priceCard(ctx, 2, h - 6, '#c96f2a');
    },
  );
}

function drawBakeryShowcaseDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawBakeryShowcase(c, w, totalH),
    () => {
      floorShadow(c, 1, totalH - 2, w - 2, 2);
      box(c, 0, 1, w, totalH - 2, WOOD_MID);
      const glassH = totalH - 9;
      box(c, 2, 2, w - 4, glassH, '#b8d4de');
      R(c, WOOD_DARK, Math.floor(w / 2), 2, 1, glassH);
      R(c, SILVER, 4, 4, 1, Math.min(4, glassH - 2));
      R(c, SILVER, Math.floor(w / 2) + 2, 4, 1, Math.min(4, glassH - 2));
      R(c, '#8b5a34', 2, totalH - 7, w - 4, 4);
    },
    (ctx) => {
      floorShadow(ctx, 1, totalH - 2, w - 2, 2);
      box(ctx, 0, 1, w, totalH - 2, WOOD_MID);
      const cheekW = Math.min(5, Math.floor(w / 3));
      const paneW = w - cheekW - 3;
      R(ctx, '#8b5a34', w - cheekW - 1, 2, cheekW, totalH - 9);
      box(ctx, 2, 2, paneW, totalH - 9, GLASS);
      const midShelf = 2 + Math.floor((totalH - 9) / 2);
      R(ctx, WHITE, 3, midShelf, paneW - 2, 1);
      box(ctx, 3, 4, Math.min(7, paneW - 2), 6, '#f2e0ba');
      box(ctx, 3, midShelf + 2, Math.min(7, paneW - 2), 6, '#fff4ea');
      R(ctx, '#e24b5a', 4, midShelf + 2, 3, 2);
      glassSheen(ctx, 2, 2, paneW, totalH - 9);
    },
  );
}

function drawBakeryTrayStandDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawBakeryTrayStand(c, w, totalH),
    () => {
      displayTable(c, w, totalH, '#dfc18d', WOOD_MID, WOOD_LIGHT, totalH - 7);
      if (w >= 28) {
        wovenBasket(c, 3, 2, w - 18, 9);
        drawCroissant(c, 4, 2);
      }
      for (let i = 0; i < 3; i++) {
        box(c, w - 13, 6 - i * 2, 10, 4, '#c88340');
      }
    },
    (ctx) => {
      displayTable(ctx, w, totalH, '#dfc18d', WOOD_MID, WOOD_LIGHT, totalH - 7);
      wovenBasket(ctx, 2, 2, w - 4, 9);
      drawCroissant(ctx, 2, 2);
      const trayY = Math.max(14, totalH - 14);
      for (let i = 0; i < 3; i++) {
        box(ctx, 2, trayY - i * 2, Math.min(10, w - 4), 4, '#c88340');
      }
      R(ctx, SILVER, 1, 4, 1, 6);
    },
  );
}

function drawBakeryCounterDir(c: C2D, w: number, h: number, facing: Facing, style: string): void {
  const isSide = style === 'side';
  drawDirectional(
    c,
    w,
    facing,
    () => drawBakeryCounter(c, w, h, style),
    () => {
      drawCounterBack(c, w, h, {
        topCol: WOOD_CREAM,
        bodyCol: WOOD_MID,
        trimCol: '#cf7d3e',
        regX: isSide ? -1 : 2,
        regCol: '#4f4640',
      });
      if (isSide) {
        box(c, 3, 2, 8, 9, '#c89b5e');
        R(c, '#a8783e', 4, 3, 6, 2);
        if (w >= 32) {
          wovenBasket(c, w - 15, 3, 11, 8);
          drawCroissant(c, w - 15, 2);
        }
      } else {
        box(c, w - 11, 2, 8, 9, '#c89b5e');
        R(c, '#a8783e', w - 10, 3, 6, 2);
        if (w >= 32) box(c, w - 18, 5, 5, 5, '#faecd2');
      }
    },
    (ctx) => {
      drawCounterSide(ctx, w, h, WOOD_CREAM, WOOD_MID, '#cf7d3e', !isSide, '#4f4640');
      if (isSide) {
        wovenBasket(ctx, 2, 2, 11, 8);
        drawCroissant(ctx, 2, 1);
        if (h >= 24) {
          box(ctx, 4, h - 13, 8, 8, '#c89b5e');
          R(ctx, '#a8783e', 5, h - 12, 6, 2);
        }
      } else if (h >= 24) {
        box(ctx, 4, h - 13, 8, 8, '#c89b5e');
        R(ctx, '#a8783e', 5, h - 12, 6, 2);
      }
    },
  );
}

function drawProduceStandDir(c: C2D, w: number, totalH: number, facing: Facing, style: string): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawProduceStand(c, w, totalH, style),
    () => {
      drawCabinetBack(c, w, totalH, WOOD_DARK, WOOD_MID, WOOD_CREAM, 16, 1);
      R(c, style === 'roots' ? '#c89b5e' : '#3d9942', 2, 2, w - 4, 2);
    },
    (ctx) =>
      drawCabinetSide(ctx, w, totalH, WOOD_DARK, '#70492b', WOOD_MID, WOOD_CREAM, WOOD_DARK, 1, (sctx, ix, iw, y1, y2) => {
        if (iw >= 14) {
          woodCrate(sctx, ix, 4, iw, Math.max(8, y1 - 5));
          woodCrate(sctx, ix, y1 + 3, iw, Math.max(8, y2 - y1 - 4));
          if (style === 'roots') {
            drawDaikon(sctx, ix + 1, 5);
            drawCarrot(sctx, ix + 1, y1 + 5);
          } else {
            drawCabbage(sctx, ix + 1, 5);
            drawTomato(sctx, ix + 1, y1 + 5);
          }
        } else if (style === 'roots') {
          box(sctx, ix + 1, y1 - 7, 6, 6, '#edf2e9');
          R(sctx, '#4f9943', ix + 2, y1 - 8, 4, 2);
          box(sctx, ix + 1, y2 - 6, 6, 5, '#e87a24');
          R(sctx, '#4f9943', ix + 2, y2 - 7, 3, 2);
        } else {
          box(sctx, ix + 1, y1 - 7, 6, 6, '#5ca844');
          R(sctx, '#9bd67a', ix + 2, y1 - 6, 4, 2);
          box(sctx, ix + 1, y2 - 6, 6, 5, '#d93e36');
          R(sctx, '#4f9943', ix + 3, y2 - 7, 2, 2);
        }
        priceCard(sctx, ix, totalH - 6, '#3d9942');
      }),
  );
}

function drawFruitTableDir(c: C2D, w: number, h: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawFruitTable(c, w, h),
    () => {
      displayTable(c, w, h, '#c79656', WOOD_DARK, WOOD_CREAM, h - 7);
      const third = Math.floor((w - 6) / 3);
      const basketH = h >= 28 ? 19 : 9;
      wovenBasket(c, 2, 2, third, basketH);
      drawBananas(c, 3, 3);
      if (basketH >= 15) drawBananas(c, 3, 12);
      wovenBasket(c, 3 + third, 2, third, basketH);
      drawMikan(c, 4 + third, 3);
      if (basketH >= 15) drawMikan(c, 5 + third, 12);
      const rx = 4 + third * 2;
      wovenBasket(c, rx, 2, w - rx - 2, basketH);
      drawApple(c, rx + 2, 2);
      if (basketH >= 15) drawApple(c, rx + 3, 11);
    },
    (ctx) => {
      displayTable(ctx, w, h, '#c79656', WOOD_DARK, WOOD_CREAM, h - 7);
      const bw = w - 4;
      const seg = Math.max(8, Math.floor((h - 10) / 3));
      wovenBasket(ctx, 2, 2, bw, seg);
      drawApple(ctx, 3, 2);
      const y2 = 3 + seg;
      wovenBasket(ctx, 2, y2, bw, seg);
      drawMikan(ctx, 3, y2 + 1);
      const y3 = 4 + seg * 2;
      wovenBasket(ctx, 2, y3, bw, Math.max(8, h - y3 - 5));
      drawBananas(ctx, 2, y3 + 1);
      priceCard(ctx, 2, h - 6, '#e07a32');
    },
  );
}

function drawBasketRackDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawBasketRack(c, w, totalH),
    () => {
      displayTable(c, w, totalH, WOOD_LIGHT, WOOD_MID, WOOD_CREAM, totalH - 7);
      const bw = Math.floor((w - 6) / 2);
      wovenBasket(c, 2, 2, bw, totalH - 10);
      drawEggplant(c, 4, 3);
      drawCucumber(c, Math.max(4, bw - 9), 5);
      const rx = 4 + bw;
      wovenBasket(c, rx, 2, bw, totalH - 10);
      drawCabbage(c, rx + 2, 3);
      drawTomato(c, rx + Math.max(2, bw - 10), 4);
      R(c, WOOD_MID, 1, totalH - 8, w - 2, 2);
    },
    (ctx) => {
      displayTable(ctx, w, totalH, WOOD_LIGHT, WOOD_MID, WOOD_CREAM, totalH - 7);
      const seg = Math.max(9, Math.floor((totalH - 12) / 2));
      wovenBasket(ctx, 2, 2, w - 4, seg);
      drawCabbage(ctx, 3, 3);
      const y2 = 4 + seg;
      wovenBasket(ctx, 2, y2, w - 4, Math.max(9, totalH - y2 - 8));
      drawEggplant(ctx, 4, y2 + 1);
      R(ctx, WOOD_DARK, 1, 4, 1, totalH - 11);
    },
  );
}

function drawGreengrocerChillCaseDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawGreengrocerChillCase(c, w, totalH),
    () => drawMachineBack(c, w, totalH, '#88ad91', '#4b9b56', '#e8f5eb'),
    (ctx) => {
      drawCabinetSide(ctx, w, totalH, '#4b9b56', '#3c8046', GLASS, '#e8f5eb', '#4b9b56', 0, (sctx, ix, iw, y1, y2) => {
        R(sctx, GLASS_HI, ix, 2, iw, 2);
        box(sctx, ix + 1, y1 - 7, Math.min(7, iw - 2), 6, '#5ca844');
        box(sctx, ix + 1, y2 - 6, Math.min(7, iw - 2), 5, '#edf2e9');
      });
      R(ctx, GLASS_HI, 1, 2, 1, totalH - 6);
    },
  );
}

function drawGreengrocerCounterDir(c: C2D, w: number, h: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawGreengrocerCounter(c, w, h),
    () => {
      drawCounterBack(c, w, h, {
        topCol: WOOD_CREAM,
        bodyCol: '#7c5334',
        trimCol: '#4e9643',
        regX: 2,
        regCol: '#5c665d',
      });
      drawScale(c, w - 11, 11);
      if (w >= 32) {
        wovenBasket(c, 13, 3, 9, 8);
        drawMikan(c, 13, 2);
      }
    },
    (ctx) => {
      drawCounterSide(ctx, w, h, WOOD_CREAM, '#7c5334', '#4e9643', true, '#5c665d');
      drawScale(ctx, 3, Math.min(h + 2, 22));
      if (h >= 36) {
        wovenBasket(ctx, 3, h - 14, 9, 8);
        drawMikan(ctx, 3, h - 15);
      }
    },
  );
}

function drawCafeBrewBarDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawCafeBrewBar(c, w, totalH),
    () => {
      floorShadow(c, 1, totalH - 2, w - 2, 2);
      box(c, 0, 12, w, totalH - 13, '#583823');
      R(c, '#a06a41', 1, 13, w - 2, 5);
      box(c, 3, 19, Math.max(8, w - 6), Math.max(4, totalH - 22), '#3b2416');
      R(c, '#83512d', 4, 20, Math.max(6, w - 8), 1);
      drawCoffeeCup(c, 3, 5, true);
      if (w >= 36) {
        box(c, 14, 4, 7, 9, '#6e4228');
        R(c, '#d7ad73', 15, 6, 5, 2);
        drawSiphon(c, Math.max(22, w - 31), 1);
      }
      box(c, w - 19, 1, 16, 13, '#98a3ad');
      R(c, '#dce3e8', w - 18, 2, 14, 2);
      R(c, '#5c6670', w - 16, 6, 10, 1);
      R(c, '#5c6670', w - 16, 9, 10, 1);
    },
    (ctx) => {
      floorShadow(ctx, 1, totalH - 2, w - 2, 2);
      box(ctx, 0, 12, w, totalH - 13, '#583823');
      R(ctx, '#a06a41', 1, 13, w - 2, totalH - 16);
      R(ctx, '#d7ad73', 1, 13, 2, totalH - 16);
      box(ctx, 2, 1, Math.min(12, w - 3), 13, '#88949e');
      R(ctx, '#dce3e8', 3, 2, Math.min(10, w - 5), 3);
      R(ctx, '#3b2416', 3, 8, Math.min(7, w - 5), 5);
      if (totalH >= 38) drawSiphon(ctx, 3, 20);
      if (totalH >= 54) drawCoffeeCup(ctx, 3, totalH - 18, true);
    },
  );
}

function drawCafeCakeCaseDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawCafeCakeCase(c, w, totalH),
    () => {
      floorShadow(c, 1, totalH - 2, w - 2, 2);
      box(c, 0, 2, w, totalH - 3, '#5f3b26');
      const doorH = Math.max(8, totalH - 13);
      box(c, 2, 3, w - 4, doorH, '#b6d2dc');
      R(c, '#5f3b26', Math.floor(w / 2), 3, 1, doorH);
      R(c, SILVER, 4, 5, 1, Math.min(5, doorH - 3));
      R(c, SILVER, Math.floor(w / 2) + 2, 5, 1, Math.min(5, doorH - 3));
      box(c, 3, totalH - 9, w - 6, 5, '#3c444d');
    },
    (ctx) => {
      floorShadow(ctx, 1, totalH - 2, w - 2, 2);
      box(ctx, 0, 2, w, totalH - 3, '#5f3b26');
      const cheekW = Math.min(4, Math.floor(w / 4));
      const paneW = w - cheekW - 3;
      R(ctx, '#472a1a', w - cheekW - 1, 3, cheekW, totalH - 8);
      box(ctx, 2, 3, paneW, totalH - 8, GLASS);
      const mid = 3 + Math.floor((totalH - 8) / 2);
      R(ctx, WHITE, 3, mid, paneW - 2, 1);
      drawShortcake(ctx, 2, 4);
      drawPudding(ctx, 2, mid + 2);
      glassSheen(ctx, 2, 3, paneW, totalH - 8);
    },
  );
}

function drawCafeCounterDir(c: C2D, w: number, h: number, facing: Facing, style: string): void {
  const isSide = style === 'side';
  drawDirectional(
    c,
    w,
    facing,
    () => drawCafeCounter(c, w, h, style),
    () => {
      drawCounterBack(c, w, h, {
        topCol: '#b87d4b',
        bodyCol: '#5a3824',
        trimCol: '#396d54',
        regX: isSide ? -1 : 2,
        regCol: '#4f463e',
      });
      drawCoffeeCup(c, w - 12, 2, true);
      if (w >= 32) {
        R(c, '#f6d06a', w - 19, 1, 5, 4);
        R(c, '#7c5a32', w - 18, 5, 3, 5);
        if (isSide) drawCoffeeCup(c, 3, 2, true);
      }
    },
    (ctx) => {
      drawCounterSide(ctx, w, h, '#b87d4b', '#5a3824', '#396d54', !isSide, '#4f463e');
      drawCoffeeCup(ctx, 3, isSide ? 2 : Math.max(12, h - 14), true);
      if (h >= 28) {
        R(ctx, '#f6d06a', 5, Math.floor(h / 2) - 4, 5, 4);
        R(ctx, '#7c5a32', 6, Math.floor(h / 2), 3, 4);
        if (isSide) drawCoffeeCup(ctx, 3, h - 14, true);
      }
    },
  );
}

function drawCafeTableDir(c: C2D, w: number, totalH: number, facing: Facing, style: string): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawCafeTable(c, w, totalH, style),
    () => {
      displayTable(c, w, totalH, '#c98e53', '#6f472a', '#e3b47a', Math.max(11, totalH - 7));
      const cx = Math.floor(w / 2);
      if (style === 'morning-toast') {
        drawCoffeeCup(c, 2, 2, true);
        drawToastPlate(c, Math.max(12, w - 13), 3);
      } else if (style === 'soda') {
        drawPudding(c, 2, 3);
        drawMelonSoda(c, Math.max(11, w - 11), 0);
      } else if (style === 'teapot') {
        box(c, cx - 4, 5, 8, 6, '#e8efe9');
        R(c, '#6ba484', cx - 3, 7, 6, 2);
        if (w >= 26) {
          drawCoffeeCup(c, 2, 4, false);
          drawCoffeeCup(c, w - 11, 2, false);
        }
      } else {
        drawShortcake(c, 2, 2);
        drawCoffeeCup(c, Math.max(11, w - 11), 2, true);
      }
    },
    (ctx) => {
      displayTable(ctx, w, totalH, '#c98e53', '#6f472a', '#e3b47a', Math.max(11, totalH - 7));
      const yBottom = Math.max(10, totalH - 18);
      if (style === 'morning-toast') {
        drawToastPlate(ctx, 2, 2);
        drawCoffeeCup(ctx, 3, yBottom, true);
      } else if (style === 'soda') {
        drawMelonSoda(ctx, 2, 0);
        drawPudding(ctx, 3, yBottom);
      } else if (style === 'teapot') {
        box(ctx, 2, 2, 8, 6, '#e8efe9');
        R(ctx, '#6ba484', 3, 4, 6, 2);
        drawCoffeeCup(ctx, 3, yBottom, false);
      } else {
        drawCoffeeCup(ctx, 2, 2, true);
        drawShortcake(ctx, 3, yBottom);
      }
    },
  );
}

function drawCafeSofaDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawCafeSofa(c, w, totalH),
    () => {
      floorShadow(c, 1, totalH - 2, w - 2, 2);
      box(c, 0, 1, w, totalH - 3, '#722830');
      R(c, '#9a3b45', 2, 2, w - 4, 3);
      R(c, '#561b21', 2, 6, w - 4, Math.max(2, totalH - 10));
      box(c, 0, 5, 2, totalH - 7, WOOD_DARK);
      box(c, w - 2, 5, 2, totalH - 7, WOOD_DARK);
    },
    (ctx) => {
      floorShadow(ctx, 1, totalH - 2, w - 2, 2);
      box(ctx, w - 6, 1, 6, totalH - 3, '#722830');
      R(ctx, '#9a3b45', w - 5, 2, 3, totalH - 6);
      box(ctx, 2, 5, Math.max(4, w - 7), Math.max(6, totalH - 9), '#aa454e');
      R(ctx, '#722830', 2, Math.floor(totalH / 2), Math.max(4, w - 7), 1);
      box(ctx, 0, 4, w - 3, 4, WOOD_DARK);
      box(ctx, 0, totalH - 7, w - 3, 5, WOOD_DARK);
    },
  );
}

function drawCafeMenuBoardDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawCafeMenuBoard(c, totalH),
    () => {
      floorShadow(c, 2, totalH - 2, 12, 2);
      box(c, 2, 1, 12, totalH - 3, WOOD_MID);
      R(c, '#a87444', 4, 3, 8, totalH - 8);
      R(c, WOOD_DARK, 3, 8, 10, 1);
    },
    (ctx) => {
      floorShadow(ctx, 3, totalH - 2, 10, 2);
      box(ctx, 6, 1, 4, 4, WOOD_MID);
      box(ctx, 4, 4, 3, totalH - 6, WOOD_MID);
      box(ctx, 9, 4, 3, totalH - 6, WOOD_DARK);
      R(ctx, '#293933', 3, 3, 2, totalH - 9);
      R(ctx, WOOD_DARK, 6, Math.floor(totalH / 2), 4, 1);
    },
  );
}

function drawKonbiniCoolerDir(c: C2D, w: number, totalH: number, facing: Facing, style: string): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawKonbiniCooler(c, w, totalH, style),
    () => {
      drawMachineBack(c, w, totalH, '#9ab2ad', '#386e63', '#e2efec');
      R(c, style === 'chilled-food' ? '#e89a4a' : '#3a86d6', 3, 3, Math.max(4, w - 6), 2);
    },
    (ctx) => {
      drawCabinetSide(ctx, w, totalH, '#4b9e8d', '#3e8476', '#d9eef5', '#f2f7f8', '#2e7d6d', 0, (sctx, ix, iw, y1, y2) => {
        if (style === 'chilled-food') {
          drawOnigiri(sctx, ix, y1 - 8);
          box(sctx, ix + 1, y2 - 6, Math.min(7, iw - 2), 5, '#e89a4a');
          R(sctx, WHITE, ix + 2, y2 - 5, 3, 2);
        } else {
          drawBottle(sctx, ix + 1, y1, '#51a847', '#2b6b28');
          drawBottle(sctx, ix + 1, y2, '#3986d6', '#ffffff');
          if (iw >= 14) {
            drawBottle(sctx, ix + 8, y1, '#e04a3f', '#f4c542');
            drawBottle(sctx, ix + 8, y2, '#e59230', '#4f993e');
          }
        }
      });
      R(ctx, GLASS_HI, 1, 3, 1, totalH - 7);
    },
  );
}

function drawKonbiniMagazineDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawKonbiniMagazine(c, w, totalH),
    () => drawCabinetBack(c, w, totalH, '#458e7f', '#eff5f2', SILVER),
    (ctx) =>
      drawCabinetSide(ctx, w, totalH, '#458e7f', '#387568', '#eff5f2', SILVER, '#458e7f', 0, (sctx, ix, iw, y1, y2) => {
        if (iw >= 12) {
          drawCoverBook(sctx, ix + 1, y1 - 11, '#e56558', '#f6db6b');
          drawCoverBook(sctx, ix + 1, y2 - 11, '#4f8cd6', '#f2efe6');
        } else {
          box(sctx, ix + 1, y1 - 10, 7, 9, '#e56558');
          R(sctx, '#f6db6b', ix + 2, y1 - 8, 5, 3);
          box(sctx, ix + 1, y2 - 10, 7, 9, '#4f8cd6');
          R(sctx, '#f2efe6', ix + 2, y2 - 8, 5, 3);
        }
      }),
  );
}

function drawKonbiniSnackShelfDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawKonbiniSnackShelf(c, w, totalH),
    () => {
      const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#4d7f76', CREAM, WHITE, 0);
      R(c, '#3a665e', 0, 0, w, 2);
      const bags: [string, string][] = [
        ['#54a84e', '#f4d352'],
        ['#5589d6', '#ffffff'],
        ['#ebd047', '#d84539'],
        ['#df4f45', '#f7f1db'],
      ];
      let i = 0;
      const step = innerW <= 30 ? 9 : 10;
      const start = innerW <= 30 ? innerX + 1 : innerX + 2;
      for (let x = start; x + 8 <= innerX + innerW; x += step) {
        const [b1, s1] = bags[i++ % bags.length];
        drawSnackBag(c, x, tier1Y - 9, b1, s1);
        const [b2, s2] = bags[(i + 1) % bags.length];
        drawSnackBag(c, x, tier2Y - 9, b2, s2);
      }
      R(c, '#f2c849', innerX, tier1Y, innerW, 1);
      R(c, '#f2c849', innerX, tier2Y, innerW, 1);
    },
    (ctx) =>
      drawCabinetSide(ctx, w, totalH, '#4d7f76', '#3a665e', CREAM, WHITE, '#4d7f76', 0, (sctx, ix, iw, y1, y2) => {
        drawSnackBag(sctx, ix, y1 - 9, '#df4f45', '#f7f1db');
        drawSnackBag(sctx, ix, y2 - 9, '#5589d6', '#ffffff');
        if (iw >= 18) {
          drawSnackBag(sctx, ix + 9, y1 - 9, '#ebd047', '#d84539');
          drawSnackBag(sctx, ix + 9, y2 - 9, '#54a84e', '#f4d352');
        }
        R(sctx, '#f2c849', ix, y1, iw, 1);
        R(sctx, '#f2c849', ix, y2, iw, 1);
      }),
  );
}

function drawKonbiniFoodShelfDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawKonbiniFoodShelf(c, w, totalH),
    () => {
      const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#5b7285', CREAM, WHITE, 0);
      R(c, '#445869', 0, 0, w, 2);
      const stripes = ['#4c76c2', '#e8962e', '#4f9952', '#d9453a'];
      let i = 0;
      const step = innerW <= 30 ? 9 : 10;
      const start = innerW <= 30 ? innerX + 1 : innerX + 2;
      for (let x = start; x + 8 <= innerX + innerW; x += step) {
        drawCupNoodle(c, x, tier1Y - 9, stripes[i++ % stripes.length]);
        if (x + 9 <= innerX + innerW) drawRoundBun(c, x, tier2Y - 8, i % 2 === 0);
      }
    },
    (ctx) =>
      drawCabinetSide(ctx, w, totalH, '#5b7285', '#445869', CREAM, WHITE, '#5b7285', 0, (sctx, ix, iw, y1, y2) => {
        drawCupNoodle(sctx, ix, y1 - 9, '#d9453a');
        drawCupNoodle(sctx, ix, y2 - 9, '#4f9952');
        if (iw >= 18) {
          drawCupNoodle(sctx, ix + 9, y1 - 9, '#e8962e');
          drawRoundBun(sctx, ix + 9, y2 - 8, true);
        }
      }),
  );
}

function drawKonbiniDailyShelfDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawKonbiniDailyShelf(c, w, totalH),
    () => {
      const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#548296', '#edf4f7', WHITE, 0);
      R(c, '#3e6577', 0, 0, w, 2);
      for (let x = innerX + 2; x + 10 <= innerX + innerW; x += 12) {
        drawTissuePack(c, x, tier1Y - 8, x % 2 === 0 ? '#f295b0' : '#7ac6e8', '#f5c768');
      }
      const pads = ['#cf5c55', '#e5a23c', '#4f9d69', '#4a7ac9'];
      let i = 0;
      for (let x = innerX + 2; x + 7 <= innerX + innerW; x += 8) {
        box(c, x, tier2Y - 8, 7, 8, pads[i++ % pads.length]);
        R(c, WHITE, x + 2, tier2Y - 7, 3, 3);
      }
    },
    (ctx) =>
      drawCabinetSide(ctx, w, totalH, '#548296', '#3e6577', '#edf4f7', WHITE, '#548296', 0, (sctx, ix, iw, y1, y2) => {
        if (iw >= 14) {
          drawTissuePack(sctx, ix + 1, y1 - 8, '#7ac6e8', '#f5c768');
        } else {
          box(sctx, ix + 1, y1 - 7, 7, 6, '#7ac6e8');
          R(sctx, WHITE, ix + 2, y1 - 6, 4, 2);
        }
        box(sctx, ix + 1, y2 - 8, 7, 8, '#4a7ac9');
        R(sctx, WHITE, ix + 3, y2 - 7, 3, 3);
      }),
  );
}

function drawKonbiniIceFreezerDir(c: C2D, w: number, h: number, facing: Facing): void {
  drawDirectional(
    c,
    w,
    facing,
    () => drawKonbiniIceFreezer(c, w, h),
    () => {
      floorShadow(c, 1, h - 2, w - 2, 2);
      box(c, 0, 1, w, h - 2, '#d5e6ed');
      box(c, 2, 2, w - 4, Math.max(6, h - 8), GLASS);
      const pops = ['#6e452d', '#f5d25c', '#6ec3ea', '#f288a4'];
      let i = 0;
      for (let x = 3; x + 5 <= w - 3; x += 6) {
        box(c, x, 3, 5, 7, pops[i++ % pops.length]);
        R(c, WHITE, x + 1, 4, 2, 2);
      }
      R(c, '#5c6670', 3, h - 5, w - 6, 2);
      glassSheen(c, 2, 2, w - 4, Math.max(6, h - 8));
    },
    (ctx) => {
      floorShadow(ctx, 1, h - 2, w - 2, 2);
      box(ctx, 0, 1, w, h - 2, '#d5e6ed');
      box(ctx, 2, 2, w - 4, h - 5, GLASS);
      const pops = ['#f288a4', '#6ec3ea', '#f5d25c', '#6e452d'];
      let i = 0;
      for (let y = 3; y + 6 <= h - 4; y += 7) {
        box(ctx, 4, y, Math.min(8, w - 6), 5, pops[i++ % pops.length]);
        R(ctx, WHITE, 5, y + 1, 2, 2);
      }
      R(ctx, '#73919c', 2, 4, 1, Math.min(10, h - 8));
      glassSheen(ctx, 2, 2, w - 4, h - 5);
    },
  );
}

function drawKonbiniCounterDir(c: C2D, w: number, h: number, facing: Facing, style: string): void {
  const isSide = style === 'side';
  drawDirectional(
    c,
    w,
    facing,
    () => drawKonbiniCounter(c, w, h, style),
    () => {
      drawCounterBack(c, w, h, {
        topCol: WHITE,
        bodyCol: '#e5ebe9',
        trimCol: '#399679',
        regX: isSide ? -1 : 2,
        regCol: '#4c5761',
      });
      R(c, '#ea823a', 1, 18, w - 2, 1);
      if (!isSide) {
        box(c, w - 13, 4, 9, 6, '#7cb89a');
        R(c, WHITE, w - 12, 5, 7, 2);
        return;
      }
      if (w >= 30) {
        box(c, 3, 0, 8, 11, '#394048');
        R(c, '#5c6670', 4, 2, 6, 6);
      }
      box(c, w - 13, 1, 9, 10, '#c4c8c2');
      R(c, '#959c94', w - 12, 3, 7, 5);
    },
    (ctx) => {
      drawCounterSide(ctx, w, h, WHITE, '#e5ebe9', '#399679', !isSide, '#4c5761');
      R(ctx, '#ea823a', 1, Math.max(12, h - 3), w - 2, 1);
      if (!isSide) {
        if (h >= 24) {
          box(ctx, 3, h - 13, 9, 6, '#7cb89a');
          R(ctx, WHITE, 4, h - 12, 7, 2);
        }
        return;
      }
      box(ctx, 3, 1, 9, 10, '#f6dfb0');
      R(ctx, '#f8b959', 4, 2, 7, 8);
      R(ctx, WHITE, 5, 3, 2, 2);
      R(ctx, WHITE, 8, 3, 2, 2);
      if (h >= 24) {
        box(ctx, 4, h - 14, 8, 11, '#394048');
        R(ctx, '#95d4c2', 5, h - 13, 6, 3);
        R(ctx, WHITE, 7, h - 8, 3, 4);
      }
    },
  );
}

/** Resolve pixel-art sprite for Bakery, Greengrocer, Cafe, Konbini, and shared floor rugs. */
export function foodStoreSprite(o: ObjectDef): StoreSprite | null {
  const w = o.w * TILE;
  const h = o.h * TILE;
  const style = o.style ?? '';
  const facing = effectiveObjectFacing(o);
  const tallOy = uprightTileHeight(o) >= 2 ? 0 : -12;

  switch (o.kind) {
    case 'shop-floor':
      return sprite(w, h, 0, (c) => drawShopFloor(c, w, h, style));
    case 'shop-rug':
      return sprite(w, h, 0, (c) => drawShopRugDir(c, w, h, facing, style));

    // Bakery
    case 'bakery-oven':
      return sprite(w, h + 14, -14, (c) => drawBakeryOvenDir(c, w, h + 14, facing));
    case 'bakery-bread-rack':
      return sprite(w, h + 16, -16, (c) => drawBakeryBreadRackDir(c, w, h + 16, facing, style));
    case 'bakery-pastry-table':
      return sprite(w, h, 0, (c) => drawBakeryPastryTableDir(c, w, h, facing, style));
    case 'bakery-showcase':
      return sprite(w, h, 0, (c) => drawBakeryShowcaseDir(c, w, h, facing));
    case 'bakery-tray-stand':
      return sprite(w, h + 4, -4, (c) => drawBakeryTrayStandDir(c, w, h + 4, facing));
    case 'bakery-counter':
      return sprite(w, h + 6, -6, (c) => drawBakeryCounterDir(c, w, h, facing, style));

    // Greengrocer
    case 'greengrocer-produce-stand':
      return sprite(w, h - tallOy, tallOy, (c) => drawProduceStandDir(c, w, h - tallOy, facing, style));
    case 'greengrocer-fruit-table':
      return sprite(w, h, 0, (c) => drawFruitTableDir(c, w, h, facing));
    case 'greengrocer-basket-rack':
      return sprite(w, h + 4, -4, (c) => drawBasketRackDir(c, w, h + 4, facing));
    case 'greengrocer-chill-case':
      return sprite(w, h + 16, -16, (c) => drawGreengrocerChillCaseDir(c, w, h + 16, facing));
    case 'greengrocer-counter':
      return sprite(w, h + 6, -6, (c) => drawGreengrocerCounterDir(c, w, h, facing));

    // Cafe
    case 'cafe-brew-bar':
      return sprite(w, h + 14, -14, (c) => drawCafeBrewBarDir(c, w, h + 14, facing));
    case 'cafe-cake-case':
      return sprite(w, h + 10, -10, (c) => drawCafeCakeCaseDir(c, w, h + 10, facing));
    case 'cafe-counter':
      return sprite(w, h + 6, -6, (c) => drawCafeCounterDir(c, w, h, facing, style));
    case 'cafe-table':
      return sprite(w, h + 5, -5, (c) => drawCafeTableDir(c, w, h + 5, facing, style));
    case 'cafe-chair':
      return sprite(w, h + 4, -4, (c) => drawCafeChair(c, w, h + 4, facing));
    case 'cafe-sofa':
      return sprite(w, h + 4, -4, (c) => drawCafeSofaDir(c, w, h + 4, facing));
    case 'cafe-menu-board':
      return sprite(w, h + 5, -5, (c) => drawCafeMenuBoardDir(c, w, h + 5, facing));
    case 'cafe-plant':
      return sprite(w, h + 10, -10, (c) => drawCafePlant(c, w, h + 10));

    // Konbini
    case 'konbini-cooler':
      return sprite(w, h + 16, -16, (c) => drawKonbiniCoolerDir(c, w, h + 16, facing, style));
    case 'konbini-magazine':
      return sprite(w, h + 16, -16, (c) => drawKonbiniMagazineDir(c, w, h + 16, facing));
    case 'konbini-snack-shelf':
      return sprite(w, h - tallOy, tallOy, (c) => drawKonbiniSnackShelfDir(c, w, h - tallOy, facing));
    case 'konbini-food-shelf':
      return sprite(w, h - tallOy, tallOy, (c) => drawKonbiniFoodShelfDir(c, w, h - tallOy, facing));
    case 'konbini-daily-shelf':
      return sprite(w, h - tallOy, tallOy, (c) => drawKonbiniDailyShelfDir(c, w, h - tallOy, facing));
    case 'konbini-ice-freezer':
      return sprite(w, h + 4, -4, (c) => drawKonbiniIceFreezerDir(c, w, h + 4, facing));
    case 'konbini-counter':
      return sprite(w, h + 6, -6, (c) => drawKonbiniCounterDir(c, w, h, facing, style));

    default:
      return null;
  }
}
