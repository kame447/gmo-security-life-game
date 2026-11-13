/** Record the real review-only phone flow; video files stay under SLG_VIDEOS. */
import { mkdir, rename } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const output = process.env.SLG_VIDEOS;
if (!output) throw new Error('Set SLG_VIDEOS to the video output directory');
const target = new URL(process.env.SLG_URL || 'http://127.0.0.1:5173');
if (!['http:', 'https:'].includes(target.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw new Error('SLG_URL must point to a local development server');
}
target.searchParams.set('review', '1');
const outputDir = resolve(output);
await mkdir(outputDir, { recursive: true });
// Keep Playwright's temporary browser profiles under the requested output too.
process.env.TMPDIR = outputDir;
process.env.TMP = outputDir;
process.env.TEMP = outputDir;
const { chromium } = await import('playwright');

const browser = await chromium.launch({ headless: true, args: [
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE [::1]',
] });
try {
  for (const { name, viewport, mobile } of [
    { name: 'desktop', viewport: { width: 1280, height: 800 }, mobile: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, mobile: true },
  ]) {
    const blocked = [], errors = [];
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile,
      serviceWorkers: 'block', recordVideo: { dir: outputDir, size: viewport } });
    let page, timer, closed = false;
    try {
      // Restrict page requests and websockets to this local server, including redirects.
      await context.route('**/*', route => {
        const requested = new URL(route.request().url());
        if (requested.origin !== target.origin) {
          blocked.push(requested.href);
          return route.abort();
        }
        return route.continue();
      });
      const socketOrigin = target.origin.replace(/^http/, 'ws');
      await context.routeWebSocket('**/*', socket => {
        if (new URL(socket.url()).origin === socketOrigin) socket.connectToServer();
        else { blocked.push(socket.url()); return socket.close({ code: 1008, reason: 'Local review only' }); }
      });
      page = await context.newPage();
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const video = page.video();
      const pause = () => page.waitForTimeout(750);
      const select = async selector => {
        const element = page.locator(selector);
        if (mobile) await element.tap({ timeout: 3000 });
        else await element.click({ timeout: 3000 });
        await pause();
      };
      const flow = async () => {
        await page.goto(target.href, { timeout: 6000 });
        await page.waitForFunction(() => !!window.__slg?.game && !!document.querySelector('#hud')?.textContent.trim(), null, { timeout: 6000 });
        await page.locator('#view').focus();
        await page.keyboard.down('ArrowRight');
        try { await pause(); } finally { await page.keyboard.up('ArrowRight'); }
        await pause();
        await select('#btn-phone');
        await page.locator('#phone-device').waitFor({ state: 'visible', timeout: 3000 });
        await select('[data-app="messages"]');
        await select('[data-screen="example"]');
        await select('#phone-back');
        await select('#phone-home');
        await select('[data-app="web"]');
        await select('#phone-home');
        await select('[data-app="data"]');
        await select('#phone-home');
        await select('#phone-close');
        await page.locator('#phone-overlay').waitFor({ state: 'hidden', timeout: 3000 });
        if (blocked.length) throw new Error(`Blocked external requests: ${blocked.join(', ')}`);
        if (errors.length) throw new Error(`Page errors: ${errors.join('; ')}`);
      };
      // Leave time to finalize the file if navigation or an action stalls.
      const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${name} recording exceeded 25 seconds`)), 25000); });
      await Promise.race([flow(), limit]);
      clearTimeout(timer); timer = undefined;
      await context.close();
      closed = true;
      const raw = await video.path();
      const destination = join(outputDir, `phone-${name}-${basename(raw)}`);
      await rename(raw, destination);
      console.log(`${name}: ${destination}`);
    } finally {
      if (timer) clearTimeout(timer);
      if (!closed) await context.close();
    }
  }
} finally { await browser.close(); }
