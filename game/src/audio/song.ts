/** BGM の曲データ。音の高さと長さだけを持ち、音色は synth.ts が決める。 */

export type Voice = 'lead' | 'harmony' | 'bass' | 'drums';
export type Drum = 'kick' | 'snare' | 'hat';

/** One note or drum hit. `step` and `length` are in eighth notes from the start of the loop. */
export interface NoteEvent {
  voice: Voice;
  step: number;
  length: number;
  midi?: number;
  drum?: Drum;
}

export interface Song {
  title: string;
  bpm: number;
  stepsPerBar: number;
  bars: number;
  events: NoteEvent[];
}

const PITCH_CLASS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C4" → 60. Accepts # and b, e.g. "Bb4", "F#3". */
export function noteToMidi(name: string): number {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!match) throw new Error(`invalid note: ${name}`);
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + PITCH_CLASS[match[1]] + accidental;
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Melody text: bars separated by "|", notes as "NOTE:LENGTH" (length in eighths), "R" for a rest.
 * Each bar must fill exactly `stepsPerBar`.
 */
export function parseMelody(text: string, voice: Voice, stepsPerBar: number): NoteEvent[] {
  const events: NoteEvent[] = [];
  text.split('|').forEach((bar, index) => {
    let step = index * stepsPerBar;
    for (const token of bar.trim().split(/\s+/)) {
      const [name, len] = token.split(':');
      const length = Number(len);
      if (!Number.isInteger(length) || length <= 0) throw new Error(`invalid length: ${token}`);
      if (name !== 'R') events.push({ voice, step, length, midi: noteToMidi(name) });
      step += length;
    }
    if (step !== (index + 1) * stepsPerBar) throw new Error(`bar ${index + 1} has ${step - index * stepsPerBar} steps`);
  });
  return events;
}

interface Chord { root: number; third: number; fifth: number }

/** "F", "Am", "Bb" → pitch classes of the triad. */
export function parseChord(name: string): Chord {
  const match = /^([A-G][#b]?)(m?)$/.exec(name);
  if (!match) throw new Error(`invalid chord: ${name}`);
  const root = noteToMidi(`${match[1]}0`) % 12;
  return { root, third: (root + (match[2] ? 3 : 4)) % 12, fifth: (root + 7) % 12 };
}

/** Place a pitch class at the lowest MIDI note >= `low`. */
function inRange(pitchClass: number, low: number): number {
  return low + ((pitchClass - low) % 12 + 12) % 12;
}

/** Bouncing root–fifth bass, one bar per chord. */
function bassLine(chords: Chord[], stepsPerBar: number): NoteEvent[] {
  const low = noteToMidi('E2');
  return chords.flatMap((chord, bar) => {
    const root = inRange(chord.root, low);
    const fifth = inRange(chord.fifth, root);
    const pattern: [number, number][] = [[root, 2], [fifth, 1], [root, 1], [root + 12, 2], [fifth, 2]];
    let step = bar * stepsPerBar;
    return pattern.map(([midi, length]) => {
      const event: NoteEvent = { voice: 'bass', step, length, midi };
      step += length;
      return event;
    });
  });
}

/** Off-beat chord tones under the melody. */
function harmonyLine(chords: Chord[], stepsPerBar: number): NoteEvent[] {
  const low = noteToMidi('G3');
  return chords.flatMap((chord, bar) => {
    const tones = [chord.third, chord.fifth, chord.third, chord.root].map(pc => inRange(pc, low));
    return tones.map((midi, i) => ({ voice: 'harmony' as const, step: bar * stepsPerBar + i * 2 + 1, length: 1, midi }));
  });
}

const GROOVE: readonly Drum[] = ['kick', 'hat', 'snare', 'hat', 'kick', 'kick', 'snare', 'hat'];
const FILL: readonly Drum[] = ['kick', 'hat', 'snare', 'hat', 'kick', 'snare', 'snare', 'snare'];

/** Steady groove with a fill on every eighth bar. */
function drumLine(bars: number, stepsPerBar: number): NoteEvent[] {
  return Array.from({ length: bars }, (_, bar) => (bar % 8 === 7 ? FILL : GROOVE).map((drum, i) => (
    { voice: 'drums' as const, step: bar * stepsPerBar + i, length: 1, drum }
  ))).flat();
}

export function buildSong(title: string, bpm: number, melody: string, chordNames: string): Song {
  const stepsPerBar = 8;
  const chords = chordNames.trim().split(/\s+/).map(parseChord);
  const events = [
    ...parseMelody(melody, 'lead', stepsPerBar),
    ...harmonyLine(chords, stepsPerBar),
    ...bassLine(chords, stepsPerBar),
    ...drumLine(chords.length, stepsPerBar),
  ];
  return { title, bpm, stepsPerBar, bars: chords.length, events };
}

/** 町の曲（ヘ長調・16小節でくり返す）。Claude による作曲で、外部の素材は使っていない。 */
export const TOWN_THEME: Song = buildSong('まちのうた', 120, `
  A4:1 C5:1 F5:2 E5:1 F5:1 G5:2 | A5:3 G5:1 E5:2 C5:2 | D5:1 F5:1 Bb5:2 A5:1 G5:1 F5:2 | G5:4 R:2 C5:1 D5:1 |
  F5:2 A5:2 G5:1 F5:1 E5:1 F5:1 | D5:3 F5:1 A5:2 F5:2 | G5:2 Bb5:2 A5:1 G5:1 F5:1 E5:1 | C5:1 E5:1 G5:1 C6:1 Bb5:2 R:2 |
  D6:3 C6:1 Bb5:2 F5:2 | G5:3 A5:1 Bb5:2 G5:2 | A5:3 G5:1 E5:2 A5:2 | F5:3 E5:1 D5:2 A4:2 |
  Bb4:1 D5:1 F5:2 Bb5:2 A5:1 G5:1 | G5:3 F5:1 E5:2 G5:2 | F5:4 A5:2 C6:2 | G5:2 E5:2 C5:2 R:2
`, 'F Am Bb C F Dm Gm C Bb C Am Dm Bb C F C');
