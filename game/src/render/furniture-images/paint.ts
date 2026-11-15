import type { FurnitureImageResult } from './loader';

export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;
const createCanvas: CanvasFactory = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/** Keep the canvas object/dimensions so existing renderer indices remain valid. */
export function paintFurnitureImage(
  target: HTMLCanvasElement, result: FurnitureImageResult, makeCanvas: CanvasFactory = createCanvas,
): boolean {
  if (result.status !== 'ready' || result.image.width !== target.width || result.image.height !== target.height) return false;
  let context: CanvasRenderingContext2D | null = null;
  let backup: ImageData | undefined;
  let saved = false;
  try {
    // All image drawing/validation happens offscreen before touching the target.
    const stage = makeCanvas(target.width, target.height);
    const stageContext = stage.getContext('2d');
    if (!stageContext) return false;
    stageContext.imageSmoothingEnabled = false;
    stageContext.drawImage(result.image.source, 0, 0);
    const pixels = stageContext.getImageData(0, 0, target.width, target.height);
    context = target.getContext('2d');
    if (!context) return false;
    backup = context.getImageData(0, 0, target.width, target.height);
    context.save();
    saved = true;
    context.imageSmoothingEnabled = false;
    // putImageData replaces transparent pixels too, ignores transform/clip/alpha,
    // and avoids a clearRect followed by a fallible drawImage on the live canvas.
    context.putImageData(pixels, 0, 0);
    return true;
  } catch {
    if (context && backup) context.putImageData(backup, 0, 0);
    return false;
  } finally {
    if (saved) context!.restore();
  }
}
