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
require('../app/js/encounters.js');
const { content, mastery: M, session: S, graph: GR } = globalThis.BF;
const BF_CONTENT = globalThis.BF_CONTENT;
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
test('V1.6: 50 core nodes, 10 threads, 8 debates, 14 deepening cards, 5 bridges', () => {
  assert.equal(C.nodes.length, 50);
  assert.ok(C.nodes.every((n) => /^V1-0\d\d$/.test(n.id) && !n.isCard), 'no deepening card counted as a core node');
  assert.equal(C.encounters.length, 88, '80 V1.5 encounters + 8 art/design');
  assert.equal(C.discovery.length, 58, '50 core DISCOVER + 8 card DISCOVER');
  assert.equal(C.threads.length, 10);
  assert.equal(C.deepening.length, 14);
  assert.deepEqual(C.deepening.map((c) => c.id), Array.from({ length: 14 }, (_, i) => 'CARD-' + String(i + 1).padStart(2, '0')));
  assert.deepEqual(C.cardNodes.map((c) => c.id), ['CARD-07', 'CARD-08', 'CARD-09', 'CARD-10', 'CARD-11', 'CARD-12', 'CARD-13', 'CARD-14']);
  assert.deepEqual(C.deepening.slice(6).map((c) => c.title), ['Who Controls the Image?', 'Who Is Black Art For?', 'Art as Evidence', 'The Artist as Organizer', 'Systems Are Designed Too', 'Design as Care', 'Who Owns the Platform?', 'Who Gets to Imagine the Future?']);
  assert.equal(C.debates.length, 8);
  assert.equal(C.starters.length, 3);
  assert.equal(C.bridges.length, 5);
  assert.deepEqual(C.threads.map((t) => t.title), ['LEAVE · REFORM · BUILD', 'LEVERAGE', 'EVIDENCE AS RESISTANCE', 'WHAT IS EDUCATION FOR?', 'WHO BUILT IT?', 'WHO DEFINES BLACKNESS?', 'LEGAL VICTORY · LIVED REALITY', 'BLACKNESS ACROSS BORDERS', 'RESPECTABILITY ↔ REFUSAL', 'WHO DESIGNS THE WORLD?']);
  for (const id of ['V1-045', 'V1-046', 'V1-047', 'V1-048', 'V1-049', 'V1-050']) assert.ok(C.nodesById[id], id);
  assert.equal(new Set(C.discovery.map((d) => d.nodeIds[0])).size, 58, 'every node and playable card has a DISCOVER card');
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
  // Writing rhythm: the RECALL card moves off the last slot (two tap cards before it).
  assert.deepEqual(s1.items.map((i) => i.enc.id), ['D001', 'D002', 'E002', 'D004', 'E010', 'E006']);
  const s2 = S.buildStarter(C, p, 1, 1);
  assert.deepEqual(s2.items.map((i) => i.enc.id).sort(), ['D005', 'E005', 'E014', 'E007', 'E027', 'E018'].sort());
  assert.ok(maxChoiceRun(s2.items) <= 2, 's2 has >2 choice screens in a row');
  const s3 = S.buildStarter(C, p, 2, 1);
  assert.deepEqual(s3.items.map((i) => i.enc.id), ['D006', 'E004', 'D003', 'E014', 'E039', 'E034']);
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
  assert.equal(player.version, M.PLAYER_VERSION);
  assert.deepEqual(player.yourWords, []);
  assert.deepEqual(player.checks, []);
  assert.equal(player.knowledge, 1234);
  assert.deepEqual(player.nodes, v1.nodes);
  assert.deepEqual(player.history, v1.history);
  assert.equal(player.startersCompleted, 1);
  assert.ok(Object.keys(player.map.nodes).length >= 4);
});

