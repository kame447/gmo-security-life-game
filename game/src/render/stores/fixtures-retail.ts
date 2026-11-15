import {
  CREAM,
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
  woodCrate,
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
  drawSpineRow,
  drawTissuePack,
  drawToiletRolls,
} from './goods-retail';

function sprite(w: number, h: number, oy: number, paint: (c: C2D) => void): StoreSprite {
  const [canvas, c] = makeCanvas(w, h);
  paint(c);
  return { canvas, ox: 0, oy };
}

// === Bookstore ===

function drawBookstoreTallShelf(c: C2D, w: number, totalH: number, seed: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, WOOD_DARK, '#4e3522', WOOD_MID, 0);
  const count = Math.floor((innerW - 2) / 3);
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
  for (let x = innerX + 1; x + 7 <= innerX + innerW; x += 8) {
    const [cov, art] = covers[i++ % covers.length];
    drawCoverBook(c, x, tier1Y - 9, cov, art);
    const [cov2, art2] = covers[(i + 1) % covers.length];
    drawCoverBook(c, x, tier2Y - 9, cov2, art2);
  }
}

function drawBookstoreFlatTable(c: C2D, w: number, h: number, style: string): void {
  displayTable(c, w, h, WOOD_CREAM, WOOD_MID, WOOD_LIGHT, Math.max(9, h - 6));
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
  for (let x = 2; x + 9 <= w - 2; x += 11) {
    const [cov, acc] = piles[idx++ % piles.length];
    drawFlatBookStack(c, x, Math.min(h - 6, 11), cov, acc, 2 + (idx % 2));
  }
  // Recommendation POP stand at center/top right
  drawPopStand(c, Math.max(2, w - 10), 0, style === 'comics' ? '#7ae09d' : '#f5d44a');
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
  for (let x = innerX + 1; x + 7 <= innerX + innerW; x += 8) {
    const [cov, art] = mags[idx++ % mags.length];
    drawCoverBook(c, x, tier1Y - 9, cov, art);
    const [cov2, art2] = mags[(idx + 2) % mags.length];
    drawCoverBook(c, x, tier2Y - 9, cov2, art2);
  }
}

function drawBookstoreCounter(c: C2D, w: number, h: number): void {
  shopCounter(c, w, h, WOOD_CREAM, '#6f482b', '#4d7762', w - 13, '#4f5862');
  // Stack of kraft book covers & bookmark jar
  box(c, 3, 2, 8, 6, '#d9b583');
  R(c, '#b78b54', 4, 4, 6, 1);
  if (w >= 40) {
    box(c, 14, 1, 5, 7, '#5a8370');
    R(c, '#e65d52', 15, 0, 1, 2);
    R(c, '#f4c542', 17, 0, 1, 2);
  }
}

// === Candy Shop (だがしや) ===

function drawCandyBoxRack(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#915b34', '#f0dec0', WOOD_LIGHT, 0);
  // Colorful 10-30 yen wooden/paper dagashi cubbies
  const cols = ['#e55656', '#f2b838', '#4fa8dc', '#72bd5a', '#de76a8'];
  let idx = 0;
  for (let x = innerX + 1; x + 6 <= innerX + innerW; x += 7) {
    const col1 = cols[idx++ % cols.length];
    const col2 = cols[(idx + 2) % cols.length];
    woodCrate(c, x, tier1Y - 6, 6, 6, col1, '#f7ecc9');
    R(c, WHITE, x + 2, tier1Y - 4, 2, 2);
    woodCrate(c, x, tier2Y - 6, 6, 6, col2, '#f7ecc9');
    R(c, '#f9e368', x + 2, tier2Y - 4, 2, 2);
  }
  priceCard(c, innerX + 1, tier2Y + 1, '#e55656');
}

function drawCandyJarStand(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 1, w, totalH - 2, WOOD_DARK);
  R(c, '#caa068', 1, 2, w - 2, totalH - 5);
  // Slanted top & bottom shelves with transparent glass candy jars
  R(c, WOOD_MID, 1, 10, w - 2, 2);
  R(c, WOOD_MID, 1, totalH - 5, w - 2, 2);
  const jars: [string, string, string][] = [
    ['#d94642', '#f472b6', '#fde047'],
    ['#4f8cd6', '#60a5fa', '#ffffff'],
    ['#e69632', '#fb923c', '#86efac'],
    ['#68a84f', '#facc15', '#f87171'],
  ];
  let idx = 0;
  for (let x = 2; x + 7 <= w - 2; x += 8) {
    const [lid, c1, c2] = jars[idx++ % jars.length];
    drawCandyJar(c, x, 2, lid, c1, c2);
    const [lid2, b1, b2] = jars[(idx + 1) % jars.length];
    drawCandyJar(c, x, totalH - 13, lid2, b1, b2);
  }
}

function drawCandyHangingRack(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 0, w, totalH - 1, '#9d6237');
  R(c, '#f3e1bd', 2, 2, w - 4, totalH - 5);
  // Hanging snack pouch strip, lottery board, and lollipop stand
  drawHangingSnacks(c, 3, 2, ['#e5564d', '#58b4e3', '#f4c542']);
  if (w >= 20) drawKujiBoard(c, 10, 3);
  if (w >= 30) drawLollipopStand(c, w - 12, totalH - 11);
}

function drawCandyLowBins(c: C2D, w: number, h: number): void {
  displayTable(c, w, h, '#d7a86b', WOOD_MID, WOOD_CREAM, h - 5);
  const cols = ['#e6655c', '#f5cb4e', '#5cb4db', '#79c268'];
  for (let x = 2, i = 0; x + 6 <= w - 2; x += 7, i++) {
    woodCrate(c, x, 2, 6, 8, cols[i % cols.length], WHITE);
    R(c, WHITE, x + 2, 4, 2, 2);
  }
  R(c, '#de4a44', 2, 1, 4, 2);
}

