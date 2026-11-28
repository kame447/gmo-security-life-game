import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(gameRoot, '..');
const base = process.env.SLG_URL ?? 'http://127.0.0.1:5494';
const reviewRoot = resolve(repoRoot, 'docs/review/local-implementation');
const shots = resolve(reviewRoot, 'screens/revision-20261128/presentation');
const shops = [
  { host: 'hayate-cycle.example', name: 'はやてサイクル', theme: 'hayate', price: '19,800' },
  { host: 'machikado-bike.example', name: 'まちかどバイク', theme: 'machikado', price: '24,800' },
  { host: 'super-cycle-sale.example', name: 'CYCLE SELECT', theme: 'select', price: '12,800' },
];
const sentinel = 'presentation-capture-preserves-normal-save';
const errors = [], outside = [], results = [];
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  for (const [label, width, height] of [['desktop', 1280, 800], ['portrait', 390, 844]]) {
    const touch = label === 'portrait';
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch,
      deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.addInitScript(value => localStorage.setItem('slg-map-save-v1', value), sentinel);
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== new URL(base).origin) {
        outside.push(route.request().url()); return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    const click = async selector => touch ? page.locator(selector).tap() : page.locator(selector).click();
    const capturePhone = async name => {
      assert.equal(await page.locator('#phone-body').evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
      await page.locator('#phone-device').screenshot({ path: resolve(shots, `${label}-${name}.png`) });
    };
    await page.goto(`${base}/?skipOpening=1&review=1&bicycleReview=1`, { waitUntil: 'networkidle' });
    await page.locator('[data-chat-conversation="mother"]').waitFor();
    assert.equal(await page.locator('.phone-chat-web-link').count(), 3);
    await capturePhone('mother');
    for (const shop of shops) {
      await click(`[data-chat-href="https://${shop.host}/bicycle"]`);
      await page.locator(`[data-storefront="${shop.theme}"]`).waitFor();
      await page.locator('#phone-body').evaluate(element => { element.scrollTop = 0; });
      const price = page.locator('.bicycle-store-hero-price');
      assert.match(await price.innerText(), new RegExp(shop.price));
      const priceBox = await price.boundingBox(), viewBox = await page.locator('#phone-body').boundingBox();
      assert.ok(priceBox && viewBox && priceBox.y >= viewBox.y && priceBox.y + priceBox.height <= viewBox.y + viewBox.height,
        `${label}/${shop.theme}: the price is visible before scrolling`);
      await capturePhone(`${shop.theme}-top`);
      await page.locator('.bicycle-store-specifications').scrollIntoViewIfNeeded();
      await capturePhone(`${shop.theme}-details`);
      await click(`.bicycle-store-care [data-web-link="https://${shop.host}/company"]`);
      await page.locator('.bicycle-store-info').waitFor();
      await capturePhone(`${shop.theme}-company`);
      await click('#phone-back');
      await click('#phone-back');
      await page.locator('[data-chat-conversation="mother"]').waitFor();
      results.push({ device: label, shop: shop.theme, firstScreenPrice: true, overflow: false });
    }
    await page.goto(`${base}/?skipOpening=1&localReview=mail`, { waitUntil: 'networkidle' });
    await page.locator('[data-mail-detail="local-review-library"]').waitFor();
    await capturePhone('library-mail');
    await click('.phone-mail-link');
    await click('.phone-mail-open-web');
    await page.locator('[data-town-site="library"]').waitFor();
    await capturePhone('library-top');
    await page.locator('.town-library-note').scrollIntoViewIfNeeded();
    await capturePhone('library-details');
    assert.equal(await page.evaluate(() => localStorage.getItem('slg-map-save-v1')), sentinel);
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(outside, []);
  await writeFile(resolve(shots, 'capture-results.json'), JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2));
} finally { await browser.close(); }

