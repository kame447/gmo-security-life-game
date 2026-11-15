import {
  CREAM,
  GLASS_HI,
  INK,
  MINT_DARK,
  MINT_LIGHT,
  MINT_MID,
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
  makeCanvas,
  priceCard,
  R,
  shelfCabinet,
  shopCounter,
  type C2D,
  type ObjectDef,
} from './art';
import {
  drawCandyJar,
  drawCoverBook,
  drawCross,
  drawFirstAidBox,
  drawFlatBookStack,
  drawHangingSnacks,
  drawKujiBoard,
  drawLollipopStand,
  drawMedBox,
  drawPillBlister,
  drawPopStand,
  drawPumpBottle,
  drawRamuneBottle,
  drawSpineRow,
  drawTissuePack,
  drawToiletRolls,
} from './goods-retail';
import { drawSnackBag } from './goods-food';

function sprite(w: number, h: number, oy: number, paint: (c: C2D) => void): StoreSprite {
  const [canvas, c] = makeCanvas(w, h);
  paint(c);
  return { canvas, ox: 0, oy };
}

// === Bookstore ===

function drawBookstoreTallShelf(c: C2D, w: number, totalH: number, seed: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, WOOD_DARK, '#4e3522', WOOD_MID, 0);
  const count = Math.floor((innerW - 2) / 4);
  drawSpineRow(c, innerX + 1, tier1Y, count, seed);
  drawSpineRow(c, innerX + 1, tier2Y, count, seed + 3);
}

function drawBookstorePictureShelf(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, WOOD_MID, '#efe0be', WOOD_LIGHT, 0);
  const covers: [string, string][] = [
    ['#e56f5c', '#fae178'],
    ['#5ca8dc', '#f5f5ee'],
    ['#77bd6a', '#f28d52'],
    ['#eab44f', '#5f7ec7'],
  ];
  let i = 0;
  for (let x = innerX + 2; x + 9 <= innerX + innerW; x += 11) {
    const [cov, art] = covers[i++ % covers.length];
    drawCoverBook(c, x, tier1Y - 11, cov, art);
    const [cov2, art2] = covers[(i + 1) % covers.length];
    drawCoverBook(c, x, tier2Y - 11, cov2, art2);
  }
}

function drawBookstoreFlatTable(c: C2D, w: number, h: number, style: string): void {
  displayTable(c, w, h, WOOD_CREAM, WOOD_MID, WOOD_LIGHT, Math.max(11, h - 7));
  const piles: [string, string][] =
    style === 'comics'
      ? [
          ['#e65c52', '#f7e16d'],
          ['#4b90d6', '#ffffff'],
          ['#71b85f', '#e8685c'],
        ]
      : [
          ['#c94c4c', '#f5dca4'],
          ['#436fa6', '#a8d5e5'],
          ['#d99c43', '#4e7748'],
        ];
  let idx = 0;
  const baseY = h >= 28 ? 19 : h - 7;
  if (h >= 28) {
    for (let x = 3; x + 10 <= w - 11; x += 14) {
      const [cov, acc] = piles[(idx + 1) % piles.length];
      drawCoverBook(c, x, 2, cov, acc);
    }
  }
  for (let x = 2; x + 12 <= w - 2; x += 15) {
    const [cov, acc] = piles[idx++ % piles.length];
    const py = h >= 28 && idx % 2 === 0 ? baseY - 2 : baseY;
    drawFlatBookStack(c, x, py, cov, acc, 2 + (idx % 2));
  }
  drawPopStand(c, Math.max(2, w - 11), 0, style === 'comics' ? '#7ae09d' : '#f5d44a');
}

