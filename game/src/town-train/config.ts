import { TRAIN_HEIGHT_PX, TRAIN_LENGTH_PX } from './car';

/** These are prototype presentation values, not an agreed timetable. */
export interface TownTrainConfig {
  readonly intervalSeconds: number;
  readonly speedPixelsPerSecond: number;
  readonly lengthPixels: number;
  readonly heightPixels: number;
}

export const TOWN_TRAIN_PROTOTYPE: Readonly<TownTrainConfig> = Object.freeze({
  intervalSeconds: 12,
  speedPixelsPerSecond: 160,
  lengthPixels: TRAIN_LENGTH_PX,
  heightPixels: TRAIN_HEIGHT_PX,
});

export function validateTrainConfig(config: Readonly<TownTrainConfig>): void {
  const values = [config.intervalSeconds, config.speedPixelsPerSecond, config.lengthPixels, config.heightPixels];
  if (values.some(value => !Number.isFinite(value) || value <= 0)) throw new Error('Train values must be positive and finite');
  if (config.lengthPixels < 20 || config.heightPixels < 12) throw new Error('Train dimensions are too small to draw');
  const spacing = config.intervalSeconds * config.speedPixelsPerSecond;
  if (!Number.isFinite(spacing) || spacing < config.lengthPixels) throw new Error('Train interval must leave room between trains');
}
