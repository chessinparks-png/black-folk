// YOUR WORDS: the player's own answers, saved privately on this device.
// Plain data helpers on player.yourWords (the answer history) and
// player.checks (understanding-check verdicts) — no DOM, no storage.
// Typed text is never scored or judged. History is append-only: answers are
// never edited or deleted; only a full reset clears them.
(function (BF) {
  'use strict';

  function list(player) {
    return (player.yourWords = player.yourWords || []);
  }

  function makeId(prefix) {
    return (prefix || 'YW-') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // When the saved text was written: answered_at, else the best older date.
  function dateOf(rec) {
    return rec.answered_at || rec.updated_at || rec.created_at || 0;
  }

  // { nodeIds, encounterId?, text, prompt?, model?, promptType?, frame?, context?,
  //   debateId?, threadId?, sides? } → saved record
  function add(player, entry, now) {
    const text = String(entry.text || '').trim();
    if (!text) return null;
    const nodeIds = (entry.nodeIds || []).filter(Boolean);
    const at = now || Date.now();
    const rec = {
      response_id: makeId(),
      node_id: nodeIds[0] || null,
      node_ids: nodeIds,
      encounter_id: entry.encounterId || null,
      text,
      created_at: at,
      answered_at: at,
      updated_at: null,
      prompt: entry.prompt || null,
      prompt_type: entry.promptType || null, // 'explain' | 'reflective'
      model_answer_snapshot: entry.model || null,
    };
    // Teach-back extras (additive; older records simply lack them).
    if (entry.frame) rec.frame = { audience: entry.frame.audience, length: entry.frame.length };
    if (entry.context) rec.context = entry.context; // 'card' | 'teach-back' | 'debate' | 'lean' | 'thread'
    if (entry.debateId) rec.debate_id = entry.debateId;
    if (entry.threadId) rec.thread_id = entry.threadId;
    if (entry.sides) rec.sides = entry.sides.map((x) => ({ label: x.label, text: String(x.text || '').trim() }));
    list(player).push(rec);
    return rec;
  }

  // Newest first.
  function forNode(player, nodeId) {
    return list(player)
      .filter((r) => r.node_id === nodeId || (r.node_ids || []).includes(nodeId))
      .sort((a, b) => dateOf(b) - dateOf(a));
  }

  // Older answers carry no prompt_type: a card answer was an explain card; an
  // idea-page answer takes that idea's prompt type.
  function typeOf(C, rec) {
    if (rec.prompt_type) return rec.prompt_type;
    if (rec.encounter_id) {
      const enc = C.byId[rec.encounter_id] || (/^X-/.test(rec.encounter_id) ? { id: rec.encounter_id, derived: true } : null);
      return enc ? BF.content.writeTypeOf(C, enc) : 'explain';
    }
    const n = C.nodesById[rec.node_id];
    return n ? BF.content.ideaPrompt(C, n).type : 'reflective';
  }

  // "Last time you said": the latest explain answer for this idea before `rec`.
  function previousExplain(C, player, nodeId, rec) {
    const cutoff = rec ? dateOf(rec) : Infinity;
    return forNode(player, nodeId).find((r) => r !== rec && (!rec || r.response_id !== rec.response_id) && dateOf(r) <= cutoff && typeOf(C, r) === 'explain') || null;
  }

  // ---- teach-back: rotating audience × length ---------------------------------------
  // key: an idea id, a debate id or a thread id.
  function keyOf(rec) {
    return rec.debate_id || rec.thread_id || null;
  }
  function forKey(player, key) {
    return list(player)
      .filter((r) => keyOf(r) === key || (!keyOf(r) && (r.node_id === key || (r.node_ids || []).includes(key))))
      .sort((a, b) => dateOf(b) - dateOf(a));
  }
  const sameFrame = (a, b) => !!(a && b && a.audience === b.audience && a.length === b.length);
  function hash(str) {
    let x = 0;
    for (const ch of String(str)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    return x;
  }
  // Deterministic, so a screen that re-renders asks the same thing. Never repeats
  // the last pairing used for this key, and avoids the last pairing used anywhere.
  // opts.spoken === false leaves out spoken lengths (a typing-only pad).
  function pickFrame(C, player, key, opts) {
    const tb = C.teachBack;
    if (!tb || !tb.frames.length) return null;
    const pool = tb.frames.filter((f) => !(opts && opts.spoken === false && tb.lengths[f.length].spoken));
    const framed = list(player).filter((r) => r.frame).sort((a, b) => dateOf(b) - dateOf(a));
    const lastHere = (forKey(player, key).find((r) => r.frame) || {}).frame;
    const lastAny = (framed[0] || {}).frame;
    const start = (hash(key) + framed.length) % pool.length;
    const order = pool.map((_, i) => pool[(start + i) % pool.length]);
    return order.find((f) => !sameFrame(f, lastHere) && !sameFrame(f, lastAny)) || order.find((f) => !sameFrame(f, lastHere)) || order[0];
  }
  function frameInfo(C, frame) {
    const tb = C.teachBack;
    const a = tb.audiences[frame.audience];
    const l = tb.lengths[frame.length];
    return { audience: a.text, length: l.text, spoken: !!l.spoken, label: a.label + ' · ' + l.label };
  }
  // "Explain Pan-Africanism to a 12-year-old, in one sentence."
  function explainAsk(C, n, frame) {
    const f = frameInfo(C, frame);
    const what = n.isCard ? 'the idea behind “' + n.name + '”' : n.name;
    return 'Explain ' + what + ' ' + f.audience + ', ' + f.length + '.';
  }
  // The latest earlier explanation for a debate or thread (ideas use previousExplain).
  function previousFor(player, key, rec, context) {
    const cutoff = rec ? dateOf(rec) : Infinity;
    return forKey(player, key).find((r) => r !== rec && (!rec || r.response_id !== rec.response_id) && dateOf(r) <= cutoff && (!context || r.context === context)) || null;
  }
  // Explain-type answers for an idea, oldest first (for "Compare first and latest").
  function explainHistory(C, player, nodeId) {
    return forNode(player, nodeId).filter((r) => typeOf(C, r) === 'explain').reverse();
  }

  // ---- understanding checks -----------------------------------------------------
  // The player taps the must-haves they covered. Tapping IS the verdict.
  function verdictFor(check, coveredIds) {
    const covered = check.mustHaves.filter((m) => coveredIds.includes(m.id)).length;
    if (covered === check.mustHaves.length) return 'got';
    return covered > 0 ? 'partly' : 'missed';
  }

  // Verdict → the card's existing self-rating, so review uses the existing
  // scheduler: Got it = KNEW IT / CLEAR (nothing extra), Partly = ALMOST
  // (returns sooner), Missed = MISSED IT / NEEDS WORK (returns soonest).
  function ratingFor(kind, verdict) {
    if (verdict === 'got') return kind === 'share' ? 'clear' : 'knew';
    if (verdict === 'partly') return 'almost';
    return kind === 'share' ? 'needs' : 'missed';
  }

  // Mix-ups to show, most relevant first: those tied to an uncovered must-have,
  // in authored order (the key mix-up is written first).
  function misreadingsFor(check, coveredIds) {
    const missing = check.mustHaves.map((m) => m.id).filter((id) => !coveredIds.includes(id));
    const score = (m) => (m.relatesTo.some((id) => missing.includes(id)) ? 1 : 0);
    return check.misreadings
      .map((m, i) => ({ m, i, s: score(m) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.m);
  }

  function checks(player) {
    return (player.checks = player.checks || []);
  }

  function recordCheck(player, entry, now) {
    const rec = {
      check_id: makeId('CK-'),
      node_id: entry.nodeId,
      encounter_id: entry.encounterId || null,
      response_id: entry.responseId || null, // the typed answer, if any
      mode: entry.responseId ? 'typed' : 'head',
      covered: entry.covered.slice(),
      offered: entry.offered.slice(),
      verdict: entry.verdict,
      at: now || Date.now(),
    };
    checks(player).push(rec);
    return rec;
  }

  BF.notes = { list, add, forNode, forKey, dateOf, typeOf, previousExplain, previousFor, explainHistory, pickFrame, frameInfo, explainAsk, verdictFor, ratingFor, misreadingsFor, checks, recordCheck };
})((globalThis.BF = globalThis.BF || {}));
