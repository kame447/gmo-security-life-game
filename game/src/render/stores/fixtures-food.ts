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
  shopCounter,
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
  for (let x = innerX + 2; x + 8 <= innerX + innerW; x += 10) {
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
  for (let x = innerX + 2; x + 8 <= innerX + innerW; x += 10) {
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

function drawShopRug(c: C2D, w: number, h: number, style: string): void {
  if (style === 'bakery') shopRug(c, w, h, '#e8c494', '#b87640', '#faecd2');
  else if (style === 'greengrocer') shopRug(c, w, h, '#bfd6a3', '#528e4b', '#f2ecd2');
  else if (style === 'bookstore') shopRug(c, w, h, '#b86258', '#683c36', '#e6c88a');
  else if (style === 'candy') shopRug(c, w, h, '#e8a278', '#c84b44', '#fae38a');
  else if (style === 'cafe') shopRug(c, w, h, '#8f3a40', '#5a2228', '#d9b583');
  else if (style === 'pharmacy') shopRug(c, w, h, MINT_LIGHT, '#4c9984', WHITE);
  else shopRug(c, w, h, '#cbe5dc', '#3d9986', '#ea823a');
}

/** Resolve pixel-art sprite for Bakery, Greengrocer, Cafe, Konbini, and shared floor rugs. */
export function foodStoreSprite(o: ObjectDef): StoreSprite | null {
  const w = o.w * TILE;
  const h = o.h * TILE;
  const style = o.style ?? '';

  switch (o.kind) {
    case 'shop-rug':
      return sprite(w, h, 0, (c) => drawShopRug(c, w, h, style));

    // Bakery
    case 'bakery-oven':
      return sprite(w, h + 14, -14, (c) => drawBakeryOven(c, w, h + 14));
    case 'bakery-bread-rack':
      return sprite(w, h + 16, -16, (c) => drawBakeryBreadRack(c, w, h + 16, style));
    case 'bakery-pastry-table':
      return sprite(w, h, 0, (c) => drawBakeryPastryTable(c, w, h, style));
    case 'bakery-showcase':
      return sprite(w, h, 0, (c) => drawBakeryShowcase(c, w, h));
    case 'bakery-tray-stand':
      return sprite(w, h + 4, -4, (c) => drawBakeryTrayStand(c, w, h + 4));
    case 'bakery-counter':
      return sprite(w, h + 6, -6, (c) => drawBakeryCounter(c, w, h, style));

    // Greengrocer
    case 'greengrocer-produce-stand': {
      const oy = o.h >= 2 ? 0 : -12;
      return sprite(w, h - oy, oy, (c) => drawProduceStand(c, w, h - oy, style));
    }
    case 'greengrocer-fruit-table':
      return sprite(w, h, 0, (c) => drawFruitTable(c, w, h));
    case 'greengrocer-basket-rack':
      return sprite(w, h + 4, -4, (c) => drawBasketRack(c, w, h + 4));
    case 'greengrocer-chill-case':
      return sprite(w, h + 16, -16, (c) => drawGreengrocerChillCase(c, w, h + 16));
    case 'greengrocer-counter':
      return sprite(w, h + 6, -6, (c) => drawGreengrocerCounter(c, w, h));

    // Cafe
    case 'cafe-brew-bar':
      return sprite(w, h + 14, -14, (c) => drawCafeBrewBar(c, w, h + 14));
    case 'cafe-cake-case':
      return sprite(w, h + 10, -10, (c) => drawCafeCakeCase(c, w, h + 10));
    case 'cafe-counter':
      return sprite(w, h + 6, -6, (c) => drawCafeCounter(c, w, h, style));
    case 'cafe-table':
      return sprite(w, h + 5, -5, (c) => drawCafeTable(c, w, h + 5, style));
    case 'cafe-chair':
      return sprite(w, h + 4, -4, (c) => drawCafeChair(c, w, h + 4, style || 'down'));
    case 'cafe-sofa':
      return sprite(w, h + 4, -4, (c) => drawCafeSofa(c, w, h + 4));
    case 'cafe-menu-board':
      return sprite(w, h + 5, -5, (c) => drawCafeMenuBoard(c, h + 5));
    case 'cafe-plant':
      return sprite(w, h + 10, -10, (c) => drawCafePlant(c, w, h + 10));

    // Konbini
    case 'konbini-cooler':
      return sprite(w, h + 16, -16, (c) => drawKonbiniCooler(c, w, h + 16, style));
    case 'konbini-magazine':
      return sprite(w, h + 16, -16, (c) => drawKonbiniMagazine(c, w, h + 16));
    case 'konbini-snack-shelf':
      return sprite(w, h + 12, -12, (c) => drawKonbiniSnackShelf(c, w, h + 12));
    case 'konbini-food-shelf':
      return sprite(w, h + 12, -12, (c) => drawKonbiniFoodShelf(c, w, h + 12));
    case 'konbini-daily-shelf':
      return sprite(w, h + 12, -12, (c) => drawKonbiniDailyShelf(c, w, h + 12));
    case 'konbini-ice-freezer':
      return sprite(w, h + 4, -4, (c) => drawKonbiniIceFreezer(c, w, h + 4));
    case 'konbini-counter':
      return sprite(w, h + 6, -6, (c) => drawKonbiniCounter(c, w, h, style));

    default:
      return null;
  }
}
