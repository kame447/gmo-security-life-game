import type { Facing } from '../../core/coords';
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
import {
  drawCabinetBack,
  drawCabinetSide,
  drawCounterBack,
  drawCounterSide,
  drawSideProfile,
  isSidewaysStoreFacing,
  makeStoreSprite as sprite,
  storeFacing,
  uprightTileHeight,
} from './rotation-art';

function drawShopBench(c: C2D, w: number, h: number, seat: string, trim: string): void {
  floorShadow(c, 1, h - 2, w - 2, 2);
  box(c, 1, 1, w - 2, h - 3, seat);
  R(c, trim, 2, 2, w - 4, 2);
  R(c, WOOD_DARK, 2, h - 4, 2, 3);
  R(c, WOOD_DARK, w - 4, h - 4, 2, 3);
}

function drawShopBenchSide(c: C2D, w: number, h: number, seat: string, trim: string): void {
  floorShadow(c, 1, h - 2, w - 2, 2);
  box(c, 1, 1, w - 2, h - 3, seat);
  R(c, trim, 2, 2, w - 4, 2);
  R(c, trim, 2, 2, 2, Math.max(2, h - 6));
  R(c, WOOD_DARK, 2, h - 4, 2, 3);
  R(c, WOOD_DARK, w - 4, h - 4, 2, 3);
}

// === Bookstore ===

function drawBookstoreTallShelf(c: C2D, w: number, totalH: number, seed: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, WOOD_DARK, '#4e3522', WOOD_MID, 0);
  const count = Math.floor((innerW - 2) / 4);
  drawSpineRow(c, innerX + 1, tier1Y, count, seed);
  drawSpineRow(c, innerX + 1, tier2Y, count, seed + 3);
}

