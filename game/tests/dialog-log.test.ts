import { describe, expect, it } from 'vitest';
import { DialogController } from '../src/events/dialog';
import { DialogLog } from '../src/events/dialog-log';

describe('dialog log', () => {
  it('records only the lines that were shown, in order, across dialogs', () => {
    const log = new DialogLog();
    const dialogs = new DialogController();
    dialogs.open('おかあさん', ['おはよう。', 'おつかいを たのめる？', 'いってらっしゃい！']);
    log.observe(dialogs.current);
    log.observe(dialogs.current); // the same line on the next frame is not recorded twice
    expect(log.entries.map(e => e.text)).toEqual(['おはよう。']);
    dialogs.advance();
    dialogs.advance(); // two lines read within one frame
    log.observe(dialogs.current);
    dialogs.advance();
    log.observe(dialogs.current);
    log.choice('A：はやて サイクル');
    dialogs.open('てんいんさん', ['いらっしゃいませ。']);
    log.observe(dialogs.current);
    expect(log.entries).toEqual([
      { speaker: 'おかあさん', text: 'おはよう。', kind: 'line' },
      { speaker: 'おかあさん', text: 'おつかいを たのめる？', kind: 'line' },
      { speaker: 'おかあさん', text: 'いってらっしゃい！', kind: 'line' },
      { speaker: '', text: 'A：はやて サイクル', kind: 'choice' },
      { speaker: 'てんいんさん', text: 'いらっしゃいませ。', kind: 'line' },
    ]);
  });

  it('records the same words again when a new dialog repeats them', () => {
    const log = new DialogLog();
    const dialogs = new DialogController();
    for (let i = 0; i < 2; i++) { dialogs.open('せんせい', ['こんにちは。']); log.observe(dialogs.current); dialogs.advance(); log.observe(dialogs.current); }
    expect(log.entries).toHaveLength(2);
  });

  it('keeps only the newest entries up to the limit', () => {
    const log = new DialogLog(3);
    for (let i = 0; i < 5; i++) log.choice(`c${i}`);
    expect(log.entries.map(e => e.text)).toEqual(['c2', 'c3', 'c4']);
  });
});