function drawBookstoreMagazineRack(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, WOOD_MID, '#dfd6c2', WOOD_CREAM, 0);
  R(c, '#c45245', 1, 1, w - 2, 2);
  const mags: [string, string][] = [
    ['#4f8cd6', '#f7d55a'],
    ['#dd6452', '#f2efe6'],
    ['#59a66b', '#5282c4'],
    ['#d98d3c', '#f8f8f3'],
  ];
  let idx = 0;
  for (let x = innerX + 2; x + 9 <= innerX + innerW; x += 11) {
    const [cov, art] = mags[idx++ % mags.length];
    drawCoverBook(c, x, tier1Y - 11, cov, art);
    const [cov2, art2] = mags[(idx + 2) % mags.length];
    drawCoverBook(c, x, tier2Y - 11, cov2, art2);
  }
}

function drawBookstoreCounter(c: C2D, w: number, h: number): void {
  shopCounter(c, w, h, WOOD_CREAM, '#6f482b', '#4d7762', w - 12, '#4f5862');
  box(c, 3, 2, 8, 8, '#d9b583');
  R(c, '#b78b54', 4, 5, 6, 1);
  if (w >= 32) {
    box(c, 13, 2, 6, 8, '#5a8370');
    R(c, '#e65d52', 14, 0, 2, 2);
    R(c, '#f4c542', 17, 0, 1, 2);
  }
}

// === Candy Shop (だがしや) ===

function drawCandyBoxRack(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#915b34', '#f0dec0', WOOD_LIGHT, 0);
  const bags: [string, string][] = [
    ['#e55656', '#f7e16d'],
    ['#4fa8dc', '#ffffff'],
    ['#72bd5a', '#f4c542'],
  ];
  let idx = 0;
  for (let x = innerX + 2; x + 8 <= innerX + innerW; x += 11) {
    const [b, s] = bags[idx++ % bags.length];
    drawSnackBag(c, x, tier1Y - 9, b, s);
  }
  for (let x = innerX + 2; x + 8 <= innerX + innerW - 6; x += 11) {
    drawRamuneBottle(c, x, tier2Y, idx++ % 2 === 0 ? '#7ed4f2' : '#f29bc1');
  }
  priceCard(c, innerX + innerW - 7, tier2Y - 5, '#e55656');
}

function drawCandyJarStand(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 1, w, totalH - 2, WOOD_DARK);
  R(c, '#caa068', 1, 2, w - 2, totalH - 4);
  const mid = 14;
  R(c, WOOD_MID, 1, mid, w - 2, 2);
  R(c, WOOD_MID, 1, totalH - 4, w - 2, 2);
  const jars: [string, string, string][] = [
    ['#d94642', '#f472b6', '#fde047'],
    ['#4f8cd6', '#60a5fa', '#ffffff'],
    ['#e69632', '#fb923c', '#86efac'],
    ['#68a84f', '#facc15', '#f87171'],
  ];
  let idx = 0;
  for (let x = 2; x + 9 <= w - 2; x += 11) {
    const [lid, c1, c2] = jars[idx++ % jars.length];
    drawCandyJar(c, x, 3, lid, c1, c2);
    const [lid2, b1, b2] = jars[(idx + 1) % jars.length];
    drawCandyJar(c, x, mid + 2, lid2, b1, b2);
  }
}

function drawCandyHangingRack(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 0, w, totalH - 1, '#9d6237');
  R(c, '#f3e1bd', 2, 2, w - 4, totalH - 5);
  drawHangingSnacks(c, 3, 4, ['#e5564d', '#58b4e3', '#f4c542']);
  if (w >= 26) drawKujiBoard(c, 13, 3);
  if (w >= 42) drawLollipopStand(c, w - 18, totalH - 16);
}

function drawCandyLowBins(c: C2D, w: number, h: number): void {
  displayTable(c, w, h, '#d7a86b', WOOD_MID, WOOD_CREAM, h - 7);
  drawLollipopStand(c, 3, h >= 28 ? 5 : 1);
  if (w >= 32) {
    drawRamuneBottle(c, 21, h >= 28 ? 17 : 12, '#7ed4f2');
    drawRamuneBottle(c, 27, h >= 28 ? 17 : 12, '#9ce89e');
  }
  if (w >= 42) {
    drawCandyJar(c, w - 12, h >= 28 ? 6 : 2, '#d94642', '#fde047', '#f472b6');
  }
  priceCard(c, 4, h - 6, '#e55656');
}