function drawBookstoreTallShelfDir(c: C2D, w: number, totalH: number, seed: number, facing: Facing): void {
  if (facing === 'up') {
    drawCabinetBack(c, w, totalH, '#4a2f1d', WOOD_DARK, WOOD_MID, 14);
    return;
  }
  if (isSidewaysStoreFacing(facing)) {
    drawSideProfile(c, w, facing, (ctx) => {
      drawCabinetSide(ctx, w, totalH, WOOD_DARK, '#5c3c24', '#4e3522', WOOD_MID, WOOD_MID, 0, (gCtx, innerX, innerW, y1, y2) => {
        const count = Math.max(1, Math.floor(innerW / 4));
        drawSpineRow(gCtx, innerX, y1, count, seed);
        drawSpineRow(gCtx, innerX, y2, count, seed + 3);
      });
    });
    return;
  }
  drawBookstoreTallShelf(c, w, totalH, seed);
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

function drawBookstorePictureShelfDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  if (facing === 'up') {
    drawCabinetBack(c, w, totalH, WOOD_DARK, WOOD_MID, WOOD_LIGHT, 14);
    return;
  }
  if (isSidewaysStoreFacing(facing)) {
    drawSideProfile(c, w, facing, (ctx) => {
      drawCabinetSide(ctx, w, totalH, WOOD_MID, '#b27f4e', '#efe0be', WOOD_LIGHT, WOOD_LIGHT, 0, (gCtx, innerX, innerW, y1, y2) => {
        if (innerW >= 9) {
          drawCoverBook(gCtx, innerX + Math.max(1, Math.floor((innerW - 9) / 2)), y1 - 11, '#e56f5c', '#fae178');
          drawCoverBook(gCtx, innerX + Math.max(1, Math.floor((innerW - 9) / 2)), y2 - 11, '#5ca8dc', '#f5f5ee');
        }
      });
    });
    return;
  }
  drawBookstorePictureShelf(c, w, totalH);
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

function drawBookstoreFlatTableDir(c: C2D, w: number, h: number, style: string, facing: Facing): void {
  if (!isSidewaysStoreFacing(facing)) {
    drawBookstoreFlatTable(c, w, h, style);
    return;
  }
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
  const popCol = style === 'comics' ? '#7ae09d' : '#f5d44a';
  drawPopStand(c, Math.max(2, w - 11), 0, popCol);
  drawCoverBook(c, 3, 2, piles[1][0], piles[1][1]);
  // Rearrange 3 flat-stacked piles vertically down the 2x3 tabletop
  drawFlatBookStack(c, 3, 21, piles[0][0], piles[0][1], 2);
  drawFlatBookStack(c, 16, 25, piles[1][0], piles[1][1], 3);
  drawFlatBookStack(c, 6, Math.max(28, h - 10), piles[2][0], piles[2][1], 2);
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

function drawBookstoreMagazineRackDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  if (facing === 'up') {
    drawCabinetBack(c, w, totalH, WOOD_DARK, WOOD_MID, '#c45245', 14);
    return;
  }
  if (isSidewaysStoreFacing(facing)) {
    drawSideProfile(c, w, facing, (ctx) => {
      drawCabinetSide(ctx, w, totalH, WOOD_MID, '#5c3c24', '#dfd6c2', WOOD_CREAM, '#c45245', 0, (gCtx, innerX, innerW, y1, y2) => {
        const edgeW = Math.max(4, innerW - 2);
        // Stepped magazine cover profiles visible from the side
        box(gCtx, innerX + 1, y1 - 12, edgeW, 6, '#4f8cd6');
        R(gCtx, '#f7d55a', innerX + 2, y1 - 10, edgeW - 2, 2);
        box(gCtx, innerX + 1, y1 - 6, edgeW, 6, '#dd6452');
        box(gCtx, innerX + 1, y2 - 12, edgeW, 6, '#59a66b');
        box(gCtx, innerX + 1, y2 - 6, edgeW, 6, '#d98d3c');
      });
    });
    return;
  }
  drawBookstoreMagazineRack(c, w, totalH);
}

function drawBookstoreCounter(c: C2D, w: number, h: number, style = ''): void {
  const isSide = style === 'side';
  shopCounter(c, w, h, WOOD_CREAM, '#6f482b', '#4d7762', isSide ? -1 : w - 12, '#4f5862');
  box(c, 3, 2, 8, 8, '#d9b583');
  R(c, '#b78b54', 4, 5, 6, 1);
  if (isSide && w >= 32) {
    box(c, 16, 2, 6, 8, '#5a8370');
    R(c, '#e65d52', 17, 0, 2, 2);
    R(c, '#f4c542', 20, 0, 1, 2);
  }
}

function drawBookstoreCounterDir(c: C2D, w: number, h: number, style: string, facing: Facing): void {
  const isSide = style === 'side';
  if (facing === 'up') {
    drawCounterBack(c, w, h, {
      topCol: WOOD_CREAM,
      bodyCol: '#6f482b',
      trimCol: '#4d7762',
      regX: isSide ? -1 : w - 12,
      regCol: '#4f5862',
    });
    box(c, 3, 2, 8, 6, '#d9b583');
    if (isSide && w >= 32) {
      box(c, 16, 2, 6, 6, '#5a8370');
    }
    return;
  }
  if (isSidewaysStoreFacing(facing)) {
    drawSideProfile(c, w, facing, (ctx) => {
      drawCounterSide(ctx, w, h, WOOD_CREAM, '#6f482b', '#4d7762', !isSide, '#4f5862');
      box(ctx, 4, h - 10, 8, 6, '#d9b583');
      if (isSide) {
        box(ctx, 5, 1, 6, 7, '#5a8370');
      }
    });
    return;
  }
  drawBookstoreCounter(c, w, h, style);
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

function drawCandyBoxRackDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  if (facing === 'up') {
    drawCabinetBack(c, w, totalH, '#6b3e1f', '#915b34', WOOD_LIGHT, 14);
    return;
  }
  if (isSidewaysStoreFacing(facing)) {
    drawSideProfile(c, w, facing, (ctx) => {
      drawCabinetSide(ctx, w, totalH, '#915b34', '#6b3e1f', '#f0dec0', WOOD_LIGHT, WOOD_LIGHT, 0, (gCtx, innerX, innerW, y1, y2) => {
        drawSnackBag(gCtx, innerX + 2, y1 - 9, '#e55656', '#f7e16d');
        drawRamuneBottle(gCtx, innerX + 2, y2, '#7ed4f2');
        if (innerW >= 15) {
          priceCard(gCtx, innerX + 9, y2 - 5, '#e55656');
        }
      });
    });
    return;
  }
  drawCandyBoxRack(c, w, totalH);
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

function drawCandyJarStandDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  if (facing === 'up') {
    // Transparent jars seen through the back without front paper labels, over solid back rail
    floorShadow(c, 1, totalH - 2, w - 2, 2);
    box(c, 0, 1, w, totalH - 2, WOOD_DARK);
    R(c, '#8c5e35', 1, 2, w - 2, totalH - 4);
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
    }
    // Lower back plank hides lower shelf from behind
    R(c, WOOD_MID, 1, 14, w - 2, totalH - 17);
    for (let sx = 12; sx < w - 4; sx += 12) {
      R(c, WOOD_DARK, sx, 14, 1, totalH - 17);
    }
    return;
  }
  if (isSidewaysStoreFacing(facing)) {
    drawSideProfile(c, w, facing, (ctx) => {
      floorShadow(ctx, 1, totalH - 2, w - 2, 2);
      box(ctx, 0, 1, w, totalH - 2, WOOD_DARK);
      R(ctx, '#caa068', 1, 2, w - 2, totalH - 4);
      // Side end cheek on rear edge (left profile -> right edge x = w - 5)
      R(ctx, WOOD_MID, w - 5, 2, 4, totalH - 5);
      R(ctx, INK, w - 6, 2, 1, totalH - 5);
      const y1 = 16;
      const y2 = 34;
      const y3 = totalH - 4;
      R(ctx, WOOD_MID, 1, y1, w - 6, 2);
      R(ctx, WOOD_MID, 1, y2, w - 6, 2);
      R(ctx, WOOD_MID, 1, y3, w - 6, 2);
      drawCandyJar(ctx, 1, 4, '#d94642', '#f472b6', '#fde047');
      drawCandyJar(ctx, 1, y1 + 3, '#4f8cd6', '#60a5fa', '#ffffff');
      drawCandyJar(ctx, 1, y2 + 3, '#e69632', '#fb923c', '#86efac');
    });
    return;
  }
  drawCandyJarStand(c, w, totalH);
}

