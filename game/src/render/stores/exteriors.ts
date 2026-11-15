import {
  CREAM,
  INK,
  MINT_DARK,
  MINT_LIGHT,
  TILE,
  WHITE,
  WOOD_DARK,
  WOOD_LIGHT,
  WOOD_MID,
  box,
  R,
  woodCrate,
  wovenBasket,
  type C2D,
  type ObjectDef,
} from './art';
import {
  drawApple,
  drawBaguette,
  drawCabbage,
  drawCarrot,
  drawCoffeeCup,
  drawCroissant,
  drawMikan,
  drawShokupan,
  drawTomato,
} from './goods-food';
import {
  drawCandyJar,
  drawCoverBook,
  drawCross,
  drawMedBox,
  drawSpineRow,
  drawTissuePack,
} from './goods-retail';

export interface ExteriorHelpers {
  topColor: string;
  wall: string;
  label: (c: C2D, text: string, x: number, y: number, color?: string) => void;
  glass: (c: C2D, x: number, y: number, w: number, h: number, warm?: boolean) => void;
  door: (c: C2D, center: number, h: number) => void;
  roof: (c: C2D, w: number, y: number, h: number, color: string) => void;
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
    // Scalloped edge tabs
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
      // Decorative window flower/herb box
      box(c, x + 1, 35, winW - 2, 4, WOOD_MID);
      R(c, '#569c49', x + 2, 33, winW - 4, 2);
    }
  }
}

function drawShowcaseWindowGoods(c: C2D, style: string, leftX: number, leftW: number, rightX: number, rightW: number, y: number): void {
  if (style === 'bakery') {
    // Golden loaves & croissants visible behind left bakery glass, cakes on right
    R(c, '#d8aa6a', leftX + 2, y + 11, leftW - 4, 2);
    drawShokupan(c, leftX + 3, y + 11);
    if (leftW >= 20) drawCroissant(c, leftX + 12, y + 6);
    R(c, '#e8d7b8', rightX + 2, y + 11, rightW - 4, 2);
    drawBaguette(c, rightX + 4, y + 6);
  } else if (style === 'bookstore') {
    // Lit wooden bookshelves inside left glass window
    R(c, '#5e3c23', leftX + 2, y + 3, leftW - 4, 13);
    drawSpineRow(c, leftX + 3, y + 10, Math.floor((leftW - 6) / 3), 1);
    drawSpineRow(c, leftX + 3, y + 15, Math.floor((leftW - 6) / 3), 4);
    drawCoverBook(c, rightX + 4, y + 5, '#e06354', '#f7df6d');
  } else if (style === 'greengrocer') {
    drawCabbage(c, leftX + 3, y + 10);
    drawTomato(c, leftX + 11, y + 10);
    drawMikan(c, rightX + 4, y + 11);
    drawApple(c, rightX + 10, y + 11);
  } else if (style === 'candy') {
    drawCandyJar(c, leftX + 3, y + 7, '#d94642', '#fde047', '#f472b6');
    drawCandyJar(c, leftX + 12, y + 7, '#4f8cd6', '#86efac', '#ffffff');
    drawCandyJar(c, rightX + 5, y + 7, '#e69632', '#f472b6', '#60a5fa');
  } else if (style === 'pharmacy') {
    R(c, '#f1f8f5', leftX + 2, y + 2, leftW - 4, 15);
    drawCross(c, leftX + 8, y + 4, MINT_DARK);
    drawMedBox(c, leftX + 3, y + 11, '#d8584c');
    drawMedBox(c, leftX + 11, y + 11, '#4b8ed6');
    R(c, '#f1f8f5', rightX + 2, y + 2, rightW - 4, 15);
    drawTissuePack(c, rightX + 4, y + 9, '#79c4e8', '#f4c76b');
  } else if (style === 'cafe') {
    // Warm pendant glow + steaming cup inside window
    R(c, '#fbe088', leftX + 8, y + 2, 4, 3);
    drawCoffeeCup(c, leftX + 7, y + 9, true);
    R(c, '#fbe088', rightX + 6, y + 2, 4, 3);
    drawCoffeeCup(c, rightX + 6, y + 9, false);
  } else if (style === 'konbini') {
    // Illuminated interior cooler bottles visible through glass
    R(c, '#d7eef4', leftX + 2, y + 2, leftW - 4, 14);
    for (let x = leftX + 4; x + 2 <= leftX + leftW - 4; x += 4) {
      R(c, x % 8 === 0 ? '#51a847' : '#3986d6', x, y + 5, 2, 4);
      R(c, '#e04a3f', x, y + 11, 2, 4);
    }
    R(c, '#f5f2e6', rightX + 2, y + 2, rightW - 4, 14);
    drawCoverBook(c, rightX + 3, y + 5, '#e56558', '#f6db6b');
    drawCoverBook(c, rightX + 11, y + 5, '#4f8cd6', '#ffffff');
  }
}