function drawCandyCounter(c: C2D, w: number, h: number): void {
  shopCounter(c, w, h, '#cf9d61', '#7d4d2c', '#d45a46', w - 12, '#645242');
  drawCandyJar(c, 2, 0, '#d94642', '#fde047', '#f472b6');
  if (w >= 32) {
    box(c, 13, 5, 6, 4, SILVER);
    R(c, '#e8be4a', 15, 6, 2, 2);
  }
}

// === Pharmacy ===

function drawPharmacyMedShelf(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, MINT_MID, WHITE, MINT_LIGHT, 0);
  R(c, MINT_DARK, 1, 1, w - 2, 2);
  drawCross(c, w - 8, 2, MINT_DARK);
  const accents = ['#d8584c', '#4b8ed6', '#4aa46d', '#e5a43e'];
  let idx = 0;
  for (let x = innerX + 2; x + 8 <= innerX + innerW - 4; x += 10) {
    drawMedBox(c, x, tier1Y - 9, accents[idx++ % accents.length]);
    if (idx % 2 === 0) drawPillBlister(c, x, tier2Y - 10, '#58b4e3');
    else drawBottle(c, x + 2, tier2Y, '#8b4e2b', WHITE, '#f5d478');
  }
}

function drawPharmacyCareShelf(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#6ca8b5', WHITE, '#e6f3f6', 0);
  for (let x = innerX + 2; x + 11 <= innerX + innerW; x += 13) {
    drawFirstAidBox(c, x, tier1Y - 10);
  }
  let idx = 0;
  for (let x = innerX + 2; x + 8 <= innerX + innerW; x += 10) {
    if (idx++ % 2 === 0) drawBottle(c, x + 1, tier2Y, '#4d92d6', WHITE, CREAM);
    else drawPillBlister(c, x, tier2Y - 10, '#e5685d');
  }
}

function drawPharmacyLowCareTray(c: C2D, w: number, h: number): void {
  displayTable(c, w, h, '#edf6f4', '#6ca8b5', WHITE, h - 7);
  drawFirstAidBox(c, 3, 2);
  if (w >= 30) drawMedBox(c, 16, 3, '#d8584c');
  if (w >= 42) drawPillBlister(c, 27, 2, '#58b4e3');
  if (w >= 46) drawBottle(c, w - 9, h - 7, '#4d92d6', WHITE, CREAM);
}

function drawPharmacyDailyShelf(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#6f9eb2', '#f2f7f9', WHITE, 0);
  for (let x = innerX + 2; x + 10 <= innerX + innerW; x += 13) {
    drawTissuePack(c, x, tier1Y - 9, x % 2 === 0 ? '#79c4e8' : '#73cb9d', '#f4c76b');
  }
  let idx = 0;
  for (let x = innerX + 2; x + 9 <= innerX + innerW; x += 11) {
    if (idx++ % 2 === 0) drawToiletRolls(c, x, tier2Y - 10);
    else drawPumpBottle(c, x + 2, tier2Y - 11, '#64add8');
  }
}

function drawPharmacyCounter(c: C2D, w: number, h: number): void {
  shopCounter(c, w, h, WHITE, '#e3eeeb', MINT_DARK, w - 12, '#677880');
  // Cross sits centered in apron row y=13..19 (totalH = h+6 = 22), cleanly above shadow
  drawCross(c, Math.floor(w / 2) - 2, 14, WHITE);
  box(c, 3, 4, 8, 6, '#5ca8dc');
  R(c, WHITE, 5, 5, 4, 2);
  if (w >= 32) {
    box(c, 13, 4, 6, 5, WHITE);
    R(c, SILVER, 14, 2, 2, 3);
    R(c, GLASS_HI, 4, 5, 5, 1);
  }
  void INK;
}