function drawCandyCounter(c: C2D, w: number, h: number): void {
  shopCounter(c, w, h, '#cf9d61', '#7d4d2c', '#d45a46', w - 12, '#645242');
  // Small glass candy jar + tin coin tray on wooden shopkeeper counter
  drawCandyJar(c, 3, 0, '#d94642', '#fde047', '#f472b6');
  if (w >= 32) {
    box(c, 12, 4, 6, 4, SILVER);
    R(c, '#e8be4a', 14, 5, 2, 2);
  }
}

// === Pharmacy ===

function drawPharmacyMedShelf(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, MINT_MID, WHITE, MINT_LIGHT, 0);
  // Clean clinical header + green cross emblem
  R(c, MINT_DARK, 1, 1, w - 2, 2);
  drawCross(c, w - 8, 2, MINT_DARK);
  const accents = ['#d8584c', '#4b8ed6', '#4aa46d', '#e5a43e'];
  let idx = 0;
  for (let x = innerX + 1; x + 6 <= innerX + innerW - 4; x += 7) {
    drawMedBox(c, x, tier1Y - 5, accents[idx++ % accents.length]);
    if (idx % 2 === 0) drawPillBlister(c, x, tier2Y - 6, '#58b4e3');
    else drawBottle(c, x + 1, tier2Y, '#8b4e2b', WHITE, '#f5d478');
  }
}

function drawPharmacyCareShelf(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#6ca8b5', WHITE, '#e6f3f6', 0);
  for (let x = innerX + 1; x + 8 <= innerX + innerW; x += 9) {
    drawFirstAidBox(c, x, tier1Y - 6);
  }
  for (let x = innerX + 1; x + 6 <= innerX + innerW; x += 7) {
    if ((x & 1) === 0) drawBottle(c, x + 1, tier2Y, '#4d92d6', WHITE, CREAM);
    else drawPillBlister(c, x, tier2Y - 6, '#e5685d');
  }
}

function drawPharmacyDailyShelf(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, '#6f9eb2', '#f2f7f9', WHITE, 0);
  for (let x = innerX + 1; x + 7 <= innerX + innerW; x += 8) {
    drawTissuePack(c, x, tier1Y - 6, x % 2 === 0 ? '#79c4e8' : '#73cb9d', '#f4c76b');
  }
  let idx = 0;
  for (let x = innerX + 1; x + 6 <= innerX + innerW; x += 7) {
    if (idx++ % 2 === 0) drawToiletRolls(c, x, tier2Y - 6);
    else drawPumpBottle(c, x + 1, tier2Y - 7, '#64add8');
  }
}

function drawPharmacyCounter(c: C2D, w: number, h: number): void {
  shopCounter(c, w, h, WHITE, '#e3eeeb', MINT_DARK, w - 13, '#677880');
  // Green medical cross emblem on the front apron + blue dispensing basket & mortar
  drawCross(c, Math.floor(w / 2) - 2, h - 1, WHITE);
  box(c, 3, 3, 8, 6, '#5ca8dc');
  R(c, WHITE, 5, 4, 4, 2);
  if (w >= 40) {
    box(c, 14, 3, 6, 5, WHITE);
    R(c, SILVER, 15, 2, 1, 2);
  }
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
      return sprite(w, h + 12, -12, (c) =>
        drawBookstoreTallShelf(c, w, h + 12, style === 'b' ? 3 : style === 'c' ? 5 : 0),
      );
    case 'bookstore-picture-shelf':
      return sprite(w, h + 10, -10, (c) => drawBookstorePictureShelf(c, w, h + 10));
    case 'bookstore-flat-table':
      return sprite(w, h, 0, (c) => drawBookstoreFlatTable(c, w, h, style));
    case 'bookstore-magazine-rack':
      return sprite(w, h + 10, -10, (c) => drawBookstoreMagazineRack(c, w, h + 10));
    case 'bookstore-counter':
      return sprite(w, h + 4, -4, (c) => drawBookstoreCounter(c, w, h));

    // Candy shop
    case 'candy-box-rack':
      return sprite(w, h + 10, -10, (c) => drawCandyBoxRack(c, w, h + 10));
    case 'candy-jar-stand':
      return sprite(w, h + 10, -10, (c) => drawCandyJarStand(c, w, h + 10));
    case 'candy-hanging-rack':
      return sprite(w, h + 10, -10, (c) => drawCandyHangingRack(c, w, h + 10));
    case 'candy-low-bins':
      return sprite(w, h, 0, (c) => drawCandyLowBins(c, w, h));
    case 'candy-counter':
      return sprite(w, h + 4, -4, (c) => drawCandyCounter(c, w, h));
    case 'candy-bench':
      return sprite(w, h, 0, (c) => drawShopBench(c, w, h, '#c95c4d', '#e48573'));

    // Pharmacy
    case 'pharmacy-med-shelf':
      return sprite(w, h + 12, -12, (c) => drawPharmacyMedShelf(c, w, h + 12));
    case 'pharmacy-care-shelf':
      return sprite(w, h + 10, -10, (c) => drawPharmacyCareShelf(c, w, h + 10));
    case 'pharmacy-daily-shelf':
      return sprite(w, h + 8, -8, (c) => drawPharmacyDailyShelf(c, w, h + 8));
    case 'pharmacy-counter':
      return sprite(w, h + 4, -4, (c) => drawPharmacyCounter(c, w, h));
    case 'pharmacy-bench':
      return sprite(w, h, 0, (c) => drawShopBench(c, w, h, MINT_MID, MINT_LIGHT));

    default:
      return null;
  }
}
