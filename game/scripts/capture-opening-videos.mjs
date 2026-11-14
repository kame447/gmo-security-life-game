import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const durations = { a: 5.6, b: 8.1, c: 8.3 };
const base = process.env.OPENING_PREVIEW_URL ?? 'http://127.0.0.1:5173/opening-preview.html';
const outputDir = path.resolve(process.env.OPENING_VIDEO_OUTPUT_DIR ?? path.resolve(import.meta.dirname, '../../docs/previews/opening'));
const tempDir = await mkdtemp(path.join(tmpdir(), 'gmo-opening-video-'));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });

async function capture(variant) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    recordVideo: { dir: tempDir, size: { width: 960, height: 600 } },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base + '?v=' + variant + '&motion=full&save=0', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#opening-view')?.width > 0 && document.querySelector('#pv-art')?.textContent === '');
    await page.addStyleTag({ content: '#pv { display: none !important; } body { height: 100vh; }' });
    await page.waitForTimeout(180);
    await page.evaluate(() => document.querySelector('#pv-replay').click());
    await page.waitForTimeout((durations[variant] + 1.0) * 1000);
    if (errors.length) throw new Error(variant + ' browser errors: ' + errors.join('; '));
    await page.locator('#opening-menu').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(550);
    await page.close();
    const input = path.join(tempDir, variant + '.webm');
    await page.video().saveAs(input);
    const output = path.join(outputDir, 'opening-' + variant + '.mp4');
    const recordedSeconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', input], { encoding: 'utf8' }).trim());
    const targetSeconds = durations[variant] + 1.5;
    const speedScale = Math.min(1, targetSeconds / recordedSeconds);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vf', `setpts=(PTS-STARTPTS)*${speedScale.toFixed(6)},fps=30,format=yuv420p`, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-movflags', '+faststart', output]);
    const { size } = await stat(output);
    if (size < 20000) throw new Error(variant + ' video unexpectedly small: ' + size);
    console.log(variant.toUpperCase() + ': ' + output + ' (' + Math.round(size / 1024) + ' KiB)');
  } finally {
    await context.close();
  }
}

try {
  await mkdir(outputDir, { recursive: true });
  for (const variant of Object.keys(durations)) await capture(variant);
} finally {
  await browser.close();
  await rm(tempDir, { recursive: true, force: true });
}
