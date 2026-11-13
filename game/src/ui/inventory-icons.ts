import type { BagIcon } from './bag-model';

/** Original, code-drawn 32px sprites. No third-party assets or runtime image requests. */
export function paintBagIcon(canvas: HTMLCanvasElement, icon: BagIcon): void {
  canvas.width = 32; canvas.height = 32;
  const c = canvas.getContext('2d')!;
  c.clearRect(0, 0, 32, 32);
  c.imageSmoothingEnabled = false;
  const r = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color; c.fillRect(x, y, w, h);
  };
  const ink = '#354a43', cream = '#fff0bd', gold = '#edb957';
  if (icon === 'bag') {
    r(10, 2, 12, 6, ink); r(13, 4, 6, 4, '#c88b57');
    r(5, 10, 22, 19, ink); r(3, 16, 26, 10, ink);
    r(7, 9, 18, 18, '#b97443'); r(8, 7, 16, 11, '#e3ae68');
    r(10, 9, 12, 2, '#f7d48b'); r(7, 18, 18, 2, '#8d5837');
    r(11, 19, 10, 8, ink); r(12, 20, 8, 5, '#d69752');
    r(14, 14, 4, 6, ink); r(15, 15, 2, 3, gold);
    r(4, 18, 2, 6, '#d69752'); r(26, 18, 2, 6, '#d69752');
  } else if (icon === 'notebook') {
    r(7, 4, 20, 25, ink); r(9, 6, 16, 21, '#d46d5d');
    r(9, 6, 3, 21, '#ae5149'); r(14, 10, 8, 8, cream);
    r(16, 12, 4, 1, '#8f9d84'); r(16, 15, 4, 1, '#8f9d84');
    for (const y of [8, 13, 18, 23]) { r(5, y, 5, 2, ink); r(6, y, 3, 1, '#f2d99a'); }
    r(12, 25, 12, 1, '#f4ad82');
  } else if (icon === 'pencil') {
    for (let i = 0; i < 17; i++) {
      r(22 - i, 5 + i, 6, 6, ink);
      r(23 - i, 6 + i, 4, 4, '#efb94c');
      r(23 - i, 6 + i, 2, 2, '#ffe28a');
    }
    r(23, 3, 6, 5, ink); r(24, 4, 4, 4, '#dd7c82');
    r(4, 23, 7, 5, '#d3b083'); r(3, 27, 4, 3, ink);
  } else if (icon === 'water') {
    r(12, 2, 8, 4, ink); r(13, 2, 6, 2, '#83bfca');
    r(12, 6, 8, 4, '#c5e0cf'); r(9, 10, 14, 20, ink);
    r(11, 10, 10, 18, '#83c2c1'); r(11, 14, 10, 9, cream);
    r(14, 16, 4, 5, '#609eaf'); r(12, 11, 2, 3, '#daefe0');
    r(12, 25, 7, 1, '#bbe1d2');
  } else if (icon === 'coin') {
    r(10, 5, 12, 22, ink); r(6, 9, 20, 14, ink);
    r(10, 7, 12, 18, gold); r(8, 10, 16, 12, gold);
    r(11, 8, 9, 2, '#ffe49a'); r(10, 11, 2, 9, '#ffe49a');
    r(15, 11, 3, 10, '#af783a'); r(13, 13, 7, 2, '#af783a'); r(13, 17, 7, 2, '#af783a');
  } else if (icon === 'snack') {
    r(7, 6, 18, 22, ink); r(9, 8, 14, 18, '#daa65e');
    r(6, 4, 20, 4, '#ce7652'); r(6, 26, 20, 3, '#ce7652');
    r(12, 12, 8, 8, '#855d43'); r(14, 13, 2, 2, cream); r(17, 17, 2, 2, cream);
  } else {
    r(9, 4, 14, 4, ink); r(11, 6, 10, 4, '#b1b989');
    r(6, 12, 20, 16, ink); r(8, 10, 16, 16, '#8ea583');
    r(11, 12, 10, 2, '#ced3a2'); r(13, 16, 6, 7, cream);
  }
}
