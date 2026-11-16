import {
  CREAM,
  INK,
  MINT_DARK,
  TILE,
  WHITE,
  WOOD_DARK,
  WOOD_MID,
  box,
  drawBottle,
  R,
  woodCrate,
  wovenBasket,
  type C2D,
  type ObjectDef,
} from './art';
import {
  drawApple,
  drawBaguette,
  drawBananas,
  drawCabbage,
  drawCarrot,
  drawCoffeeCup,
  drawCroissant,
  drawMikan,
  drawOnigiri,
  drawShokupan,
  drawShortcake,
  drawTomato,
} from './goods-food';
import {
  drawCandyJar,
  drawCoverBook,
  drawCross,
  drawFirstAidBox,
  drawLollipopStand,
  drawMedBox,
  drawRamuneBottle,
  drawSpineRow,
  drawTissuePack,
} from './goods-retail';

export interface ExteriorHelpers {
  readonly wall: string;
  readonly topColor: string;
  roof(c: C2D, w: number, y: number, h: number, color: string): void;
  label(c: C2D, text: string, cx: number, y: number, color: string): void;
  glass(c: C2D, x: number, y: number, w: number, h: number, warm?: boolean): void;
  door(c: C2D, center: number, h: number): void;
}

const FACADES: Record<string, string> = {
  greengrocer: '#cfdab2',
  bookstore: '#b88469',
  candy: '#e8cbb5',
  konbini: '#eef1ea',
  bakery: '#ebd09a',
  cafe: '#bfa688',
  pharmacy: '#e2efe9',
};

const SIGNS: Record<string, [string, string, string]> = {
  greengrocer: ['やおや', '#37734c', '#579c64'],
  bookstore: ['ほん', '#3e6285', '#51789c'],
  candy: ['だがし', '#a64d47', '#ce695c'],
  konbini: ['コンビニ', '#2f7f78', '#489b8d'],
  bakery: ['パン', '#9c662e', '#cc8842'],
  cafe: ['カフェ', '#6f4e37', '#3f765a'],
  pharmacy: ['くすり', '#3d7c63', '#529b7e'],
};

function drawAwning(c: C2D, x0: number, x1: number, y: number, col1: string, col2 = '#f7ebd0'): void {
  for (let x = x0; x < x1; x += 6) {
    const segW = Math.min(6, x1 - x);
    R(c, Math.floor((x - x0) / 6) % 2 ? col2 : col1, x, y, segW, 9);
    R(c, '#ffffff38', x, y + 1, segW, 2);
    R(c, INK, x, y + 9, segW, 1);
    R(c, Math.floor((x - x0) / 6) % 2 ? col2 : col1, x + 1, y + 10, Math.max(1, segW - 2), 1);
  }
}

function drawUpperWindows(c: C2D, w: number, style: string, helpers: ExteriorHelpers): void {
  const count = style === 'bookstore' || style === 'cafe' ? 2 : style === 'konbini' ? 4 : 3;
  const winW = count === 2 ? 23 : count === 4 ? 14 : 18;
  const warm = style === 'cafe' || style === 'bakery';
  for (let i = 0; i < count; i++) {
    const x = Math.round(11 + (i * (w - 22 - winW)) / (count - 1));
    helpers.glass(c, x, 22, winW, style === 'cafe' ? 12 : 16, warm);
    if (style === 'cafe') {
      R(c, WOOD_MID, x - 3, 22, 3, 12);
      R(c, WOOD_MID, x + winW, 22, 3, 12);
    } else if (style === 'bakery' || style === 'greengrocer') {
      box(c, x + 1, 35, winW - 2, 4, WOOD_MID);
      R(c, '#569c49', x + 2, 33, winW - 4, 2);
    }
  }
}