const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
async function picture(path, caption, className = '') {
  const bytes = await readFile(resolve(reviewRoot, path));
  return `<figure class="${className}"><img src="data:image/png;base64,${bytes.toString('base64')}" alt="${escape(caption)}" loading="lazy"><figcaption>${escape(caption)}</figcaption></figure>`;
}
const prefix = 'screens/revision-20261128/';
const mother = await picture(prefix + 'presentation/portrait-mother.png', 'お母さんのトークに届く3つの候補URL', 'phone');
const products = await Promise.all(shops.map(shop => picture(prefix + `presentation/portrait-${shop.theme}-top.png`, `${shop.name}の商品ページ`, 'phone')));
const library = await picture(prefix + 'presentation/portrait-library-top.png', 'メールから開いた、まちの図書館のおはなし会', 'phone');
const libraryDetails = await picture(prefix + 'presentation/portrait-library-details.png', '会の内容・参加方法・会場の案内', 'phone');
const cafe = await picture(prefix + 'stores/store-cafe-desktop.png', 'カフェの2人は椅子に座り、机へ向かう姿勢。座ったまま話しかけられます。', 'wide');
const optional = await picture(prefix + 'events/event-optional-univ-project-portrait-choices.png', '追加イベント「ゼミの共同発表」。上部からやり直し・次の場面へ移動できます。', 'phone');
const securityPath = prefix + 'choice-refinements/event-univ-phishing-portrait-choices.png';
const security = await picture(securityPath, 'カード会社からのメール。導入の情報を読み、手続きの経路を選びます。', 'phone');
const timestamp = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
const html = `<!doctype html><html lang="ja" data-review-revision="20261128"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>今回の修正と実画面 — ローカル確認</title><style>
:root{font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;background:#f3f1e9;color:#203b32;line-height:1.8}*{box-sizing:border-box}body{margin:0}a{color:#215d49}a:focus-visible{outline:3px solid #b97d2c;outline-offset:5px}.wrap{width:min(1080px,calc(100% - 40px));margin:auto}header{background:#193e33;color:#f5f5e9;padding:40px 0}header p{max-width:760px;color:#dde6d9}h1{font-size:clamp(28px,4vw,44px);line-height:1.35;margin:12px 0 20px}h2{font-size:clamp(22px,3vw,29px);line-height:1.5;margin:0 0 13px}h3{font-size:19px}.tag{font-size:12px;letter-spacing:.08em}.action{display:inline-flex;align-items:center;min-height:46px;border:1px solid #2d5c46;border-radius:6px;padding:9px 17px;background:#214e3d;color:white;text-decoration:none;font-size:14px}header .action{background:#ebd298;color:#193e33;border-color:#ebd298}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}main{padding:38px 0 50px}section{margin:0 0 38px;padding:27px;border:1px solid #cdd7c7;background:white;border-radius:12px;scroll-margin-top:20px}.intro{max-width:840px;font-size:15px}.note{font-size:13px;color:#627368}p{margin:0 0 15px}.photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:21px;margin-top:24px}.photos.two{grid-template-columns:repeat(2,minmax(0,1fr));max-width:760px;margin-left:auto;margin-right:auto}.with-phone{display:grid;grid-template-columns:1fr 270px;align-items:center;gap:32px}figure{margin:0}figure img{display:block;max-width:100%;height:auto;margin:auto}.phone img{width:auto;max-height:690px}.wide img{width:100%;border:1px solid #d2d9cd;border-radius:6px}figcaption{font-size:12px;line-height:1.6;color:#5c6e62;margin-top:12px;text-align:center}.wide{margin-top:23px}.evidence{background:#e9eee2}.sources a{overflow-wrap:anywhere}footer{padding:23px 0;background:#e1e7da;color:#506757;font-size:12px}@media(max-width:700px){.wrap{width:calc(100% - 28px)}header{padding:30px 0}section{padding:21px}.photos,.photos.two,.with-phone{grid-template-columns:1fr}.with-phone{gap:22px}.phone img{max-width:100%}.photos{gap:30px}main{padding-top:24px}}
</style></head><body><header><div class="wrap"><div class="tag">2026年11月28日 修正版 · 実際のゲーム画面</div><h1>今回の修正を、<br>見たい場面から確認。</h1><p>通販の作り込み、お母さんのメッセージ、店内の人、イベントの直接確認。指摘を受けた箇所を修正し、確認する入口をまとめ直しました。</p><div class="actions"><a class="action" href="/review.html">確認ページを開く</a></div><p class="tag">画像の最終取得：${escape(timestamp)}（日本時間）</p></div></header><main class="wrap">
<section><div class="with-phone"><div><h2>お母さんが送った3つのURLを比べる</h2><p class="intro">メッセージの「お母さん」から始まります。候補のリンクを押すと商品ページへ移り、戻る操作で同じトークへ戻れます。通常の進行でも、お使いを報告した後に3つの候補が届きます。</p><p class="intro">商品画像とカラー見本、装備・サイズ、価格、配送、支払い、会社案内、返品条件を用意しました。3店とも同じ密度で作り、見た目の粗さで判断できないようにしています。</p><div class="actions"><a class="action" href="/?review=1&amp;bicycleReview=1" target="gmo-local-review-game">母のメッセージから試す</a></div><p class="note">カラーは見本表示です。ゲーム内の商品と店舗は架空のものです。</p></div>${mother}</div><div class="photos">${products.join('')}</div></section>
<section><h2>メールのリンク先も、読んで確かめられるページへ</h2><p class="intro">図書館のおはなし会に、内容・参加方法・日時・会場の案内を追加しました。開館案内へ進んだ後でも、元のメールまで戻れます。</p><div class="actions"><a class="action" href="/?skipOpening=1&amp;localReview=mail" target="gmo-local-review-game">案内メールから試す</a></div><div class="photos two">${library}${libraryDetails}</div></section>
<section><h2>カフェの客は着席し、ほかの店では商品を見る</h2><p class="intro">カフェの読書中の客と友達に、膝を曲げて椅子に座る姿勢を追加しました。他の6店舗は棚や商品を見る位置・向きに直しています。今回は購入操作より、店内での過ごし方を確認してください。</p><div class="actions"><a class="action" href="/?review=1&amp;shopReview=cafe&amp;shopScene=1" target="gmo-local-review-game">カフェを直接開く</a><a class="action" href="/review.html#stores">7店舗から選ぶ</a></div>${cafe}</section>
<section><h2>追加イベント12件を、待たずに1件ずつ確認</h2><p class="intro">一覧の「導入から見る」で、相手との最初の会話から始まります。学校や会社まで移動したり、発生するまで待ったりする必要はありません。上部の「この場面をやり直す」で別の選択も試せます。</p><p class="intro">既存のセキュリティイベント32件は、文章を見直した確認枠に分けています。行動の意味は会話で明らかにし、選択肢の言葉や並びだけで答えが分かりすぎないよう整えました。自転車の通販は母のメッセージから確認できます。</p><div class="actions"><a class="action" href="/review.html#events">追加イベント12件を見る</a><a class="action" href="/review.html#choices">選択肢の修正を見る</a></div><div class="photos two">${optional}${security}</div></section>
<section class="evidence"><h2>確認した範囲</h2><p class="intro">PC幅とスマホ幅のChromiumで、通販3店、メールの往復、全7店舗の客、44場面の導入・選択・結果を操作しました。通常の保存先が変わらないこと、店員と出口への通路が残ることも確認しています。画像はそのゲームを実際に表示して撮影したものです。</p><p class="intro">今回の確認入口には、新しくローカル追加した体験と今回指摘された修正を載せています。通常の自転車・電車、セーブ・タイトル画面は今回の確認項目から外しました。</p><p class="note">スマホの確認は390×844のタッチ対応ブラウザです。実機のSafariなどでの確認とは区別しています。価格・配点は従来の仮値を維持し、ここで仕様を確定していません。</p></section>
<section class="sources"><h2>通販ページで参考にした構成</h2><p class="intro"><a href="https://cyclemarket.jp/" target="_blank" rel="noopener">cyma</a>、<a href="https://www.aeonbike.jp/products/1001-0000-4977716143931" target="_blank" rel="noopener">イオンバイク</a>、<a href="https://store.shopping.yahoo.co.jp/cyclemall/54960.html" target="_blank" rel="noopener">サイクルベースあさひ公式Yahoo!店</a>の商品ページを調べ、商品画像、仕様、受け取り、会社情報、返品案内の構成を参考にしました。画像・ロゴ・文章の転載はせず、自転車の図と店のデザインは今回作成しています。</p></section>
</main><footer><div class="wrap">確認用入口：<a href="/review.html">review.html</a> · このMacのローカル版</div></footer></body></html>`;

const report = resolve(gameRoot, 'review-report-20261128.html');
try {
  const previous = await readFile(report, 'utf8');
  if (!previous.includes('data-review-revision="20261128"')) {
    const backup = resolve(reviewRoot, 'report-before-revision-20261128.html');
    try { await access(backup); } catch { await copyFile(report, backup); }
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(report, html);
console.log(`PASS final presentation captures: ${results.length} store views, both mail views, no overflow, no external requests or page errors`);
console.log(`Wrote ${report}`);