function drawCandyHangingRack(c: C2D, w: number, totalH: number): void {
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 0, w, totalH - 1, '#9d6237');
  R(c, '#f3e1bd', 2, 2, w - 4, totalH - 5);
  drawHangingSnacks(c, 3, 4, ['#e5564d', '#58b4e3', '#f4c542']);
  if (w >= 26) drawKujiBoard(c, 13, 3);
  if (w >= 42) drawLollipopStand(c, w - 18, totalH - 16);
}

function drawCandyHangingRackDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  // Type B: 'up' is disallowed; handle sideways profile ('left' | 'right') cleanly
  if (isSidewaysStoreFacing(facing)) {
    drawSideProfile(c, w, facing, (ctx) => {
      floorShadow(ctx, 1, totalH - 2, w - 2, 2);
      // Thin wall-mounted backing board on the wall side (right edge in left view)
      box(ctx, w - 6, 0, 6, totalH - 1, '#9d6237');
      R(ctx, '#f3e1bd', w - 5, 2, 3, totalH - 5);
      // Upper arm hook with hanging snacks
      R(ctx, INK, 3, 4, w - 8, 2);
      drawHangingSnacks(ctx, 2, 6, ['#e5564d', '#58b4e3', '#f4c542']);
      // Lower kuji board strip & lollipop edge near base
      box(ctx, 3, 25, w - 8, 12, '#f0d562');
      R(ctx, '#d4483a', 4, 26, w - 10, 3);
      box(ctx, 3, totalH - 16, w - 8, 12, '#b07b48');
      R(ctx, '#eb5d75', 5, totalH - 22, 4, 5);
      R(ctx, WHITE, 6, totalH - 18, 2, 3);
    });
    return;
  }
  drawCandyHangingRack(c, w, totalH);
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

