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

  // { nodeIds, encounterId?, text, prompt?, model?, promptType? } → saved record
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

  BF.notes = { list, add, forNode, dateOf, typeOf, previousExplain, verdictFor, ratingFor, misreadingsFor, checks, recordCheck };
})((globalThis.BF = globalThis.BF || {}));
