// Headless checks of the session engine: `npm test`.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
require('../app/data/content.js');
require('../app/js/content.js');
require('../app/js/mastery.js');
require('../app/js/graph.js');
require('../app/js/notes.js');
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
    if (e.kind === 'choice' || e.kind === 'binary') resp = { choice: good ? e.correct : e.choices.find((c) => c !== e.correct) };
    if (e.kind === 'sort') resp = { bins: Object.fromEntries(e.items.map((it, i) => [i, good ? it.bin : e.bins.find((b) => b !== it.bin)])) };
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
test('V1.5: 50 nodes, 80 encounters + 50 DISCOVER = 130, 9 threads, 8 debates, 5 bridges', () => {
  assert.equal(C.nodes.length, 50);
  assert.equal(C.encounters.length, 80);
  assert.equal(C.discovery.length, 50);
  assert.equal(C.encounters.length + C.discovery.length, 130);
  assert.equal(C.threads.length, 9);
  assert.equal(C.debates.length, 8);
  assert.equal(C.starters.length, 3);
  assert.equal(C.bridges.length, 5);
  assert.deepEqual(C.threads.map((t) => t.title), ['LEAVE · REFORM · BUILD', 'LEVERAGE', 'EVIDENCE AS RESISTANCE', 'WHAT IS EDUCATION FOR?', 'WHO BUILT IT?', 'WHO DEFINES BLACKNESS?', 'LEGAL VICTORY · LIVED REALITY', 'BLACKNESS ACROSS BORDERS', 'RESPECTABILITY ↔ REFUSAL']);
  for (const id of ['V1-045', 'V1-046', 'V1-047', 'V1-048', 'V1-049', 'V1-050']) assert.ok(C.nodesById[id], id);
  assert.equal(new Set(C.discovery.map((d) => d.nodeIds[0])).size, 50, 'every node has a DISCOVER card');
});
test('Linked Fate, Post-Race and Diaspora are not core nodes; WHO IS “WE”? is not a thread/node', () => {
  const names = C.nodes.map((n) => n.subject.toLowerCase());
  for (const bad of ['linked fate', 'post-race', 'diaspora']) assert.ok(!names.some((x) => x.includes(bad)), bad);
  assert.ok(!C.threads.some((t) => /WHO IS/.test(t.title)));
  assert.ok(!C.nodes.some((n) => /WHO IS/.test(n.subject)));
  assert.ok(C.deepening.some((c) => c.title === 'Diaspora' && c.home === 'T-08'));
});
test('interaction balance: conventional four-option screens are the exception', () => {
  const forms = {};
  for (const e of C.encounters.concat(C.discovery)) { const f = e.form || e.kind; forms[f] = (forms[f] || 0) + 1; }
  const conventional = forms.conventional || 0;
  console.log('    forms:', JSON.stringify(forms));
  assert.ok(conventional / 130 <= 0.3, 'too many conventional screens');
  assert.ok((conventional + (forms.pick || 0)) / 130 <= 0.3, 'too many choice-list screens');
  for (const e of C.encounters) if (e.kind === 'binary' || e.form === 'pick') assert.ok(e.choices.includes(e.correct), e.id);
});
test('every node is discoverable and has an active encounter', () => {
  const active = new Set(C.encounters.flatMap((e) => e.nodeIds));
  for (const n of C.nodes) assert.ok(active.has(n.id), n.id + ' has no active encounter');
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
  assert.deepEqual(sum.words.sort(), ['W001', 'W011']);
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
  assert.equal(C.wordsById['W001'].source, 'Four Hundred Souls');
  const w = C.wordsById['W001'];
  assert.equal(w.text, 'We wish to plead our own cause');
  assert.equal(w.speaker, 'Freedom’s Journal editors');
  assert.equal(C.wordsById['W021'].text, 'they would cease to measure others always in terms of their ‘differences in color,’');
});
test('a quotation pays +5 once, then never again', () => {
  const p = M.newPlayer(); const rng = S.makeRng(2);
  const s = S.buildStarter(C, p, 0, 1);
  answerAll(p, s, 'good', rng);
  const k = p.knowledge;
  const again = S.buildStarter(C, p, 0, 1); // replay the same cards
  again.items.forEach((it) => { if (it.enc.id === 'D004') it.quoteId = 'W001'; });
  const foundAt = p.words['W001'].at;
  const sum = answerAll(p, again, 'good', rng);
  // Replay pays graded answers (10+10+20) and only quotations that are new (Du Bois's
  // second quote attaches this time); DISCOVER and W-01 pay nothing again.
  assert.ok(!sum.words.includes('W001'));
  assert.equal(p.words['W001'].at, foundAt);
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
  assert.equal(player.version, 4);
  assert.deepEqual(player.yourWords, []);
  assert.equal(player.knowledge, 1234);
  assert.deepEqual(player.nodes, v1.nodes);
  assert.deepEqual(player.history, v1.history);
  assert.equal(player.startersCompleted, 1);
  assert.ok(Object.keys(player.map.nodes).length >= 4);
});

