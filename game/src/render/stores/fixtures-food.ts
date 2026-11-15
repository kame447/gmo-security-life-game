import {
  CREAM,
  GLASS,
  GLASS_HI,
  INK,
  MINT_DARK,
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
  drawMelonpan,
  drawMelonSoda,
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
  // Brick courses & warm chimney hood
  R(c, '#8d4330', 2, 3, w - 4, 4);
  for (let bx = 3; bx < w - 5; bx += 7) {
    R(c, '#c87356', bx, 8, 5, 3);
    R(c, '#c87356', bx + 3, 12, 4, 3);
  }
  // Glowing hearth arch with baking loaves
  box(c, 5, 11, w - 10, 11, '#3b2824');
  R(c, '#d96926', 6, 12, w - 12, 9);
  R(c, '#f8b24c', 7, 15, w - 14, 5);
  drawCroissant(c, 8, 16);
  if (w >= 32) drawRoundBun(c, w - 16, 15, false);
  // Metal handle & wooden peel beside oven
  R(c, SILVER, 7, 22, w - 14, 1);
}

function drawBakeryBreadRack(c: C2D, w: number, totalH: number, style: string): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, WOOD_DARK, '#f2dfc0', WOOD_MID, 0);
  // Warm bread basket trays on top tier
  R(c, '#c89b55', innerX + 1, tier1Y - 2, innerW - 2, 2);
  if (style === 'loaves') {
    for (let x = innerX + 2; x + 7 <= innerX + innerW - 1; x += 9) {
      drawShokupan(c, x, tier1Y - 1);
    }
    for (let x = innerX + 2; x + 8 <= innerX + innerW - 1; x += 10) {
      drawBaguette(c, x, tier2Y - 6);
    }
  } else {
    for (let x = innerX + 2; x + 7 <= innerX + innerW - 1; x += 9) {
      drawCroissant(c, x, tier1Y - 5);
    }
    for (let x = innerX + 2; x + 6 <= innerX + innerW - 1; x += 8) {
      drawMelonpan(c, x, tier2Y - 6);
    }
  }
  priceCard(c, innerX + 1, tier1Y + 1, '#c96f2a');
}

function drawBakeryPastryTable(c: C2D, w: number, h: number): void {
  displayTable(c, w, h, WOOD_CREAM, WOOD_MID, WOOD_LIGHT, h - 6);
  // Two metal/wood bakery trays across the table top
  const half = Math.floor((w - 6) / 2);
  box(c, 2, 2, half, 9, SILVER);
  R(c, CREAM, 3, 3, half - 2, 7);
  drawCroissant(c, 4, 4);
  if (half >= 16) drawMelonpan(c, 12, 4);

  const rx = 4 + half;
  box(c, rx, 2, w - rx - 2, 9, SILVER);
  R(c, CREAM, rx + 1, 3, w - rx - 4, 7);
  drawRoundBun(c, rx + 2, 4, false);
  if (w - rx >= 18) drawRoundBun(c, rx + 9, 4, true);
  // Silver tongs clipped on front corner
  R(c, SILVER, w - 7, 1, 1, 4);
  R(c, INK, w - 6, 1, 1, 3);
}

function drawBakeryShowcase(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 2, w, totalH - 3, WOOD_MID);
  box(c, 2, 3, w - 4, 13, GLASS);
  R(c, '#eaf7fa', 3, 4, w - 6, 4);
  R(c, WHITE, 3, 10, w - 6, 1);
  // Sandwiches on upper glass tier, cakes on lower tier
  for (let x = 4; x + 6 <= w - 4; x += 8) {
    if (x < w / 2) drawSandwich(c, x, 4);
    else drawShortcake(c, x, 3);
  }
  for (let x = 4; x + 6 <= w - 4; x += 8) {
    drawShortcake(c, x, 9);
  }
  glassSheen(c, 2, 3, w - 4, 12);
}

function drawBakeryTrayStand(c: C2D, w: number, totalH: number): void {
  displayTable(c, w, totalH, '#dfc18d', WOOD_MID, WOOD_LIGHT, totalH - 7);
  // Stack of amber bakery trays + tongs holder
  for (let i = 0; i < 3; i++) {
    box(c, 3, 5 - i * 2, 9, 3, '#c88340');
  }
  if (w >= 24) {
    wovenBasket(c, 14, 2, w - 17, 7);
    drawBaguette(c, 15, 2);
  }
}

