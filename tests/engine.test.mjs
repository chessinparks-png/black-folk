// Headless checks of the session engine: `npm test`.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
require('../app/data/content.js');
require('../app/js/content.js');
require('../app/js/mastery.js');
require('../app/js/graph.js');
require('../app/js/session.js');
const { content, mastery: M, session: S, graph: GR } = globalThis.BF;
const C = content.load();

let failures = 0;
function test(name, fn) {
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { failures++; console.log('  ✗ ' + name + '\n    ' + e.message); }
}

function answerAll(player, session, mode, rng, now) {
  while (session.index < session.items.length) {
    const it = session.items[session.index];
    const e = it.enc;
    const good = mode === 'good' || (mode === 'random' && rng() < 0.7);
    let resp = {};
    if (e.kind === 'choice') resp = { choice: good ? e.correct : e.choices.find((c) => c !== e.correct) };
    if (e.kind === 'recall') resp = { rating: good ? 'knew' : rng() < 0.5 ? 'almost' : 'missed' };
    if (e.kind === 'share') resp = { rating: good ? 'clear' : rng() < 0.5 ? 'almost' : 'needs' };
    if (e.kind === 'timeline') resp = { order: good ? e.items.map((_, i) => i) : it.order };
    if (e.kind === 'match') resp = { pairs: Object.fromEntries(e.pairs.map((_, i) => [i, good ? i : (i + 1) % e.pairs.length])) };
    S.applyResult(C, player, session, S.evaluate(e, resp, player), now);
    session.index++;
  }
  return S.finish(C, player, session, now);
}

function maxChoiceRun(items) {
  let run = 0, max = 0;
  for (const it of items) { run = it.enc.kind === 'choice' ? run + 1 : 0; max = Math.max(max, run); }
  return max;
}

console.log('content');
test('44 nodes, 40 encounters, 8 discovery cards, 3 starters', () => {
  assert.equal(C.nodes.length, 44);
  assert.equal(C.encounters.length, 40);
  assert.equal(C.discovery.length, 8);
  assert.equal(C.starters.length, 3);
});
test('timeline and match are split into items/pairs', () => {
  assert.deepEqual(C.byId.E018.items.length, 4);
  assert.equal(C.byId.E040.pairs.length, 4);
});

console.log('starters');
test('starter sessions keep curated content and fix pacing', () => {
  const p = M.newPlayer();
  const s1 = S.buildStarter(C, p, 0, 1);
  assert.deepEqual(s1.items.map((i) => i.enc.id), ['D001', 'D002', 'E002', 'D004', 'E006', 'E010']);
  const s2 = S.buildStarter(C, p, 1, 1);
  assert.deepEqual(s2.items.map((i) => i.enc.id).sort(), ['D005', 'E005', 'E014', 'E007', 'E027', 'E018'].sort());
  assert.ok(maxChoiceRun(s2.items) <= 2, 's2 has >2 choice screens in a row');
  const s3 = S.buildStarter(C, p, 2, 1);
  assert.deepEqual(s3.items.map((i) => i.enc.id), ['D006', 'E004', 'D003', 'E014', 'E034', 'E039']);
});
test('starter 1 awards 55 Knowledge + WORDS when all correct', () => {
  // 3 DISCOVER × 5 + WHO 10 + WHAT 10 + RECALL 20 = 55, plus 2 WORDS found × 5.
  const p = M.newPlayer();
  const sum = answerAll(p, S.buildNext(C, p, { seed: 1 }), 'good');
  assert.deepEqual(sum.words.sort(), ['W-01', 'W-11']);
  assert.equal(sum.knowledge, 65);
  assert.equal(p.knowledge, 65);
  assert.equal(p.startersCompleted, 1);
  assert.equal(sum.keepThis, 'History changes when you change who gets to define the story.');
});
test('misses earn 0, never subtract, and return sooner', () => {
  const p = M.newPlayer();
  p.knowledge = 400;
  const s = S.buildStarter(C, p, 0, 1);
  const now = Date.now();
  answerAll(p, s, 'bad', () => 0.9, now); // every graded answer wrong / MISSED IT
  // Only ungraded discovery (3 × 5) and WORDS found (2 × 5) pay.
  assert.equal(p.knowledge, 400 + 15 + 10);
  const du = p.nodes['V1-019']; // missed WHO
  assert.equal(du.lastResult, 'miss');
  assert.ok(du.nextReview - now <= 15 * 60 * 1000);
});
test('ALMOST returns sooner than KNEW IT', () => {
  const a = M.newPlayer(), b = M.newPlayer(), now = Date.now();
  M.recordEncounter(a, C.byId.E020, 0.5, now);
  M.recordEncounter(b, C.byId.E020, 1, now);
  assert.ok(a.nodes['V1-024'].nextReview < b.nodes['V1-024'].nextReview);
});
test('recognition alone cannot push review far away', () => {
  const p = M.newPlayer(); let now = Date.now();
  for (let i = 0; i < 8; i++) { M.recordEncounter(p, C.byId.E007, 1, now); now += 10 * M.DAY; }
  assert.ok(p.nodes['V1-018'].interval <= M.CONFIG.recognitionOnlyCapDays);
  assert.notEqual(M.label(p, 'V1-018'), 'STRONG');
});