console.log('your words');
test('notes save, edit, delete; newest first; earn no Knowledge', () => {
  const N = globalThis.BF.notes;
  const p = M.newPlayer();
  const k = p.knowledge;
  const a = N.add(p, { nodeIds: ['V1-019'], encounterId: 'X-R-V1-019', text: '  Seeing yourself twice. ', prompt: 'Explain it', model: 'Du Bois…' }, 1000);
  const b = N.add(p, { nodeIds: ['V1-019'], text: 'Later, a fuller view.' }, 2000);
  assert.equal(N.add(p, { nodeIds: ['V1-019'], text: '   ' }), null, 'empty notes are not saved');
  for (const f of ['response_id', 'node_id', 'encounter_id', 'text', 'created_at', 'prompt', 'model_answer_snapshot']) assert.ok(f in a, f);
  assert.equal(a.text, 'Seeing yourself twice.');
  assert.deepEqual(N.forNode(p, 'V1-019').map((r) => r.response_id), [b.response_id, a.response_id]);
  N.update(p, a.response_id, 'Revised.', 3000);
  assert.equal(a.text, 'Revised.');
  assert.equal(a.updated_at, 3000);
  assert.ok(N.remove(p, b.response_id));
  assert.equal(N.forNode(p, 'V1-019').length, 1);
  assert.equal(p.knowledge, k);
});
test('v3 saves (with YOUR WORDS) upgrade to v4 losslessly; quote ids remapped', () => {
  const N = globalThis.BF.notes;
  const p = M.newPlayer(); const rng = S.makeRng(12);
  answerAll(p, S.buildNext(C, p, { seed: 1 }), 'good', rng);
  N.add(p, { nodeIds: ['V1-032', 'V1-015'], encounterId: 'E010', text: 'Rules move faster than reality.', prompt: 'p', model: 'm' }, 1111);
  N.update(p, p.yourWords[0].response_id, 'Rules move faster than reality, edited.', 2222);
  const v3 = JSON.parse(JSON.stringify(p));
  v3.version = 3; delete v3.bridgesCompleted;
  v3.words = { 'W-01': { at: 5, encounterId: 'D004' }, 'W-11': { at: 6, encounterId: 'D002' } };
  v3.history[0].words = ['W-11', 'W-01'];
  const snapshot = JSON.parse(JSON.stringify(v3));
  const { player, migrated } = M.migrate(JSON.parse(JSON.stringify(v3)));
  assert.ok(migrated);
  assert.equal(player.version, 4);
  assert.deepEqual(player.yourWords, snapshot.yourWords, 'YOUR WORDS preserved exactly');
  assert.deepEqual(Object.keys(player.words).sort(), ['W001', 'W011']);
  assert.equal(player.words.W001.at, 5);
  assert.deepEqual(player.history[0].words, ['W011', 'W001']);
  for (const k of ['knowledge', 'nodes', 'map', 'encounters', 'threadsUnlocked', 'debatesUnlocked', 'ratings', 'startersCompleted']) assert.deepEqual(player[k], snapshot[k], k);
  assert.deepEqual(player.bridgesCompleted, []);
  const sess = M.migrateSession({ items: [{ quoteId: 'W-12', enc: { id: 'X-WM-W-12', quoteId: 'W-12' } }], wordsFound: ['W-12'], results: [] });
  assert.equal(sess.items[0].quoteId, 'W012');
  assert.equal(sess.items[0].enc.id, 'X-WM-W012');
});
test('v2 saves gain YOUR WORDS without losing map, WORDS or history', () => {
  const p = M.newPlayer(); const rng = S.makeRng(8);
  answerAll(p, S.buildNext(C, p, { seed: 1 }), 'good', rng);
  const v2 = JSON.parse(JSON.stringify(p));
  v2.version = 2; delete v2.yourWords;
  const { player } = M.migrate(JSON.parse(JSON.stringify(v2)));
  assert.equal(player.version, 4);
  assert.deepEqual(player.yourWords, []);
  assert.equal(player.knowledge, v2.knowledge);
  assert.deepEqual(player.nodes, v2.nodes);
  assert.deepEqual(player.map, v2.map);
  assert.deepEqual(player.words, v2.words);
  assert.deepEqual(player.history, v2.history);
});