function drawShopBench(c: C2D, w: number, h: number, seat: string, trim: string): void {
  floorShadow(c, 1, h - 2, w - 2, 2);
  box(c, 1, 1, w - 2, h - 3, seat);
  R(c, trim, 2, 2, w - 4, 2);
  R(c, WOOD_DARK, 2, h - 4, 2, 3);
  R(c, WOOD_DARK, w - 4, h - 4, 2, 3);
}

/** Resolve pixel-art sprite for Bookstore, Candy Shop, and Pharmacy objects. */
export function retailStoreSprite(o: ObjectDef): StoreSprite | null {
  const w = o.w * TILE;
  const h = o.h * TILE;
  const style = o.style ?? '';

  switch (o.kind) {
    // Bookstore
    case 'bookstore-tall-shelf':
      return sprite(w, h + 16, -16, (c) =>
        drawBookstoreTallShelf(c, w, h + 16, style === 'b' ? 3 : style === 'c' ? 5 : 0),
      );
    case 'bookstore-picture-shelf': {
      const oy = o.h >= 2 ? 0 : -14;
      return sprite(w, h - oy, oy, (c) => drawBookstorePictureShelf(c, w, h - oy));
    }
    case 'bookstore-flat-table':
      return sprite(w, h, 0, (c) => drawBookstoreFlatTable(c, w, h, style));
    case 'bookstore-magazine-rack':
      return sprite(w, h + 12, -12, (c) => drawBookstoreMagazineRack(c, w, h + 12));
    case 'bookstore-counter':
      return sprite(w, h + 6, -6, (c) => drawBookstoreCounter(c, w, h));

    // Candy shop
    case 'candy-box-rack': {
      const oy = o.h >= 2 ? 0 : -14;
      return sprite(w, h - oy, oy, (c) => drawCandyBoxRack(c, w, h - oy));
    }
    case 'candy-jar-stand':
      return sprite(w, h + 16, -16, (c) => drawCandyJarStand(c, w, h + 16));
    case 'candy-hanging-rack':
      return sprite(w, h + 16, -16, (c) => drawCandyHangingRack(c, w, h + 16));
    case 'candy-low-bins':
      return sprite(w, h, 0, (c) => drawCandyLowBins(c, w, h));
    case 'candy-counter':
      return sprite(w, h + 6, -6, (c) => drawCandyCounter(c, w, h));
    case 'candy-bench':
      return sprite(w, h, 0, (c) => drawShopBench(c, w, h, '#c95c4d', '#e48573'));

    // Pharmacy
    case 'pharmacy-med-shelf': {
      const oy = o.h >= 2 ? 0 : -16;
      return sprite(w, h - oy, oy, (c) => drawPharmacyMedShelf(c, w, h - oy));
    }
    case 'pharmacy-care-shelf': {
      const oy = o.h >= 2 ? 0 : -14;
      return sprite(w, h - oy, oy, (c) => drawPharmacyCareShelf(c, w, h - oy));
    }
    case 'pharmacy-low-care':
      return sprite(w, h + 4, -4, (c) => drawPharmacyLowCareTray(c, w, h + 4));
    case 'pharmacy-daily-shelf': {
      const oy = o.h >= 2 ? 0 : -14;
      return sprite(w, h - oy, oy, (c) => drawPharmacyDailyShelf(c, w, h - oy));
    }
    case 'pharmacy-counter':
      return sprite(w, h + 6, -6, (c) => drawPharmacyCounter(c, w, h));
    case 'pharmacy-bench':
      return sprite(w, h, 0, (c) => drawShopBench(c, w, h, MINT_MID, MINT_LIGHT));

    default:
      return null;
  }
}
