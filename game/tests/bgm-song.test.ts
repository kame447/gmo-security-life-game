import { describe, expect, it } from 'vitest';
import { buildSong, midiToHz, noteToMidi, parseChord, parseMelody, SONGS, STREET_THEME, TOWN_THEME, type SongSpec } from '../src/audio/song';

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
  });
});

describe('accompaniment patterns', () => {
  const spec: SongSpec = {
    id: 'x', title: 'x', mood: 'x', bpm: 120, stepsPerBar: 4, leadDuty: 0.25, melody: 'C5:4', chords: 'Am',
    bass: 'root:2 octave:2', harmony: 'R:1 third:1 fifth:2', drums: { groove: 'k.s.', fill: 'kkss' },
  };
  it('turns chord roles into pitches', () => {
    const notes = (voice: string) => buildSong(spec).events.filter(e => e.voice === voice).map(e => [e.step, e.midi]);
    expect(notes('bass')).toEqual([[0, noteToMidi('A2')], [2, noteToMidi('A3')]]);
    expect(notes('harmony')).toEqual([[1, noteToMidi('C4')], [2, noteToMidi('E4')]]);
    expect(buildSong(spec).events.filter(e => e.voice === 'drums').map(e => e.drum)).toEqual(['kick', 'snare']);
  });
  it('rejects patterns that do not fill a bar', () => {
    expect(() => buildSong({ ...spec, bass: 'root:3' })).toThrow(/bass/);
    expect(() => buildSong({ ...spec, drums: { groove: 'k.s', fill: 'kkss' } })).toThrow(/drum/);
    expect(() => buildSong({ ...spec, harmony: 'seventh:4' })).toThrow(/role/);
  });
});

it('plays candidate C in the town', () => {
  expect(TOWN_THEME).toBe(STREET_THEME);
});

it('keeps three candidates with distinct ids for the preview page', () => {
  expect(SONGS.map(song => song.id)).toEqual(['a', 'b', 'c']);
});

describe.each(SONGS.map(song => [song.title, song] as const))('%s', (_title, song) => {
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
    expect(Math.min(...range('lead'))).toBeGreaterThanOrEqual(noteToMidi('G4'));
    expect(Math.max(...range('lead'))).toBeLessThanOrEqual(noteToMidi('E6'));
    expect(Math.min(...range('harmony'))).toBeGreaterThanOrEqual(noteToMidi('G3'));
    expect(Math.max(...range('harmony'))).toBeLessThan(noteToMidi('G5'));
    expect(Math.min(...range('bass'))).toBeGreaterThanOrEqual(noteToMidi('E2'));
    expect(Math.max(...range('bass'))).toBeLessThan(noteToMidi('G4'));
  });

  it('loops in about half a minute', () => {
    const seconds = loop * 60 / song.bpm / 2;
    expect(seconds).toBeGreaterThanOrEqual(25);
    expect(seconds).toBeLessThanOrEqual(35);
  });
});
