/**
 * 本編の BGM：最初の操作で鳴らし始め、M キーでミュートを切り替え、タブが隠れている間は止める。
 */
import { TOWN_THEME } from './song';
import { BgmPlayer } from './synth';

export const MUTE_KEY = 'KeyM';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

export function installBgm(onMuteChange: (muted: boolean) => void): BgmPlayer {
  const player = new BgmPlayer(TOWN_THEME);
  const start = () => {
    if (!document.hidden) player.play();
    for (const type of ['pointerdown', 'keydown'] as const) window.removeEventListener(type, start, true);
  };
  for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, start, true);

  window.addEventListener('keydown', event => {
    if (event.code !== MUTE_KEY || event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
    player.setMuted(!player.isMuted);
    onMuteChange(player.isMuted);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) player.suspend(); else player.resume();
  });
  return player;
}
