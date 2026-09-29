// Headless checks of the session engine: `npm test`.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
require('../app/data/content.js');
require('../app/js/content.js');
require('../app/js/mastery.js');
require('../app/js/session.js');
const { content, mastery: M, session: S } = globalThis.BF;
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
    S.applyResult(C, player, session, S.evaluate(e, resp), now);
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
test('starter 1 awards 70 Knowledge when all correct', () => {
  const p = M.newPlayer();
  const sum = answerAll(p, S.buildNext(C, p, { seed: 1 }), 'good');
  assert.equal(sum.knowledge, 70);
  assert.equal(p.knowledge, 70);
  assert.equal(p.startersCompleted, 1);
  assert.equal(sum.keepThis, 'History changes when you change who gets to define the story.');
});
test('misses never subtract Knowledge and return sooner', () => {
  const p = M.newPlayer();
  const s = S.buildStarter(C, p, 0, 1);
  const now = Date.now();
  answerAll(p, s, 'bad', Math.random, now);
  assert.ok(p.knowledge > 0);
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
