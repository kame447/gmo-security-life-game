import { describe, expect, it } from 'vitest';
import { buildSong, midiToHz, noteToMidi, parseChord, parseMelody, TOWN_THEME } from '../src/audio/song';

describe('pitch', () => {
  it.each([['C4', 60], ['A4', 69], ['Bb4', 70], ['F#3', 54], ['E2', 40]])('%s is MIDI %i', (name, midi) => {
    expect(noteToMidi(name)).toBe(midi);
  });
  it('tunes A4 to 440 Hz', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBeCloseTo(880);
  });
  it('rejects malformed notes', () => {
    expect(() => noteToMidi('H4')).toThrow();
  });
  it('builds major and minor triads', () => {
    expect(parseChord('F')).toEqual({ root: 5, third: 9, fifth: 0 });
    expect(parseChord('Am')).toEqual({ root: 9, third: 0, fifth: 4 });
  });
});

describe('melody parser', () => {
  it('places notes and skips rests', () => {
    expect(parseMelody('C5:2 R:2 E5:4', 'lead', 8)).toEqual([
      { voice: 'lead', step: 0, length: 2, midi: 72 },
      { voice: 'lead', step: 4, length: 4, midi: 76 },
    ]);
  });
  it('rejects a bar that does not fill its length', () => {
    expect(() => parseMelody('C5:2 E5:4', 'lead', 8)).toThrow(/bar 1/);
    expect(() => buildSong('x', 120, 'C5:8', 'C F')).not.toThrow();
  });
});

describe('town theme', () => {
  const song = TOWN_THEME;
  const loop = song.bars * song.stepsPerBar;

  it('has every voice in every bar', () => {
    for (const voice of ['lead', 'harmony', 'bass', 'drums'] as const) {
      const bars = new Set(song.events.filter(e => e.voice === voice).map(e => Math.floor(e.step / song.stepsPerBar)));
      expect(bars.size, voice).toBe(song.bars);
    }
  });

  it('keeps every event inside the loop', () => {
    for (const event of song.events) {
      expect(event.step).toBeGreaterThanOrEqual(0);
      expect(event.step + event.length).toBeLessThanOrEqual(loop);
    }
  });

  it('does not overlap notes within a melodic voice', () => {
    for (const voice of ['lead', 'harmony', 'bass'] as const) {
      const notes = song.events.filter(e => e.voice === voice).sort((a, b) => a.step - b.step);
      notes.slice(1).forEach((note, i) => expect(note.step, voice).toBeGreaterThanOrEqual(notes[i].step + notes[i].length));
    }
  });

  it('keeps each voice in its register', () => {
    const range = (voice: string) => song.events.filter(e => e.voice === voice).map(e => e.midi!);
    // Lead above harmony, harmony above bass, all within a comfortable chiptune range.
    expect(Math.min(...range('lead'))).toBeGreaterThanOrEqual(noteToMidi('A4'));
    expect(Math.max(...range('lead'))).toBeLessThanOrEqual(noteToMidi('D6'));
    expect(Math.min(...range('harmony'))).toBeGreaterThanOrEqual(noteToMidi('G3'));
    expect(Math.max(...range('harmony'))).toBeLessThan(noteToMidi('G4'));
    expect(Math.min(...range('bass'))).toBeGreaterThanOrEqual(noteToMidi('E2'));
    expect(Math.max(...range('bass'))).toBeLessThan(noteToMidi('G4'));
  });

  it('loops in about half a minute', () => {
    const seconds = loop * 60 / song.bpm / 2;
    expect(seconds).toBe(32);
  });
});