console.log('your words');
test('answers save with dates, newest first, append-only; earn no Knowledge', () => {
  const N = globalThis.BF.notes;
  const p = M.newPlayer();
  const k = p.knowledge;
  const a = N.add(p, { nodeIds: ['V1-019'], encounterId: 'X-R-V1-019', text: '  Seeing yourself twice. ', prompt: 'Explain it', model: 'Du Bois…', promptType: 'explain' }, 1000);
  const b = N.add(p, { nodeIds: ['V1-019'], text: 'Later, a fuller view.' }, 2000);
  assert.equal(N.add(p, { nodeIds: ['V1-019'], text: '   ' }), null, 'empty answers are not saved');
  for (const f of ['response_id', 'node_id', 'encounter_id', 'text', 'created_at', 'answered_at', 'prompt', 'prompt_type', 'model_answer_snapshot']) assert.ok(f in a, f);
  assert.equal(a.text, 'Seeing yourself twice.');
  assert.equal(a.answered_at, 1000);
  assert.deepEqual(N.forNode(p, 'V1-019').map((r) => r.response_id), [b.response_id, a.response_id]);
  assert.ok(!('update' in N) && !('remove' in N), 'no edit or delete API: history is permanent');
  assert.equal(p.knowledge, k);
});
test('v3 saves (with YOUR WORDS) upgrade losslessly; quote ids remapped', () => {
  const N = globalThis.BF.notes;
  const p = M.newPlayer(); const rng = S.makeRng(12);
  answerAll(p, S.buildNext(C, p, { seed: 1 }), 'good', rng);
  // A v3 note exactly as v3 stored it (edited once, no answered_at).
  p.yourWords = [{ response_id: 'YW-old', node_id: 'V1-032', node_ids: ['V1-032', 'V1-015'], encounter_id: 'E010', text: 'Rules move faster than reality, edited.', created_at: 1111, updated_at: 2222, prompt: 'p', model_answer_snapshot: 'm' }];
  const v3 = JSON.parse(JSON.stringify(p));
  delete v3.checks;
  v3.version = 3; delete v3.bridgesCompleted;
  v3.words = { 'W-01': { at: 5, encounterId: 'D004' }, 'W-11': { at: 6, encounterId: 'D002' } };
  v3.history[0].words = ['W-11', 'W-01'];
  const snapshot = JSON.parse(JSON.stringify(v3));
  const { player, migrated } = M.migrate(JSON.parse(JSON.stringify(v3)));
  assert.ok(migrated);
  assert.equal(player.version, M.PLAYER_VERSION);
  const { answered_at, ...rest } = player.yourWords[0];
  assert.deepEqual([rest], snapshot.yourWords, 'every YOUR WORDS field preserved exactly');
  assert.equal(answered_at, 2222, 'dated by when its current text was written');
  assert.deepEqual(player.checks, []);
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
  assert.equal(player.version, M.PLAYER_VERSION);
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
  console.log('    introduced:', C.nodes.filter((n) => p.nodes[n.id] && p.nodes[n.id].introduced).length, '/ 50 · cards:', C.cardNodes.filter((n) => p.nodes[n.id] && p.nodes[n.id].introduced).length, '/ 8 · threads:',
    Object.keys(p.threadsUnlocked).length, '· debates:', Object.keys(p.debatesUnlocked).length, '· LVL', p.level, p.knowledge);
  assert.equal(C.nodes.filter((n) => p.nodes[n.id] && p.nodes[n.id].introduced).length, 50, 'all 50 nodes discovered through play');
  assert.equal(C.cardNodes.filter((n) => p.nodes[n.id] && p.nodes[n.id].introduced).length, 8, 'all 8 art/design cards discovered through play');
  assert.equal(Object.keys(p.threadsUnlocked).length, 10);
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

console.log('respectability');
test('no promotional respectability language reaches the player', () => {
  const bundle = require('node:fs').readFileSync(new URL('../app/data/content.js', import.meta.url), 'utf8');
  for (const bad of [/real advantages?/i, /strategically useful/i, /best[- ]case/i, /respectability (worked|works|wins)/i])
    assert.ok(!bad.test(bundle), 'found ' + bad);
});
test('Respectability: new core idea, KEEP THIS and YOUR WORDS prompt', () => {
  const n = C.nodesById['V1-045'];
  assert.equal(n.keepThis, 'Who has to prove they deserve protection?');
  assert.equal(n.yourWordsPrompt, 'Who gets left out when dignity becomes a condition for sympathy?');
  assert.ok(/worthy of protection, opportunity, legitimacy, or sympathy/.test(n.coreIdea));
  assert.equal(C.threadsById['T-09'].question, 'What happens when protection depends on acceptability?');
  assert.equal(C.threadResponses['T-09'].length, 9);
  // The revision's two cards are T-09 thread notes in V1.6 (CARD-07+ are the art/design cards).
  assert.deepEqual(C.threadsById['T-09'].notes.map((n) => n.title), ['Disrepute', 'Who counts as a thinker?']);
});
test('E056 / E057 / E058 rewritten; refusal is never the scored answer', () => {
  const [a, b, c] = ['E056', 'E057', 'E058'].map((id) => C.byId[id]);
  assert.equal(a.kind, 'binary'); assert.equal(a.correct, 'Who is treated as worthy');
  assert.equal(a.reveal, 'Respectability makes acceptability part of whether someone is believed, protected, or defended.');
  assert.equal(b.correct, 'The person judged less acceptable');
  assert.deepEqual(b.choices, ['The person judged less acceptable', 'The law', 'The movement']);
  assert.equal(c.kind, 'binary'); assert.equal(c.correct, 'Not exactly');
  const t09 = C.encounters.filter((e) => e.nodeIds.includes('V1-045'));
  for (const e of t09) assert.ok(!/refus/i.test((e.correct || '').replace('Respectability ↔ Refusal', '')), e.id + ' makes refusal the answer');
});

console.log('learn from here');
function anchoredChecks(anchorId) {
  const p = M.newPlayer();
  const before = JSON.stringify(p);
  const s = S.buildAnchored(C, p, anchorId, { seed: 4 });
  assert.equal(JSON.stringify(p), before, 'building changes nothing');
  assert.equal(s.kind, 'anchored');
  assert.equal(s.anchorId, anchorId);
  assert.ok(s.items.length >= 4 && s.items.length <= 6, 'length ' + s.items.length);
  assert.ok(s.items[0].enc.kind === 'discover' && s.items[0].enc.nodeIds[0] === anchorId, 'opens on the anchor');
  const G = GR.build(C);
  const near = new Set([anchorId, ...(G.byNode[anchorId] || []).map((e) => (e.a === anchorId ? e.b : e.a))]);
  const introduced = new Set();
  for (const it of s.items) {
    if (it.enc.kind === 'discover') { introduced.add(it.enc.nodeIds[0]); assert.ok(near.has(it.enc.nodeIds[0]), it.enc.id + ' not a graph neighbour'); continue; }
    assert.ok(it.enc.nodeIds.every((id) => introduced.has(id)), it.enc.id + ' before its ideas were introduced');
  }
  const recall = s.items.findIndex((it) => it.enc.kind === 'recall' && it.enc.nodeIds.includes(anchorId));
  assert.ok(recall > 0 && recall < s.items.length - 1, 'recalls the anchor, never as the last card');
  assert.equal(p.knowledge, 0);
  answerAll(p, s, 'good', S.makeRng(1), Date.now());
  assert.ok(p.knowledge > 0 && p.nodes[anchorId].introduced, 'progress comes from play');
  return s;
}
for (const [id, name] of [['V1-048', 'Pan-Africanism'], ['V1-015', 'Reconstruction'], ['V1-045', 'Respectability']])
  test('anchored session from unseen ' + name, () => {
    const s = anchoredChecks(id);
    console.log('    ' + s.items.map((i) => i.enc.id).join(' → '));
  });
test('normal PLAY is unchanged by anchored sessions (starter 1 still first)', () => {
  const p = M.newPlayer();
  answerAll(p, S.buildAnchored(C, p, 'V1-048', { seed: 2 }), 'good', S.makeRng(1));
  assert.equal(S.buildNext(C, p, { seed: 1 }).kind, 'starter');
});

console.log('check your understanding');
const N = globalThis.BF.notes;
const SNAP = JSON.parse(require('node:fs').readFileSync(new URL('./fixtures/content_snapshot.json', import.meta.url), 'utf8'));
const allItems = () => Object.fromEntries([...C.encounters, ...C.discovery].map((e) => [e.id, e]));
test('every existing explanation, reveal and card text is unchanged (vs. pre-change snapshot)', () => {
  const items = allItems();
  let n = 0;
  // Clarity audit: on audited cards only the question, labels and hint may change, and
  // the reveal may only gain a first line. Everything else must match exactly.
  const audited = new Set(BF_CONTENT.interactions._clarity_audit.ids);
  const QUESTION_FIELDS = ['prompt', 'lead', 'ask', 'choices', 'correct', 'items'];
  for (const [id, fields] of Object.entries(SNAP.items)) for (const [k, v] of Object.entries(fields)) {
    n++;
    if (audited.has(id) && QUESTION_FIELDS.includes(k)) continue;
    if (audited.has(id) && k === 'reveal') { assert.ok(items[id].reveal === v || items[id].reveal.endsWith('\n\n' + v), id + ' reveal changed'); continue; }
    assert.deepEqual(items[id][k], v, id + '.' + k);
  }
  for (const id of audited) {
    const was = SNAP.items[id], now = items[id];
    if (was.choices) assert.equal(now.choices.indexOf(now.correct), was.choices.indexOf(was.correct), id + ': correct answer moved');
    if (was.choices) assert.equal(now.choices.length, was.choices.length);
    if (was.items && was.items[0] && was.items[0].bin) assert.deepEqual(now.items.map((i) => i.bin), was.items.map((i) => i.bin), id + ': sort answers changed');
    if (was.pairs) assert.deepEqual(now.pairs, was.pairs);
  }
  for (const [id, fields] of Object.entries(SNAP.nodes)) for (const [k, v] of Object.entries(fields)) { assert.deepEqual(C.nodesById[id][k], v, id + '.' + k); n++; }
  // V1.6 reassigned CARD-07/08 to the art/design layer; the two Respectability
  // revision cards keep their exact text as T-09 notes.
  const notes = C.threadsById['T-09'].notes.map((x) => x.text);
  for (const [id, v] of Object.entries(SNAP.deepening)) {
    if (id === 'CARD-07' || id === 'CARD-08') assert.ok(notes.includes(v), id + ' text kept as a T-09 note');
    else assert.equal((C.deepeningById[id] || {}).text || null, v, id);
  }
  // Derived cards reveal the curriculum's core idea, word for word.
  for (const nd of C.nodes) {
    const s = S.buildAnchored(C, M.newPlayer(), nd.id, { seed: 3 });
    for (const it of s.items) if (it.enc.derived && it.enc.reveal && it.enc.nodeIds[0] === nd.id) assert.equal(it.enc.reveal, nd.coreIdea);
  }
  console.log('    ' + n + ' fields compared');
});
test('every YOUR WORDS prompt is classified explain or reflective', () => {
  const writing = C.encounters.filter((e) => e.kind === 'recall' || e.kind === 'share');
  assert.equal(writing.length, 14);
  for (const e of writing) assert.equal(C.promptTypes.encounters[e.id], 'explain', e.id + ' needs an explicit type');
  for (const pre of ['X-R', 'X-S', 'X-WR']) assert.equal(C.promptTypes.derived[pre], 'explain');
  const reflective = C.nodes.filter((n) => BF.content.ideaPrompt(C, n).type === 'reflective').map((n) => n.id);
  assert.deepEqual(reflective, ['V1-045', 'V1-046', 'V1-047', 'V1-048', 'V1-049', 'V1-050']);
  assert.equal(BF.content.ideaPrompt(C, C.nodesById['V1-045']).text, 'Who gets left out when dignity becomes a condition for sympathy?');
  assert.equal(BF.content.ideaPrompt(C, C.nodesById['V1-015']).text, 'How would you explain Reconstruction to someone new?');
  assert.equal(BF.content.writeTypeOf(C, { id: 'E999' }), 'reflective', 'unlisted prompts default to reflective');
});
test('pilot checks: three ideas, 2–3 short must-haves, mix-ups, explain cards only', () => {
  assert.deepEqual(Object.keys(C.checks).sort(), ['V1-045', 'V1-048', 'V1-050']);
  const quotes = C.words.map((w) => w.text);
  for (const c of Object.values(C.checks)) {
    assert.ok(c.mustHaves.length >= 2 && c.mustHaves.length <= 3);
    for (const m of c.mustHaves) assert.ok(m.text.split(/\s+/).length <= 6, m.text);
    assert.ok(c.misreadings.length >= 1);
    for (const id of c.appliesTo) {
      const enc = S.buildAnchored(C, M.newPlayer(), c.nodeId, { seed: 1 }).items.map((i) => i.enc).find((e) => e.id === id) || { id, derived: true };
      assert.equal(BF.content.writeTypeOf(C, enc), 'explain', id);
    }
    for (const m of c.misreadings) for (const q of quotes) assert.ok(!m.text.includes(q), 'no quotations in mix-ups');
  }
  assert.ok(/Du Bois/.test(C.checks['V1-048'].misreadings[0].text) && /Black [Nn]ationalism/.test(C.checks['V1-048'].misreadings[0].text));
  assert.ok(/after the door opens/.test(C.checks['V1-050'].misreadings[0].text));
  assert.ok(/One helps define who is punishable\. The other helps define who is considered deserving of protection or sympathy\./.test(C.checks['V1-045'].misreadings[0].text), 'consistent with E058');
  assert.equal(BF.content.checkFor(C, { id: 'X-R-V1-015', derived: true }), null, 'no check without pilot content');
});
test('chip taps are the verdict: all = got, some = partly, none = missed', () => {
  const c = C.checks['V1-045'];
  const ids = c.mustHaves.map((m) => m.id);
  assert.equal(N.verdictFor(c, ids), 'got');
  assert.equal(N.verdictFor(c, ids.slice(0, 1)), 'partly');
  assert.equal(N.verdictFor(c, ids.slice(0, 2)), 'partly');
  assert.equal(N.verdictFor(c, []), 'missed');
  assert.deepEqual(['got', 'partly', 'missed'].map((v) => N.ratingFor('recall', v)), ['knew', 'almost', 'missed']);
  assert.deepEqual(['got', 'partly', 'missed'].map((v) => N.ratingFor('share', v)), ['clear', 'almost', 'needs']);
});
test('the most relevant mix-up comes first', () => {
  assert.equal(N.misreadingsFor(C.checks['V1-045'], ['pressure', 'standards'])[0].id, 'criminalization');
  assert.equal(N.misreadingsFor(C.checks['V1-045'], ['worthy'])[0].id, 'manners');
  assert.equal(N.misreadingsFor(C.checks['V1-048'], ['family'])[0].id, 'nationalism');
  assert.equal(N.misreadingsFor(C.checks['V1-050'], ['terms', 'extraction'])[0].id, 'exclusion');
  assert.equal(N.misreadingsFor(C.checks['V1-050'], [])[0].id, 'exclusion');
});
test('Partly / Missed bring the idea back sooner; Got it is exactly KNEW IT', () => {
  const enc = S.buildAnchored(C, M.newPlayer(), 'V1-048', { seed: 4 }).items.find((i) => i.enc.id === 'X-R-V1-048').enc;
  const run = (rating) => {
    const p = M.newPlayer(); const now = 1e12;
    M.recordEncounter(p, C.byId.D048, 1, now);
    const r = S.evaluate(enc, { rating }, p);
    M.recordEncounter(p, enc, r.quality, now);
    return { due: p.nodes['V1-048'].nextReview - now, points: r.points, p };
  };
  const got = run(N.ratingFor('recall', 'got'));
  const partly = run(N.ratingFor('recall', 'partly'));
  const missed = run(N.ratingFor('recall', 'missed'));
  assert.ok(missed.due < partly.due && partly.due < got.due, 'missed < partly < got');
  const knew = run('knew');
  assert.deepEqual(got.p.nodes, knew.p.nodes, 'Got it changes nothing beyond KNEW IT');
  assert.equal(got.points, knew.points);
});
test('no text scoring anywhere: verdicts and points ignore what was typed', () => {
  const c = C.checks['V1-050'];
  assert.equal(N.verdictFor(c, ['access']), 'partly');
  const enc = { kind: 'recall', points: 20 };
  assert.deepEqual(S.evaluate(enc, { rating: 'almost', text: 'a full and perfect answer' }), S.evaluate(enc, { rating: 'almost' }));
  // Nothing that decides a verdict, rating or points ever reads typed text.
  for (const fn of [S.evaluate, N.verdictFor, N.ratingFor, N.misreadingsFor, N.recordCheck]) assert.ok(!/\btext\b/.test(fn.toString()), fn.name + ' reads text');
  const p = M.newPlayer();
  const k = p.knowledge;
  const a = N.add(p, { nodeIds: ['V1-050'], text: 'x', promptType: 'explain' });
  N.recordCheck(p, { nodeId: 'V1-050', responseId: a.response_id, covered: [], offered: ['access'], verdict: 'missed' });
  assert.equal(p.knowledge, k);
  assert.equal(p.checks[0].mode, 'typed');
  assert.ok(!('score' in p.checks[0]) && !('score' in a));
});
test('"Last time you said": latest earlier explain answer only, never the current one', () => {
  const p = M.newPlayer();
  const first = N.add(p, { nodeIds: ['V1-045'], encounterId: 'X-R-V1-045', text: 'first', promptType: 'explain' }, 1000);
  assert.equal(N.previousExplain(C, p, 'V1-045', first), null, 'first attempt has no last time');
  N.add(p, { nodeIds: ['V1-045'], text: 'a reflection', prompt: 'Who gets left out…', promptType: 'reflective' }, 2000);
  const second = N.add(p, { nodeIds: ['V1-045'], encounterId: 'X-S-V1-045', text: 'second', promptType: 'explain' }, 3000);
  assert.equal(N.previousExplain(C, p, 'V1-045', second).text, 'first', 'reflective answers are not a "last time"');
  // Older answers without a prompt_type: a card answer counts as explain.
  const q = M.newPlayer();
  q.yourWords.push({ response_id: 'old', node_id: 'V1-045', node_ids: ['V1-045'], encounter_id: 'X-R-V1-045', text: 'old', created_at: 500 });
  const now = N.add(q, { nodeIds: ['V1-045'], encounterId: 'X-R-V1-045', text: 'new', promptType: 'explain' }, 900);
  assert.equal(N.previousExplain(C, q, 'V1-045', now).text, 'old');
});
test('first sentence split for the bold lead (initials are not sentence ends)', () => {
  assert.deepEqual(BF.ui.firstSentence('W.E.B. Du Bois reframed it. Then more.'), ['W.E.B. Du Bois reframed it.', 'Then more.']);
  assert.deepEqual(BF.ui.firstSentence(C.nodesById['V1-045'].coreIdea), [C.nodesById['V1-045'].coreIdea, '']);
  const [a, b] = BF.ui.firstSentence(C.byId.E045.reveal.split(/\n\n/)[0] + ' Extra.');
  assert.equal(a + ' ' + b, C.byId.E045.reveal.split(/\n\n/)[0] + ' Extra.', 'nothing dropped');
});
function rhythmViolations(items) {
  const w = items.map((it) => S.isWritingItem(it));
  const bad = [];
  w.forEach((x, i) => {
    if (!x) return;
    if (i === items.length - 1) bad.push('last');
    if (i < 2 || w[i - 1] || w[i - 2]) bad.push('needs two tap cards before ' + items[i].enc.id);
  });
  return bad;
}
test('writing rhythm holds in starters, bridges, Learn from here and 40 review sessions', () => {
  const p = M.newPlayer(); const rng = S.makeRng(11); let now = Date.now();
  const sessions = [];
  for (let i = 0; i < C.starters.length; i++) sessions.push(S.buildStarter(C, p, i, i + 1));
  for (const b of C.bridges) sessions.push(S.buildBridge(C, p, b, 2));
  for (const n of C.nodes) sessions.push(S.buildAnchored(C, M.newPlayer(), n.id, { seed: 5 }));
  for (let i = 0; i < 3; i++) answerAll(p, S.buildNext(C, p, { seed: i + 1 }), 'good', rng, now);
  for (let k = 0; k < 40; k++) {
    now += 0.4 * M.DAY;
    const s = S.buildNext(C, p, { seed: 300 + k, now });
    sessions.push(s);
    answerAll(p, s, 'random', rng, now);
  }
  let writing = 0, quiet = 0;
  for (const s of sessions) {
    assert.deepEqual(rhythmViolations(s.items), [], s.kind + ' ' + s.items.map((i) => i.enc.id).join(' '));
    assert.ok(maxChoiceRun(s.items) <= 2);
    writing += s.items.filter(S.isWritingItem).length;
    quiet += s.items.filter((i) => i.noWrite).length;
  }
  console.log('    ' + sessions.length + ' sessions · ' + writing + ' writing cards · ' + quiet + ' recall cards shown without writing');
  for (const id of ['V1-045', 'V1-048', 'V1-050']) {
    const s = S.buildAnchored(C, M.newPlayer(), id, { seed: 5 });
    assert.ok(s.items.some((it) => S.isWritingItem(it) && BF.content.checkFor(C, it.enc)), id + ': Learn from here reaches its check');
  }
});
test('v4 saves upgrade to v5: progress, WORDS and every YOUR WORDS answer kept, dated', () => {
  const p = M.newPlayer(); const rng = S.makeRng(31);
  for (let i = 0; i < 3; i++) answerAll(p, S.buildNext(C, p, { seed: i + 1 }), 'good', rng);
  p.yourWords = [
    { response_id: 'YW-a', node_id: 'V1-032', node_ids: ['V1-032'], encounter_id: 'E010', text: 'edited note', created_at: 100, updated_at: 300, prompt: 'p', model_answer_snapshot: 'm' },
    { response_id: 'YW-b', node_id: 'V1-045', node_ids: ['V1-045'], encounter_id: null, text: 'a reflection', created_at: 200, updated_at: null, prompt: 'Who gets left out…', model_answer_snapshot: null },
    { response_id: 'YW-c', node_id: 'V1-010', node_ids: ['V1-010'], text: 'undated', prompt: null },
  ];
  const v4 = JSON.parse(JSON.stringify(p));
  v4.version = 4; delete v4.checks; v4.createdAt = 50;
  const snap = JSON.parse(JSON.stringify(v4));
  const { player, migrated } = M.migrate(JSON.parse(JSON.stringify(v4)));
  assert.ok(migrated);
  assert.equal(player.version, 5);
  for (const k of Object.keys(snap)) if (!['version', 'yourWords', 'migratedFrom', 'level'].includes(k)) assert.deepEqual(player[k], snap[k], k);
  assert.equal(player.yourWords.length, 3);
  player.yourWords.forEach((r, i) => { const { answered_at, ...rest } = r; assert.deepEqual(rest, snap.yourWords[i]); });
  assert.deepEqual(player.yourWords.map((r) => r.answered_at), [300, 200, 50], 'best available date');
  assert.deepEqual(player.checks, []);
  assert.equal(N.typeOf(C, player.yourWords[0]), 'explain');
  assert.equal(N.typeOf(C, player.yourWords[1]), 'reflective');
});

console.log('clarity');
const INSTRUCTION = /^(Put|Match|Place|Explain|Name|Complete|Pick|Choose|Sort|Tap|Read|Describe|Compare|Say|Type|Write|Connect)\b/;
const isQuestion = (t) => { t = String(t).trim(); return t.endsWith('?') || INSTRUCTION.test(t); };
test('every question headline ends in "?" or begins with an instruction verb', () => {
  const heads = [];
  const encHead = (e) => {
    if (e.kind === 'discover') return e.ask ? [e.id + ' ask', e.ask] : null; // reading cards: the statement is the content
    if (e.kind === 'quote') return null; // a quotation card has no question
    return [e.id, e.lead || e.prompt];
  };
  for (const e of [...C.encounters, ...C.discovery]) { const x = encHead(e); if (x) heads.push(x); }
  // Generated cards, as they appear in real sessions.
  const p = M.newPlayer(); const rng = S.makeRng(2); let now = Date.now();
  const seen = new Set();
  const take = (s) => s.items.forEach((it) => { if (it.enc.derived && !seen.has(it.enc.id)) { seen.add(it.enc.id); const x = encHead(it.enc); if (x) heads.push(x); } });
  for (const n of C.nodes) take(S.buildAnchored(C, M.newPlayer(), n.id, { seed: 7 }));
  for (let k = 0; k < 60; k++) { now += 0.5 * M.DAY; const s = S.buildNext(C, p, { seed: 500 + k, now }); take(s); answerAll(p, s, 'random', rng, now); }
  for (const n of C.nodes) heads.push(['your words ' + n.id, BF.content.ideaPrompt(C, n).text]);
  for (const c of Object.values(C.checks)) heads.push(['check ' + c.nodeId, c.ask]);
  for (const t of C.threads) heads.push([t.id, t.question]);
  for (const d of C.debates) heads.push([d.id, d.question]);
  for (const w of C.worlds) heads.push([w.id, w.question]);
  // A trailing colon is fine only on a lead that introduces the quoted line beneath it.
  const leads = new Set([...C.encounters, ...C.discovery].filter((e) => e.lead).map((e) => e.lead).concat(['Explain this line:']));
  const bad = heads.filter(([, t]) => !isQuestion(t) || /…$/.test(String(t).trim()) || (/:$/.test(String(t).trim()) && !leads.has(t)));
  assert.deepEqual(bad, []);
  console.log('    ' + heads.length + ' headlines checked (' + seen.size + ' generated cards)');
});
test('sort cards and multi-part cards carry a one-line hint', () => {
  for (const e of C.encounters.filter((x) => x.kind === 'sort')) assert.ok(e.hint && e.hint.length < 60, e.id + ' needs a hint');
});
test('no option or sort label leans on a pronoun from another line', () => {
  const labels = [];
  for (const e of C.encounters) {
    for (const c of e.choices || []) labels.push([e.id, c]);
    for (const it of (e.kind === 'sort' ? e.items : [])) labels.push([e.id, it.text]);
  }
  // Allowed: the antecedent sits in the same label, or a plain answer to a yes/no question.
  const OK = ['Wells opposed journalism; Washington supported it.', 'Not that simple', 'Proof that inclusion equals exclusion', 'Tries to turn that connection into an organized movement'];
  const bad = labels.filter(([, t]) => /\b(it|this|that|they|them)\b/i.test(t) && !/^(What|Who|Whether|How)\b/.test(t) && !OK.includes(t));
  assert.deepEqual(bad, []);
});

console.log('V1.6 art & design');
const ART = C.cardNodes.map((c) => c.id);
test('T-10 WHO DESIGNS THE WORLD? is a formal thread of ideas and deepening cards', () => {
  const t = C.threadsById['T-10'];
  assert.equal(t.title, 'WHO DESIGNS THE WORLD?');
  assert.equal(t.question, 'Who shapes the images, spaces, systems, platforms, and futures Black people inhabit—and who has the power to redesign them?');
  for (const id of ['V1-005', 'V1-010', 'V1-026', 'V1-027', 'V1-037', 'V1-040', 'CARD-07', 'CARD-11', 'CARD-14']) assert.ok(t.members.includes(id), id);
  for (const s of t.steps) for (const id of s.nodeIds) assert.ok(C.nodesById[id], 'broken id ' + id);
});
test('the 8 art/design cards are playable deepening cards, not core nodes', () => {
  assert.deepEqual(ART, ['CARD-07', 'CARD-08', 'CARD-09', 'CARD-10', 'CARD-11', 'CARD-12', 'CARD-13', 'CARD-14']);
  for (const id of ART) {
    assert.ok(!C.nodes.some((n) => n.id === id));
    assert.ok(C.discovery.some((d) => d.nodeIds[0] === id), id + ' has a DISCOVER card');
    const encs = C.encounters.filter((e) => e.nodeIds.includes(id));
    assert.ok(encs.length >= 1, id + ' has an interaction');
    for (const e of encs) {
      assert.ok(e.prompt.trim().endsWith('?'), e.id + ' asks a question');
      assert.ok(e.choices.every((c) => c.length <= 40 && c.split(/\s+/).length <= 6), e.id + ' short options');
      assert.ok(e.reveal.length <= 260 && e.reveal.split(/(?<=[.?!])\s+/).length <= 2, e.id + ' concise reveal');
      assert.ok(e.choices.includes(e.correct));
    }
  }
  assert.equal(C.encounters.filter((e) => e.nodeIds.some((x) => ART.includes(x))).length, 8, 'only the encounters needed: one per card');
});
test('required V1.6 connections are kept', () => {
  const links = (id) => C.cardLinks[id];
  assert.ok(links('CARD-09').includes('T-03'));
  assert.ok(links('CARD-10').includes('T-05') && links('CARD-11').includes('T-05'));
  assert.ok(links('CARD-07').includes('T-06'));
  assert.ok(links('CARD-14').includes('T-08'));
  assert.ok(links('CARD-07').includes('T-09') && links('CARD-08').includes('T-09'));
  assert.ok(links('CARD-08').includes('D-06'));
  assert.ok(links('CARD-11').includes('D-08'));
  const t10 = C.threadConnections.filter((e) => e.from === 'T-10').map((e) => e.to).sort();
  assert.deepEqual(t10, ['D-05', 'D-06', 'D-08', 'T-03', 'T-05', 'T-06', 'T-08', 'T-09']);
  const G = GR.build(C);
  const nb = (id) => new Set((G.byNode[id] || []).map((e) => (e.a === id ? e.b : e.a)));
  for (const [card, ids] of Object.entries({ 'CARD-07': ['V1-010', 'V1-026', 'V1-027', 'V1-028', 'V1-040'], 'CARD-08': ['V1-026', 'V1-027', 'V1-045'], 'CARD-10': ['V1-037', 'V1-047'], 'CARD-13': ['V1-010', 'V1-040', 'V1-044', 'V1-050'], 'CARD-14': ['V1-047', 'V1-048'] }))
    for (const id of ids) assert.ok(nb(card).has(id), card + ' ↔ ' + id);
  for (const e of G.edges.values()) assert.ok(C.nodesById[e.a] && C.nodesById[e.b], 'edge to unknown id ' + e.id);
  for (const id of ART) assert.ok(nb(id).size >= 3 && nb(id).size <= 9, id + ' is connected, not a hub (' + nb(id).size + ')');
});
test('the overview map stays core-only; cards appear only in their world view', () => {
  const G = GR.build(C);
  for (const id of ART) assert.ok(!G.layout.nodes[id], id + ' not on the overview');
  const L = GR.worldLayout(C, 'CULTURE');
  for (const id of ART) assert.ok(L.nodes[id] && L.nodes[id].card, id + ' in CULTURE view');
  assert.equal(Object.keys(GR.worldLayout(C, 'POWER').nodes).length, C.nodes.filter((n) => n.world === 'POWER').length);
  // A new player sees no links at all; nothing is revealed in advance.
  assert.equal(GR.visibleEdges(G, M.newPlayer()).length, 0);
});
test('recurring question WHO DESIGNED THIS — AND WHO COULD REDESIGN IT? is used selectively', () => {
  assert.equal(C.designLens, 'WHO DESIGNED THIS — AND WHO COULD REDESIGN IT?');
  assert.ok(!C.threads.some((t) => /WHO DESIGNED THIS/.test(t.title)) && !C.nodes.some((n) => /WHO DESIGNED THIS/.test(n.name)), 'not a thread or node');
  const tagged = C.encounters.filter((e) => e.lens === C.designLens).map((e) => e.id);
  assert.ok(tagged.length >= 1 && tagged.length <= 3, 'selective: ' + tagged);
});
test('cards surface in PLAY only after two of their ideas are met, one at a time', () => {
  const p = M.newPlayer();
  for (let k = 0; k < 5; k++) assert.ok(!S.buildAdaptive(C, p, { seed: 3 + k }).items.some((i) => i.enc.nodeIds.some((x) => ART.includes(x))), 'no card for a new player');
  // Once the core ideas are met, cards are what is new — at most one per session.
  for (const d of C.discovery) if (!ART.includes(d.nodeIds[0])) M.recordEncounter(p, d, 1);
  for (let k = 0; k < 8; k++) {
    const cards = S.buildAdaptive(C, p, { seed: 60 + k }).items.filter((i) => i.enc.kind === 'discover' && ART.includes(i.enc.nodeIds[0]));
    assert.equal(cards.length, 1, 'one card per session');
  }
  // A card whose ideas are unmet stays back.
  const q = M.newPlayer();
  for (const d of C.discovery) if (!ART.includes(d.nodeIds[0]) && !C.cardsById['CARD-07'].connections.includes(d.nodeIds[0])) M.recordEncounter(q, d, 1);
  for (let k = 0; k < 8; k++) assert.ok(!S.buildAdaptive(C, q, { seed: 80 + k }).items.some((i) => i.enc.id === 'D051'), 'CARD-07 waits for its ideas');
});
for (const [id, label] of [['V1-026', 'Harlem Renaissance'], ['V1-027', 'Hurston'], ['V1-040', 'Hip-hop'], ['V1-047', 'Black Nationalism'], ['CARD-07', 'Who Controls the Image?'], ['CARD-11', 'Systems Are Designed Too'], ['CARD-14', 'Who Gets to Imagine the Future?']])
  test('Learn from here: ' + label, () => {
    const G = GR.build(C);
    const p = M.newPlayer();
    const s = S.buildAnchored(C, p, id, { seed: 4 });
    assert.equal(s.items[0].enc.nodeIds[0], id);
    assert.ok(s.items.length >= 4 && s.items.length <= 6);
    assert.ok(s.items.at(-1).enc.kind !== 'discover', 'does not end on an untried idea');
    const near = new Set([id, ...(G.byNode[id] || []).map((e) => (e.a === id ? e.b : e.a))]);
    const intro = new Set();
    for (const it of s.items) {
      for (const x of it.enc.nodeIds) assert.ok(C.nodesById[x], 'broken id ' + x);
      if (it.enc.kind === 'discover') { const x = it.enc.nodeIds[0]; assert.ok(near.has(x), x + ' is not a graph neighbour of ' + id); intro.add(x); }
      else assert.ok(it.enc.nodeIds.every((x) => intro.has(x)), it.enc.id + ' before its ideas were introduced');
    }
    console.log('    ' + s.items.map((i) => i.enc.nodeIds.map((x) => C.nodesById[x].name).join('+')).join(' → '));
  });
test('V1.6 keeps the Respectability revision; NOW hooks stay out of the historical content', () => {
  const bundle = require('node:fs').readFileSync(new URL('../app/data/content.js', import.meta.url), 'utf8');
  assert.ok(!/strategically useful|real historical uses/i.test(bundle));
  assert.equal(C.nodesById['V1-045'].keepThis, 'Who has to prove they deserve protection?');
  const hist = JSON.stringify([BF_CONTENT.curriculum, BF_CONTENT.playtest, BF_CONTENT.knowledgeMap, BF_CONTENT.interactions, BF_CONTENT.artDesign]);
  assert.ok(!/"refreshBy"|"now_hook"|"lead_hook"|"coda_hook"/i.test(hist), 'no NOW fields inside historical content');
  assert.equal(BF_CONTENT.curriculum.version, 'V1.6 — arts/design expansion');
});

console.log('NOW layer');
const NOW_RAW = BF_CONTENT.nowHooks;
const NONE_IDS = ['V1-004', 'V1-008', 'V1-014', 'V1-015', 'V1-035', 'V1-037', 'V1-007', 'V1-011', 'V1-018', 'V1-023', 'V1-001', 'V1-028', 'V1-009', 'V1-034', 'V1-038', 'V1-005', 'V1-027', 'D-01', 'D-02', 'D-04'];
test('48 hooks: 18 LEAD, 30 CODA; no NONE item has one; every id is a real idea/thread/debate', () => {
  const hooks = Object.values(C.nowHooks);
  assert.equal(hooks.length, 48);
  assert.equal(hooks.filter((x) => x.placement === 'LEAD').length, 18);
  assert.equal(hooks.filter((x) => x.placement === 'CODA').length, 30);
  for (const id of NONE_IDS) assert.ok(!C.nowHooks[id], id + ' is NONE');
  assert.equal(NONE_IDS.length, 20);
  for (const x of hooks) {
    if (x.type === 'CORE') assert.ok(C.nodes.some((n) => n.id === x.id), x.id);
    if (x.type === 'THREAD') assert.ok(C.threadsById[x.id], x.id);
    if (x.type === 'DEBATE') assert.ok(C.debatesById[x.id], x.id);
  }
  assert.equal(C.nodes.length + C.threads.length + C.debates.length - 20, 48, 'every non-NONE item has exactly one hook');
});
test('every hook has text, one bridge and full source metadata', () => {
  for (const x of Object.values(C.nowHooks)) {
    assert.ok(x.text && x.bridge && x.refreshBy && /^\d{4}-\d{2}$/.test(x.refreshBy), x.id);
    for (const s of x.sources) assert.ok(s.title && s.publisher && /^https:\/\//.test(s.url) && s.date, x.id + ' source');
  }
  for (const r of NOW_RAW.hooks) for (const k of ['item', 'type', 'world', 'placement', 'text', 'bridge', 'sourceTitle', 'sourcePublisher', 'sourceURL', 'sourceDate', 'refreshBy']) assert.ok(r[k], r.id + ' ' + k);
});
test('Part 1 wording: T-03 names each company action; V1-025 is source-faithful; V1-044 has no 2025 investigation', () => {
  const t03 = C.nowHooks['T-03'].text;
  assert.ok(/IBM stopped offering general-purpose facial-recognition software/.test(t03));
  assert.ok(/Amazon announced a one-year moratorium on police use of Rekognition/.test(t03));
  assert.ok(/Microsoft said it would not sell the technology to U\.S\. police until federal regulation existed/.test(t03));
  assert.ok(!/each limited/.test(t03));
  assert.ok(/Atlanta was the largest net Black migration gainer/.test(C.nowHooks['V1-025'].text));
  assert.ok(!/2025|Justice Department|investigat/i.test(C.nowHooks['V1-044'].text + C.nowHooks['V1-044'].bridge));
  assert.ok(!/died|death|2026/i.test(C.nowHooks['V1-033'].text));
  assert.ok(!/shooting|shot|trial|convict/i.test(C.nowHooks['V1-041'].text));
});
test('in PLAY a hook travels with its item: DISCOVER card for ideas, the debate\'s own encounter for debates', () => {
  assert.equal(BF.content.nowHookFor(C, C.byId.D028).id, 'V1-025');
  assert.equal(BF.content.nowHookFor(C, C.byId.D028).placement, 'LEAD');
  assert.equal(BF.content.nowHookFor(C, C.byId.D008).placement, 'CODA');
  assert.equal(BF.content.nowHookFor(C, C.byId.D020), null, 'Douglass is NONE');
  assert.equal(BF.content.nowHookFor(C, C.byId.D023), null, 'Washington is NONE');
  assert.equal(BF.content.nowHookFor(C, C.byId.D007), null, 'Hurston is NONE');
  assert.equal(BF.content.nowHookFor(C, C.byId.E022).id, 'D-05');
  assert.equal(BF.content.nowHookFor(C, C.byId.E060).id, 'D-08');
  assert.equal(BF.content.nowHookFor(C, C.byId.E028), null, 'ordinary encounters carry no hook');
  assert.equal(BF.content.nowHookFor(C, C.byId.D051), null, 'deepening cards carry no hook');
});
test('hooks never become questions, items, Knowledge or graph routes', () => {
  const ids = new Set([...C.encounters, ...C.discovery].map((e) => e.id));
  for (const id of Object.keys(C.nowHooks)) assert.ok(!ids.has(id) && !ids.has('NOW-' + id));
  // Same session and the same graph with or without the NOW layer.
  const bare = Object.assign({}, C, { nowHooks: {} });
  for (const a of ['V1-025', 'V1-036', 'V1-050', 'CARD-11']) {
    const x = S.buildAnchored(C, M.newPlayer(), a, { seed: 9 }).items.map((i) => i.enc.id).join();
    const y = S.buildAnchored(bare, M.newPlayer(), a, { seed: 9 }).items.map((i) => i.enc.id).join();
    assert.equal(x, y, a + ': Learn from here routing unchanged');
  }
  assert.equal(GR.build(C).edges.size, GR.build(bare).edges.size);
  const p = M.newPlayer();
  const r = S.evaluate(C.byId.D028, {}, p);
  assert.equal(r.points, M.CONFIG.discoverPoints, 'a LEAD DISCOVER pays exactly the usual DISCOVER points');
});
test('refreshBy is maintenance-only: stale hooks are reported, never removed', () => {
  assert.equal(BF.content.staleNowHooks(C, Date.UTC(2026, 9, 2)).length, 0);
  const later = BF.content.staleNowHooks(C, Date.UTC(2030, 0, 1));
  assert.equal(later.length, 48);
  assert.equal(Object.keys(C.nowHooks).length, 48);
});

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
