export type C2D = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, C2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  context.imageSmoothingEnabled = false;
  return [canvas, context];
}

export function R(c: C2D, color: string, x: number, y: number, w: number, h: number): void {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}