function drawCandyLowBinsDir(c: C2D, w: number, h: number, facing: Facing): void {
  if (!isSidewaysStoreFacing(facing)) {
    drawCandyLowBins(c, w, h);
    return;
  }
  displayTable(c, w, h, '#d7a86b', WOOD_MID, WOOD_CREAM, h - 7);
  drawLollipopStand(c, 3, 3);
  drawCandyJar(c, w - 12, 5, '#d94642', '#fde047', '#f472b6');
  drawRamuneBottle(c, 5, 31, '#7ed4f2');
  drawRamuneBottle(c, 12, 31, '#9ce89e');
  drawSnackBag(c, w - 12, 21, '#e55656', '#f7e16d');
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

function drawCandyCounterDir(c: C2D, w: number, h: number, facing: Facing): void {
  if (facing === 'up') {
    drawCounterBack(c, w, h, {
      topCol: '#cf9d61',
      bodyCol: '#7d4d2c',
      trimCol: '#d45a46',
      regX: w - 12,
      regCol: '#645242',
    });
    drawCandyJar(c, 2, 0, '#d94642', '#fde047', '#f472b6');
    return;
  }
  if (isSidewaysStoreFacing(facing)) {
    drawSideProfile(c, w, facing, (ctx) => {
      drawCounterSide(ctx, w, h, '#cf9d61', '#7d4d2c', '#d45a46', true, '#645242');
      drawCandyJar(ctx, 3, Math.max(10, h - 10), '#d94642', '#fde047', '#f472b6');
    });
    return;
  }
  drawCandyCounter(c, w, h);
}

// === Pharmacy ===

function drawPharmacyMedShelf(c: C2D, w: number, totalH: number): void {
  const { innerX, innerW, tier1Y, tier2Y } = shelfCabinet(c, w, totalH, MINT_MID, WHITE, MINT_LIGHT, 0);
  R(c, MINT_DARK, 1, 1, w - 2, 2);
  const accents = ['#d8584c', '#4b8ed6', '#4aa46d', '#e5a43e'];
  let idx = 0;
  for (let x = innerX + 2; x + 8 <= innerX + innerW - 4; x += 10) {
    drawMedBox(c, x, tier1Y - 9, accents[idx++ % accents.length]);
    if (idx % 2 === 0) drawPillBlister(c, x, tier2Y - 10, '#58b4e3');
    else drawBottle(c, x + 2, tier2Y, '#8b4e2b', WHITE, '#f5d478');
  }
}

function drawPharmacyMedShelfDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  if (facing === 'up') {
    drawCabinetBack(c, w, totalH, MINT_DARK, '#e3eeeb', MINT_MID, 14);
    return;
  }
  if (isSidewaysStoreFacing(facing)) {
    drawSideProfile(c, w, facing, (ctx) => {
      drawCabinetSide(ctx, w, totalH, MINT_MID, '#b7d6cd', WHITE, MINT_LIGHT, MINT_DARK, 0, (gCtx, innerX, _innerW, y1, y2) => {
        drawMedBox(gCtx, innerX, y1 - 9, '#d8584c');
        drawPillBlister(gCtx, innerX, y1 - 21, '#58b4e3');
        drawMedBox(gCtx, innerX, y2 - 20, '#4b8ed6');
        drawBottle(gCtx, innerX + 2, y2, '#8b4e2b', WHITE, '#f5d478');
      });
    });
    return;
  }
  drawPharmacyMedShelf(c, w, totalH);
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

function drawPharmacyCareShelfDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  if (facing === 'up') {
    drawCabinetBack(c, w, totalH, '#4f8290', '#e3eeeb', '#6ca8b5', 14);
    return;
  }
  if (isSidewaysStoreFacing(facing)) {
    drawSideProfile(c, w, facing, (ctx) => {
      drawCabinetSide(ctx, w, totalH, '#6ca8b5', '#c8e0e6', WHITE, '#e6f3f6', '#6ca8b5', 0, (gCtx, innerX, _innerW, y1, y2) => {
        drawMedBox(gCtx, innerX, y1 - 9, '#4aa46d');
        drawPillBlister(gCtx, innerX, y2 - 19, '#e5685d');
        drawBottle(gCtx, innerX + 2, y2, '#4d92d6', WHITE, CREAM);
      });
    });
    return;
  }
  drawPharmacyCareShelf(c, w, totalH);
}