function drawShowcaseWindowGoods(
  c: C2D,
  style: string,
  leftX: number,
  leftW: number,
  rightX: number,
  rightW: number,
  y: number,
): void {
  if (style === 'bakery') {
    R(c, '#d8aa6a', leftX + 2, y + 12, leftW - 4, 2);
    drawShokupan(c, leftX + 3, y + 12);
    if (leftW >= 24) drawCroissant(c, leftX + 14, y + 4);
    R(c, '#e8d7b8', rightX + 2, y + 12, rightW - 4, 2);
    drawBaguette(c, rightX + 3, y + 3);
  } else if (style === 'bookstore') {
    R(c, '#5e3c23', leftX + 2, y + 2, leftW - 4, 12);
    drawSpineRow(c, leftX + 3, y + 13, Math.floor((leftW - 6) / 4), 1);
    drawCoverBook(c, rightX + 6, y + 2, '#e06354', '#f7df6d');
  } else if (style === 'greengrocer') {
    R(c, WOOD_MID, leftX + 2, y + 12, leftW - 4, 2);
    drawCabbage(c, leftX + 2, y + 4);
    drawTomato(c, leftX + 13, y + 5);
    R(c, WOOD_MID, rightX + 2, y + 12, rightW - 4, 2);
    drawMikan(c, rightX + 2, y + 5);
    drawApple(c, rightX + 11, y + 4);
  } else if (style === 'candy') {
    drawCandyJar(c, leftX + 3, y + 4, '#d94642', '#fde047', '#f472b6');
    if (leftW >= 24) drawCandyJar(c, leftX + 14, y + 4, '#4f8cd6', '#86efac', '#ffffff');
    drawCandyJar(c, rightX + 3, y + 4, '#e69632', '#f472b6', '#60a5fa');
    if (rightW >= 20) drawRamuneBottle(c, rightX + 14, y + 13, '#7ed4f2');
  } else if (style === 'pharmacy') {
    R(c, '#f1f8f5', leftX + 2, y + 1, leftW - 4, 13);
    drawCross(c, leftX + 3, y + 2, MINT_DARK);
    drawMedBox(c, leftX + 4, y + 8, '#d8584c');
    drawMedBox(c, leftX + 14, y + 8, '#4b8ed6');
    R(c, '#f1f8f5', rightX + 2, y + 1, rightW - 4, 13);
    drawTissuePack(c, rightX + 5, y + 4, '#79c4e8', '#f4c76b');
  } else if (style === 'cafe') {
    R(c, '#fbe088', leftX + 10, y + 1, 5, 2);
    drawCoffeeCup(c, leftX + 8, y + 4, true);
    R(c, '#fbe088', rightX + 8, y + 1, 5, 2);
    drawShortcake(c, rightX + 6, y + 5);
  } else if (style === 'konbini') {
    R(c, '#d7eef4', leftX + 2, y + 1, leftW - 4, 13);
    const cols: [string, string][] = [
      ['#51a847', '#2b6b28'],
      ['#3986d6', '#ffffff'],
      ['#e04a3f', '#f4c542'],
      ['#e59230', '#4f993e'],
    ];
    let idx = 0;
    for (let x = leftX + 3; x + 5 <= leftX + leftW - 3; x += 6) {
      const [b, cap] = cols[idx++ % cols.length];
      drawBottle(c, x, y + 13, b, cap);
    }
    R(c, '#f5f2e6', rightX + 2, y + 1, rightW - 4, 13);
    drawCoverBook(c, rightX + 2, y + 2, '#e56558', '#f6db6b');
    if (rightW >= 22) drawOnigiri(c, rightX + 12, y + 5);
  }
}

function drawSidewalkProps(c: C2D, style: string, w: number, h: number, center: number): void {
  if (style === 'greengrocer') {
    woodCrate(c, 16, h - 9, 14, 8);
    drawCabbage(c, 17, h - 10);
    woodCrate(c, 31, h - 8, 12, 7);
    drawCarrot(c, 31, h - 9);
    wovenBasket(c, w - 21, h - 8, 14, 7);
    drawBananas(c, w - 20, h - 10);
  } else if (style === 'bakery') {
    wovenBasket(c, 18, h - 9, 15, 8);
    drawBaguette(c, 19, h - 11);
    box(c, w - 20, h - 10, 10, 9, WOOD_MID);
    R(c, '#2d3b34', w - 19, h - 9, 8, 6);
    R(c, '#f5d98c', w - 18, h - 8, 5, 1);
    R(c, '#f29f85', w - 18, h - 6, 4, 1);
  } else if (style === 'bookstore') {
    box(c, 16, h - 10, 21, 9, WOOD_MID);
    drawCoverBook(c, 17, h - 10, '#d9574e', '#fae178');
    drawCoverBook(c, 27, h - 10, '#4c88c4', '#ffffff');
    box(c, w - 24, h - 10, 17, 9, WOOD_MID);
    drawSpineRow(c, w - 22, h - 2, 4, 1);
  } else if (style === 'candy') {
    woodCrate(c, 16, h - 9, 13, 8, '#c95c4d', '#f5dca4');
    drawLollipopStand(c, 27, h - 10);
    for (let x = 10; x < w - 10; x += 6) {
      R(c, (x / 6) % 2 ? '#e5564d' : '#f4c542', x, h - 27, 4, 2);
    }
  } else if (style === 'cafe') {
    box(c, 17, h - 10, 11, 9, WOOD_DARK);
    R(c, '#293933', 18, h - 9, 9, 6);
    R(c, CREAM, 20, h - 8, 5, 1);
    R(c, '#8fd1a8', 19, h - 6, 6, 1);
    box(c, w - 18, h - 6, 8, 5, '#b56143');
    R(c, '#3a8046', w - 19, h - 10, 10, 4);
    R(c, '#63b364', w - 17, h - 11, 6, 2);
  } else if (style === 'pharmacy') {
    box(c, 18, h - 10, 11, 9, WHITE);
    drawCross(c, 20, h - 9, MINT_DARK);
    drawFirstAidBox(c, w - 21, h - 9);
  } else if (style === 'konbini') {
    R(c, '#95d4c2', center - 12, h - 3, 24, 2);
    box(c, w - 21, h - 9, 11, 8, '#d6dee2');
    R(c, '#4b9e8d', w - 20, h - 8, 9, 2);
    R(c, '#e86f58', w - 18, h - 10, 2, 3);
    R(c, '#4f8cd6', w - 15, h - 10, 2, 3);
  }
}