console.log('adaptive');
test('after onboarding, 40 simulated sessions obey the rules', () => {
  const p = M.newPlayer();
  const rng = S.makeRng(7);
  let now = Date.now();
  for (let i = 0; i < 3; i++) answerAll(p, S.buildNext(C, p, { seed: i + 1 }), 'good', rng, now);
  assert.equal(p.startersCompleted, 3);
  const kinds = new Set();
  const kindsSeen = [];
  for (let k = 0; k < 50; k++) {
    now += 0.4 * M.DAY;
    const introducedBefore = new Set(Object.keys(p.nodes).filter((id) => p.nodes[id].introduced));
    const s = S.buildNext(C, p, { seed: 100 + k, now });
    kindsSeen.push(s.kind === 'bridge' ? s.bridgeId : s.kind);
    if (s.kind === 'bridge') { answerAll(p, s, 'random', rng, now); continue; }
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
  console.log('    first sessions after onboarding:', kindsSeen.slice(0, 10).join(' → '));
  assert.deepEqual(kindsSeen.filter((k) => /^S0/.test(k)), ['S04', 'S05', 'S06', 'S07', 'S08'], 'all five bridges surface, in order');
  assert.equal(kindsSeen[1], 'adaptive', 'bridges alternate with review sessions');
  console.log('    introduced:', Object.values(p.nodes).filter((n) => n.introduced).length, '/ 50 · threads:',
    Object.keys(p.threadsUnlocked).length, '· debates:', Object.keys(p.debatesUnlocked).length, '· LVL', p.level, p.knowledge);
  assert.equal(Object.values(p.nodes).filter((n) => n.introduced).length, 50, 'all 50 nodes discovered through play');
  assert.equal(Object.keys(p.threadsUnlocked).length, 9);
  assert.equal(Object.keys(p.debatesUnlocked).length, 8);
  for (const m of ['DISCOVER', 'RECALL', 'SHARE', 'TIMELINE', 'MATCH', 'SAME QUESTION', 'THEN → NOW', 'CONNECT', 'WORDS'])
    assert.ok(kinds.has(m), 'never saw ' + m);
});
test('missed idea shows up in the next adaptive session', () => {
  const p = M.newPlayer(); const rng = S.makeRng(3); let now = Date.now();
  for (let i = 0; i < 3; i++) answerAll(p, S.buildNext(C, p, { seed: i + 1 }), 'good', rng, now);
  now += 5 * M.DAY;
  M.recordEncounter(p, C.byId.E006, 0, now); // miss Freedom's Journal
  const s = S.buildAdaptive(C, p, { seed: 9, now: now + 20 * 60 * 1000 });
  assert.ok(s.items.some((i) => i.enc.nodeIds.includes('V1-010')), 'missed idea not reviewed');
});
test('threads unlock gradually (never more than two per session)', () => {
  const p = M.newPlayer(); const rng = S.makeRng(3); let now = Date.now();
  const perSession = [];
  for (let i = 0; i < 12; i++) { now += M.DAY; perSession.push(answerAll(p, S.buildNext(C, p, { seed: i + 1, now }), 'good', rng, now).threads.length); }
  assert.equal(perSession[0], 0, 'no thread in the first session');
  assert.ok(perSession.every((n) => n <= 2), 'too many at once: ' + perSession);
  assert.ok(perSession.reduce((a, b) => a + b, 0) >= 5, 'threads should be appearing');
});
test('bridge sessions follow onboarding and keep their curated flow', () => {
  const p = M.newPlayer(); const rng = S.makeRng(21);
  for (let i = 0; i < 3; i++) answerAll(p, S.buildNext(C, p, { seed: i + 1 }), 'good', rng);
  const b = S.buildNext(C, p, { seed: 9 });
  assert.equal(b.kind, 'bridge');
  assert.equal(b.title, 'WHO GETS CALLED DANGEROUS?');
  assert.deepEqual(b.items.map((i) => i.enc.id).sort(), ['D049', 'E068', 'D045', 'E058', 'E057', 'E076'].sort());
  const sum = answerAll(p, b, 'good', rng);
  assert.equal(sum.keepThis, 'Before punishment or protection, ask who was defined as dangerous—or worthy.');
  assert.ok(p.threadsUnlocked['T-09'], 'RESPECTABILITY ↔ REFUSAL surfaces with the bridge');
  assert.ok(sum.threads.includes('T-09'));
  assert.equal(S.buildNext(C, p, { seed: 10 }).kind, 'adaptive');
});
test('D-08 FIX IT OR END IT? needs Abolition and Criminalization introduced', () => {
  const p = M.newPlayer();
  M.recordEncounter(p, C.byId.D046, 1);
  assert.ok(!M.updateUnlocks(C, p).debates.includes('D-08'));
  M.recordEncounter(p, C.byId.D049, 1);
  assert.ok(M.updateUnlocks(C, p).debates.includes('D-08'));
});
test('binary and sort score like any objective question', () => {
  const b = C.byId.E063;
  assert.equal(S.evaluate(b, { choice: 'No' }).points, b.points);
  assert.equal(S.evaluate(b, { choice: 'Yes' }).points, 0);
  const so = C.byId.E069;
  const right = Object.fromEntries(so.items.map((it, i) => [i, it.bin]));
  assert.equal(S.evaluate(so, { bins: right }).points, so.points);
  assert.equal(S.evaluate(so, { bins: Object.assign({}, right, { 0: so.bins[1] }) }).points, 0);
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