console.log('scoring');
test('objective: correct = full, wrong = 0', () => {
  assert.equal(S.evaluate(C.byId.E006, { choice: C.byId.E006.correct }).points, 10);
  assert.equal(S.evaluate(C.byId.E006, { choice: 'the first federal voting law' }).points, 0);
  assert.equal(S.evaluate(C.byId.E034, { choice: C.byId.E034.correct }).points, 25);
});
test('RECALL: KNEW IT full, ALMOST half, MISSED IT 0', () => {
  const e = C.byId.E020; // 20 points
  assert.equal(S.evaluate(e, { rating: 'knew' }).points, 20);
  assert.equal(S.evaluate(e, { rating: 'almost' }).points, 10);
  assert.equal(S.evaluate(e, { rating: 'missed' }).points, 0);
});
test('SHARE: CLEAR full, ALMOST half (rounded), NEEDS WORK 0', () => {
  const e = C.byId.E031; // 25 points
  assert.equal(S.evaluate(e, { rating: 'clear' }).points, 25);
  assert.equal(S.evaluate(e, { rating: 'almost' }).points, 13);
  assert.equal(S.evaluate(e, { rating: 'needs' }).points, 0);
});
test('DISCOVER pays +5 only the first time', () => {
  const p = M.newPlayer();
  assert.equal(S.evaluate(C.byId.D001, {}, p).points, 5);
  M.recordEncounter(p, C.byId.D001, 1);
  assert.equal(S.evaluate(C.byId.D001, {}, p).points, 0);
});
test('TIMELINE / MATCH: full points only when fully correct', () => {
  const t = C.byId.E018;
  assert.equal(S.evaluate(t, { order: [0, 1, 2, 3] }).points, 15);
  assert.equal(S.evaluate(t, { order: [0, 1, 3, 2] }).points, 0);
  const m = C.byId.E040;
  assert.equal(S.evaluate(m, { pairs: { 0: 0, 1: 1, 2: 2, 3: 3 } }).points, 50);
  assert.equal(S.evaluate(m, { pairs: { 0: 0, 1: 1, 2: 3, 3: 2 } }).points, 0);
});

console.log('words');
test('WORDS bank loads verbatim (23 quotes, exact text + speaker)', () => {
  assert.equal(C.words.length, 23);
  const w = C.wordsById['W-01'];
  assert.equal(w.text, 'We wish to plead our own cause');
  assert.equal(w.speaker, 'Freedom’s Journal editors');
  assert.equal(C.wordsById['W-21'].text, 'they would cease to measure others always in terms of their ‘differences in color,’');
});
test('a quotation pays +5 once, then never again', () => {
  const p = M.newPlayer(); const rng = S.makeRng(2);
  const s = S.buildStarter(C, p, 0, 1);
  answerAll(p, s, 'good', rng);
  const k = p.knowledge;
  const again = S.buildStarter(C, p, 0, 1); // replay the same cards
  again.items.forEach((it) => { if (it.enc.id === 'D004') it.quoteId = 'W-01'; });
  const foundAt = p.words['W-01'].at;
  const sum = answerAll(p, again, 'good', rng);
  // Replay pays graded answers (10+10+20) and only quotations that are new (Du Bois's
  // second quote attaches this time); DISCOVER and W-01 pay nothing again.
  assert.ok(!sum.words.includes('W-01'));
  assert.equal(p.words['W-01'].at, foundAt);
  assert.equal(p.knowledge - k, 40 + 5 * sum.words.length);
});

console.log('map');
test('graph is built from real relationships and starts hidden', () => {
  const G = GR.build(C);
  console.log('    edges in graph:', G.edges.size);
  const p = M.newPlayer();
  assert.equal(GR.visibleEdges(G, p).length, 0);
  assert.equal(GR.nodeState(G, p, 'V1-010'), 'locked');
});
test('connections reveal gradually, never all at once', () => {
  const G = GR.build(C);
  const p = M.newPlayer(); const rng = S.makeRng(4); let now = Date.now();
  const counts = [];
  for (let i = 0; i < 3; i++) { answerAll(p, S.buildNext(C, p, { seed: i + 1 }), 'good', rng, now); counts.push(GR.visibleEdges(C.graph, p).length); }
  for (let k = 0; k < 6; k++) { now += M.DAY; answerAll(p, S.buildNext(C, p, { seed: 20 + k, now }), 'good', rng, now); counts.push(GR.visibleEdges(C.graph, p).length); }
  console.log('    visible links after each session:', counts.join(' → '), 'of', G.edges.size);
  assert.ok(counts[0] < counts[counts.length - 1]);
  assert.ok(counts[counts.length - 1] < G.edges.size);
  assert.equal(GR.nodeState(G, p, 'V1-044') === 'locked' || M.isSeen(p, 'V1-044'), true);
});
test('v1 saves migrate without losing anything', () => {
  const p = M.newPlayer(); const rng = S.makeRng(5);
  answerAll(p, S.buildNext(C, p, { seed: 1 }), 'good', rng);
  const v1 = JSON.parse(JSON.stringify(p));
  v1.version = 1; delete v1.map; delete v1.words; v1.knowledge = 1234;
  const { player, migrated } = M.migrate(JSON.parse(JSON.stringify(v1)));
  GR.backfill(C, GR.build(C), player);
  assert.ok(migrated);
  assert.equal(player.version, 2);
  assert.equal(player.knowledge, 1234);
  assert.deepEqual(player.nodes, v1.nodes);
  assert.deepEqual(player.history, v1.history);
  assert.equal(player.startersCompleted, 1);
  assert.ok(Object.keys(player.map.nodes).length >= 4);
});

