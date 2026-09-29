// End-to-end playthrough in headless Chromium: `npm run test:e2e`
// (start the app first with `npm run dev`, or set URL=...).
import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const APP_URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = new URL('./screens/', import.meta.url).pathname;
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
const launch = { headless: true };
if (process.env.CHROMIUM) launch.executablePath = process.env.CHROMIUM;

const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
const errors = [];
const badText = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let shot = 0;
const snap = async (name) => {
  await page.waitForTimeout(450); // let entry transitions settle
  await page.screenshot({ path: `${SHOTS}${String(++shot).padStart(2, '0')}-${name}.png` });
};
const st = () => page.evaluate(() => {
  const s = BF.app.state;
  return { knowledge: s.player.knowledge, level: s.player.level, starters: s.player.startersCompleted,
    session: s.session && { kind: s.session.kind, index: s.session.index, ids: s.session.items.map((i) => i.enc.id) },
    threads: Object.keys(s.player.threadsUnlocked), debates: Object.keys(s.player.debatesUnlocked) };
});
const btn = (text) => page.getByRole('button', { name: text, exact: true });
const has = async (sel) => (await page.locator(sel).count()) > 0;
function check(cond, msg) { if (!cond) { console.log('  ✗ ' + msg); process.exitCode = 1; } else console.log('  ✓ ' + msg); }