function drawPharmacyLowCareTray(c: C2D, w: number, h: number): void {
  displayTable(c, w, h, '#edf6f4', '#6ca8b5', WHITE, h - 7);
  drawFirstAidBox(c, 3, 2);
  if (w >= 30) drawMedBox(c, 16, 3, '#d8584c');
  if (w >= 42) drawPillBlister(c, 27, 2, '#58b4e3');
  if (w >= 46) drawBottle(c, w - 9, h - 7, '#4d92d6', WHITE, CREAM);
}

function drawPharmacyLowCareTrayDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  if (!isSidewaysStoreFacing(facing)) {
    drawPharmacyLowCareTray(c, w, totalH);
    return;
  }
  displayTable(c, w, totalH, '#edf6f4', '#6ca8b5', WHITE, totalH - 7);
  drawFirstAidBox(c, 3, 2);
  drawMedBox(c, 4, 15, '#d8584c');
  drawPillBlister(c, 4, 26, '#58b4e3');
  drawBottle(c, 6, totalH - 7, '#4d92d6', WHITE, CREAM);
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

function drawPharmacyDailyShelfDir(c: C2D, w: number, totalH: number, facing: Facing): void {
  if (!isSidewaysStoreFacing(facing)) {
    drawPharmacyDailyShelf(c, w, totalH);
    return;
  }
  // C2 vertical double-sided gondola shelf: central end-panel divider + left & right columns
  floorShadow(c, 1, totalH - 2, w - 2, 2);
  box(c, 0, 0, w, totalH - 1, '#6f9eb2');
  R(c, '#f2f7f9', 2, 2, w - 4, totalH - 5);
  R(c, WHITE, 1, 21, w - 2, 2);
  R(c, INK, 2, 23, w - 4, 1);
  R(c, WHITE, 1, totalH - 4, w - 2, 2);
  // Central vertical divider plank
  R(c, '#6f9eb2', Math.floor(w / 2) - 1, 1, 3, totalH - 3);
  drawTissuePack(c, 3, 5, '#79c4e8', '#f4c76b');
  drawToiletRolls(c, w - 12, 4);
  drawPumpBottle(c, 5, 16, '#64add8');
  drawTissuePack(c, 3, 27, '#73cb9d', '#f4c76b');
  drawToiletRolls(c, w - 12, 26);
  drawPumpBottle(c, w - 10, totalH - 15, '#64add8');
}

function drawPharmacyCounter(c: C2D, w: number, h: number, style = ''): void {
  const isSide = style === 'side';
  shopCounter(c, w, h, WHITE, '#e3eeeb', MINT_DARK, isSide ? -1 : w - 12, '#677880');
  // Cross sits centered in apron row y=13..19 (totalH = h+6 = 22), cleanly above shadow
  drawCross(c, Math.floor(w / 2) - 2, 14, WHITE);
  box(c, 3, 4, 8, 6, '#5ca8dc');
  R(c, WHITE, 5, 5, 4, 2);
  R(c, GLASS_HI, 4, 5, 5, 1);
  if (isSide && w >= 32) {
    box(c, 15, 4, 6, 5, WHITE);
    R(c, SILVER, 16, 2, 2, 3);
    if (w >= 48) {
      box(c, 26, 4, 9, 6, '#5ca8dc');
      R(c, WHITE, 28, 5, 5, 2);
    }
  }
  void INK;
}

function drawPharmacyCounterDir(c: C2D, w: number, h: number, style: string, facing: Facing): void {
  const isSide = style === 'side';
  if (facing === 'up') {
    drawCounterBack(c, w, h, {
      topCol: WHITE,
      bodyCol: '#e3eeeb',
      trimCol: MINT_DARK,
      regX: isSide ? -1 : w - 12,
      regCol: '#677880',
    });
    box(c, 3, 4, 8, 5, '#5ca8dc');
    R(c, WHITE, 5, 5, 4, 2);
    return;
  }
  if (isSidewaysStoreFacing(facing)) {
    drawSideProfile(c, w, facing, (ctx) => {
      // No white cross drawn on the side panel
      drawCounterSide(ctx, w, h, WHITE, '#e3eeeb', MINT_DARK, !isSide, '#677880');
      box(ctx, 4, Math.max(12, h - 18), 8, 6, '#5ca8dc');
      R(ctx, WHITE, 6, Math.max(13, h - 17), 4, 2);
      if (isSide) {
        box(ctx, 5, 14, 6, 5, WHITE);
        R(ctx, SILVER, 6, 12, 2, 3);
      }
    });
    return;
  }
  drawPharmacyCounter(c, w, h, style);
}