function drawBakeryCounter(c: C2D, w: number, h: number): void {
  shopCounter(c, w, h, WOOD_CREAM, WOOD_MID, '#cf7d3e', w - 13, '#4f4640');
  // Brown paper bread bag stack + wicker basket of rolls
  box(c, 3, 1, 8, 8, '#c89b5e');
  R(c, '#a8783e', 4, 2, 6, 2);
  if (w >= 40) {
    wovenBasket(c, 14, 2, 13, 8);
    drawCroissant(c, 15, 3);
    drawRoundBun(c, 21, 3, true);
  }
}

// === Greengrocer ===

function drawProduceStand(c: C2D, w: number, totalH: number, style: string): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 2, w, totalH - 3, WOOD_DARK);
  R(c, WOOD_MID, 1, 3, w - 2, totalH - 6);
  // Sloped upper crate tier + lower crate tier
  const half = Math.floor((w - 5) / 2);
  woodCrate(c, 2, 3, half, 9);
  woodCrate(c, 3 + half, 3, w - half - 5, 9);
  woodCrate(c, 2, 13, half, 8);
  woodCrate(c, 3 + half, 13, w - half - 5, 8);

  if (style === 'roots') {
    for (let x = 3; x + 7 <= 1 + half; x += 7) drawDaikon(c, x, 5);
    for (let x = 4 + half; x + 6 <= w - 3; x += 6) drawCarrot(c, x, 6);
    for (let x = 3; x + 5 <= 1 + half; x += 6) drawEggplant(c, x, 14);
    for (let x = 4 + half; x + 5 <= w - 3; x += 6) drawCucumber(c, x, 15);
  } else {
    for (let x = 3; x + 6 <= 1 + half; x += 6) drawCabbage(c, x, 5);
    for (let x = 4 + half; x + 5 <= w - 3; x += 5) drawTomato(c, x, 5);
    for (let x = 3; x + 6 <= 1 + half; x += 6) drawCarrot(c, x, 15);
    for (let x = 4 + half; x + 4 <= w - 3; x += 5) drawMikan(c, x, 15);
  }
  priceCard(c, 3, 12, '#3d9942');
}

function drawFruitTable(c: C2D, w: number, h: number): void {
  displayTable(c, w, h, '#c79656', WOOD_DARK, WOOD_CREAM, h - 6);
  const third = Math.floor((w - 6) / 3);
  wovenBasket(c, 2, 2, third, 8);
  drawApple(c, 3, 3);
  if (third >= 9) drawApple(c, 7, 4);

  wovenBasket(c, 3 + third, 2, third, 8);
  drawMikan(c, 4 + third, 3);
  if (third >= 9) drawMikan(c, 8 + third, 4);

  const rx = 4 + third * 2;
  wovenBasket(c, rx, 2, w - rx - 2, 8);
  drawBananas(c, rx + 1, 3);
}

function drawBasketRack(c: C2D, w: number, totalH: number): void {
  displayTable(c, w, totalH, WOOD_LIGHT, WOOD_MID, WOOD_CREAM, totalH - 6);
  const cols = Math.max(2, Math.floor((w - 4) / 13));
  const bw = Math.floor((w - 4) / cols) - 1;
  for (let i = 0; i < cols; i++) {
    const bx = 2 + i * (bw + 1);
    wovenBasket(c, bx, 2, bw, 9);
    if (i % 2 === 0) {
      drawCabbage(c, bx + 2, 3);
      drawTomato(c, bx + 6, 4);
    } else {
      drawEggplant(c, bx + 2, 3);
      drawCucumber(c, bx + 6, 4);
    }
  }
}

function drawGreengrocerChillCase(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#4b9b56', GLASS, '#e8f5eb', 0);
  R(c, GLASS_HI, innerX, 2, innerW, 2);
  for (let x = innerX + 1; x + 6 <= innerX + innerW; x += 8) {
    drawCabbage(c, x, tier1Y - 5);
    drawDaikon(c, x, tier2Y - 4);
  }
  glassSheen(c, innerX, 2, innerW, totalH - 6);
}

function drawGreengrocerCounter(c: C2D, w: number, h: number): void {
  shopCounter(c, w, h, WOOD_CREAM, '#7c5334', '#4e9643', w - 13, '#5c665d');
  drawScale(c, 3, 10);
  if (w >= 40) {
    wovenBasket(c, 13, 2, 10, 8);
    drawMikan(c, 14, 4);
    drawMikan(c, 18, 4);
  }
}

// === Cafe ===

