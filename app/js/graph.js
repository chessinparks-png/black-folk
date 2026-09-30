// Knowledge Map data layer: the graph of ideas, threads, debates, context and
// WORDS; which parts the player has revealed; and a deterministic layout.
// Pure logic: no DOM, no storage.
(function (BF) {
  'use strict';

  const M = BF.mastery;
  const pairId = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  // ---- graph construction -----------------------------------------------------
  // Edges connect curriculum nodes. Each edge remembers why it exists
  // (encounter / thread / debate / map) so it can be revealed for that reason.
  function build(C) {
    const edges = new Map();
    const add = (a, b, kind, ref) => {
      if (!a || !b || a === b || !C.nodesById[a] || !C.nodesById[b]) return;
      const id = pairId(a, b);
      let e = edges.get(id);
      if (!e) {
        const [x, y] = id.split('|');
        e = { id, a: x, b: y, kinds: new Set(), encounters: [], threads: [], debates: [] };
        edges.set(id, e);
      }
      e.kinds.add(kind);
      if (ref && kind === 'encounter') e.encounters.push(ref);
      if (ref && kind === 'thread') e.threads.push(ref);
      if (ref && kind === 'debate') e.debates.push(ref);
    };

    // Authored encounters that link several ideas.
    for (const enc of C.encounters) {
      const ids = enc.nodeIds;
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) add(ids[i], ids[j], 'encounter', enc.id);
    }
    // Neighbouring steps along each thread.
    for (const t of C.threads) {
      const steps = t.steps.filter((s) => s.nodeIds.length);
      for (let i = 0; i + 1 < steps.length; i++) {
        for (const a of steps[i].nodeIds) for (const b of steps[i + 1].nodeIds) add(a, b, 'thread', t.id);
      }
    }
    // The two sides of each debate.
    for (const d of C.debates) {
      const [s1, s2] = d.sides;
      if (s1 && s2) for (const a of s1.nodeIds) for (const b of s2.nodeIds) add(a, b, 'debate', d.id);
    }
    // V1.5 knowledge map: idea↔idea connections. Those tied to an encounter reveal
    // when it is played (or both ideas are familiar); the rest reveal once both
    // ideas have been discovered.
    const raw = C.knowledgeMapRaw;
    for (const r of (raw && raw.edges) || []) {
      if (r.type !== 'encounter_connection') continue;
      if (r.encounter_id) add(r.from, r.to, 'encounter', r.encounter_id);
      else add(r.from, r.to, 'discovered', null);
    }

    const byNode = {};
    for (const e of edges.values()) {
      (byNode[e.a] = byNode[e.a] || []).push(e);
      (byNode[e.b] = byNode[e.b] || []).push(e);
    }
    const wordsByNode = {};
    for (const w of C.words) for (const id of w.nodeIds) (wordsByNode[id] = wordsByNode[id] || []).push(w);
    const contextByNode = {};
    for (const c of C.context) for (const id of c.nodeIds) (contextByNode[id] = contextByNode[id] || []).push(c);

    return { edges, byNode, wordsByNode, contextByNode, layout: layout(C) };
  }

  // ---- player map state ---------------------------------------------------------
  function ensure(player) {
    player.map = player.map || { nodes: {}, edges: {}, lastViewed: 0 };
    player.map.nodes = player.map.nodes || {};
    player.map.edges = player.map.edges || {};
    player.words = player.words || {};
    return player.map;
  }

  const FAMILIARISH = ['FAMILIAR', 'STRONG'];

  // Reveal what this encounter showed: its ideas, and the links between them.
  function revealFromEncounter(G, player, enc, now) {
    const map = ensure(player);
    for (const id of enc.nodeIds) if (M.isSeen(player, id) && !map.nodes[id]) map.nodes[id] = now;
    const ids = enc.nodeIds;
    const added = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const id = pairId(ids[i], ids[j]);
        if (G.edges.has(id) && !map.edges[id]) {
          map.edges[id] = now;
          added.push(id);
        }
      }
    }
    return added;
  }

  // Thread and debate unlocks reveal their own links, but only between ideas
  // the player has already met.
  function revealFromUnlocks(C, G, player, unlocks, now) {
    const map = ensure(player);
    const added = [];
    const mark = (a, b) => {
      const id = pairId(a, b);
      if (G.edges.has(id) && !map.edges[id]) {
        map.edges[id] = now;
        added.push(id);
      }
    };
    for (const tid of unlocks.threads || []) {
      const t = C.threadsById[tid];
      const seen = t.steps.map((s) => s.nodeIds.find((id) => M.isSeen(player, id))).filter(Boolean);
      for (let i = 0; i + 1 < seen.length; i++) mark(seen[i], seen[i + 1]);
    }
    for (const did of unlocks.debates || []) {
      const d = C.debatesById[did];
      const [s1, s2] = d.sides;
      const a = s1.nodeIds.find((id) => M.isIntroduced(player, id));
      const b = s2 && s2.nodeIds.find((id) => M.isIntroduced(player, id));
      if (a && b) mark(a, b);
    }
    return added;
  }

  // Links between two ideas the player knows well become visible on their own;
  // map links marked "discovered" need only both ideas to have been met.
  function revealFromFamiliarity(G, player, now) {
    const map = ensure(player);
    const added = [];
    for (const e of G.edges.values()) {
      if (map.edges[e.id]) continue;
      const bothMet = e.kinds.has('discovered') && M.isSeen(player, e.a) && M.isSeen(player, e.b);
      if (bothMet || (FAMILIARISH.includes(M.label(player, e.a)) && FAMILIARISH.includes(M.label(player, e.b)))) {
        map.edges[e.id] = now;
        added.push(e.id);
      }
    }
    return added;
  }

  // One call after every PLAY result.
  function update(C, G, player, enc, unlocks, now) {
    now = now || Date.now();
    return [
      ...revealFromEncounter(G, player, enc, now),
      ...revealFromUnlocks(C, G, player, unlocks || {}, now),
      ...revealFromFamiliarity(G, player, now),
    ];
  }

  // Rebuild map state from older saves that predate the map (schema v1).
  function backfill(C, G, player) {
    const map = ensure(player);
    for (const id of Object.keys(player.nodes)) {
      if (player.nodes[id].seen && !map.nodes[id]) map.nodes[id] = player.nodes[id].firstSeen || Date.now();
    }
    for (const eid of Object.keys(player.encounters)) {
      const enc = C.byId[eid];
      if (enc) revealFromEncounter(G, player, enc, player.encounters[eid].lastSeen || Date.now());
    }
    revealFromUnlocks(C, G, player, { threads: Object.keys(player.threadsUnlocked), debates: Object.keys(player.debatesUnlocked) }, Date.now());
    revealFromFamiliarity(G, player, Date.now());
  }

  // LOCKED → DISCOVERED → CONNECTED → FAMILIAR → STRONG
  function nodeState(G, player, id) {
    const map = ensure(player);
    if (!map.nodes[id] && !M.isSeen(player, id)) return 'locked';
    const label = M.label(player, id);
    if (label === 'STRONG') return 'strong';
    if (label === 'FAMILIAR') return 'familiar';
    if ((G.byNode[id] || []).some((e) => map.edges[e.id])) return 'connected';
    return 'discovered';
  }

  function visibleEdges(G, player) {
    const map = ensure(player);
    return [...G.edges.values()].filter((e) => map.edges[e.id]);
  }

  function connectionsOf(G, player, id) {
    const map = ensure(player);
    return (G.byNode[id] || []).filter((e) => map.edges[e.id]).map((e) => (e.a === id ? e.b : e.a));
  }

  function discoveredCount(C, player, worldId) {
    return C.nodes.filter((n) => n.world === worldId && (ensure(player).nodes[n.id] || M.isSeen(player, n.id))).length;
  }

  // ---- WORDS state --------------------------------------------------------------
  function wordsFound(C, player) {
    ensure(player);
    return C.words.filter((w) => player.words[w.id]);
  }
  function isFound(player, wid) {
    return !!(player.words && player.words[wid]);
  }

  // ---- layout -------------------------------------------------------------------
  // Worlds sit on a ring; each world's ideas circle its label, ordered by era.
  const SIZE = 1200;
  function eraStart(n) {
    const m = String(n.era).match(/\d{3,4}/);
    if (!m) return /pre-/.test(n.era) ? 1500 : 3000;
    const v = m[0].length === 3 ? +m[0] * 10 : +m[0];
    return v;
  }
  function layout(C) {
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const R = 405;
    const worlds = {};
    const nodes = {};
    C.worlds.forEach((w, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / C.worlds.length;
      const wx = cx + R * Math.cos(ang);
      const wy = cy + R * Math.sin(ang);
      worlds[w.id] = { x: wx, y: wy, angle: ang };
      const members = C.nodes.filter((n) => n.world === w.id).sort((a, b) => eraStart(a) - eraStart(b));
      const r = 62 + members.length * 6;
      members.forEach((n, k) => {
        const a = ang + Math.PI + ((k + 0.5) * 2 * Math.PI) / members.length;
        nodes[n.id] = { x: wx + r * Math.cos(a), y: wy + r * Math.sin(a), angle: a, wx, wy };
      });
    });
    return { size: SIZE, worlds, nodes, center: { x: cx, y: cy } };
  }

  // Layout for a single world, larger and labelled.
  function worldLayout(C, worldId) {
    const members = C.nodes.filter((n) => n.world === worldId).sort((a, b) => eraStart(a) - eraStart(b));
    const W = 1000;
    const H = 760;
    const cx = W / 2;
    const cy = H / 2;
    const r = 255;
    const nodes = {};
    members.forEach((n, k) => {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / members.length;
      nodes[n.id] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) * 0.82, angle: a };
    });
    return { width: W, height: H, center: { x: cx, y: cy }, nodes };
  }

  BF.graph = {
    build,
    ensure,
    update,
    backfill,
    nodeState,
    visibleEdges,
    connectionsOf,
    discoveredCount,
    wordsFound,
    isFound,
    worldLayout,
    pairId,
  };
})((globalThis.BF = globalThis.BF || {}));
