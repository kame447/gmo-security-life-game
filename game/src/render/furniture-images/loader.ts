import type { FurnitureAsset } from './catalog';

export interface DecodedFurnitureImage {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}
export type ImageDecoder = (url: string) => Promise<DecodedFurnitureImage>;
export type FurnitureImageResult =
  | { readonly status: 'ready'; readonly image: DecodedFurnitureImage }
  | { readonly status: 'unavailable'; readonly reason: 'missing' | 'load' | 'dimensions' };

/** DOM adapter. No DOM access occurs until a supplied PNG is actually requested. */
export async function decodePng(url: string): Promise<DecodedFurnitureImage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Furniture PNG HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) throw new Error('Not a PNG');
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  try {
    const image = new Image();
    image.src = blobUrl;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** Share pending, successful and failed decodes by URL; validate dimensions per caller. */
export class FurnitureImageLoader {
  private readonly images = new Map<string, Promise<DecodedFurnitureImage | undefined>>();

  constructor(private readonly decode: ImageDecoder = decodePng) {}

  async load(asset: FurnitureAsset, urls: Readonly<Record<string, string>>): Promise<FurnitureImageResult> {
    const url = Object.hasOwn(urls, asset.file) ? urls[asset.file] : undefined;
    if (!url) return { status: 'unavailable', reason: 'missing' };
    let pending = this.images.get(url);
    if (!pending) {
      pending = Promise.resolve().then(() => this.decode(url)).catch(() => undefined);
      this.images.set(url, pending);
    }
    const image = await pending;
    if (!image) return { status: 'unavailable', reason: 'load' };
    if (!Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width <= 0 || asset.height <= 0 ||
      image.width !== asset.width || image.height !== asset.height) {
      return { status: 'unavailable', reason: 'dimensions' };
    }
    return { status: 'ready', image };
  }
}