/** Resolve pixel-art sprite for Bookstore, Candy Shop, and Pharmacy objects. */
export function retailStoreSprite(o: ObjectDef): StoreSprite | null {
  const w = o.w * TILE;
  const h = o.h * TILE;
  const style = o.style ?? '';
  const facing = storeFacing(o);
  const baseH = uprightTileHeight(o);

  switch (o.kind) {
    // Bookstore
    case 'bookstore-tall-shelf':
      return sprite(w, h + 16, -16, (c) =>
        drawBookstoreTallShelfDir(c, w, h + 16, style === 'b' ? 3 : style === 'c' ? 5 : 0, facing),
      );
    case 'bookstore-picture-shelf': {
      const oy = baseH >= 2 ? 0 : -14;
      return sprite(w, h - oy, oy, (c) => drawBookstorePictureShelfDir(c, w, h - oy, facing));
    }
    case 'bookstore-flat-table':
      return sprite(w, h, 0, (c) => drawBookstoreFlatTableDir(c, w, h, style, facing));
    case 'bookstore-magazine-rack':
      return sprite(w, h + 12, -12, (c) => drawBookstoreMagazineRackDir(c, w, h + 12, facing));
    case 'bookstore-counter':
      return sprite(w, h + 6, -6, (c) => drawBookstoreCounterDir(c, w, h, style, facing));

    // Candy shop
    case 'candy-box-rack': {
      const oy = baseH >= 2 ? 0 : -14;
      return sprite(w, h - oy, oy, (c) => drawCandyBoxRackDir(c, w, h - oy, facing));
    }
    case 'candy-jar-stand':
      return sprite(w, h + 16, -16, (c) => drawCandyJarStandDir(c, w, h + 16, facing));
    case 'candy-hanging-rack':
      return sprite(w, h + 16, -16, (c) => drawCandyHangingRackDir(c, w, h + 16, facing));
    case 'candy-low-bins':
      return sprite(w, h, 0, (c) => drawCandyLowBinsDir(c, w, h, facing));
    case 'candy-counter':
      return sprite(w, h + 6, -6, (c) => drawCandyCounterDir(c, w, h, facing));
    case 'candy-bench':
      return sprite(w, h, 0, (c) =>
        isSidewaysStoreFacing(facing)
          ? drawShopBenchSide(c, w, h, '#c95c4d', '#e48573')
          : drawShopBench(c, w, h, '#c95c4d', '#e48573'),
      );

    // Pharmacy
    case 'pharmacy-med-shelf': {
      const oy = baseH >= 2 ? 0 : -16;
      return sprite(w, h - oy, oy, (c) => drawPharmacyMedShelfDir(c, w, h - oy, facing));
    }
    case 'pharmacy-care-shelf': {
      const oy = baseH >= 2 ? 0 : -14;
      return sprite(w, h - oy, oy, (c) => drawPharmacyCareShelfDir(c, w, h - oy, facing));
    }
    case 'pharmacy-low-care':
      return sprite(w, h + 4, -4, (c) => drawPharmacyLowCareTrayDir(c, w, h + 4, facing));
    case 'pharmacy-daily-shelf': {
      const oy = baseH >= 2 ? 0 : -14;
      return sprite(w, h - oy, oy, (c) => drawPharmacyDailyShelfDir(c, w, h - oy, facing));
    }
    case 'pharmacy-counter':
      return sprite(w, h + 6, -6, (c) => drawPharmacyCounterDir(c, w, h, style, facing));
    case 'pharmacy-bench':
      return sprite(w, h, 0, (c) =>
        isSidewaysStoreFacing(facing)
          ? drawShopBenchSide(c, w, h, MINT_MID, MINT_LIGHT)
          : drawShopBench(c, w, h, MINT_MID, MINT_LIGHT),
      );

    default:
      return null;
  }
}