function drawSidewalkProps(c: C2D, style: string, w: number, h: number, center: number): void {
  if (style === 'greengrocer') {
    woodCrate(c, 7, h - 10, 14, 9);
    drawCabbage(c, 8, h - 10);
    drawTomato(c, 15, h - 9);
    woodCrate(c, 22, h - 9, 13, 8);
    drawCarrot(c, 23, h - 8);
    drawMikan(c, 30, h - 8);
    wovenBasket(c, w - 21, h - 9, 13, 8);
    drawApple(c, w - 19, h - 8);
    drawMikan(c, w - 13, h - 8);
  } else if (style === 'bakery') {
    wovenBasket(c, 11, h - 10, 12, 9);
    drawBaguette(c, 12, h - 12);
    drawCroissant(c, 16, h - 8);
    // Warm chalkboard A-frame menu stand outside right side
    box(c, w - 21, h - 13, 10, 12, WOOD_MID);
    R(c, '#2d3b34', w - 20, h - 12, 8, 8);
    R(c, '#f5d98c', w - 19, h - 10, 5, 1);
    R(c, '#f29f85', w - 19, h - 8, 4, 1);
  } else if (style === 'bookstore') {
    box(c, 9, h - 14, 18, 13, WOOD_MID);
    drawCoverBook(c, 10, h - 13, '#d9574e', '#fae178');
    drawCoverBook(c, 18, h - 13, '#4c88c4', '#ffffff');
    box(c, w - 25, h - 15, 16, 14, WOOD_MID);
    drawSpineRow(c, w - 23, h - 4, 4, 2);
  } else if (style === 'candy') {
    // Low dagashi crates + bright gumball / candy jar display boxes
    woodCrate(c, 10, h - 9, 12, 8, '#c95c4d', '#f5dca4');
    R(c, '#f9e368', 13, h - 7, 3, 2);
    R(c, '#60a5fa', 17, h - 6, 3, 2);
    drawCandyJar(c, 24, h - 10, '#d94642', '#fde047', '#f472b6');
    // Colorful triangular bunting garland under canopy
    for (let x = 10; x < w - 10; x += 6) {
      R(c, (x / 6) % 2 ? '#e5564d' : '#f4c542', x, h - 26, 4, 2);
    }
  } else if (style === 'cafe') {
    // Chalkboard welcome easel on left + potted lush plant on right
    box(c, 12, h - 14, 11, 13, WOOD_DARK);
    R(c, '#293933', 13, h - 13, 9, 9);
    R(c, CREAM, 15, h - 11, 5, 1);
    R(c, '#8fd1a8', 14, h - 8, 6, 1);
    // Potted plant beside cafe entrance
    box(c, w - 20, h - 7, 8, 6, '#b56143');
    R(c, '#3a8046', w - 21, h - 14, 10, 7);
    R(c, '#63b364', w - 19, h - 15, 6, 4);
  } else if (style === 'pharmacy') {
    // Clean clinic A-frame pharmacy stand with green cross
    box(c, 11, h - 13, 11, 12, WHITE);
    drawCross(c, 14, h - 11, MINT_DARK);
    R(c, MINT_DARK, w - 21, h - 11, 10, 10);
    R(c, WHITE, w - 20, h - 10, 8, 8);
    drawCross(c, w - 18, h - 8, MINT_DARK);
  } else if (style === 'konbini') {
    // Crisp konbini tiled concrete threshold + bike/umbrella stand
    R(c, '#95d4c2', center - 12, h - 3, 24, 2);
    box(c, w - 21, h - 10, 9, 9, '#d6dee2');
    R(c, '#4b9e8d', w - 20, h - 9, 7, 2);
    R(c, '#e86f58', w - 18, h - 12, 2, 4);
    R(c, '#4f8cd6', w - 15, h - 11, 2, 3);
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

  // Subtle brick wall courses for bookstore & cafe
  if (style === 'bookstore') {
    for (let y = 18; y < h - 54; y += 5) {
      R(c, '#d7ad91', 5, y, w - 10, 1);
      for (let x = 8 + (y % 2) * 4; x < w - 5; x += 11) {
        R(c, '#d7ad91', x, y - 4, 1, 4);
      }
    }
  } else if (style === 'pharmacy') {
    // Clean clinic tile grid on upper facade
    for (let y = 20; y < h - 54; y += 6) {
      R(c, '#cfe2da', 5, y, w - 10, 1);
    }
  }

  // Roof / parapet must paint topColor across upper portion for building-colors contract
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

  // Storefront fascia sign
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

  // Iconic awning above storefront windows & door
  if (style === 'konbini') {
    R(c, '#3d9986', 4, h - 37, w - 8, 8);
    R(c, '#f7f8f4', 4, h - 33, w - 8, 2);
    R(c, '#ea823a', 4, h - 29, w - 8, 2);
    R(c, INK, 4, h - 27, w - 8, 1);
  } else {
    drawAwning(c, 4, w - 4, h - 37, awningCol, style === 'cafe' ? '#dfcfb1' : '#f7ebd0');
  }

  // Left and right display showcase windows flanking central doorway
  const leftX = 9;
  const leftW = Math.max(15, center - 23);
  const rightX = center + 12;
  const rightW = Math.max(14, w - center - 22);
  const winY = h - 24;
  helpers.glass(c, leftX, winY, leftW, 19, style === 'cafe' || style === 'bakery');
  helpers.glass(c, rightX, winY, rightW, 19, style === 'cafe' || style === 'bakery');
  drawShowcaseWindowGoods(c, style, leftX, leftW, rightX, rightW, winY);

  // Storefront door aligned strictly on `center`
  helpers.door(c, center, h);
  if (style === 'konbini') {
    // Sliding automatic door light bar
    R(c, '#95d4c2', center - 8, h - 22, 16, 2);
  }

  drawSidewalkProps(c, style, w, h, center);
}
