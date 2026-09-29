// Renders the PWA icons (PNG) from the app's own fonts and palette.
// Usage: node scripts/make-icons.mjs  (needs Playwright + Chromium)
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const font = 'data:font/woff2;base64,' + readFileSync(join(root, 'app/fonts/inter-latin-wght-normal.woff2')).toString('base64');
const colors = ['#86a3cf', '#c7767a', '#d2a75c', '#86ad80', '#ae92bf', '#d08658', '#69aca5'];
const html = (size, pad) => `<!doctype html><html><head><style>
@font-face{font-family:I;src:url(${font})}
html,body{margin:0;background:#0f0e0d}
.i{width:${size}px;height:${size}px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;box-sizing:border-box;padding:0 ${pad}px;background:#0f0e0d;color:#f1ece3;font-family:I;font-weight:700;letter-spacing:.06em;line-height:.95;font-size:${size * 0.2}px}
.s{display:flex;gap:${size * 0.008}px;width:70%;margin-top:${size * 0.06}px}.s span{flex:1;height:${Math.max(2, size * 0.012)}px}
</style></head><body><div class="i"><div>BLACK</div><div>FOLK</div><div class="s">${colors.map((c) => `<span style="background:${c}"></span>`).join('')}</div></div></body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [['icon-512.png', 512, 70], ['icon-192.png', 192, 26], ['apple-touch-icon.png', 180, 24], ['icon-maskable-512.png', 512, 110]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html(size, pad));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(root, 'app/icons', name) });
}
await browser.close();
console.log('icons → app/icons/');
