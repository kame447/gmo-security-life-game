/** 曲データを Web Audio API でファミコン風の音に合成して、くり返し鳴らす。 */
import { midiToHz, type NoteEvent, type Song, type Voice } from './song';

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;
const MASTER_VOLUME = 0.16;
const VOICE_VOLUME: Readonly<Record<Voice, number>> = { lead: 0.5, harmony: 0.16, bass: 0.7, drums: 0.45 };

/** Fourier series of a pulse wave; `duty` is the fraction of the period spent high. */
function pulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    real[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
    imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
  }
  return ctx.createPeriodicWave(real, imag);
}

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Events grouped by their step in the loop. */
function byStep(song: Song): NoteEvent[][] {
  const steps: NoteEvent[][] = Array.from({ length: song.bars * song.stepsPerBar }, () => []);
  for (const event of song.events) steps[event.step].push(event);
  return steps;
}

/**
 * Loops one song. The AudioContext is created on the first `play()`, which must run inside a user gesture
 * because browsers block audio until the page has been interacted with.
 */
export class BgmPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Partial<Record<Voice, GainNode>> = {};
  private waves: { lead?: PeriodicWave; harmony?: PeriodicWave } = {};
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly steps: NoteEvent[][];
  private readonly stepSeconds: number;
  private step = 0;
  private nextTime = 0;
  private muted = false;

  constructor(private readonly song: Song) {
    this.steps = byStep(song);
    this.stepSeconds = 60 / song.bpm / 2;
  }

  get isPlaying(): boolean { return this.timer !== null; }
  get isMuted(): boolean { return this.muted; }
  /** Current bar (0-based) of the loop, for display. */
  get bar(): number { return Math.floor(this.step / this.song.stepsPerBar) % this.song.bars; }

  play(): void {
    const ctx = this.ctx ?? this.setup();
    void ctx.resume();
    if (this.timer) return;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.ctx?.suspend();
  }

  /** Pause without losing the position, e.g. while the tab is hidden. */
  suspend(): void { void this.ctx?.suspend(); }
  resume(): void { if (this.timer) void this.ctx?.resume(); }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.03);
  }

  private setup(): AudioContext {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(ctx.destination);
    for (const voice of Object.keys(VOICE_VOLUME) as Voice[]) {
      const gain = ctx.createGain();
      gain.gain.value = VOICE_VOLUME[voice];
      gain.connect(this.master);
      this.voices[voice] = gain;
    }
    this.waves = { lead: pulseWave(ctx, 0.25), harmony: pulseWave(ctx, 0.125) };
    this.noise = noiseBuffer(ctx);
    return ctx;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    // After the timer was throttled (background tab), skip ahead instead of firing a burst of late notes.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      for (const event of this.steps[this.step % this.steps.length]) this.playEvent(event, this.nextTime);
      this.nextTime += this.stepSeconds;
      this.step++;
    }
  }

  private playEvent(event: NoteEvent, time: number): void {
    const duration = event.length * this.stepSeconds;
    if (event.drum) this.playDrum(event.drum, time);
    else if (event.midi !== undefined) this.playTone(event.voice, event.midi, time, duration);
  }

  private playTone(voice: Voice, midi: number, time: number, duration: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const wave = voice === 'lead' || voice === 'harmony' ? this.waves[voice] : undefined;
    if (wave) osc.setPeriodicWave(wave); else osc.type = 'triangle';
    osc.frequency.value = midiToHz(midi);
    const env = ctx.createGain();
    // Short gap at the end so repeated notes stay separate, like a tracker.
    const end = time + duration * 0.88;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(1, time + 0.006);
    env.gain.setTargetAtTime(voice === 'bass' ? 0.8 : 0.6, time + 0.006, 0.08);
    env.gain.setTargetAtTime(0, end, 0.015);
    osc.connect(env).connect(this.voices[voice]!);
    osc.start(time);
    osc.stop(end + 0.1);
  }

  private playDrum(drum: NonNullable<NoteEvent['drum']>, time: number): void {
    const ctx = this.ctx!;
    const out = this.voices.drums!;
    const env = ctx.createGain();
    env.connect(out);
    if (drum === 'kick') {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
      env.gain.setValueAtTime(1, time);
      env.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      osc.connect(env);
      osc.start(time);
      osc.stop(time + 0.16);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = drum === 'snare' ? 1200 : 7000;
    const decay = drum === 'snare' ? 0.12 : 0.04;
    env.gain.setValueAtTime(drum === 'snare' ? 0.7 : 0.35, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + decay);
    src.connect(filter).connect(env);
    src.start(time);
    src.stop(time + decay + 0.01);
  }
}
