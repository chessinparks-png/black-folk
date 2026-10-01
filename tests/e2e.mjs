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
const formsSeen = new Set();
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
// Writing rhythm, checked on every session the test starts.
const rhythmSeen = [];
async function noteRhythm() {
  const r = await page.evaluate(() => {
    const s = BF.app.state.session;
    if (!s) return null;
    const w = s.items.map((it) => BF.session.isWritingItem(it));
    const bad = w.some((x, i) => x && (i < 2 || i === w.length - 1 || w[i - 1] || w[i - 2]));
    return { ids: s.items.map((it, i) => it.enc.id + (w[i] ? '*' : '')).join(' '), bad };
  });
  if (r) rhythmSeen.push(r);
}
function check(cond, msg) { if (!cond) { console.log('  ✗ ' + msg); process.exitCode = 1; } else console.log('  ✓ ' + msg); }

// Play the current encounter. `miss` answers wrongly where possible.
async function playEncounter({ miss = false, shotName, write = null } = {}) {
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
  } else if (enc.kind === 'binary') {
    const target = miss ? enc.choices.find((c) => c !== enc.correct) : enc.correct;
    await page.locator('.bin-opt', { hasText: target }).first().click();
    formsSeen.add('binary');
  } else if (enc.kind === 'sort') {
    const items = await page.locator('.sort-item').all();
    for (const row of items) {
      const text = await row.locator('.sort-text').textContent();
      const it = enc.items.find((x) => x.text === text);
      const bin = miss ? enc.bins.find((b) => b !== it.bin) : it.bin;
      await row.locator('.sort-bin', { hasText: new RegExp('^' + bin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).click();
    }
    await btn('Check').click();
    formsSeen.add('sort');
  } else if ((enc.kind === 'recall' || enc.kind === 'share') && await has('.card--check')) {
    // Understanding check: say it in your head, then tap every must-have (Got it).
    await btn('Say it in your head').click();
    await btn('Continue').click();
    for (const chip of await page.locator('.check-chip').all()) await chip.click();
    await btn('Continue').click();
    await page.waitForTimeout(300);
    return enc;
  } else if (enc.kind === 'recall' || enc.kind === 'share') {
    if (write) {
      await btn('Write yours').click();
      await page.locator('.yw-input').fill(write);
      await page.keyboard.press('Enter'); // typing must not trigger the reveal shortcut
      check(await page.locator('.yw-input').count() === 1, 'Enter inside YOUR WORDS does not skip ahead');
      if (shotName) await snap(shotName + '-writing');
      await btn('Save & reveal').click();
      check((await page.textContent('.yw-compare')).includes(write), 'saved note shown beside the model answer');
    } else {
      await page.getByRole('button', { name: /^Reveal/ }).click();
    }
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

async function playSession({ tag, missFirstChoice = false, reloadAt = -1, writeOnRecall = null } = {}) {
  let knowledgeNeverDropped = true;
  let missedPoints = null;
  await btn('Begin').click();
  await noteRhythm();
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
    const hasQuote = await page.evaluate(() => { const s = BF.app.state.session; const it = s.items[s.index]; return !!(it.quoteId || it.enc.quoteId); });
    // A first-found quotation pays +5 on its own, so test misses on quote-free cards.
    const miss = missFirstChoice && !hasQuote && (enc.kind === 'choice' || enc.kind === 'binary') && !modes.some((m) => m.miss);
    const before = (await st()).knowledge;
    await playEncounter({ miss, shotName: i < 6 ? `${tag}-${i + 1}` : null, write: enc.kind === 'recall' ? writeOnRecall : null });
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
check(mig.v === 5 && mig.savedV === 5, 'V1 save upgraded to the current schema (v5) and re-saved');
check(mig.k === 480 && mig.starters === 3 && mig.hist === 1 && mig.ratings === 1 && mig.node, 'Knowledge, starters, history, ratings and mastery preserved');
check(mig.mapNode && mig.edge, 'map backfilled from past encounters (Bethune–Randolph link revealed)');
check(mig.backupK === 480, 'untouched V1 backup kept');
check((await page.textContent('.stats')).includes('480 KNOWLEDGE'), 'home shows preserved 480 KNOWLEDGE');

// Upgrade path: a populated schema-v3 save with YOUR WORDS notes and WORDS found.
await page.evaluate(async () => {
  const p = JSON.parse(JSON.stringify(BF.app.state.player));
  p.version = 3; delete p.bridgesCompleted;
  p.knowledge = 912;
  p.words = { 'W-01': { at: 111, encounterId: 'D004' }, 'W-13': { at: 222, encounterId: 'D006' } };
  p.yourWords = [
    { response_id: 'YW-a', node_id: 'V1-010', node_ids: ['V1-010'], encounter_id: 'E032', text: 'Owning the paper meant owning the story.', created_at: 1700000000000, updated_at: 1700000500000, prompt: 'Explain why Freedom’s Journal was a form of power.', model_answer_snapshot: 'A Black-controlled newspaper…' },
    { response_id: 'YW-b', node_id: 'V1-032', node_ids: ['V1-032', 'V1-015'], encounter_id: null, text: 'Law first, reality later.', created_at: 1710000000000, updated_at: null, prompt: 'Explain Brown v. Board in your own words.', model_answer_snapshot: null },
  ];
  window.__v3 = JSON.parse(JSON.stringify(p));
  await BF.store.set('player', p);
  await BF.store.set('v3-snapshot', p);
});
await page.reload();
await page.waitForSelector('.stats');
const m3 = await page.evaluate(async () => {
  const p = BF.app.state.player;
  const snap = await BF.store.get('v3-snapshot');
  const backup = await BF.store.get('player-backup-v3');
  const strip = (r) => { const { answered_at, ...rest } = r; return rest; };
  return { v: p.version, k: p.knowledge, yw: JSON.stringify(p.yourWords.map(strip)) === JSON.stringify(snap.yourWords),
    dated: p.yourWords.map((r) => r.answered_at).join() === '1700000500000,1710000000000', checks: Array.isArray(p.checks) && p.checks.length === 0,
    words: Object.keys(p.words).sort().join(), backup: backup && backup.version === 3 && backup.yourWords.length === 2 };
});
check(m3.v === 5 && m3.k === 912, 'populated v3 save upgraded to v5 with Knowledge intact');
check(m3.yw, 'every YOUR WORDS field preserved exactly through the v3→v5 migration');
check(m3.dated && m3.checks, 'existing answers dated (edit date, else creation date); empty verdict list added');
check(m3.words === 'W001,W013', 'found WORDS remapped to the V1.5 quote ids (' + m3.words + ')');
check(m3.backup, 'untouched v3 backup kept');
await page.goto(APP_URL + '#/idea/V1-010');
await page.locator('.yw-toggle').click();
const ywMigrated = await page.textContent('.yw');
check(ywMigrated.includes('Owning the paper meant owning the story.') && ywMigrated.includes('NOV 14, 2023'), 'migrated answer shows in the idea timeline with its best date');
await page.goto(APP_URL + '#/words');
check((await page.textContent('main')).includes('lynching is not invoked to punish crime but color'), 'migrated WORDS still in the collection');
await page.goto(APP_URL + '#/');
await page.evaluate(async () => { await BF.store.clearAll(); });
await page.reload();
await page.waitForSelector('text=BLACK FOLK');
await snap('home-new');
check((await page.textContent('.stats')).includes('0 KNOWLEDGE'), 'home shows 0 KNOWLEDGE and LVL');

// Starter 1
await btn('Play').click();
await page.waitForSelector('text=WHO DEFINES THE STORY?');
await snap('s1-intro');
const NOTE = 'A law can change on paper while schools, money, and habits stay the same.';
const s1 = await playSession({ tag: 's1', writeOnRecall: NOTE });
check(s1.modes.map((m) => m.id).join() === 'D001,D002,E002,D004,E010,E006', 'starter 1 plays the curated flow (writing card moved off the last slot)');
check(s1.summary.knowledge === 65 && s1.knowledgeNeverDropped, 'writing a note earns no extra Knowledge (recall still pays by self-rating)');
check(s1.summary.knowledge === 65, 'starter 1 awards 55 for play + 10 for two WORDS found (' + s1.summary.knowledge + ')');
check(s1.summary.words.join() === 'W011,W001', 'WORDS found in starter 1: ' + s1.summary.words.join());
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
// YOUR WORDS on the idea page: write, timeline (collapsed, newest first, dated), permanent, persists
await page.goto(APP_URL + '#/idea/V1-032');
await page.waitForSelector('.yw');
check((await page.textContent('.yw')).includes('Your answers over time · 1') && !(await page.textContent('.yw')).includes(NOTE), 'answer from play is in the timeline, collapsed by default');
await page.getByRole('button', { name: 'Write an answer +' }).click();
await page.locator('.yw .yw-input').fill('Second pass: rules and reality move at different speeds.');
await page.locator('.yw').getByRole('button', { name: 'Save', exact: true }).click();
check((await page.textContent('.yw')).includes('Your answers over time · 2'), 'new answer added to the timeline');
await page.locator('.yw-toggle').click();
await snap('yourwords-idea');
const entries = await page.locator('.yw-entry .yw-text').allTextContents();
check(entries[0].startsWith('Second pass') && entries[1] === NOTE, 'timeline is newest first');
check(await page.locator('.yw-entry .yw-date').count() === 2, 'every answer is dated');
check(await page.locator('.yw').getByRole('button', { name: /^(Edit|Delete)/ }).count() === 0, 'answers are permanent: no edit or delete');
await page.waitForFunction(async () => ((await BF.store.get('player')).yourWords || []).length === 2);
await page.reload();
await page.waitForSelector('.yw');
await page.locator('.yw-toggle').click();
const ywText = await page.textContent('.yw');
check(ywText.includes('Your answers over time · 2') && ywText.includes(NOTE) && ywText.includes('Second pass'), 'answers survive reload');
const kNow = await page.evaluate(() => BF.app.state.player.knowledge);
check(kNow === 65, 'answers never change Knowledge (' + kNow + ')');
await page.goto(APP_URL + '#/idea/V1-019');
check((await page.textContent('.yw')).includes('No answers yet.'), 'empty state reads "No answers yet."');
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
let state = await st();
check(state.starters === 3, 'three starter sessions complete');
await btn('Keep playing').click();

// After onboarding: V1.5 bridge sessions alternate with adaptive review
const seen = new Set();
const kinds = [];
const missChecks = [];
for (let k = 0; k < 6; k++) {
  const intro = await page.textContent('main');
  const sessKind = (await st()).session.kind;
  kinds.push(sessKind + ':' + (await page.textContent('h1')));
  const res = await playSession({ tag: 'a' + (k + 1), missFirstChoice: true });
  res.modes.forEach((m) => seen.add(m.mode));
  check(res.modes.length === 6, `${sessKind} session ${k + 1}: ${res.modes.map((m) => m.mode).join(' / ')}`);
  if (res.missedPoints !== null) missChecks.push(res.missedPoints === 0 && res.knowledgeNeverDropped);
  await btn('Keep playing').click();
}
console.log('    sessions:', kinds.join(' → '));
check(missChecks.length > 0 && missChecks.every(Boolean), `misses after onboarding earn 0 and never subtract (${missChecks.length} checked)`);
check(kinds[0] === 'bridge:WHO GETS CALLED DANGEROUS?' && kinds[1].startsWith('adaptive') && kinds[2] === 'bridge:ACCESS OR CONTROL?', 'bridges surface after onboarding and alternate with review');
check(formsSeen.has('binary') && formsSeen.has('sort'), 'binary and sort interactions played: ' + [...formsSeen].join(','));
state = await st();
check(state.threads.includes('T-09'), 'RESPECTABILITY ↔ REFUSAL thread unlocked through play');
console.log('    modes across post-onboarding play:', [...seen].join(', '));
await btn('Not now').click();

// Explore
await btn('Explore').click();
await snap('explore');
const exploreText = await page.textContent('main');
check(!/\b44\b|What Now|End of Running|Black Radicalism|Linked Fate|Post-Race/i.test(exploreText), 'no obsolete counts or hidden-foundation sections visible');
const g = await page.evaluate(() => ({ total: BF.app.state.G.edges.size, shown: document.querySelectorAll('.kmap .medge').length }));
check(g.shown > 0 && g.shown < g.total, `connections reveal gradually (${g.shown} of ${g.total} drawn)`);
await page.locator('.kmap .mworld', { hasText: 'POWER' }).click();
await snap('map-world');
check(await has('.kmap--world'), 'world view shows its own map');
const openThread = (await st()).threads[0];
await page.goto(APP_URL + '#/thread/' + openThread);
await snap('thread');
check((await page.textContent('main')).includes('Different moments. Same question.'), 'thread view works');
await page.goto(APP_URL + '#/words');
await snap('words');
await page.goto(APP_URL + '#/explore');
check(await has('text=FREEDOM'), 'EXPLORE lists worlds');
await page.locator('.world-card[data-world="POWER"]').click();
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

// MAP VISIBILITY: display only. Visible is not the same as learned.
console.log('map visibility');
// map.lastViewed only times the "new links draw in once" animation; everything else must match.
const dbPlayer = () => page.evaluate(async () => JSON.stringify(await BF.store.get('player'), (k, v) => (k === 'lastViewed' ? undefined : v)));
const memPlayer = () => page.evaluate(() => JSON.stringify(BF.app.state.player, (k, v) => (k === 'lastViewed' ? undefined : v)));
const ideaCount = async () => {
  let n = 0;
  for (const w of ['FREEDOM', 'POWER', 'EDUCATION', 'ECONOMICS', 'IDENTITY', 'ORGANIZING', 'CULTURE']) {
    await page.goto(APP_URL + '#/world/' + w);
    await page.waitForSelector('.screen');
    // The first list on a world page is its core ideas (CULTURE also lists deepening cards).
    n += await page.evaluate(() => { const ul = document.querySelector('.panel--list .rows'); return ul ? ul.children.length : 0; });
  }
  return n;
};
const landing = async () => {
  await page.goto(APP_URL + '#/explore');
  await page.waitForSelector('.kmap');
  const text = await page.textContent('main');
  const t = await page.evaluate(() => ({ threads: BF.app.state.C.threads.map((x) => x.title), debates: BF.app.state.C.debates.map((x) => x.title) }));
  return { threads: t.threads.filter((x) => text.includes(x)).length, debates: t.debates.filter((x) => text.includes(x)).length, unlearned: await page.locator('.kmap .is-unlearned').count() };
};
check(await page.evaluate(() => BF.store.settings.get().mapVisibility) === 'gradual', 'Map visibility defaults to Discover gradually');
const pBefore = { db: await dbPlayer(), mem: await memPlayer() };
const gradualIdeas = await ideaCount();
const gradualLanding = await landing();
check(gradualIdeas < 50 && gradualLanding.unlearned === 0, `gradual map shows only discovered ideas (${gradualIdeas} of 50)`);
await page.goto(APP_URL + '#/settings');
await btn('Show everything').click();
check(await btn('Show everything').getAttribute('aria-pressed') === 'true', 'Show everything selected');
const allLanding = await landing();
check(allLanding.threads === 10 && allLanding.debates === 8, `Show everything lists 10 threads and 8 debates (${allLanding.threads}/${allLanding.debates})`);
check(allLanding.unlearned > 0 && (await page.textContent('main')).includes('Visible is not the same as learned'), 'undiscovered ideas drawn as not yet learned');
await snap('show-all-map');
check(await ideaCount() === 50, 'Show everything exposes all 50 ideas');
const unseen = await page.evaluate(() => BF.app.state.C.nodes.find((n) => !(BF.app.state.player.nodes[n.id] || {}).introduced).id);
await page.goto(APP_URL + '#/idea/' + unseen);
await page.waitForSelector('.hero');
const unseenText = await page.textContent('main');
check(/not yet learned/i.test(unseenText) && /keep this/i.test(unseenText) && await btn('Learn from here').count() === 1, 'an undiscovered idea is browsable and offers Learn from here');
await snap('show-all-idea');
const lockedThread = await page.evaluate(() => (BF.app.state.C.threads.find((t) => !BF.app.state.player.threadsUnlocked[t.id]) || BF.app.state.C.threads[8]).id);
await page.goto(APP_URL + '#/thread/' + lockedThread);
check((await page.textContent('main')).length > 200, 'an unopened thread is browsable');
const lockedDebate = await page.evaluate(() => (BF.app.state.C.debates.find((d) => !BF.app.state.player.debatesUnlocked[d.id]) || BF.app.state.C.debates[7]).id);
await page.goto(APP_URL + '#/debate/' + lockedDebate);
check((await page.textContent('main')).length > 200, 'an unopened debate is browsable');
await page.goto(APP_URL + '#/thread/T-09');
const t09 = await page.textContent('main');
check(t09.includes('What happens when protection depends on acceptability?') && t09.includes('Disrepute') && t09.includes('Who counts as a thinker?'), 'T-09 shows its question, historical responses and deepening cards');
await page.goto(APP_URL + '#/words');
await page.waitForTimeout(300);
check(pBefore.db === await dbPlayer() && pBefore.mem === await memPlayer(), 'browsing everything changes no Knowledge, mastery, discoveries, WORDS or notes');
await page.reload();
await page.goto(APP_URL + '#/settings');
check(await btn('Show everything').getAttribute('aria-pressed') === 'true', 'Map visibility persists across reload');
await btn('Discover gradually').click();
const backLanding = await landing();
check(await ideaCount() === gradualIdeas && backLanding.unlearned === 0 && backLanding.threads === gradualLanding.threads, 'switching back hides undiscovered content again');
check(pBefore.db === await dbPlayer(), 'progress identical after switching back');

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

check(await page.evaluate(() => BF.store.settings.get().mapVisibility) === 'gradual', 'reset returns Map visibility to Discover gradually');

// LEARN FROM HERE from unseen ideas (new player, Show everything)
console.log('learn from here');
async function playToEnd(tag) {
  for (let i = 0; i < 8 && !(await has('text=Session complete')); i++) {
    while (await has('text=Thread revealed')) await btn('Continue').click();
    if (await has('text=Session complete')) break;
    const before = (await st()).knowledge;
    await playEncounter({ shotName: i < 2 ? tag + '-' + (i + 1) : null });
    if ((await st()).knowledge < before) check(false, 'knowledge dropped');
  }
  await page.waitForSelector('text=Session complete');
}
async function learnFrom(id) {
  await page.goto(APP_URL + '#/idea/' + id);
  await page.waitForSelector('.hero');
  await btn('Learn from here').click();
  if (await has('text=Leave your current session?')) await page.locator('.learn-actions .btn--learn').click();
  await page.waitForSelector('text=Begin');
  await noteRhythm();
  return st();
}
await page.goto(APP_URL + '#/settings');
await btn('Show everything').click();
const k0 = (await st()).knowledge;
let lf = await learnFrom('V1-048');
check(lf.session.kind === 'anchored' && lf.session.ids[0] === 'D048', 'Pan-Africanism: anchored session opens on the idea (' + lf.session.ids.join(' → ') + ')');
check(lf.knowledge === k0 && !(await page.evaluate(() => BF.app.state.player.nodes['V1-048'])), 'starting it awards nothing');
check((await page.textContent('main')).includes('Learn from here'), 'intro says Learn from here');
await btn('Begin').click();
check(await page.locator('main.screen--play[data-world]').count() === 1, 'play screen carries its world colour');
await playToEnd('lfh-pan');
const afterPan = await page.evaluate(() => ({ k: BF.app.state.player.knowledge, intro: !!(BF.app.state.player.nodes['V1-048'] || {}).introduced, starters: BF.app.state.player.startersCompleted }));
check(afterPan.k > k0 && afterPan.intro, `progress came only through play (+${afterPan.k - k0})`);
await btn('Done').click();
await page.getByRole('button', { name: /^(Play|Continue)$/ }).click();
check(!(await page.textContent('main')).includes('Learn from here'), 'PLAY intro is the normal one');
await btn('Begin').click();
check((await st()).session.kind === 'starter', 'normal PLAY still starts the curated starter');
await page.setViewportSize({ width: 390, height: 844 });
lf = await learnFrom('V1-045');
check(lf.session.kind === 'anchored' && lf.session.ids[0] === 'D045', 'Respectability: ' + lf.session.ids.join(' → '));
await btn('Begin').click();
const ov = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
check(!ov, 'phone play screen has no horizontal overflow');
await playToEnd('lfh-resp');
await btn('Done').click();
await page.goto(APP_URL + '#/explore');
await page.waitForSelector('.kmap');
check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'phone EXPLORE (show everything) has no horizontal overflow');
await snap('mobile-show-all');
await page.setViewportSize({ width: 1280, height: 820 });
lf = await learnFrom('V1-015');
check(lf.session.kind === 'anchored' && lf.session.ids[0] === 'D005', 'Reconstruction: ' + lf.session.ids.join(' → '));
await btn('Begin').click();
await playEncounter({});
await page.goto(APP_URL + '#/idea/V1-048');
await btn('Learn from here').click();
check(await has('text=Leave your current session?'), 'Learn from here asks before replacing a session in progress');
await btn('Cancel').click();
check((await st()).session.ids[0] === 'D005', 'cancel keeps the current session');

// CHECK YOUR UNDERSTANDING (Respectability pilot)
console.log('check your understanding');
await page.goto(APP_URL + '#/');
const beatsSeen = [];
const beatNow = async () => {
  const b = await page.locator('.beat').count();
  const name = b ? await page.locator('.beat').getAttribute('data-beat') : null;
  if (name) beatsSeen.push(name);
  return { count: b, name };
};
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
let overflowAt = [];
const checksAtStart = await page.evaluate(() => BF.app.state.player.checks.length);
// Play an anchored Respectability session up to its check card.
async function toRespCheck() {
  await learnFrom('V1-045');
  await btn('Begin').click();
  for (let i = 0; i < 6; i++) {
    while (await has('text=Thread revealed')) await btn('Continue').click();
    const enc = await page.evaluate(() => { const s = BF.app.state.session; return s.items[s.index].enc; });
    if (enc.id === 'X-R-V1-045' || enc.id === 'X-S-V1-045') return enc;
    await playEncounter({});
  }
  throw new Error('no Respectability check card in the session');
}
async function finishSession() {
  for (let i = 0; i < 6 && !(await has('text=Session complete')); i++) {
    while (await has('text=Thread revealed')) await btn('Continue').click();
    if (await has('text=Session complete')) break;
    await playEncounter({});
  }
  await page.waitForSelector('text=Session complete');
  await btn('Done').click();
}
const ANS1 = 'Trying to look proper so that people will protect you.';
const ANS2 = 'Pressure to meet standards set by people with more power, in hopes of being treated as worthy of protection or sympathy.';

// 1) First attempt: typed, one must-have covered → Partly
let enc = await toRespCheck();
await snap('check-think');
check(!(await has('text=Last time you said')) && !(await has('.check-chip')) && !(await has('.beat')), 'think screen: no previous answer, no chips, no verdict');
check(await btn('Type it').count() === 1 && await btn('Say it in your head').count() === 1, 'two ways in: Type it / Say it in your head');
await btn('Type it').click();
await page.locator('.yw-input').fill(ANS1);
check(!(await has('text=Last time you said')), 'no previous answer shown while typing');
const nBefore = await page.evaluate(() => BF.app.state.player.yourWords.length);
const k1 = (await st()).knowledge;
await btn('Save').click();
let bt = await beatNow();
check(bt.count === 1 && bt.name === 'yours' && (await page.textContent('.beat')).includes(ANS1), 'beat a: your answer, alone on screen');
check(!(await has('text=Last time you said')), 'first attempt: no "Last time you said"');
const saved1 = await page.evaluate(() => BF.app.state.player.yourWords.at(-1));
check(saved1 && saved1.text === ANS1 && saved1.prompt_type === 'explain' && saved1.answered_at > 0 && (await page.evaluate(() => BF.app.state.player.yourWords.length)) === nBefore + 1, 'typed answer saved with a date and its prompt type');
await snap('check-a-yours');
await btn('Continue').click();
bt = await beatNow();
const explText = (await page.textContent('.explanation')).trim();
check(bt.count === 1 && bt.name === 'explain' && explText === enc.reveal.trim(), 'beat b: the full explanation, word for word');
check((await page.textContent('.explanation .first-sentence')).length > 20 && !(await has('.check-chip')), 'first sentence bold; chips not shown yet');
await snap('check-b-explain');
await btn('Continue').click();
bt = await beatNow();
check(bt.count === 1 && bt.name === 'chips' && await page.locator('.check-chip').count() === 3, 'beat c: three must-have chips');
await page.locator('.check-chip').first().click();
check(await page.locator('.check-chip').first().getAttribute('aria-pressed') === 'true', 'tapping a chip marks it covered');
await snap('check-c-chips');
const tAnswer = Date.now();
await btn('Continue').click();
bt = await beatNow();
check(bt.name === 'mixup' && (await page.textContent('.beat')).includes('A common mix-up'), 'Partly → beat d: a common mix-up');
check(await page.locator('.beat').getAttribute('data-mixup') === 'criminalization', 'most relevant mix-up first (Respectability vs. Criminalization)');
check(await page.locator('#floats .float').count() === 0, 'no Knowledge animation on a check');
await snap('check-d-mixup');
await btn('See another mix-up').click();
check(await page.locator('.beat').getAttribute('data-mixup') === 'manners' && await btn('See another mix-up').count() === 0, '"See another mix-up" shows the second, then no more');
const after1 = await page.evaluate(() => ({ c: BF.app.state.player.checks.at(-1), n: BF.app.state.player.nodes['V1-045'], k: BF.app.state.player.knowledge }));
check(after1.c.verdict === 'partly' && after1.c.mode === 'typed' && after1.c.covered.join() === 'pressure' && after1.c.response_id === saved1.response_id, 'verdict "partly" stored with the answer it belongs to');
check(after1.n.lastResult === 'almost' && after1.n.nextReview <= tAnswer + 2 * 86400000 + 60000, 'Partly uses the ALMOST schedule (back within two days at most)');
const scheduledPartly = after1.n.nextReview - tAnswer;
const badWords = /\b(wrong|incorrect|score|percent|%|fail)/i;
check(!badWords.test(await page.textContent('main')), 'no "wrong", score or percentage on the check');
await btn('Continue').click();
check(!(await has('.beat')), 'Continue moves on to the next card');
await finishSession();

// 2) Reload; the answer persists and shows on the idea page timeline
await page.reload();
await page.goto(APP_URL + '#/idea/V1-045');
await page.waitForSelector('.yw');
await page.locator('.yw-toggle').click();
check((await page.textContent('.yw')).includes(ANS1), 'typed answer persists across reload and appears on the idea page');

// 3) Second attempt: "Last time you said" after submit; all chips → Got it, no mix-up
enc = await toRespCheck();
check(!(await has('text=Last time you said')), 'second attempt: previous answer hidden before submitting');
await btn('Type it').click();
await page.locator('.yw-input').fill(ANS2);
check(!(await has('text=Last time you said')), 'still hidden while typing');
await btn('Save').click();
const last = await page.textContent('.beat');
check(last.includes('Last time you said') && last.includes(ANS1) && last.includes(ANS2), 'after submit: "Last time you said" with the earlier answer');
check(/last time you said · [a-z]{3} \d{1,2}, \d{4}/i.test(await page.textContent('.beat-last-label')), '…with its date');
await snap('check-a-lasttime');
await btn('Continue').click();
await btn('Continue').click();
for (const chip of await page.locator('.check-chip').all()) await chip.click();
const idxBefore = (await st()).session.index;
const k2 = (await st()).knowledge;
const t2 = Date.now();
await btn('Continue').click();
await page.waitForTimeout(400);
const after2 = await page.evaluate(() => ({ c: BF.app.state.player.checks.at(-1), n: BF.app.state.player.nodes['V1-045'], k: BF.app.state.player.knowledge, idx: BF.app.state.session ? BF.app.state.session.index : -1 }));
check(after2.c.verdict === 'got' && !(await has('[data-beat="mixup"]')), 'Got it skips the mix-up beat');
check(after2.idx === idxBefore + 1, 'Got it goes straight to the next card');
check(after2.k - k2 === enc.points && await page.locator('#floats .float').count() === 0, 'Got it: the card’s usual points, no bonus, no animation (+' + (after2.k - k2) + ')');
check(after2.n.nextReview - t2 > scheduledPartly, 'Got it schedules later than Partly');
await finishSession();

// 4) Third attempt on phone: said in head, nothing covered → Missed
await page.setViewportSize({ width: 390, height: 844 });
enc = await toRespCheck();
if (await overflow()) overflowAt.push('think');
const yw3 = await page.evaluate(() => BF.app.state.player.yourWords.length);
await btn('Say it in your head').click();
bt = await beatNow();
check(bt.name === 'explain', 'Say it in your head: straight to the explanation (no answer beat)');
if (await overflow()) overflowAt.push('explain');
await btn('Continue').click();
if (await overflow()) overflowAt.push('chips');
await snap('mobile-check-chips');
const t3 = Date.now();
await btn('Continue').click();
bt = await beatNow();
if (await overflow()) overflowAt.push('mixup');
await snap('mobile-check-mixup');
const after3 = await page.evaluate(() => ({ c: BF.app.state.player.checks.at(-1), n: BF.app.state.player.nodes['V1-045'], yw: BF.app.state.player.yourWords.length }));
check(bt.name === 'mixup' && after3.c.verdict === 'missed' && after3.c.mode === 'head', 'Missed → mix-up shown; verdict stored as said-in-head');
check(after3.n.nextReview - t3 <= 15 * 60000, 'Missed brings the idea back within minutes');
check(after3.yw === yw3, 'nothing typed, nothing saved');
const chipW = await page.evaluate(() => [...document.querySelectorAll('.actions--beat .btn')].map((b) => b.getBoundingClientRect().width));
check(chipW.every((w) => w > 300), 'phone: beat buttons full width');
await btn('Continue').click();
await finishSession();
check(overflowAt.length === 0, 'no horizontal overflow on phone at any beat' + (overflowAt.length ? ': ' + overflowAt.join() : ''));
await page.setViewportSize({ width: 1280, height: 820 });

// 5) Reflective prompt: saved with a date, never checked
await page.goto(APP_URL + '#/idea/V1-045');
await page.waitForSelector('.yw');
check((await page.textContent('.yw')).includes('Who gets left out when dignity becomes a condition for sympathy?'), 'idea page shows the reflective prompt');
await page.getByRole('button', { name: 'Write an answer +' }).click();
await page.locator('.yw .yw-input').fill('People who could not, or would not, perform respectability.');
await page.locator('.yw').getByRole('button', { name: 'Save', exact: true }).click();
const refl = await page.evaluate(() => BF.app.state.player.yourWords.at(-1));
check(refl.prompt_type === 'reflective' && refl.answered_at > 0, 'reflective answer saved with a date');
check(!(await has('.check-chip')) && !(await has('.beat')) && !(await has('text=A common mix-up')), 'reflective prompt: no chips, mix-ups or verdict');
const checksNow = await page.evaluate(() => BF.app.state.player.checks.length);
check(checksNow - checksAtStart === 3, 'only the three explain attempts produced verdicts (+' + (checksNow - checksAtStart) + ')');
await page.locator('.yw-toggle').click();
const tl = await page.locator('.yw-entry .yw-text').allTextContents();
check(tl.length === 3 && tl[0].startsWith('People who could not') && tl[1] === ANS2 && tl[2] === ANS1, 'timeline: all answers, reflective included, newest first');
await snap('idea-timeline');
check(beatsSeen.slice(0, 4).join() === 'yours,explain,chips,mixup', 'beats in order, one per screen: ' + beatsSeen.join(' → '));

// 6) Reset clears answer history and verdicts
await page.goto(APP_URL + '#/settings');
await btn('Reset progress').click();
await btn('Erase progress').click();
await page.waitForSelector('.stats');
await page.reload();
await page.waitForSelector('.stats');
const cleared = await page.evaluate(async () => { const p = await BF.store.get('player'); return { yw: (p ? p.yourWords : []).length, ck: (p ? p.checks || [] : []).length, mem: BF.app.state.player.yourWords.length + BF.app.state.player.checks.length }; });
check(cleared.yw === 0 && cleared.ck === 0 && cleared.mem === 0, 'reset clears answer history and verdicts');
check(rhythmSeen.length >= 10 && rhythmSeen.every((r) => !r.bad), `writing rhythm held in all ${rhythmSeen.length} sessions started` + (rhythmSeen.some((r) => r.bad) ? ': ' + rhythmSeen.filter((r) => r.bad).map((r) => r.ids).join(' | ') : ''));

// V1.6 ART & DESIGN
console.log('V1.6 art & design');
const ART = ['CARD-07', 'CARD-08', 'CARD-09', 'CARD-10', 'CARD-11', 'CARD-12', 'CARD-13', 'CARD-14'];
const counts = await page.evaluate(() => { const C = BF.app.state.C; return { nodes: C.nodes.length, threads: C.threads.length, debates: C.debates.length, cards: C.deepening.length }; });
check(counts.nodes === 50 && counts.threads === 10 && counts.debates === 8 && counts.cards === 14, 'V1.6 content: 50 core · 10 threads · 8 debates · 14 deepening cards');
await page.goto(APP_URL + '#/settings');
await btn('Discover gradually').click();
let land = await (async () => { await page.goto(APP_URL + '#/explore'); await page.waitForSelector('.kmap'); return page.textContent('main'); })();
const t10Before = await page.evaluate(() => !!BF.app.state.player.threadsUnlocked['T-10']);
check(!t10Before && !land.includes('WHO DESIGNS THE WORLD?'), 'gradual: T-10 hidden until it unlocks');
check(!ART.some((id) => land.includes(id)) && (await page.locator('.kmap .is-card').count()) === 0, 'gradual: no deepening cards before they are met');
// Learn from here on Harlem Renaissance: needs Show everything to open an unmet idea.
await page.goto(APP_URL + '#/settings');
await btn('Show everything').click();
const kArt = (await st()).knowledge;
lf = await learnFrom('V1-026');
check(lf.session.kind === 'anchored' && lf.session.ids[0] === 'D029' && lf.session.ids.some((x) => /^D05[1-8]$/.test(x)), 'Learn from here: Harlem Renaissance reaches an art/design card (' + lf.session.ids.join(' → ') + ')');
await btn('Begin').click();
await playToEnd('lfh-hr');
await btn('Done').click();
const afterHR = await page.evaluate(() => ({ k: BF.app.state.player.knowledge, cards: ['CARD-07', 'CARD-08'].filter((x) => (BF.app.state.player.nodes[x] || {}).introduced), t10: !!BF.app.state.player.threadsUnlocked['T-10'] }));
check(afterHR.k > kArt && afterHR.cards.length >= 1, 'deepening cards are learned through play (' + afterHR.cards.join(', ') + ')');
await page.goto(APP_URL + '#/settings');
await btn('Discover gradually').click();
land = await (async () => { await page.goto(APP_URL + '#/explore'); await page.waitForSelector('.kmap'); return page.textContent('main'); })();
check(afterHR.t10 === land.includes('WHO DESIGNS THE WORLD?'), 'T-10 appears on EXPLORE exactly when unlocked (' + afterHR.t10 + ')');
const metTitles = await page.evaluate((ids) => ids.map((x) => BF.app.state.C.nodesById[x].subject), afterHR.cards);
check(land.includes('Deepening cards') && metTitles.every((x) => land.includes(x)), 'met cards are listed under Deepening cards: ' + metTitles.join(', '));
await page.goto(APP_URL + '#/world/CULTURE');
check(await page.locator('.kmap .is-card').count() === afterHR.cards.length, 'CULTURE map draws only the cards met so far');
await snap('v16-culture-gradual');
// Overview stays sparse: cards are never drawn on the whole map.
await page.goto(APP_URL + '#/explore');
check(await page.locator('.kmap--overview .is-card').count() === 0, 'overview map stays core-only (no card marks)');
const sparse = await page.evaluate(() => ({ drawn: document.querySelectorAll('.kmap--overview .medge').length, total: BF.app.state.G.edges.size }));
check(sparse.drawn < sparse.total / 2, `no spiderweb: ${sparse.drawn} of ${sparse.total} links drawn`);
// Show everything: all V1.6 content browsable.
await page.goto(APP_URL + '#/settings');
await btn('Show everything').click();
land = await (async () => { await page.goto(APP_URL + '#/explore'); await page.waitForSelector('.kmap'); return page.textContent('main'); })();
const titles = await page.evaluate(() => BF.app.state.C.cardNodes.map((c) => c.subject));
check(titles.every((x) => land.includes(x)) && land.includes('14 deepening cards'), 'Show everything lists all 8 art/design cards (14 deepening cards in all)');
await snap('v16-explore-all');
await page.goto(APP_URL + '#/thread/T-10');
const t10 = await page.textContent('main');
check(t10.includes('Who shapes the images, spaces, systems, platforms, and futures') && titles.every((x) => t10.includes(x)) && t10.includes('EVIDENCE AS RESISTANCE') && t10.includes('FIX IT OR END IT?'), 'T-10 view: question, cards on the path, links to T-03…D-08');
await snap('v16-t10');
for (const id of ART) {
  await page.goto(APP_URL + '#/idea/' + id);
  await page.waitForSelector('.hero');
  const txt = await page.textContent('main');
  if (!(txt.includes('Deepening card') && txt.includes('Keep this') && await btn('Learn from here').count() === 1)) check(false, id + ' page');
}
check(true, 'all 8 card pages browsable with KEEP THIS and Learn from here');
await page.goto(APP_URL + '#/debate/D-06');
check((await page.textContent('main')).includes('Who Is Black Art For?'), 'D-06 is deepened by Who Is Black Art For?');
await page.goto(APP_URL + '#/debate/D-08');
check((await page.textContent('main')).includes('Systems Are Designed Too'), 'D-08 is deepened by Systems Are Designed Too');
// Learn from here anchored on a card, played on a phone.
await page.setViewportSize({ width: 390, height: 844 });
lf = await learnFrom('CARD-11');
check(lf.session.ids[0] === 'D055', 'Learn from here: Systems Are Designed Too (' + lf.session.ids.join(' → ') + ')');
await btn('Begin').click();
let artOverflow = 0;
for (let i = 0; i < 7 && !(await has('text=Session complete')); i++) {
  while (await has('text=Thread revealed')) await btn('Continue').click();
  if (await has('text=Session complete')) break;
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) artOverflow++;
  const e = await page.evaluate(() => { const s = BF.app.state.session; return s.items[s.index].enc; });
  if (e.id === 'E085') { await snap('v16-mobile-E085'); check(/\?$/.test(await page.textContent('h1.question')), 'E085 asks a clear question'); }
  await playEncounter({});
}
await page.waitForSelector('text=Session complete');
await btn('Done').click();
check(artOverflow === 0, 'phone: no horizontal overflow on art/design cards');
const c11 = await page.evaluate(() => !!(BF.app.state.player.nodes['CARD-11'] || {}).introduced);
check(c11, 'Systems Are Designed Too learned through play');
await page.goto(APP_URL + '#/idea/CARD-11');
check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'phone: card page fits');
await snap('v16-mobile-card');
await page.goto(APP_URL + '#/explore');
await page.waitForSelector('.kmap');
check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'phone: EXPLORE with V1.6 content fits');
await page.setViewportSize({ width: 1280, height: 820 });
// Persistence: card progress and settings survive reload.
await page.reload();
await page.waitForSelector('.screen');
const kept = await page.evaluate(() => ({ c: !!(BF.app.state.player.nodes['CARD-11'] || {}).introduced, vis: BF.store.settings.get().mapVisibility }));
check(kept.c && kept.vis === 'all', 'card progress and settings survive reload');

check(badText.length === 0, 'no stray null/undefined text' + (badText.length ? ': ' + badText.join(' | ') : ''));
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
