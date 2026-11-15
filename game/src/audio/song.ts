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
  id: string;
  title: string;
  mood: string;
  bpm: number;
  /** Pulse width of the melody voice: 0.25 is bright, 0.5 is round. */
  leadDuty: number;
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

type Role = 'root' | 'third' | 'fifth' | 'octave';
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

/**
 * Accompaniment pattern for one bar: "ROLE:LENGTH" tokens, "R" for a rest, e.g. "root:2 fifth:1 R:1".
 * Roles are chord tones placed upward from `low`; "octave" is the root an octave higher.
 */
function chordLine(pattern: string, chords: Chord[], voice: Voice, low: number, stepsPerBar: number): NoteEvent[] {
  return chords.flatMap((chord, bar) => {
    const root = inRange(chord.root, low);
    const pitch: Record<Role, number> = {
      root, third: inRange(chord.third, low), fifth: inRange(chord.fifth, low), octave: root + 12,
    };
    const events: NoteEvent[] = [];
    let step = bar * stepsPerBar;
    for (const token of pattern.trim().split(/\s+/)) {
      const [role, len] = token.split(':');
      const length = Number(len);
      if (role !== 'R') {
        if (!(role in pitch)) throw new Error(`invalid role: ${token}`);
        events.push({ voice, step, length, midi: pitch[role as Role] });
      }
      step += length;
    }
    if (step !== (bar + 1) * stepsPerBar) throw new Error(`${voice} pattern has ${step - bar * stepsPerBar} steps`);
    return events;
  });
}

const DRUM_CODE: Readonly<Record<string, Drum>> = { k: 'kick', s: 'snare', h: 'hat' };

/** Drum pattern: one character per step ("k", "s", "h", "." for silence), `fill` replaces every eighth bar. */
function drumLine(groove: string, fill: string, bars: number, stepsPerBar: number): NoteEvent[] {
  return Array.from({ length: bars }, (_, bar) => {
    const steps = (bar % 8 === 7 ? fill : groove).replace(/\s+/g, '');
    if (steps.length !== stepsPerBar) throw new Error(`drum pattern has ${steps.length} steps`);
    return [...steps].flatMap((code, i) => code === '.' ? [] : [
      { voice: 'drums' as const, step: bar * stepsPerBar + i, length: 1, drum: DRUM_CODE[code] },
    ]);
  }).flat();
}

export interface SongSpec {
  id: string;
  title: string;
  mood: string;
  bpm: number;
  /** Eighth notes per bar: 8 for 4/4, 6 for 3/4. */
  stepsPerBar: number;
  leadDuty: number;
  melody: string;
  chords: string;
  bass: string;
  harmony: string;
  drums: { groove: string; fill: string };
}

export function buildSong(spec: SongSpec): Song {
  const { stepsPerBar } = spec;
  const chords = spec.chords.trim().split(/\s+/).map(parseChord);
  const events = [
    ...parseMelody(spec.melody, 'lead', stepsPerBar),
    ...chordLine(spec.harmony, chords, 'harmony', noteToMidi('G3'), stepsPerBar),
    ...chordLine(spec.bass, chords, 'bass', noteToMidi('E2'), stepsPerBar),
    ...drumLine(spec.drums.groove, spec.drums.fill, chords.length, stepsPerBar),
  ];
  return { id: spec.id, title: spec.title, mood: spec.mood, bpm: spec.bpm, stepsPerBar, leadDuty: spec.leadDuty, bars: chords.length, events };
}

// 以下の3曲は比較用の候補。どれも Claude による作曲で、外部の素材は使っていない。

