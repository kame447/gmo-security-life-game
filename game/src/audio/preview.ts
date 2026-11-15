/** BGM の試聴ページ（bgm-preview.html）。本編を起動せずに曲だけを確認する。 */
import { TOWN_THEME } from './song';
import { BgmPlayer } from './synth';

const song = TOWN_THEME;
const player = new BgmPlayer(song);
const $ = (id: string) => document.getElementById(id)!;
const play = $('play') as HTMLButtonElement;
const mute = $('mute') as HTMLButtonElement;

$('title').textContent = song.title;
$('meta').textContent = `テンポ ${song.bpm}・${song.bars} 小節でくり返し（約 ${song.bars * song.stepsPerBar * 30 / song.bpm} 秒）`;
const bars = Array.from({ length: song.bars }, () => $('bars').appendChild(document.createElement('span')));

play.addEventListener('click', () => {
  if (player.isPlaying) player.stop(); else player.play();
  play.textContent = player.isPlaying ? 'ていし' : 'さいせい';
});
mute.addEventListener('click', () => {
  player.setMuted(!player.isMuted);
  mute.textContent = player.isMuted ? 'ミュート解除' : 'ミュート';
});

// The scheduler runs slightly ahead of what is audible, so the highlight leads by up to ~0.1 s.
function tick() {
  bars.forEach((bar, i) => bar.classList.toggle('on', player.isPlaying && i === player.bar));
  requestAnimationFrame(tick);
}
tick();
