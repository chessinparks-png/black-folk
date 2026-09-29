// Offline checks: `npm run build && npm run preview`, then `node tests/offline.mjs`.
// 1) the built app keeps working with the network cut (service worker cache);
// 2) index.html opened straight from disk (file://) runs and saves progress.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const APP_URL = process.env.URL || 'http://localhost:4173/';
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) process.exitCode = 1; };
const browser = await chromium.launch({ headless: true });

const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(APP_URL);
await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === 'activated');
await page.reload(); // now controlled by the service worker
await page.waitForSelector('text=BLACK FOLK');
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('text=BLACK FOLK', { timeout: 5000 }).catch(() => {});
ok(await page.locator('.wordmark').count() === 1, 'reloads with the network offline');
await page.getByRole('button', { name: /^(Play|Continue)$/ }).click();
ok(await page.getByRole('button', { name: 'Begin' }).count() === 1, 'PLAY works offline');
await page.goto(APP_URL + '#/explore');
await page.waitForSelector('.kmap', { timeout: 5000 }).catch(() => {});
ok(await page.locator('.kmap').count() === 1, 'Knowledge Map renders offline');
const fontsOk = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('32px "Instrument Serif"'); });
ok(fontsOk, 'local fonts load offline');
await ctx.close();

// Installability basics: manifest with PNG icons, standalone display, iOS touch icon.
const p0 = await browser.newPage();
await p0.goto(APP_URL);
const pwa = await p0.evaluate(async () => {
  const m = await (await fetch(document.querySelector('link[rel=manifest]').href)).json();
  const touch = document.querySelector('link[rel=apple-touch-icon]');
  const ok = touch && (await fetch(touch.href)).ok;
  return { display: m.display, sizes: m.icons.map((i) => i.sizes), touch: ok };
});
ok(pwa.display === 'standalone' && pwa.sizes.includes('192x192') && pwa.sizes.includes('512x512') && pwa.touch, 'installable: standalone manifest, 192/512 icons, apple-touch-icon');
await p0.close();

const fileUrl = 'file://' + fileURLToPath(new URL('../app/index.html', import.meta.url));
const p2 = await browser.newPage();
const errs = [];
p2.on('pageerror', (e) => errs.push(e.message));
await p2.goto(fileUrl);
await p2.waitForSelector('text=BLACK FOLK');
await p2.getByRole('button', { name: /^(Play|Continue)$/ }).click();
await p2.getByRole('button', { name: 'Begin' }).click();
await p2.getByRole('button', { name: 'Reveal' }).click();
await p2.waitForTimeout(300);
await p2.reload();
const k = await p2.evaluate(() => BF.app.state.player.knowledge);
ok(k >= 5, 'runs from file:// and progress survives reload (' + k + ' Knowledge)');
ok(errs.length === 0, 'no errors from file://' + (errs.length ? ': ' + errs.join(' | ') : ''));
await browser.close();