console.log('adaptive');
test('after onboarding, 40 simulated sessions obey the rules', () => {
  const p = M.newPlayer();
  const rng = S.makeRng(7);
  let now = Date.now();
  for (let i = 0; i < 3; i++) answerAll(p, S.buildNext(C, p, { seed: i + 1 }), 'good', rng, now);
  assert.equal(p.startersCompleted, 3);
  const kinds = new Set();
  for (let k = 0; k < 40; k++) {
    now += 0.4 * M.DAY;
    const introducedBefore = new Set(Object.keys(p.nodes).filter((id) => p.nodes[id].introduced));
    const s = S.buildNext(C, p, { seed: 100 + k, now });
    assert.equal(s.kind, 'adaptive');
    assert.equal(s.items.length, 6, 'session ' + k + ' has ' + s.items.length + ' items');
    assert.equal(new Set(s.items.map((i) => i.enc.id)).size, 6, 'duplicate encounter');
    assert.ok(maxChoiceRun(s.items) <= 2, 'choice run > 2 in session ' + k);
    const introducedHere = new Set();
    for (const it of s.items) {
      kinds.add(it.enc.mode);
      if (it.enc.kind === 'discover') { it.enc.nodeIds.forEach((id) => introducedHere.add(id)); continue; }
      const known = (id) => introducedBefore.has(id) || introducedHere.has(id);
      const min = C.bossMinNodes[it.enc.id];
      if (min) assert.ok(it.enc.nodeIds.filter(known).length >= min);
      else assert.ok(it.enc.nodeIds.every(known), it.enc.id + ' before its ideas were introduced');
      if (it.enc.debateId) assert.ok(it.enc.nodeIds.every(known));
    }
    answerAll(p, s, 'random', rng, now);
  }
  console.log('    modes seen:', [...kinds].join(', '));
  console.log('    introduced:', Object.values(p.nodes).filter((n) => n.introduced).length, '/ 44 · threads:',
    Object.keys(p.threadsUnlocked).length, '· debates:', Object.keys(p.debatesUnlocked).length, '· LVL', p.level, p.knowledge);
  for (const m of ['DISCOVER', 'RECALL', 'SHARE', 'TIMELINE', 'MATCH', 'SAME QUESTION', 'THEN → NOW', 'WHY THEN', 'CONNECT'])
    assert.ok(kinds.has(m), 'never saw ' + m);
});
test('missed idea shows up in the next adaptive session', () => {
  const p = M.newPlayer(); const rng = S.makeRng(3); let now = Date.now();
  for (let i = 0; i < 3; i++) answerAll(p, S.buildNext(C, p, { seed: i + 1 }), 'good', rng, now);
  now += 5 * M.DAY;
  M.recordEncounter(p, C.byId.E006, 0, now); // miss Freedom's Journal
  const s = S.buildNext(C, p, { seed: 9, now: now + 20 * 60 * 1000 });
  assert.ok(s.items.some((i) => i.enc.nodeIds.includes('V1-010')), 'missed idea not reviewed');
});
test('threads unlock gradually; LEVERAGE opens during starter 3', () => {
  const p = M.newPlayer(); const rng = S.makeRng(3);
  answerAll(p, S.buildNext(C, p, { seed: 1 }), 'good', rng);
  assert.equal(Object.keys(p.threadsUnlocked).length, 0);
  answerAll(p, S.buildNext(C, p, { seed: 2 }), 'good', rng);
  const s3 = answerAll(p, S.buildNext(C, p, { seed: 3 }), 'good', rng);
  assert.ok(s3.threads.includes('T-02'), 'LEVERAGE not revealed: ' + s3.threads);
});
test('debates stay locked until both sides are introduced', () => {
  const p = M.newPlayer();
  assert.deepEqual(M.updateUnlocks(C, p).debates, []);
  M.recordEncounter(p, C.byId.D003, 1);
  assert.ok(!M.updateUnlocks(C, p).debates.includes('D-03'));
});
test('levels: 2,480 Knowledge is LVL 12', () => {
  assert.equal(M.levelFor(0), 1);
  assert.equal(M.levelFor(2480), 12);
});

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
