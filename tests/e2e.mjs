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
check(mig.v === 4 && mig.savedV === 4, 'V1 save upgraded to the current schema (v4) and re-saved');
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
  return { v: p.version, k: p.knowledge, yw: JSON.stringify(p.yourWords) === JSON.stringify(snap.yourWords), words: Object.keys(p.words).sort().join(), backup: backup && backup.version === 3 && backup.yourWords.length === 2 };
});
check(m3.v === 4 && m3.k === 912, 'populated v3 save upgraded to v4 with Knowledge intact');
check(m3.yw, 'every YOUR WORDS field preserved exactly through the v3→v4 migration');
check(m3.words === 'W001,W013', 'found WORDS remapped to the V1.5 quote ids (' + m3.words + ')');
check(m3.backup, 'untouched v3 backup kept');
await page.goto(APP_URL + '#/idea/V1-010');
const ywMigrated = await page.textContent('.yw');
check(ywMigrated.includes('Owning the paper meant owning the story.') && ywMigrated.includes('EDITED'), 'migrated note (with its edit date) shows on its idea page');
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
check(s1.modes.map((m) => m.id).join() === 'D001,D002,E002,D004,E006,E010', 'starter 1 plays the curated flow');
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
// YOUR WORDS on the idea page: view, add, expand, edit, delete (with confirm), persist
await page.goto(APP_URL + '#/idea/V1-032');
await page.waitForSelector('.yw');
check((await page.textContent('.yw')).includes(NOTE) && (await page.textContent('.yw')).includes('Your words · 1'), 'note from play appears on its idea page');
await page.getByRole('button', { name: 'Add a new note +' }).click();
await page.locator('.yw .yw-input').fill('Second pass: rules and reality move at different speeds.');
await page.locator('.yw').getByRole('button', { name: 'Save', exact: true }).click();
check((await page.textContent('.yw')).includes('Your words · 2') && (await page.textContent('.yw')).includes('Show 1 earlier +'), 'new note added; older one folded away');
await page.getByRole('button', { name: 'Show 1 earlier +' }).click();
await snap('yourwords-idea');
await page.locator('.yw-entry').first().getByRole('button', { name: /^Edit/ }).click();
await page.locator('.yw .yw-input').fill('Second pass, edited.');
await page.locator('.yw').getByRole('button', { name: 'Save', exact: true }).click();
check((await page.textContent('.yw')).includes('Second pass, edited.') && (await page.textContent('.yw')).includes('EDITED'), 'note edited');
await page.locator('.yw-entry').first().getByRole('button', { name: /^Delete/ }).click();
check((await page.textContent('.yw')).includes('Delete this note?'), 'delete asks for confirmation');
await page.locator('.yw').getByRole('button', { name: 'Keep' }).click();
check((await page.textContent('.yw')).includes('Second pass, edited.'), 'cancelling keeps the note');
await page.locator('.yw-entry').first().getByRole('button', { name: /^Delete/ }).click();
await page.locator('.yw').getByRole('button', { name: 'Delete', exact: true }).click();
await page.waitForFunction(async () => ((await BF.store.get('player')).yourWords || []).length === 1);
await page.reload();
await page.waitForSelector('.yw');
const ywText = await page.textContent('.yw');
check(ywText.includes('Your words · 1') && ywText.includes(NOTE) && !ywText.includes('Second pass'), 'notes survive reload; deletion persisted');
const kNow = await page.evaluate(() => BF.app.state.player.knowledge);
check(kNow === 65, 'notes never change Knowledge (' + kNow + ')');
await page.goto(APP_URL + '#/idea/V1-019');
check((await page.textContent('.yw')).includes('No notes yet.'), 'empty state reads "No notes yet."');
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
await page.goto(APP_URL + '#/thread/T-02');
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
    n += await page.locator('.rows .row').count();
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
check(allLanding.threads === 9 && allLanding.debates === 8, `Show everything lists 9 threads and 8 debates (${allLanding.threads}/${allLanding.debates})`);
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
  await page.waitForSelector('text=Begin');
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

check(badText.length === 0, 'no stray null/undefined text' + (badText.length ? ': ' + badText.join(' | ') : ''));
check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
