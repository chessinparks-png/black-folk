// Session engine: curated starter sessions, adaptive session generation,
// derived encounters (built only from curriculum text), pacing, scoring,
// and session summaries. Pure logic: no DOM, no storage.
(function (BF) {
  'use strict';

  const M = BF.mastery;
  const SESSION_LENGTH = 6;
  const CONNECTION_MODES = ['CONNECT', 'SAME QUESTION', 'MATCH'];

  // ---- small utilities --------------------------------------------------------
  function makeRng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const isChoice = (e) => e.kind === 'choice';
  const round5 = (n) => Math.round(n / 5) * 5;

  // ---- derived encounters (curriculum text only; no new claims) ---------------
  const derive = {
    discover(n) {
      return {
        id: 'X-D-' + n.id, mode: 'DISCOVER', kind: 'discover', derived: true,
        title: n.name.toUpperCase(), statement: n.share, reveal: n.coreIdea,
        points: 10, nodeIds: [n.id], world: n.world, mastery: ['UNDERSTAND'],
        source: n.source + ' — ' + n.sourceSection, difficulty: 'easy', answerLabel: 'ANSWER',
      };
    },
    recall(n) {
      return {
        id: 'X-R-' + n.id, mode: 'RECALL', kind: 'recall', derived: true,
        eyebrow: 'Think before revealing', subject: n.name,
        prompt: 'What is the core idea worth remembering?', reveal: n.coreIdea,
        points: 20, nodeIds: [n.id], mastery: ['RECALL'], difficulty: 'medium',
        source: n.source + ' — ' + n.sourceSection, answerLabel: 'ANSWER',
      };
    },
    share(n) {
      return {
        id: 'X-S-' + n.id, mode: 'SHARE', kind: 'share', derived: true,
        eyebrow: '30 SECONDS', lead: 'Explain this line:', subject: n.name,
        prompt: '“' + n.share + '”', reveal: n.coreIdea,
        points: 25, nodeIds: [n.id], mastery: ['SHARE'], difficulty: 'hard',
        source: n.source + ' — ' + n.sourceSection, answerLabel: 'ANSWER',
      };
    },
    timeline(nodes) {
      return {
        id: 'X-T-' + nodes.map((n) => n.id).join('.'), mode: 'TIMELINE', kind: 'timeline', derived: true,
        prompt: 'Put these in chronological order.',
        items: nodes.map((n) => n.name), dates: nodes.map((n) => n.era),
        itemNodes: nodes.map((n) => n.id),
        reveal: nodes.map((n) => n.era).join(' → ') + '.',
        points: 15, nodeIds: nodes.map((n) => n.id), mastery: ['CONTEXTUALIZE'], difficulty: 'medium',
        source: 'Curriculum eras', answerLabel: 'ANSWER',
      };
    },
    match(nodes) {
      return {
        id: 'X-M-' + nodes.map((n) => n.id).join('.'), mode: 'MATCH', kind: 'match', derived: true,
        eyebrow: 'LENS', prompt: 'Match each idea to the lens it offers.',
        pairs: nodes.map((n) => ({ left: n.name, right: n.lens, nodeId: n.id })),
        reveal: 'A lens is a way of seeing that travels beyond its original moment.',
        points: 25, nodeIds: nodes.map((n) => n.id), mastery: ['CONNECT', 'APPLY'], difficulty: 'hard',
        source: 'Curriculum lenses', answerLabel: 'MATCH',
      };
    },
  };

  // Parse a curriculum era into a [start, end] year range, or null if unclear.
  function eraRange(era) {
    if (!era || /pre-|interpreting/i.test(era)) return null;
    const parts = String(era).split(/[–-]/).map((s) => s.trim());
    const one = (s) => {
      let m;
      if ((m = s.match(/^(\d{2})00s$/))) return [+m[1] * 100, +m[1] * 100 + 99];
      if ((m = s.match(/^(\d{3})0s$/))) return [+m[1] * 10, +m[1] * 10 + 9];
      if ((m = s.match(/^(\d{4})$/))) return [+m[1], +m[1]];
      return null;
    };
    const a = one(parts[0]);
    const b = parts[1] ? one(parts[1]) : a;
    if (!a || !b) return null;
    return [a[0], b[1]];
  }

  // ---- eligibility -----------------------------------------------------------
  function eligible(C, player, enc, introduced) {
    if (enc.kind === 'discover') return false;
    const ids = enc.nodeIds;
    const intro = (id) => introduced.has(id);
    const min = C.bossMinNodes[enc.id];
    if (min) return ids.filter(intro).length >= min;
    if (!ids.every(intro)) return false;
    if (enc.unlockRule && /correctly/.test(enc.unlockRule)) {
      return ids.some((id) => player.nodes[id] && player.nodes[id].correct > 0);
    }
    return true;
  }

  function encounterPool(C, player, introduced) {
    const pool = C.encounters.filter((e) => eligible(C, player, e, introduced));
    for (const id of introduced) {
      const n = C.nodesById[id];
      pool.push(derive.recall(n));
      if (player.nodes[id] && player.nodes[id].correct > 0) pool.push(derive.share(n));
    }
    return pool;
  }

  function derivedTimeline(C, introduced, rng, count) {
    const seenNames = new Set();
    const cands = shuffle([...introduced], rng)
      .map((id) => C.nodesById[id])
      .filter((n) => {
        if (!eraRange(n.era) || seenNames.has(n.name)) return false;
        seenNames.add(n.name);
        return true;
      });
    const chosen = [];
    for (const n of cands) {
      const r = eraRange(n.era);
      if (chosen.every((c) => { const q = eraRange(c.era); return r[1] < q[0] || q[1] < r[0]; })) chosen.push(n);
      if (chosen.length === count) break;
    }
    if (chosen.length < 3) return null;
    chosen.sort((a, b) => eraRange(a.era)[0] - eraRange(b.era)[0]);
    return derive.timeline(chosen);
  }

  function derivedMatch(C, introduced, rng) {
    const worlds = new Set();
    const chosen = [];
    for (const id of shuffle([...introduced], rng)) {
      const n = C.nodesById[id];
      if (!n.lens || worlds.has(n.world) || chosen.some((c) => c.name === n.name)) continue;
      worlds.add(n.world);
      chosen.push(n);
      if (chosen.length === 3) break;
    }
    return chosen.length === 3 ? derive.match(chosen) : null;
  }

  // ---- pacing -----------------------------------------------------------------
  // Cost of an ordering; lower is better. Hard rules carry large weights.
  function orderCost(items, discoveredHere) {
    let cost = 0;
    let run = 0;
    const introducedAt = {};
    items.forEach((it, i) => {
      if (it.kind === 'discover') for (const id of it.nodeIds) introducedAt[id] = i;
    });
    items.forEach((it, i) => {
      run = isChoice(it) ? run + 1 : 0;
      if (run > 2) cost += 50;
      if (it.kind !== 'discover') {
        for (const id of it.nodeIds) {
          if (discoveredHere.has(id) && introducedAt[id] > i) cost += 100;
        }
      }
      if (i > 0) {
        const prev = items[i - 1];
        if (prev.kind === it.kind) cost += it.kind === 'discover' ? 2 : 0.5;
      }
      if (it._slot === 'higher' && i !== items.length - 1) cost += 3;
    });
    if (items.some((i) => i.kind === 'discover') && items[0].kind !== 'discover') cost += 2;
    return cost;
  }

  function permutations(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    arr.forEach((x, i) => {
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      for (const p of permutations(rest)) out.push([x].concat(p));
    });
    return out;
  }

  function bestOrder(items, discoveredHere, rng) {
    let best = items;
    let bestCost = Infinity;
    for (const p of permutations(items)) {
      // A little noise breaks ties so sessions don't all share one rhythm.
      const c = orderCost(p, discoveredHere) + (rng ? rng() * 1.5 : 0);
      if (c < bestCost) {
        best = p;
        bestCost = c;
      }
    }
    return { order: best, cost: bestCost };
  }

  // Minimal repair for curated sequences: if three choice screens would run
  // together, swap the third with the next non-choice screen after it.
  function repairPacing(items) {
    const a = items.slice();
    let run = 0;
    for (let i = 0; i < a.length; i++) {
      run = isChoice(a[i]) ? run + 1 : 0;
      if (run > 2) {
        const j = a.findIndex((x, k) => k > i && !isChoice(x));
        if (j === -1) break;
        [a[i], a[j]] = [a[j], a[i]];
        run = 0;
      }
    }
    return a;
  }

  // ---- session construction ---------------------------------------------------
  function prepareItem(enc, rng) {
    const item = { enc };
    if (enc.kind === 'choice') item.order = shuffle(enc.choices, rng);
    if (enc.kind === 'timeline') {
      let order;
      do order = shuffle(enc.items.map((_, i) => i), rng);
      while (order.every((v, i) => v === i) && enc.items.length > 1);
      item.order = order;
    }
    if (enc.kind === 'match') item.order = shuffle(enc.pairs.map((_, i) => i), rng);
    return item;
  }

  function newSessionShell(kind, title, items, extra) {
    return Object.assign(
      {
        id: 'S-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        kind,
        title,
        items,
        index: 0,
        results: [],
        pending: [], // quiet reveals (threads) waiting to be shown
        knowledge: 0,
        strengthened: [],
        discovered: [],
        connections: 0,
        newThreads: [],
        newDebates: [],
        levelBefore: null,
        startedAt: Date.now(),
      },
      extra || {}
    );
  }

  function buildStarter(C, player, index, seed) {
    const s = C.starters[index];
    const rng = makeRng(seed || Date.now());
    const encs = repairPacing(s.encounterIds.map((id) => C.byId[id]));
    return newSessionShell('starter', s.title, encs.map((e) => prepareItem(e, rng)), {
      starterIndex: index,
      starterId: s.id,
      keepThis: s.keepThis,
      levelBefore: player.level,
    });
  }

  function lastSessionEncounterIds(player) {
    const h = player.history[player.history.length - 1];
    return new Set(h ? h.encounterIds : []);
  }

  function buildAdaptive(C, player, opts) {
    opts = opts || {};
    const now = opts.now || Date.now();
    const rng = makeRng(opts.seed || now);
    const introduced = new Set(Object.keys(player.nodes).filter((id) => player.nodes[id].introduced));
    const recent = lastSessionEncounterIds(player);
    const used = new Set();
    const usedNodes = new Set();
    const picks = [];
    const add = (enc, slot) => {
      const e = Object.assign({}, enc, { _slot: slot });
      used.add(enc.id);
      picks.push(e);
    };
    const seenCount = (id) => (player.encounters[id] ? player.encounters[id].count : 0);

    // 1) Two new ideas, introduced with DISCOVER cards.
    const discoveredHere = new Set();
    const curatedDiscover = Object.fromEntries(C.discovery.map((d) => [d.nodeIds[0], d]));
    const unlockValue = (id) =>
      C.encounters.filter((e) => e.nodeIds.includes(id)).length + (curatedDiscover[id] ? 3 : 0);
    const fresh = C.nodes
      .filter((n) => !introduced.has(n.id))
      .map((n) => ({ n, score: unlockValue(n.id) + rng() * 2 + (M.isSeen(player, n.id) ? 1 : 0) }))
      .sort((a, b) => b.score - a.score);
    const newWorlds = new Set();
    for (const { n } of fresh) {
      if (discoveredHere.size >= 2) break;
      if (newWorlds.has(n.world) && fresh.length > 4) continue;
      newWorlds.add(n.world);
      discoveredHere.add(n.id);
      add(curatedDiscover[n.id] || derive.discover(n), 'new');
    }
    const introPlus = new Set([...introduced, ...discoveredHere]);
    const pool = encounterPool(C, player, introPlus);

    // If the curriculum has run out of new ideas, "new" means an unseen encounter.
    while (picks.filter((p) => p._slot === 'new').length < 2) {
      const unseen = pool.filter((e) => !used.has(e.id) && !e.derived && !seenCount(e.id) && e.kind !== 'match');
      if (!unseen.length) break;
      add(unseen[Math.floor(rng() * unseen.length)], 'new');
    }

    // 2) Two retrieval/review encounters for ideas that are due (misses first).
    const reviewNodes = [...introduced]
      .map((id) => ({ id, n: player.nodes[id] }))
      .sort((a, b) => {
        const am = a.n.lastResult === 'miss' ? 0 : 1;
        const bm = b.n.lastResult === 'miss' ? 0 : 1;
        if (am !== bm) return am - bm;
        return (a.n.nextReview || 0) - (b.n.nextReview || 0);
      });
    let reviews = 0;
    for (const { id, n } of reviewNodes) {
      if (reviews >= 2) break;
      if (usedNodes.has(id)) continue;
      const cands = pool.filter(
        (e) => !used.has(e.id) && e.nodeIds.includes(id) && e.nodeIds.length <= 2 && e.kind !== 'match' && e.kind !== 'timeline'
      );
      if (!cands.length) continue;
      const hasUnaided = Math.max(n.recall, n.share, n.apply) >= 0.5;
      const scored = cands.map((e) => {
        const dims = M.dimsFor(e);
        let s = dims.reduce((acc, d) => acc + (1 - n[d]), 0) / Math.max(1, dims.length);
        if (!hasUnaided && ['recall', 'share', 'apply'].some((d) => dims.includes(d))) s += 0.5;
        if (recent.has(e.id)) s -= 1;
        if (e.nodeIds.length === 1) s += 0.3;
        if (e.derived) s -= 0.2; // prefer authored encounters when they exist
        s -= 0.15 * seenCount(e.id);
        return { e, s: s + rng() * 0.3 };
      });
      scored.sort((a, b) => b.s - a.s);
      add(scored[0].e, 'review');
      usedNodes.add(id);
      reviews++;
    }

    // 3) One connection or historical-context encounter.
    const connectModes = ['CONNECT', 'WHY THEN', 'TIMELINE', 'SAME QUESTION'];
    // Derived timelines/matches get a fresh id every time, so they would always
    // look "unseen"; damp them, especially if the last session already had one.
    const recentDerivedModes = new Set([...recent].filter((id) => /^X-[TM]-/.test(id)).map((id) => id[2]));
    const scoreFresh = (e) =>
      (seenCount(e.id) ? 0 : 1) - (recent.has(e.id) ? 1 : 0) +
      (e.nodeIds.some((id) => discoveredHere.has(id)) ? 0.3 : 0) + rng() * 0.4 -
      (e.derived && (e.kind === 'timeline' || e.kind === 'match')
        ? 0.6 + (recentDerivedModes.has(e.id[2]) ? 1 : 0)
        : 0);
    const pickBest = (cands) => cands.map((e) => ({ e, s: scoreFresh(e) })).sort((a, b) => b.s - a.s)[0];
    {
      const cands = pool.filter((e) => !used.has(e.id) && connectModes.includes(e.mode) && e.difficulty !== 'hard');
      const tl = derivedTimeline(C, introPlus, rng, 4);
      if (tl && !recent.has(tl.id)) cands.push(tl);
      const best = pickBest(cands);
      if (best) add(best.e, 'connect');
    }

    // 4) One higher-order encounter (comparison, transfer, share, synthesis).
    {
      const higherModes = ['SAME QUESTION', 'THEN → NOW', 'SHARE', 'MATCH'];
      const cands = pool.filter(
        (e) => !used.has(e.id) && (higherModes.includes(e.mode) || (e.mode === 'CONNECT' && e.difficulty === 'hard'))
      );
      const m = derivedMatch(C, introPlus, rng);
      if (m) cands.push(m);
      const scored = cands.map((e) => ({
        e,
        s: scoreFresh(e) + (e.difficulty === 'boss' && !seenCount(e.id) ? 2 : 0) + (e.derived ? -0.3 : 0),
      }));
      scored.sort((a, b) => b.s - a.s);
      if (scored[0]) add(scored[0].e, 'higher');
    }

    // Fill any gaps so a session is always six encounters.
    let guard = 0;
    while (picks.length < SESSION_LENGTH && guard++ < 50) {
      const cands = pool.filter((e) => !used.has(e.id) && e.kind !== 'match' && e.kind !== 'timeline');
      if (!cands.length) break;
      const best = pickBest(cands);
      add(best.e, 'fill');
    }

    // Order for rhythm; if choice screens still bunch up, swap a review for RECALL.
    let { order, cost } = bestOrder(picks, discoveredHere, rng);
    if (cost >= 49) {
      const idx = picks.findIndex((p) => isChoice(p) && p._slot !== 'higher' && p.nodeIds.length === 1);
      if (idx !== -1) {
        const r = derive.recall(C.nodesById[picks[idx].nodeIds[0]]);
        if (!used.has(r.id)) {
          picks[idx] = Object.assign({}, r, { _slot: picks[idx]._slot });
          order = bestOrder(picks, discoveredHere, rng).order;
        }
      }
    }

    // Title the session after the world most of its ideas come from.
    const worldCount = {};
    for (const e of order) for (const id of e.nodeIds) {
      const w = C.nodesById[id].world;
      worldCount[w] = (worldCount[w] || 0) + 1;
    }
    const topWorld = Object.keys(worldCount).sort((a, b) => worldCount[b] - worldCount[a])[0];
    const world = C.worlds.find((w) => w.id === topWorld);

    return newSessionShell('adaptive', world ? world.question.toUpperCase() : 'SESSION', order.map((e) => prepareItem(e, rng)), {
      world: topWorld,
      levelBefore: player.level,
    });
  }

  function buildNext(C, player, opts) {
    if (player.startersCompleted < C.starters.length) {
      return buildStarter(C, player, player.startersCompleted, opts && opts.seed);
    }
    return buildAdaptive(C, player, opts);
  }

  // ---- scoring ----------------------------------------------------------------
  const RATING_QUALITY = { knew: 1, clear: 1, almost: 0.5, missed: 0, needs: 0 };

  // response: choice → { choice }, recall/share → { rating }, timeline → { order: [itemIdx…] },
  // match → { pairs: { leftIdx: rightIdx } }, discover → {}.
  function evaluate(enc, response) {
    const miss = M.CONFIG.missPoints;
    switch (enc.kind) {
      case 'discover':
        return { quality: 1, points: enc.points };
      case 'choice': {
        const ok = response.choice === enc.correct;
        return { quality: ok ? 1 : 0, points: ok ? enc.points : miss, correct: ok };
      }
      case 'recall':
      case 'share':
        // Self-rating is honest reflection, so it never changes the points earned.
        return { quality: RATING_QUALITY[response.rating], points: enc.points, rating: response.rating };
      case 'timeline': {
        const placed = response.order;
        const hits = placed.map((v, i) => v === i);
        const frac = hits.filter(Boolean).length / placed.length;
        const perNode = enc.itemNodes ? Object.fromEntries(enc.itemNodes.map((id, i) => [id, hits[i] ? 1 : 0])) : null;
        return partial(enc, frac, perNode, { hits });
      }
      case 'match': {
        const hits = enc.pairs.map((_, i) => response.pairs[i] === i);
        const frac = hits.filter(Boolean).length / enc.pairs.length;
        const perNode = enc.pairs.every((p) => p.nodeId)
          ? Object.fromEntries(enc.pairs.map((p, i) => [p.nodeId, hits[i] ? 1 : 0]))
          : null;
        return partial(enc, frac, perNode, { hits });
      }
    }
    throw new Error('Cannot evaluate ' + enc.kind);
  }
  function partial(enc, frac, perNode, extra) {
    const miss = M.CONFIG.missPoints;
    const quality = frac === 1 ? 1 : frac >= 0.5 ? 0.5 : 0;
    const points = frac === 1 ? enc.points : Math.max(miss, round5((enc.points * frac) / 2));
    return Object.assign({ quality, points, perNode, correct: frac === 1 }, extra);
  }

  // Apply an evaluated result to player + session. Returns what changed.
  function applyResult(C, player, session, result, now) {
    now = now || Date.now();
    const item = session.items[session.index];
    const enc = item.enc;
    const prior = player.encounters[enc.id] ? player.encounters[enc.id].successes : 0;
    const wasIntroduced = new Set(enc.nodeIds.filter((id) => M.isIntroduced(player, id)));

    M.recordEncounter(player, enc, result.quality, now, result.perNode);
    M.addKnowledge(player, result.points);
    if (result.rating) {
      player.ratings.push({ encounterId: enc.id, rating: result.rating, at: now });
      if (player.ratings.length > 1000) player.ratings.splice(0, player.ratings.length - 1000);
    }

    session.knowledge += result.points;
    for (const id of enc.nodeIds) {
      const q = result.perNode && result.perNode[id] != null ? result.perNode[id] : result.quality;
      if (q > 0 && !session.strengthened.includes(id)) session.strengthened.push(id);
      if (!wasIntroduced.has(id) && M.isIntroduced(player, id) && !session.discovered.includes(id)) {
        session.discovered.push(id);
      }
    }
    const newConnection = CONNECTION_MODES.includes(enc.mode) && result.quality >= 1 && prior === 0;
    if (newConnection) session.connections++;

    const unlocks = M.updateUnlocks(C, player, now);
    session.newThreads.push(...unlocks.threads);
    session.newDebates.push(...unlocks.debates);
    session.pending.push(...unlocks.threads.map((id) => ({ type: 'thread', id })));

    session.results[session.index] = {
      encounterId: enc.id,
      quality: result.quality,
      points: result.points,
      rating: result.rating || null,
      at: now,
    };
    return { points: result.points, unlocks, newConnection };
  }

  function keepThisFor(C, session) {
    if (session.keepThis) return session.keepThis;
    const pickFrom = session.discovered.length ? session.discovered : session.strengthened;
    const singles = session.items.filter((i) => i.enc.nodeIds.length === 1).map((i) => i.enc.nodeIds[0]);
    const id = pickFrom.find((x) => singles.includes(x)) || pickFrom[0] || singles[0];
    return id ? C.nodesById[id].share : null;
  }

  function finish(C, player, session, now) {
    now = now || Date.now();
    const keepThis = keepThisFor(C, session);
    const summary = {
      id: session.id,
      kind: session.kind,
      title: session.title,
      startedAt: session.startedAt,
      endedAt: now,
      knowledge: session.knowledge,
      strengthened: session.strengthened.length,
      connections: session.connections,
      threads: session.newThreads.slice(),
      debates: session.newDebates.slice(),
      keepThis,
      levelBefore: session.levelBefore,
      levelAfter: player.level,
      encounterIds: session.items.map((i) => i.enc.id),
    };
    player.history.push(summary);
    if (player.history.length > 500) player.history.splice(0, player.history.length - 500);
    if (session.kind === 'starter' && session.starterIndex === player.startersCompleted) {
      player.startersCompleted++;
    }
    return summary;
  }

  BF.session = {
    SESSION_LENGTH,
    derive,
    eraRange,
    eligible,
    encounterPool,
    repairPacing,
    orderCost,
    buildStarter,
    buildAdaptive,
    buildNext,
    evaluate,
    applyResult,
    finish,
    keepThisFor,
    makeRng,
    shuffle,
  };
})((globalThis.BF = globalThis.BF || {}));