function drawCafeBrewBar(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 10, w, totalH - 11, '#583823');
  R(c, '#a06a41', 1, 11, w - 2, 5);
  R(c, '#83512d', 1, 16, w - 2, 2);
  // Espresso machine on left, siphon brewer & bean jars across counter top
  drawEspressoMachine(c, 3, 0);
  if (w >= 32) drawSiphon(c, 21, 2);
  if (w >= 44) {
    box(c, w - 16, 4, 6, 8, '#6e4228');
    R(c, '#d7ad73', w - 15, 6, 4, 2);
    drawCoffeeCup(c, w - 9, 6, true);
  }
}

function drawCafeCakeCase(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 2, w, totalH - 3, '#5f3b26');
  box(c, 2, 3, w - 4, 13, GLASS);
  R(c, '#f1f9fc', 3, 4, w - 6, 4);
  R(c, WHITE, 3, 10, w - 6, 1);
  for (let x = 4; x + 6 <= w - 4; x += 8) {
    drawShortcake(c, x, 3);
    drawPudding(c, x + 1, 10);
  }
  glassSheen(c, 2, 3, w - 4, 12);
}

function drawCafeCounter(c: C2D, w: number, h: number): void {
  shopCounter(c, w, h, '#b87d4b', '#5a3824', '#396d54', w - 13, '#4f463e');
  drawCoffeeCup(c, 4, 2, true);
  if (w >= 36) {
    // Stacked saucers + brass lamp glow
    R(c, WHITE, 13, 5, 6, 2);
    R(c, WHITE, 13, 3, 6, 2);
    R(c, '#f6d06a', 22, 1, 4, 4);
    R(c, '#7c5a32', 23, 5, 2, 4);
  }
}

function drawCafeTable(c: C2D, w: number, h: number, style: string): void {
  displayTable(c, w, h, '#c98e53', '#6f472a', '#e3b47a', Math.max(9, h - 6));
  const cx = Math.floor(w / 2);
  if (style === 'morning-toast') {
    drawToastPlate(c, 2, 3);
    drawCoffeeCup(c, Math.max(9, w - 8), 2, true);
  } else if (style === 'soda') {
    drawMelonSoda(c, 3, 0);
    if (w >= 16) drawPudding(c, w - 7, 3);
  } else if (style === 'teapot') {
    // Porcelain teapot + two small tea cups
    box(c, cx - 3, 2, 6, 5, '#e8efe9');
    R(c, '#6ba484', cx - 2, 4, 4, 1);
    if (w >= 20) {
      drawCoffeeCup(c, 2, 3, false);
      drawCoffeeCup(c, w - 8, 3, false);
    }
  } else {
    // 'coffee-cake' default
    drawCoffeeCup(c, 2, 2, true);
    if (w >= 16) {
      R(c, WHITE, w - 8, 4, 6, 4);
      drawShortcake(c, w - 8, 1);
    }
  }
}

function drawCafeChair(c: C2D, w: number, totalH: number, dir: string): void {
  floorShadow(c, 2, totalH - 2, w - 4, 2);
  const seat = '#963b42';
  const hi = '#bf565d';
  if (dir === 'right') {
    box(c, 2, 2, 4, totalH - 4, WOOD_DARK);
    box(c, 5, 5, 8, 8, seat);
    R(c, hi, 6, 6, 6, 2);
    R(c, INK, 11, 13, 2, 3);
  } else if (dir === 'left') {
    box(c, w - 6, 2, 4, totalH - 4, WOOD_DARK);
    box(c, 3, 5, 8, 8, seat);
    R(c, hi, 4, 6, 6, 2);
    R(c, INK, 3, 13, 2, 3);
  } else if (dir === 'up') {
    box(c, 3, 3, 10, 7, seat);
    R(c, hi, 4, 4, 8, 2);
    box(c, 2, 9, 12, 6, WOOD_MID);
    R(c, WOOD_LIGHT, 3, 10, 10, 2);
  } else {
    // 'down'
    box(c, 2, 0, 12, 7, WOOD_MID);
    R(c, WOOD_LIGHT, 3, 1, 10, 2);
    box(c, 3, 6, 10, 7, seat);
    R(c, hi, 4, 7, 8, 2);
    R(c, INK, 3, 13, 2, 3);
    R(c, INK, 11, 13, 2, 3);
  }
}

function drawCafeSofa(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 1, w, totalH - 3, '#722830');
  R(c, '#9a3b45', 2, 2, w - 4, 6);
  // Cushions & side wooden armrests
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
  R(c, '#f29f85', 4, 10, 5, 1);
  drawCoffeeCup(c, 5, 11, false);
}

