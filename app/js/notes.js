// YOUR WORDS: the player's own explanations, saved privately on this device.
// Plain data helpers on player.yourWords — no DOM, no storage, no scoring.
// Writing never earns Knowledge; it is a notebook, not a test.
(function (BF) {
  'use strict';

  function list(player) {
    return (player.yourWords = player.yourWords || []);
  }

  function makeId() {
    return 'YW-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // { nodeIds, encounterId?, text, prompt?, model? } → saved record
  function add(player, entry, now) {
    const text = String(entry.text || '').trim();
    if (!text) return null;
    const nodeIds = (entry.nodeIds || []).filter(Boolean);
    const rec = {
      response_id: makeId(),
      node_id: nodeIds[0] || null,
      node_ids: nodeIds,
      encounter_id: entry.encounterId || null,
      text,
      created_at: now || Date.now(),
      updated_at: null,
      prompt: entry.prompt || null,
      model_answer_snapshot: entry.model || null,
    };
    list(player).push(rec);
    return rec;
  }

  function update(player, id, text, now) {
    const rec = list(player).find((r) => r.response_id === id);
    const t = String(text || '').trim();
    if (!rec || !t) return null;
    rec.text = t;
    rec.updated_at = now || Date.now();
    return rec;
  }

  function remove(player, id) {
    const arr = list(player);
    const i = arr.findIndex((r) => r.response_id === id);
    if (i === -1) return false;
    arr.splice(i, 1);
    return true;
  }

  // Newest first.
  function forNode(player, nodeId) {
    return list(player)
      .filter((r) => r.node_id === nodeId || (r.node_ids || []).includes(nodeId))
      .sort((a, b) => b.created_at - a.created_at);
  }

  BF.notes = { list, add, update, remove, forNode };
})((globalThis.BF = globalThis.BF || {}));
