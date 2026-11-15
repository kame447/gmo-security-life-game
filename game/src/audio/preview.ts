/** BGM の試聴ページ（bgm-preview.html）。本編を起動せずに候補の曲を聴き比べる。 */
import { SONGS, type Song } from './song';
import { BgmPlayer } from './synth';

const list = document.getElementById('songs')!;
const players: BgmPlayer[] = [];

function card(song: Song, player: BgmPlayer): () => void {
  const root = list.appendChild(document.createElement('section'));
  root.className = 'song';
  const seconds = Math.round(song.bars * song.stepsPerBar * 30 / song.bpm);
  const meter = song.stepsPerBar === 6 ? '3拍子' : '4拍子';
  root.innerHTML = `<h2>案${song.id.toUpperCase()}「${song.title}」</h2>
    <p>${song.mood}／テンポ ${song.bpm}・${meter}・${song.bars} 小節（約 ${seconds} 秒）でくり返し</p>
    <div class="row"><button type="button">さいせい</button><div class="bars"></div></div>`;
  const button = root.querySelector('button')!;
  const bars = Array.from({ length: song.bars }, () => root.querySelector('.bars')!.appendChild(document.createElement('span')));
  button.addEventListener('click', () => {
    const playing = player.isPlaying;
    for (const other of players) other.stop();
    if (!playing) player.play();
  });
  return () => {
    root.classList.toggle('playing', player.isPlaying);
    button.textContent = player.isPlaying ? 'ていし' : 'さいせい';
    bars.forEach((bar, i) => bar.classList.toggle('on', player.isPlaying && i === player.bar));
  };
}

const updates = SONGS.map(song => {
  const player = new BgmPlayer(song);
  players.push(player);
  return card(song, player);
});

// The scheduler runs slightly ahead of what is audible, so the highlight leads by up to ~0.1 s.
function tick() {
  for (const update of updates) update();
  requestAnimationFrame(tick);
}
tick();