function drawCafePlant(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 2, totalH - 2, w - 4, 2);
  // Terracotta pot
  box(c, 3, totalH - 9, w - 6, 7, '#b56143');
  R(c, '#d17b5b', 2, totalH - 10, w - 4, 2);
  // Lush layered foliage
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
    for (let x = innerX + 1; x + 6 <= innerX + innerW; x += 7) {
      drawOnigiri(c, x, tier1Y - 5);
    }
    for (let x = innerX + 1; x + 7 <= innerX + innerW; x += 9) {
      drawBento(c, x, tier2Y - 5);
    }
  } else {
    const drinks: [string, string][] = [
      ['#51a847', '#2b6b28'],
      ['#3986d6', '#ffffff'],
      ['#e04a3f', '#f4c542'],
      ['#f2f5f8', '#4c88c4'],
      ['#e59230', '#4f993e'],
    ];
    let idx = 0;
    for (let x = innerX + 1; x + 3 <= innerX + innerW; x += 4) {
      const [body, cap] = drinks[idx++ % drinks.length];
      drawBottle(c, x, tier1Y, body, cap);
      drawBottle(c, x, tier2Y, drinks[(idx + 2) % drinks.length][0], drinks[(idx + 2) % drinks.length][1]);
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
  for (let x = innerX + 1; x + 7 <= innerX + innerW; x += 8) {
    const [cov, art] = covers[idx++ % covers.length];
    drawCoverBook(c, x, tier1Y - 9, cov, art);
    const [cov2, art2] = covers[(idx + 1) % covers.length];
    drawCoverBook(c, x, tier2Y - 9, cov2, art2);
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
  for (let x = innerX + 1; x + 5 <= innerX + innerW; x += 6) {
    const [b1, s1] = bags[i++ % bags.length];
    drawSnackBag(c, x, tier1Y - 6, b1, s1);
    const [b2, s2] = bags[(i + 2) % bags.length];
    drawSnackBag(c, x, tier2Y - 6, b2, s2);
  }
  R(c, '#f2c849', innerX, tier1Y, innerW, 1);
  R(c, '#f2c849', innerX, tier2Y, innerW, 1);
}

function drawKonbiniFoodShelf(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#5b7285', CREAM, WHITE, 0);
  const stripes = ['#d9453a', '#4f9952', '#e8962e', '#4c76c2'];
  let i = 0;
  for (let x = innerX + 1; x + 5 <= innerX + innerW; x += 6) {
    drawCupNoodle(c, x, tier1Y - 5, stripes[i++ % stripes.length]);
    if ((i & 1) === 1) drawRoundBun(c, x, tier2Y - 5, true);
    else drawSnackBag(c, x, tier2Y - 6, '#e28f48', '#833a20');
  }
}

function drawKonbiniDailyShelf(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#548296', '#edf4f7', WHITE, 0);
  // Tissue boxes on top shelf; notebooks/stationery & daily goods on bottom shelf
  for (let x = innerX + 1; x + 7 <= innerX + innerW; x += 9) {
    drawTissuePack(c, x, tier1Y - 6, x % 2 === 0 ? '#7ac6e8' : '#f295b0', '#f5c768');
  }
  const pads = ['#4a7ac9', '#4f9d69', '#e5a23c', '#cf5c55'];
  let i = 0;
  for (let x = innerX + 1; x + 6 <= innerX + innerW; x += 7) {
    box(c, x, tier2Y - 6, 5, 6, pads[i++ % pads.length]);
    R(c, WHITE, x + 1, tier2Y - 5, 3, 2);
  }
}

function drawKonbiniIceFreezer(c: C2D, w: number, h: number): void {
  floorShadow(c, 1, h - 2, w - 2, 2);
  box(c, 0, 1, w, h - 2, '#d5e6ed');
  box(c, 2, 2, w - 4, h - 6, GLASS);
  const pops = ['#f288a4', '#6ec3ea', '#f5d25c', '#6e452d'];
  let i = 0;
  for (let x = 4; x + 5 <= w - 4; x += 6) {
    box(c, x, 4, 4, 6, pops[i++ % pops.length]);
    R(c, WHITE, x + 1, 5, 1, 3);
  }
  glassSheen(c, 2, 2, w - 4, h - 6);
}

function drawKonbiniCounter(c: C2D, w: number, h: number): void {
  shopCounter(c, w, h, WHITE, '#e5ebe9', '#399679', w - 13, '#4c5761');
  // Second orange brand pinstripe
  R(c, '#ea823a', 1, 16, w - 2, 1);
  // Glowing glass nikuman/hot-snack steamer on left
  box(c, 2, 0, 11, 9, '#f6dfb0');
  R(c, '#f8b959', 3, 1, 9, 7);
  R(c, WHITE, 4, 2, 3, 2);
  R(c, WHITE, 8, 2, 3, 2);
  R(c, WHITE, 4, 5, 3, 2);
  R(c, WHITE, 8, 5, 3, 2);
  if (w >= 40) {
    // Hot coffee brewer machine beside steamer
    box(c, 15, 0, 8, 9, '#394048');
    R(c, '#95d4c2', 16, 1, 6, 2);
    R(c, WHITE, 17, 5, 3, 3);
  }
}

/** Resolve pixel-art sprite for Bakery, Greengrocer, Cafe, and Konbini objects. */
export function foodStoreSprite(o: ObjectDef): StoreSprite | null {
  const w = o.w * TILE;
  const h = o.h * TILE;
  const style = o.style ?? '';

  switch (o.kind) {
    // Bakery
    case 'bakery-oven':
      return sprite(w, h + 10, -10, (c) => drawBakeryOven(c, w, h + 10));
    case 'bakery-bread-rack':
      return sprite(w, h + 10, -10, (c) => drawBakeryBreadRack(c, w, h + 10, style));
    case 'bakery-pastry-table':
      return sprite(w, h, 0, (c) => drawBakeryPastryTable(c, w, h));
    case 'bakery-showcase':
      return sprite(w, h + 6, -6, (c) => drawBakeryShowcase(c, w, h + 6));
    case 'bakery-tray-stand':
      return sprite(w, h + 4, -4, (c) => drawBakeryTrayStand(c, w, h + 4));
    case 'bakery-counter':
      return sprite(w, h + 4, -4, (c) => drawBakeryCounter(c, w, h));

    // Greengrocer
    case 'greengrocer-produce-stand':
      return sprite(w, h + 8, -8, (c) => drawProduceStand(c, w, h + 8, style));
    case 'greengrocer-fruit-table':
      return sprite(w, h, 0, (c) => drawFruitTable(c, w, h));
    case 'greengrocer-basket-rack':
      return sprite(w, h + 6, -6, (c) => drawBasketRack(c, w, h + 6));
    case 'greengrocer-chill-case':
      return sprite(w, h + 10, -10, (c) => drawGreengrocerChillCase(c, w, h + 10));
    case 'greengrocer-counter':
      return sprite(w, h + 4, -4, (c) => drawGreengrocerCounter(c, w, h));

    // Cafe
    case 'cafe-brew-bar':
      return sprite(w, h + 10, -10, (c) => drawCafeBrewBar(c, w, h + 10));
    case 'cafe-cake-case':
      return sprite(w, h + 6, -6, (c) => drawCafeCakeCase(c, w, h + 6));
    case 'cafe-counter':
      return sprite(w, h + 4, -4, (c) => drawCafeCounter(c, w, h));
    case 'cafe-table':
      return sprite(w, h, 0, (c) => drawCafeTable(c, w, h, style));
    case 'cafe-chair':
      return sprite(w, h + 2, -2, (c) => drawCafeChair(c, w, h + 2, style || 'down'));
    case 'cafe-sofa':
      return sprite(w, h + 4, -4, (c) => drawCafeSofa(c, w, h + 4));
    case 'cafe-menu-board':
      return sprite(w, h + 4, -4, (c) => drawCafeMenuBoard(c, h + 4));
    case 'cafe-plant':
      return sprite(w, h + 10, -10, (c) => drawCafePlant(c, w, h + 10));

    // Konbini
    case 'konbini-cooler':
      return sprite(w, h + 10, -10, (c) => drawKonbiniCooler(c, w, h + 10, style));
    case 'konbini-magazine':
      return sprite(w, h + 10, -10, (c) => drawKonbiniMagazine(c, w, h + 10));
    case 'konbini-snack-shelf':
      return sprite(w, h + 8, -8, (c) => drawKonbiniSnackShelf(c, w, h + 8));
    case 'konbini-food-shelf':
      return sprite(w, h + 8, -8, (c) => drawKonbiniFoodShelf(c, w, h + 8));
    case 'konbini-daily-shelf':
      return sprite(w, h + 8, -8, (c) => drawKonbiniDailyShelf(c, w, h + 8));
    case 'konbini-ice-freezer':
      return sprite(w, h, 0, (c) => drawKonbiniIceFreezer(c, w, h));
    case 'konbini-counter':
      return sprite(w, h + 4, -4, (c) => drawKonbiniCounter(c, w, h));

    default:
      return null;
  }
}
