/** 各案の演出が満たす形。draw は時刻 t（秒）だけで絵が決まるので、スキップは t を duration へ進めるだけでよい。 */
import type { Art } from './art';
import type { Logo } from './glyphs';

export interface SceneEnv {
  c: CanvasRenderingContext2D;
  /** 論理サイズ。中央の 240×270 は必ず見える。 */
  w: number; h: number;
  art: Art;
  logo: Logo;
  /** 縮小表示用のロゴ。 */
  small: Logo;
}

export interface Scene {
  /** 演出が終わりメニューを出す時刻。以降も t は進み、雲などの待機中の動きに使う。 */
  duration: number;
  draw(env: SceneEnv, t: number): void;
}

/** 黒からの明転・黒への暗転。 */
export function fade(env: SceneEnv, amount: number): void {
  if (amount <= 0) return;
  env.c.fillStyle = `rgba(13,10,14,${Math.min(1, amount)})`;
  env.c.fillRect(0, 0, env.w, env.h);
}