/** Draw distinct, product-authentic exterior facade for all 7 shops. */
export function drawShopExterior(
  c: C2D,
  o: ObjectDef,
  w: number,
  h: number,
  helpers: ExteriorHelpers,
): void {
  const style = o.style ?? '';
  const center = (Math.floor(o.w / 2) + 0.5) * TILE;
  box(c, 3, 5, w - 6, h - 5, FACADES[style] ?? helpers.wall);
  R(c, '#a89d86', 4, h - 4, w - 8, 3);

  if (style === 'bookstore') {
    for (let y = 18; y < h - 54; y += 5) {
      R(c, '#d7ad91', 5, y, w - 10, 1);
      for (let x = 8 + (y % 2) * 4; x < w - 5; x += 11) {
        R(c, '#d7ad91', x, y - 4, 1, 4);
      }
    }
  } else if (style === 'pharmacy') {
    for (let y = 20; y < h - 54; y += 6) {
      R(c, '#cfe2da', 5, y, w - 10, 1);
    }
  }

  if (style === 'bakery' || style === 'cafe') {
    helpers.roof(c, w, 0, 17, helpers.topColor);
  } else {
    box(c, 2, 1, w - 4, style === 'konbini' ? 10 : 15, helpers.topColor);
    if (style !== 'konbini') {
      box(c, style === 'pharmacy' ? 9 : w - 26, 4, 16, 8, '#e3e5da');
    }
    if (style === 'pharmacy') {
      drawCross(c, w - 18, 5, WHITE);
    }
  }

  drawUpperWindows(c, w, style, helpers);

  const [name, color, awningCol] = SIGNS[style] ?? ['おみせ', '#78847b', '#8f9b93'];
  box(c, 6, h - 54, w - 12, 16, '#fcf1d3');
  if (style === 'konbini') {
    R(c, '#2f7f78', 5, h - 54, w - 10, 3);
    R(c, '#ea823a', 5, h - 40, w - 10, 2);
  } else if (style === 'pharmacy') {
    R(c, '#f6fcf9', 7, h - 53, w - 14, 14);
    drawCross(c, 11, h - 48, MINT_DARK);
    drawCross(c, w - 16, h - 48, MINT_DARK);
  }
  helpers.label(c, name, w / 2, h - 53, color);

  if (style === 'konbini') {
    R(c, '#3d9986', 4, h - 37, w - 8, 8);
    R(c, '#f7f8f4', 4, h - 33, w - 8, 2);
    R(c, '#ea823a', 4, h - 29, w - 8, 2);
    R(c, INK, 4, h - 27, w - 8, 1);
  } else {
    drawAwning(c, 4, w - 4, h - 37, awningCol, style === 'cafe' ? '#dfcfb1' : '#f7ebd0');
  }

  const leftX = 9;
  const leftW = Math.max(15, center - 23);
  const rightX = center + 12;
  const rightW = Math.max(14, w - center - 22);
  const winY = h - 26;
  helpers.glass(c, leftX, winY, leftW, 15, style === 'cafe' || style === 'bakery');
  helpers.glass(c, rightX, winY, rightW, 15, style === 'cafe' || style === 'bakery');
  drawShowcaseWindowGoods(c, style, leftX, leftW, rightX, rightW, winY);

  helpers.door(c, center, h);
  if (style === 'konbini') {
    R(c, '#95d4c2', center - 8, h - 22, 16, 2);
  }

  drawSidewalkProps(c, style, w, h, center);
}
