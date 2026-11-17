/** BGM の試聴ページ（bgm-preview.html）。本編を起動せずに町の曲だけを聴く。 */
import { TOWN_THEME, type Song } from './song';
import { BgmPlayer } from './synth';

const list = document.getElementById('songs')!;

function card(song: Song, player: BgmPlayer): () => void {
  const root = list.appendChild(document.createElement('section'));
  root.className = 'song';
  const seconds = Math.round(song.bars * song.stepsPerBar * 30 / song.bpm);
  const meter = song.stepsPerBar === 6 ? '3拍子' : '4拍子';
  root.innerHTML = `<h2>「${song.title}」</h2>
    <p>${song.mood}／テンポ ${song.bpm}・${meter}・${song.bars} 小節（約 ${seconds} 秒）でくり返し</p>
    <div class="row"><button type="button">さいせい</button><div class="bars"></div></div>`;
  const button = root.querySelector('button')!;
  const bars = Array.from({ length: song.bars }, () => root.querySelector('.bars')!.appendChild(document.createElement('span')));
  button.addEventListener('click', () => {
    if (player.isPlaying) player.stop(); else player.play();
  });
  return () => {
    root.classList.toggle('playing', player.isPlaying);
    button.textContent = player.isPlaying ? 'ていし' : 'さいせい';
    bars.forEach((bar, i) => bar.classList.toggle('on', player.isPlaying && i === player.bar));
  };
}

const update = card(TOWN_THEME, new BgmPlayer(TOWN_THEME));

// The scheduler runs slightly ahead of what is audible, so the highlight leads by up to ~0.1 s.
function tick() {
  update();
  requestAnimationFrame(tick);
}
tick();