// Play the current encounter. `miss` answers wrongly where possible.
async function playEncounter({ miss = false, shotName } = {}) {
  const enc = await page.evaluate(() => { const s = BF.app.state.session; return s.items[s.index].enc; });
  if (shotName) await snap(shotName + '-' + enc.mode.replace(/\W+/g, ''));
  const text = await page.textContent('main');
  if (/\bnull\b|\bundefined\b|\[object /.test(text)) badText.push(enc.id + ': ' + text.slice(0, 120));
  if (enc.kind === 'quote') {
    await btn('Continue').click();
    return enc;
  } else if (enc.kind === 'discover') {
    await btn('Reveal').click();
  } else if (enc.kind === 'choice') {
    const target = miss ? enc.choices.find((c) => c !== enc.correct) : enc.correct;
    await page.locator('.choice', { hasText: target }).first().click();
  } else if (enc.kind === 'recall' || enc.kind === 'share') {
    await page.getByRole('button', { name: /^Reveal/ }).click();
    const label = miss ? (enc.kind === 'share' ? 'Needs work' : 'Missed it') : enc.kind === 'share' ? 'Clear' : 'Knew it';
    if (shotName) await snap(shotName + '-revealed');
    await btn(label).click();
    await page.waitForTimeout(800);
    return enc;
  } else if (enc.kind === 'timeline') {
    const order = miss ? enc.items.slice().reverse() : enc.items;
    for (const text of order) await page.locator('.pool .chip', { hasText: text }).first().click();
    await btn('Check order').click();
  } else if (enc.kind === 'match') {
    for (let i = 0; i < enc.pairs.length; i++) {
      await page.locator('.match .chip').nth(i).click();
      const j = miss ? (i + 1) % enc.pairs.length : i;
      await page.locator('.target', { hasText: enc.pairs[j].right }).first().click();
    }
    await btn('Check matches').click();
  }
  if (shotName) await snap(shotName + '-revealed');
  await btn('Continue').click();
  return enc;
}

async function playSession({ tag, missFirstChoice = false, reloadAt = -1 } = {}) {
  let knowledgeNeverDropped = true;
  let missedPoints = null;
  await btn('Begin').click();
  const modes = [];
  for (let i = 0; i < 6; i++) {
    while (await has('text=Thread revealed')) { await snap(tag + '-thread'); await btn('Continue').click(); }
    if (i === reloadAt) {
      const before = await st();
      // Close the browser tab mid-session, reopen at home: PLAY becomes CONTINUE.
      await page.goto(APP_URL + '#/');
      await page.reload();
      await btn('Continue').click();
      const after = await st();
      check(after.session && after.session.index === before.session.index, `session restored after reload at encounter ${i + 1}`);
    }
    const enc = await page.evaluate(() => { const s = BF.app.state.session; return s.items[s.index].enc; });
    const miss = missFirstChoice && enc.kind === 'choice' && !modes.some((m) => m.miss);
    const before = (await st()).knowledge;
    await playEncounter({ miss, shotName: i < 6 ? `${tag}-${i + 1}` : null });
    const after = (await st()).knowledge;
    if (after < before) knowledgeNeverDropped = false;
    if (miss) missedPoints = after - before;
    modes.push({ mode: enc.mode, id: enc.id, miss });
  }
  while (await has('text=Thread revealed')) { await snap(tag + '-thread'); await btn('Continue').click(); }
  await page.waitForSelector('text=Session complete');
  await snap(tag + '-summary');
  const summary = await page.evaluate(() => BF.app.state.summary);
  return { modes, summary, knowledgeNeverDropped, missedPoints };
}

console.log('BLACK FOLK e2e @ ' + APP_URL);
await page.goto(APP_URL);
await page.evaluate(async () => { await BF.store.clearAll(); });

// Upgrade path: a V1 save (pre-map, pre-WORDS) must survive intact.
await page.evaluate(async () => {
  const node = (x) => Object.assign(BF.mastery.newPlayer() && {}, { seen: 1, correct: 1, introduced: true, firstSeen: Date.now(), lastSeen: Date.now(), lastResult: 'good', lapses: 0, recognition: 0.5, recall: 0, context: 0, connection: 0.5, share: 0, apply: 0, interval: 1, nextReview: Date.now() }, x || {});
  const v1 = {
    version: 1, createdAt: Date.now() - 86400000, knowledge: 480, level: 4, startersCompleted: 3,
    encounters: { E006: { count: 2, successes: 2, lastSeen: Date.now(), lastResult: 'good' }, E034: { count: 1, successes: 1, lastSeen: Date.now(), lastResult: 'good' } },
    nodes: { 'V1-010': node(), 'V1-030': node(), 'V1-031': node() },
    ratings: [{ encounterId: 'E010', rating: 'knew', at: Date.now() }],
    threadsUnlocked: {}, debatesUnlocked: {}, history: [{ id: 'old', knowledge: 70, encounterIds: [] }], hintsSeen: { DISCOVER: 'x' },
  };
  await BF.store.set('player', v1);
});
await page.reload();
await page.waitForSelector('.stats');
const mig = await page.evaluate(async () => {
  const p = BF.app.state.player;
  const saved = await BF.store.get('player');
  const backup = await BF.store.get('player-backup-v1');
  return { v: p.version, k: p.knowledge, starters: p.startersCompleted, hist: p.history.length, ratings: p.ratings.length,
    node: !!p.nodes['V1-010'].introduced, mapNode: !!p.map.nodes['V1-010'], edge: !!p.map.edges['V1-030|V1-031'],
    savedV: saved.version, backupK: backup && backup.knowledge, words: p.words };
});
check(mig.v === 2 && mig.savedV === 2, 'V1 save upgraded to schema v2 and re-saved');
check(mig.k === 480 && mig.starters === 3 && mig.hist === 1 && mig.ratings === 1 && mig.node, 'Knowledge, starters, history, ratings and mastery preserved');
check(mig.mapNode && mig.edge, 'map backfilled from past encounters (Bethune–Randolph link revealed)');
check(mig.backupK === 480, 'untouched V1 backup kept');
check((await page.textContent('.stats')).includes('480 KNOWLEDGE'), 'home shows preserved 480 KNOWLEDGE');
await page.evaluate(async () => { await BF.store.clearAll(); });
await page.reload();
await page.waitForSelector('text=BLACK FOLK');
await snap('home-new');
check((await page.textContent('.stats')).includes('0 KNOWLEDGE'), 'home shows 0 KNOWLEDGE and LVL');

// Starter 1
await btn('Play').click();
await page.waitForSelector('text=WHO DEFINES THE STORY?');
await snap('s1-intro');
const s1 = await playSession({ tag: 's1' });
check(s1.modes.map((m) => m.id).join() === 'D001,D002,E002,D004,E006,E010', 'starter 1 plays the curated flow');
check(s1.summary.knowledge === 65, 'starter 1 awards 55 for play + 10 for two WORDS found (' + s1.summary.knowledge + ')');
check(s1.summary.words.join() === 'W-11,W-01', 'WORDS found in starter 1: ' + s1.summary.words.join());
check((await page.textContent('.keep')).includes('History changes when you change who gets to define the story.'), 'KEEP THIS shows starter line');
await btn('Done').click();
check((await page.textContent('.stats')).includes('65 KNOWLEDGE'), 'home shows 65 KNOWLEDGE');

// Persistence
await page.reload();
await page.waitForSelector('.stats');
check((await page.textContent('.stats')).includes('65 KNOWLEDGE'), 'Knowledge survives reload');
const persisted = await page.evaluate(() => ({ words: Object.keys(BF.app.state.player.words), map: Object.keys(BF.app.state.player.map.nodes) }));
check(persisted.words.length === 2 && persisted.map.length >= 4, 'WORDS and map discoveries survive reload');

// WORDS collection shows only what was found, verbatim
await page.goto(APP_URL + '#/words');
await snap('words-collection');
const wtext = await page.textContent('main');
check(wtext.includes('“We wish to plead our own cause”') && wtext.includes('Freedom’s Journal editors'), 'found quote shown verbatim with attribution');
check(!wtext.includes('Cast down your bucket'), 'unfound quotes are not exposed');
await page.goto(APP_URL + '#/idea/V1-019');
check((await page.textContent('main')).includes('How does it feel to be a problem?'), 'quote joins its node page');
await page.goto(APP_URL + '#/idea/V1-044');
check((await page.textContent('main')).includes('Not yet discovered'), 'undiscovered node page stays locked');
await page.goto(APP_URL + '#/explore');
await snap('map-after-s1');
const drawn = await page.locator('.kmap .medge').count();
const locked = await page.locator('.kmap .is-locked').count();
check(locked > 30 && drawn < 10, `map is sparse after one session (${drawn} links drawn, ${locked} ideas still locked)`);
await page.goto(APP_URL + '#/');

// Starter 2 (with one deliberate miss and a mid-session reload)
await btn('Play').click();
const s2 = await playSession({ tag: 's2', missFirstChoice: true, reloadAt: 3 });
check(s2.modes.some((m) => m.mode === 'TIMELINE'), 'starter 2 includes TIMELINE');
check(s2.missedPoints === 0, 'wrong answer earned 0 Knowledge');
check(s2.knowledgeNeverDropped, 'Knowledge never went down during the session');
await btn('Keep playing').click();

// Starter 3
const s3 = await playSession({ tag: 's3' });
check(s3.modes.some((m) => m.mode === 'SHARE'), 'starter 3 includes SHARE');
check(s3.summary.threads.includes('T-02'), 'LEVERAGE thread revealed in starter 3');
let state = await st();
check(state.starters === 3, 'three starter sessions complete');
await btn('Keep playing').click();

// Adaptive sessions
const seen = new Set();
for (let k = 0; k < 4; k++) {
  const intro = await page.textContent('main');
  const res = await playSession({ tag: 'a' + (k + 1), missFirstChoice: k === 0 });
  res.modes.forEach((m) => seen.add(m.mode));
  check(res.modes.length === 6, `adaptive session ${k + 1}: ${res.modes.map((m) => m.mode).join(' / ')}`);
  await btn('Keep playing').click();
}
console.log('    modes across adaptive play:', [...seen].join(', '));
await btn('Not now').click();

// Explore
await btn('Explore').click();
await snap('explore');
const g = await page.evaluate(() => ({ total: BF.app.state.G.edges.size, shown: document.querySelectorAll('.kmap .medge').length }));
check(g.shown > 0 && g.shown < g.total, `connections reveal gradually (${g.shown} of ${g.total} drawn)`);
await page.locator('.kmap .mworld', { hasText: 'POWER' }).click();
await snap('map-world');
check(await has('.kmap--world'), 'world view shows its own map');
await page.goto(APP_URL + '#/thread/T-02');
await snap('thread');
check((await page.textContent('main')).includes('Different moments. Same question.'), 'thread view works');
await page.goto(APP_URL + '#/words');
await snap('words');
await page.goto(APP_URL + '#/explore');
check(await has('text=FREEDOM'), 'EXPLORE lists worlds');
await page.locator('.row', { hasText: 'POWER' }).first().click();
await snap('explore-world');
await page.locator('.rows .row', { hasText: 'Ida B. Wells — evidence' }).first().click();
await snap('explore-idea');
check(await has('text=Keep this') && await has('text=SOURCE'), 'idea detail shows KEEP THIS and source');
await page.goto(APP_URL + '#/thread/T-02');
await snap('explore-thread');
state = await st();
if (state.debates.length) { await page.goto(APP_URL + '#/debate/' + state.debates[0]); await snap('explore-debate'); }

// Mobile layout
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(APP_URL + '#/');
await snap('mobile-home');
await page.goto(APP_URL + '#/explore');
await snap('mobile-map');
await page.goto(APP_URL + '#/world/POWER');
await snap('mobile-world');
await page.goto(APP_URL + '#/');
await page.getByRole('button', { name: /^(Play|Continue)$/ }).click();
await btn('Begin').click();
await snap('mobile-encounter');
await page.setViewportSize({ width: 1280, height: 820 });

// Reset
await page.goto(APP_URL + '#/settings');
await btn('Reset progress').click();
await btn('Erase progress').click();
await page.waitForSelector('.stats');
check((await page.textContent('.stats')).includes('0 KNOWLEDGE'), 'reset progress returns to a new player');
await page.reload();
await page.waitForSelector('.stats');
state = await st();
check(state.knowledge === 0 && state.starters === 0 && !state.session, 'reset persists across reload');

check(badText.length === 0, 'no stray null/undefined text' + (badText.length ? ': ' + badText.join(' | ') : ''));
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