/** 案A：ヘ長調・4拍子。明るく弾む町の曲。 */
export const TOWN_THEME: Song = buildSong({
  id: 'a', title: 'まちのうた', mood: '明るく弾む・ふだんの町', bpm: 120, stepsPerBar: 8, leadDuty: 0.25,
  melody: `
    A4:1 C5:1 F5:2 E5:1 F5:1 G5:2 | A5:3 G5:1 E5:2 C5:2 | D5:1 F5:1 Bb5:2 A5:1 G5:1 F5:2 | G5:4 R:2 C5:1 D5:1 |
    F5:2 A5:2 G5:1 F5:1 E5:1 F5:1 | D5:3 F5:1 A5:2 F5:2 | G5:2 Bb5:2 A5:1 G5:1 F5:1 E5:1 | C5:1 E5:1 G5:1 C6:1 Bb5:2 R:2 |
    D6:3 C6:1 Bb5:2 F5:2 | G5:3 A5:1 Bb5:2 G5:2 | A5:3 G5:1 E5:2 A5:2 | F5:3 E5:1 D5:2 A4:2 |
    Bb4:1 D5:1 F5:2 Bb5:2 A5:1 G5:1 | G5:3 F5:1 E5:2 G5:2 | F5:4 A5:2 C6:2 | G5:2 E5:2 C5:2 R:2`,
  chords: 'F Am Bb C F Dm Gm C Bb C Am Dm Bb C F C',
  bass: 'root:2 fifth:1 root:1 octave:2 fifth:2',
  harmony: 'R:1 third:1 R:1 fifth:1 R:1 third:1 R:1 root:1',
  drums: { groove: 'k h s h k k s h', fill: 'k h s h k s s s' },
});

/** 案B：ハ長調・3拍子。ゆったりした懐かしい曲。 */
export const WALTZ_THEME: Song = buildSong({
  id: 'b', title: 'ひだまりワルツ', mood: 'ゆったり・なつかしい', bpm: 96, stepsPerBar: 6, leadDuty: 0.5,
  melody: `
    E5:3 D5:1 C5:2 | E5:2 A5:2 G5:2 | F5:3 E5:1 D5:2 | D5:4 R:2 |
    E5:3 D5:1 C5:2 | B4:2 E5:2 G5:2 | A5:3 G5:1 F5:2 | G5:4 R:2 |
    A5:3 B5:1 C6:2 | B5:2 G5:2 E5:2 | F5:2 A5:2 C6:2 | G5:4 E5:2 |
    F5:3 E5:1 D5:2 | D5:2 G5:2 F5:2 | E5:6 | D5:2 B4:2 G4:2`,
  chords: 'C Am F G C Em F G Am Em F C Dm G C G',
  bass: 'root:2 R:2 fifth:2',
  harmony: 'R:2 third:1 fifth:1 octave:1 fifth:1',
  drums: { groove: 'k . h . h .', fill: 'k . h . s s' },
});

/** 案C：ト長調・4拍子・速め。元気に走り回る曲。 */
export const STREET_THEME: Song = buildSong({
  id: 'c', title: 'わくわくストリート', mood: '元気・速め・冒険', bpm: 144, stepsPerBar: 8, leadDuty: 0.25,
  melody: `
    G5:1 G5:1 D5:1 G5:1 B5:2 A5:1 G5:1 | E5:1 G5:1 B5:2 A5:2 G5:2 | C6:2 B5:1 A5:1 G5:2 E5:2 | F#5:2 A5:2 D6:3 R:1 |
    G5:1 G5:1 D5:1 G5:1 B5:2 A5:1 G5:1 | B5:2 C6:1 B5:1 A5:2 G5:2 | E5:2 G5:2 C6:2 E6:2 | D6:2 C6:1 B5:1 A5:2 R:2 |
    E6:3 D6:1 C6:2 G5:2 | F#5:3 G5:1 A5:2 D5:2 | B5:3 A5:1 F#5:2 D5:2 | E5:2 G5:2 B5:2 E6:2 |
    C6:3 B5:1 A5:2 E5:2 | F#5:2 A5:2 C6:2 A5:2 | B5:4 G5:2 D5:2 | A5:2 F#5:2 D5:2 R:2`,
  chords: 'G Em C D G Em C D C D Bm Em Am D G D',
  bass: 'root:1 octave:1 root:1 octave:1 root:1 octave:1 fifth:1 octave:1',
  harmony: 'third:1 fifth:1 R:1 fifth:1 third:1 fifth:1 R:1 octave:1',
  drums: { groove: 'k h s h k h s h', fill: 'k h s s k s s s' },
});

export const SONGS: readonly Song[] = [TOWN_THEME, WALTZ_THEME, STREET_THEME];
