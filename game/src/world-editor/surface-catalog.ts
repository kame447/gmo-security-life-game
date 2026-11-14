// A's surface module is optional while the three-item furniture contract is used.
// The same module becomes available without an editor-side copy of the artwork.
export interface EditorSurface { id: string; name: string; kind: 'floor' | 'wall' }
interface SurfaceModule {
  SURFACES: readonly EditorSurface[];
  surfaceThumbnail(id: string, size?: number): HTMLCanvasElement;
}
const modules = import.meta.glob('../render/surfaces*.ts', { eager: true }) as Record<string, SurfaceModule>;
export const surfaceModule = Object.values(modules).find(m => Array.isArray(m.SURFACES));
