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

  // ---- WORDS encounters -------------------------------------------------------
  // Quotations are shown exactly as supplied. Questions ask what the words
  // connect to (ideas, threads), not who said them — WHO is used sparingly.
  const wordsDerive = {
    // A quiet card: the quote, its speaker, the idea it belongs to. No question.
    card(C, w) {
      const n = C.nodesById[w.nodeIds[0]];
      return {
        id: 'X-WC-' + w.id, mode: 'WORDS', kind: 'quote', derived: true, quoteId: w.id,
        subject: n.name, points: 0, nodeIds: [n.id], mastery: [], difficulty: 'easy',
        source: 'WORDS', answerLabel: 'ANSWER',
      };
    },
    // "These words connect to which idea?" — pick one of two curriculum share lines.
    meaning(C, w, introduced, rng) {
      const n = C.nodesById[w.nodeIds[0]];
      const other = shuffle(
        C.nodes.filter((o) => !w.nodeIds.includes(o.id) && introduced.has(o.id) && o.world !== n.world), rng
      )[0];
      if (!other) return null;
      return {
        id: 'X-WM-' + w.id, mode: 'WORDS', kind: 'binary', form: 'binary', derived: true, quoteId: w.id, hideSpeaker: true,
        eyebrow: 'What is this really saying?', prompt: 'These words connect to which idea?',
        choices: rng() < 0.5 ? [n.share, other.share] : [other.share, n.share], correct: n.share, reveal: n.coreIdea,
        points: 15, nodeIds: [n.id], mastery: ['UNDERSTAND', 'CONNECT'], difficulty: 'medium',
        source: 'WORDS', answerLabel: 'BEST FIT',
      };
    },
    // "Which thread runs through these words?" — only for revealed threads.
    thread(C, w, player, rng) {
      const nid = w.nodeIds[0];
      const on = C.threads.filter((t) => t.steps.some((s) => s.nodeIds.includes(nid)));
      const mine = on.filter((t) => player.threadsUnlocked[t.id]);
      if (!mine.length) return null;
      const t = mine[Math.floor(rng() * mine.length)];
      const off = shuffle(C.threads.filter((x) => !on.includes(x)), rng).slice(0, 2);
      if (off.length < 2) return null;
      return {
        id: 'X-WT-' + w.id, mode: 'WORDS', kind: 'choice', form: 'pick', derived: true, quoteId: w.id,
        eyebrow: 'Which thread?', prompt: 'Which thread runs through these words?',
        choices: [t.title].concat(off.map((x) => x.title)), correct: t.title, reveal: t.question,
        points: 20, nodeIds: [nid], mastery: ['CONNECT'], difficulty: 'hard',
        source: 'WORDS', answerLabel: 'BEST FIT',
      };
    },
    // Recall the idea first; the words appear with the answer.
    recall(C, w) {
      const n = C.nodesById[w.nodeIds[0]];
      return {
        id: 'X-WR-' + w.id, mode: 'RECALL', kind: 'recall', derived: true, quoteId: w.id, quoteAfter: true,
        eyebrow: 'Think before revealing', subject: n.name,
        prompt: 'Before you see the quotation: what was the core idea?', reveal: n.coreIdea,
        points: 20, nodeIds: [n.id], mastery: ['RECALL'], difficulty: 'medium',
        source: 'WORDS', answerLabel: 'ANSWER',
      };
    },
    // Occasional WHO: whose words are these?
    who(C, w, rng) {
      if (!w.speaker) return null;
      const speakers = [...new Set(C.words.map((x) => x.speaker).filter((sp) => sp && sp !== w.speaker))];
      if (speakers.length < 3) return null;
      const n = C.nodesById[w.nodeIds[0]];
      return {
        id: 'X-WW-' + w.id, mode: 'WHO', kind: 'choice', form: 'pick', derived: true, quoteId: w.id, hideSpeaker: true,
        eyebrow: 'Words', prompt: 'Whose words are these?',
        choices: [w.speaker].concat(shuffle(speakers, rng).slice(0, 2)), correct: w.speaker, reveal: n.coreIdea,
        points: 10, nodeIds: [n.id], mastery: ['RECALL'], difficulty: 'easy',
        source: 'WORDS', answerLabel: 'ANSWER',
      };
    },
  };

  function wordsPool(C, player, introduced, rng) {
    const out = [];
    for (const w of C.words) {
      if (!introduced.has(w.nodeIds[0])) continue;
      const found = !!(player.words && player.words[w.id]);
      if (!found) out.push(wordsDerive.card(C, w));
      const m = wordsDerive.meaning(C, w, introduced, rng);
      if (m) out.push(m);
      const t = wordsDerive.thread(C, w, player, rng);
      if (t) out.push(t);
      out.push(wordsDerive.recall(C, w));
      if (found && rng() < 0.25) {
        const who = wordsDerive.who(C, w, rng);
        if (who) out.push(who);
      }
    }
    return out;
  }

  // Attach one not-yet-found quotation to each DISCOVER card whose idea has one.
  // It appears quietly under the reveal ("WORDS FOUND").
  function attachWords(C, player, items) {
    const taken = new Set();
    for (const it of items) {
      if (it.enc.kind !== 'discover') continue;
      const nid = it.enc.nodeIds[0];
      const w = C.words.find((x) => x.nodeIds.includes(nid) && !taken.has(x.id) && !(player.words && player.words[x.id]));
      if (w) {
        it.quoteId = w.id;
        taken.add(w.id);
      }
    }
    for (const it of items) if (it.enc.quoteId) taken.add(it.enc.quoteId);
    return items;
  }

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


  // ---- writing rhythm -----------------------------------------------------------
  // Cards that offer YOUR WORDS (RECALL / SHARE) are "writing cards". Rules:
  // never two in a row, at least two tap cards right before each one, and a
  // session never ends on one. This runs after a session is built and only
  // reorders it (keeping DISCOVER-before-test and the choice-run limit). If a
  // session holds more writing cards than the rhythm allows, the extras are
  // still played in full but without the writing option (item.noWrite), so they
  // count as tap cards. Cards with an understanding check keep writing first.
  const offersWriting = (it) => (it.enc.kind === 'recall' || it.enc.kind === 'share') && it.enc.nodeIds.length > 0;
  function isWritingItem(it) {
    return offersWriting(it) && !it.noWrite;
  }
  function rhythmOk(order, writing) {
    for (let i = 0; i < order.length; i++) {
      if (!writing.has(order[i])) continue;
      if (i < 2 || i === order.length - 1) return false;
      if (writing.has(order[i - 1]) || writing.has(order[i - 2])) return false;
    }
    return true;
  }
  function introOk(order) {
    const at = {};
    order.forEach((it, i) => {
      if (it.enc.kind === 'discover') for (const id of it.enc.nodeIds) if (at[id] == null) at[id] = i;
    });
    return order.every((it, i) => it.enc.kind === 'discover' || it.enc.nodeIds.every((id) => at[id] == null || at[id] < i));
  }
  function maxRun(order) {
    let run = 0, max = 0;
    for (const it of order) { run = isChoice(it.enc) ? run + 1 : 0; max = Math.max(max, run); }
    return max;
  }
  function subsets(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [x, ...rest] = arr;
    return subsets(rest, k - 1).map((s) => [x].concat(s)).concat(subsets(rest, k));
  }
  function applyRhythm(C, items) {
    const cands = items.filter(offersWriting);
    if (!cands.length) return items;
    const runLimit = Math.max(2, maxRun(items));
    const pos = new Map(items.map((it, i) => [it, i]));
    const hasCheck = (it) => !!(BF.content && BF.content.checkFor && BF.content.checkFor(C, it.enc));
    const orders = items.length <= 8 ? permutations(items) : [items];
    for (let k = cands.length; k >= 0; k--) {
      let best = null;
      for (const keep of subsets(cands, k)) {
        const writing = new Set(keep);
        const bonus = keep.filter(hasCheck).length * 1000;
        for (const o of orders) {
          if (!rhythmOk(o, writing) || !introOk(o) || maxRun(o) > runLimit) continue;
          const moved = o.reduce((sum, it, i) => sum + Math.abs(i - pos.get(it)), 0);
          // Prefer not to end on a DISCOVER card: an idea met last is never tried.
          const endsOnDiscover = o[o.length - 1].enc.kind === 'discover' ? 4 : 0;
          const cost = moved - bonus + endsOnDiscover;
          if (!best || cost < best.cost) best = { cost, order: o, writing };
        }
      }
      if (best) {
        for (const it of cands) if (!best.writing.has(it)) it.noWrite = true;
        return best.order;
      }
    }
    return items;
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
    if (enc.kind === 'binary') item.order = enc.choices.slice(); // authored order (Yes / No …)
    if (enc.kind === 'sort') item.order = shuffle(enc.items.map((_, i) => i), rng);
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
    return newSessionShell('starter', s.title, applyRhythm(C, attachWords(C, player, encs.map((e) => prepareItem(e, rng)))), {
      starterIndex: index,
      starterId: s.id,
      keepThis: s.keepThis,
      levelBefore: player.level,
    });
  }

  // V1.5 bridge sessions (S04–S08): curated theme bundles that surface after
  // onboarding, alternating with adaptive review sessions. Not mandatory tutorials.
  function pendingBridges(C, player) {
    const done = new Set(player.bridgesCompleted || []);
    return C.bridges.filter((b) => !done.has(b.id));
  }

  function buildBridge(C, player, bridge, seed) {
    const rng = makeRng(seed || Date.now());
    const encs = repairPacing(bridge.encounterIds.map((id) => C.byId[id]));
    return newSessionShell('bridge', bridge.title, applyRhythm(C, attachWords(C, player, encs.map((e) => prepareItem(e, rng)))), {
      bridgeId: bridge.id,
      keepThis: bridge.keepThis,
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
    let wordsUsed = 0; // at most two WORDS encounters per session
    const okWords = (e) => !e.quoteId || wordsUsed < 2;
    const add = (enc, slot) => {
      if (enc.quoteId) wordsUsed++;
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
    // Ideas a pending bridge session introduces are left for that session.
    const reserved = new Set(pendingBridges(C, player).flatMap((b) => b.encounterIds.filter((id) => /^D/.test(id)).flatMap((id) => C.byId[id].nodeIds)));
    // V1.6 deepening cards surface out of the network: a card becomes a candidate
    // once two of the ideas it deepens have been introduced (at most one per session).
    const cardReady = (c) => !introduced.has(c.id) && c.connections.filter((x) => introduced.has(x)).length >= 2;
    const unmet = C.nodes.filter((n) => !introduced.has(n.id)).concat((C.cardNodes || []).filter(cardReady));
    const fresh = (unmet.some((n) => !reserved.has(n.id)) ? unmet.filter((n) => !reserved.has(n.id)) : unmet)
      .map((n) => ({ n, score: unlockValue(n.id) + rng() * 2 + (M.isSeen(player, n.id) ? 1 : 0) }))
      .sort((a, b) => b.score - a.score);
    const newWorlds = new Set();
    let cardsHere = 0;
    for (const { n } of fresh) {
      if (discoveredHere.size >= 2) break;
      if (n.isCard && cardsHere >= 1) continue;
      if (newWorlds.has(n.world) && fresh.length > 4) continue;
      if (n.isCard) cardsHere++;
      newWorlds.add(n.world);
      discoveredHere.add(n.id);
      add(curatedDiscover[n.id] || derive.discover(n), 'new');
    }
    const introPlus = new Set([...introduced, ...discoveredHere]);
    const pool = encounterPool(C, player, introPlus);
    // WORDS only draw on ideas met before this session.
    const words = wordsPool(C, player, introduced, rng);
    pool.push(...words.filter((e) => e.kind !== 'quote'));

    // If the curriculum has run out of new ideas, "new" means an unseen encounter.
    while (picks.filter((p) => p._slot === 'new').length < 2) {
      const unseen = pool.filter((e) => !used.has(e.id) && !e.derived && !seenCount(e.id) && e.kind !== 'match');
      // When the curriculum has no new ideas left, an unfound quotation is "new" too.
      const cards = words.filter((e) => e.kind === 'quote' && !used.has(e.id) && okWords(e));
      if (cards.length && (!unseen.length || rng() < 0.4)) {
        add(cards[Math.floor(rng() * cards.length)], 'new');
        continue;
      }
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
        (e) => !used.has(e.id) && okWords(e) && e.nodeIds.includes(id) && e.nodeIds.length <= 2 && e.kind !== 'match' && e.kind !== 'timeline'
      );
      if (!cands.length) continue;
      const hasUnaided = Math.max(n.recall, n.share, n.apply) >= 0.5;
      const scored = cands.map((e) => {
        const dims = M.dimsFor(e);
        let s = dims.reduce((acc, d) => acc + (1 - n[d]), 0) / Math.max(1, dims.length);
        if (!hasUnaided && ['recall', 'share', 'apply'].some((d) => dims.includes(d))) s += 0.5;
        if (recent.has(e.id)) s -= 1;
        if (e.nodeIds.length === 1) s += 0.3;
        if (e.derived && !e.quoteId) s -= 0.2; // prefer authored encounters when they exist
        if (e.quoteId && !(player.words && player.words[e.quoteId])) s += 0.35; // unfound WORDS
        s -= 0.15 * seenCount(e.id);
        return { e, s: s + rng() * 0.3 };
      });
      scored.sort((a, b) => b.s - a.s);
      add(scored[0].e, 'review');
      usedNodes.add(id);
      reviews++;
    }

    // 3) One connection or historical-context encounter.
    const connectModes = ['CONNECT', 'WHY THEN', 'TIMELINE', 'SAME QUESTION', 'WORDS', 'APPLY'];
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
      const cands = pool.filter((e) => !used.has(e.id) && okWords(e) && connectModes.includes(e.mode) && e.difficulty !== 'hard');
      const tl = derivedTimeline(C, introPlus, rng, 4);
      if (tl && !recent.has(tl.id)) cands.push(tl);
      const best = pickBest(cands);
      if (best) add(best.e, 'connect');
    }

    // 4) One higher-order encounter (comparison, transfer, share, synthesis).
    {
      const higherModes = ['SAME QUESTION', 'THEN → NOW', 'SHARE', 'MATCH', 'BOSS ROUND', 'APPLY'];
      const cands = pool.filter(
        (e) => !used.has(e.id) && okWords(e) && (higherModes.includes(e.mode) || (e.mode === 'CONNECT' && e.difficulty === 'hard'))
      );
      const m = derivedMatch(C, introPlus, rng);
      if (m) cands.push(m);
      const scored = cands.map((e) => ({
        e,
        s: scoreFresh(e) + ((e.boss || e.difficulty === 'boss') && !seenCount(e.id) ? 2 : 0) + (e.derived ? -0.3 : 0),
      }));
      scored.sort((a, b) => b.s - a.s);
      if (scored[0]) add(scored[0].e, 'higher');
    }

    // Fill any gaps so a session is always six encounters.
    let guard = 0;
    while (picks.length < SESSION_LENGTH && guard++ < 50) {
      const cands = pool.filter((e) => !used.has(e.id) && okWords(e) && e.kind !== 'match' && e.kind !== 'timeline');
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

    const items = applyRhythm(C, attachWords(C, player, order.map((e) => prepareItem(e, rng))));
    return newSessionShell('adaptive', world ? world.question.toUpperCase() : 'SESSION', items, {
      world: topWorld,
      levelBefore: player.level,
    });
  }

  // ---- LEARN FROM HERE: a session anchored on one idea --------------------------
  // Starts at the chosen idea and walks outward along real knowledge-map links:
  // the idea itself → its context → a connected idea and the encounter that
  // links them → a thread or debate neighbour → recall. Nothing is marked
  // learned in advance: neighbours that are new arrive as DISCOVER cards, and
  // only answered encounters change progress.
  function buildAnchored(C, player, anchorId, opts) {
    opts = opts || {};
    const rng = makeRng(opts.seed || Date.now());
    const G = C.graph || (C.graph = BF.graph.build(C));
    const anchor = C.nodesById[anchorId];
    if (!anchor) throw new Error('Unknown idea ' + anchorId);
    const introduced = new Set(Object.keys(player.nodes).filter((id) => player.nodes[id].introduced));
    const curatedDiscover = Object.fromEntries(C.discovery.map((d) => [d.nodeIds[0], d]));
    const known = new Set(introduced);
    const out = [];
    const used = new Set();
    const push = (e) => {
      if (!e || used.has(e.id)) return false;
      used.add(e.id);
      out.push(e);
      return true;
    };
    const introduce = (id) => {
      if (known.has(id)) return;
      push(curatedDiscover[id] || derive.discover(C.nodesById[id]));
      known.add(id);
    };
    const singles = (id) => C.encounters.filter((e) => e.nodeIds.length === 1 && e.nodeIds[0] === id);
    const tapFor = (id) => singles(id).find((e) => e.kind !== 'recall' && e.kind !== 'share' && !used.has(e.id) && !seen(e));
    const seen = (e) => player.encounters[e.id] && player.encounters[e.id].count;

    // 1) Enter through the idea.
    introduce(anchorId);
    // 2) Its context: WHY THEN first, else another single-idea encounter.
    const own = singles(anchorId).filter((e) => e.kind !== 'recall' && e.kind !== 'share');
    const context = own.find((e) => e.mode === 'WHY THEN' && !seen(e)) || own.find((e) => !seen(e)) || own[0];
    push(context);

    // 3–5) Neighbours, strongest relationships first: links from small authored
    // encounters (≤3 ideas), then knowledge-map links, then shared threads, then
    // debates. Pairs that only co-occur in big synthesis rounds rank last.
    const small = (eid) => C.byId[eid] && C.byId[eid].nodeIds.length <= 3;
    const rankOf = (e) => {
      if (e.kinds.has('encounter') && e.encounters.some(small)) return 0;
      if (e.kinds.has('discovered')) return 1;
      if (e.kinds.has('thread')) return 2;
      if (e.kinds.has('debate')) return 3;
      return 5;
    };
    const jointFor = (nbId) =>
      C.encounters
        .filter((e) => !used.has(e.id) && e.nodeIds.length <= 3 && e.nodeIds.includes(anchorId) && e.nodeIds.includes(nbId))
        .sort((x, y) => x.nodeIds.length - y.nodeIds.length || (seen(x) ? 1 : 0) - (seen(y) ? 1 : 0))[0];
    const neighbours = (G.byNode[anchorId] || [])
      .map((e) => {
        const id = e.a === anchorId ? e.b : e.a;
        const j = jointFor(id);
        // Cost = new ideas this neighbour would bring in; tight links come first.
        const cost = j ? j.nodeIds.filter((x) => !known.has(x)).length : known.has(id) ? 0 : 1;
        return { id, r: rankOf(e), joint: !!j, cost };
      })
      .filter((nb) => nb.r < 5)
      .sort((x, y) => (x.joint ? 0 : 1) - (y.joint ? 0 : 1) || x.cost - y.cost || x.r - y.r || rng() - 0.5);
    let bare = 0;
    for (const nb of neighbours) {
      if (out.length >= SESSION_LENGTH - 1) break;
      const joint = jointFor(nb.id);
      const newIds = [...new Set([nb.id].concat(joint ? joint.nodeIds : []))].filter((id) => !known.has(id));
      if (newIds.length > 2) continue;
      const needed = newIds.length + (joint ? 1 : 0);
      if (!needed || out.length + needed > SESSION_LENGTH - 1) continue;
      if (!joint && bare >= 1) continue; // at most one neighbour met without a connecting card
      for (const id of newIds) introduce(id);
      if (joint) push(joint);
      else {
        bare++;
        // A neighbour met without a connecting card gets one quick question of its own.
        const t = tapFor(nb.id);
        if (t && out.length < SESSION_LENGTH - 1) push(t);
      }
    }
    // Thin neighbourhood? Meet one or two more neighbours directly.
    // Neighbours that can be tried right away (known, or with a quick question) come first.
    const fill = neighbours.filter((nb) => known.has(nb.id) || tapFor(nb.id)).concat(neighbours.filter((nb) => !known.has(nb.id) && !tapFor(nb.id)));
    for (const nb of fill) {
      if (out.length >= 4) break;
      if (out.some((e) => e.nodeIds.includes(nb.id))) continue;
      if (!known.has(nb.id)) {
        introduce(nb.id);
        const t = tapFor(nb.id);
        if (t && out.length < SESSION_LENGTH - 1) push(t);
      } else push(singles(nb.id).find((e) => e.kind !== 'share' && !used.has(e.id)) || derive.recall(C.nodesById[nb.id]));
    }

    // 6) Close on the idea itself: think first, then reveal.
    const recall = C.encounters.find((e) => e.kind === 'recall' && e.nodeIds.length === 1 && e.nodeIds[0] === anchorId && !used.has(e.id));
    push(recall || derive.recall(anchor));

    const items = applyRhythm(C, attachWords(C, player, repairPacing(out.slice(0, SESSION_LENGTH)).map((e) => prepareItem(e, rng))));
    return newSessionShell('anchored', anchor.name.toUpperCase(), items, {
      anchorId,
      keepThis: anchor.keepThis || anchor.share,
      world: anchor.world,
      levelBefore: player.level,
    });
  }

  function buildNext(C, player, opts) {
    if (player.startersCompleted < C.starters.length) {
      return buildStarter(C, player, player.startersCompleted, opts && opts.seed);
    }
    const last = player.history[player.history.length - 1];
    const pending = pendingBridges(C, player);
    if (pending.length && (!last || last.kind !== 'bridge')) return buildBridge(C, player, pending[0], opts && opts.seed);
    return buildAdaptive(C, player, opts);
  }

  // ---- scoring ----------------------------------------------------------------
  // Knowledge reflects successful learning: correct = full value, wrong = 0,
  // ALMOST = half. Nothing is ever subtracted; misses only affect scheduling.
  const RATING_QUALITY = { knew: 1, clear: 1, almost: 0.5, missed: 0, needs: 0 };

  // response: choice → { choice }, recall/share → { rating }, timeline → { order: [itemIdx…] },
  // match → { pairs: { leftIdx: rightIdx } }, discover/quote → {}.
  // `player` (optional) lets DISCOVER pay only the first time a card is seen.
  function evaluate(enc, response, player) {
    const cfg = M.CONFIG;
    switch (enc.kind) {
      case 'discover': {
        const seenBefore = player && player.encounters[enc.id] && player.encounters[enc.id].count > 0;
        return { quality: 1, points: seenBefore ? 0 : cfg.discoverPoints };
      }
      case 'quote':
        return { quality: null, points: 0 };
      case 'choice':
      case 'binary': {
        const ok = response.choice === enc.correct;
        return { quality: ok ? 1 : 0, points: ok ? enc.points : 0, correct: ok };
      }
      case 'sort': {
        // response.bins: { itemIndex: binName }. Full points only when all are placed right.
        const hits = enc.items.map((it, i) => response.bins[i] === it.bin);
        return partial(enc, hits.filter(Boolean).length / hits.length, null, { hits });
      }
      case 'recall':
      case 'share': {
        const q = RATING_QUALITY[response.rating];
        const points = q >= 1 ? enc.points : q > 0 ? Math.round(enc.points * cfg.halfCredit) : 0;
        return { quality: q, points, rating: response.rating };
      }
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
  // Multi-part answers: mastery credits each correct part; Knowledge is paid
  // only for a fully correct answer (or proportionally, if partialCredit is on).
  function partial(enc, frac, perNode, extra) {
    const quality = frac === 1 ? 1 : frac >= 0.5 ? 0.5 : 0;
    const points = frac === 1 ? enc.points : M.CONFIG.partialCredit ? Math.floor(enc.points * frac) : 0;
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

    // WORDS: a quotation shown for the first time is found (+5, once ever).
    const wordsFound = [];
    for (const wid of [item.quoteId, enc.quoteId]) {
      if (!wid || !C.wordsById[wid]) continue;
      player.words = player.words || {};
      if (player.words[wid]) continue;
      player.words[wid] = { at: now, encounterId: enc.id };
      wordsFound.push(wid);
    }
    const wordsPoints = wordsFound.length * M.CONFIG.wordsPoints;
    result.wordsFound = wordsFound;
    result.encounterPoints = result.points;
    result.points += wordsPoints;
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

    const unlocks = M.updateUnlocks(C, player, now);
    // Knowledge Map: reveal ideas and the links this encounter actually showed.
    const G = C.graph || (C.graph = BF.graph.build(C));
    const newEdges = BF.graph.update(C, G, player, enc, unlocks, now);
    session.newEdges = (session.newEdges || []).concat(newEdges);
    session.connections = session.newEdges.length;
    session.wordsFound = (session.wordsFound || []).concat(wordsFound);
    session.newThreads.push(...unlocks.threads);
    session.newDebates.push(...unlocks.debates);
    session.pending.push(...unlocks.threads.map((id) => ({ type: 'thread', id })));
    // Thread complete: one reflective teach-back screen per session at most.
    for (const id of M.updateThreadsCompleted(C, player, now)) {
      if (session.threadDoneShown) continue;
      session.threadDoneShown = true;
      session.pending.push({ type: 'thread-done', id });
    }

    session.results[session.index] = {
      encounterId: enc.id,
      quality: result.quality,
      points: result.points,
      rating: result.rating || null,
      words: wordsFound,
      at: now,
    };
    return { points: result.points, unlocks, newConnection, wordsFound, newEdges };
  }

  function keepThisFor(C, session) {
    if (session.keepThis) return session.keepThis;
    const pickFrom = session.discovered.length ? session.discovered : session.strengthened;
    const singles = session.items.filter((i) => i.enc.nodeIds.length === 1).map((i) => i.enc.nodeIds[0]);
    const id = pickFrom.find((x) => singles.includes(x)) || pickFrom[0] || singles[0];
    return id ? C.nodesById[id].keepThis || C.nodesById[id].share : null;
  }

  // The idea offered for "Teach one back" at the end: the anchor of a LEARN FROM
  // HERE session, else an idea met this session, else one strengthened.
  function teachIdFor(C, session) {
    if (session.anchorId && C.nodesById[session.anchorId]) return session.anchorId;
    const singles = new Set(session.items.filter((i) => i.enc.nodeIds.length === 1).map((i) => i.enc.nodeIds[0]));
    const pick = session.discovered.find((x) => singles.has(x)) || session.strengthened.find((x) => singles.has(x)) || session.discovered[0] || session.strengthened[0];
    return pick && C.nodesById[pick] ? pick : null;
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
      strengthenedIds: session.strengthened.slice(),
      connections: session.connections,
      words: (session.wordsFound || []).slice(),
      threads: session.newThreads.slice(),
      debates: session.newDebates.slice(),
      keepThis,
      teachId: teachIdFor(C, session),
      levelBefore: session.levelBefore,
      levelAfter: player.level,
      encounterIds: session.items.map((i) => i.enc.id),
    };
    player.history.push(summary);
    if (player.history.length > 500) player.history.splice(0, player.history.length - 500);
    if (session.kind === 'starter' && session.starterIndex === player.startersCompleted) {
      player.startersCompleted++;
    }
    if (session.kind === 'bridge') {
      player.bridgesCompleted = player.bridgesCompleted || [];
      if (!player.bridgesCompleted.includes(session.bridgeId)) player.bridgesCompleted.push(session.bridgeId);
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
    buildBridge,
    buildAnchored,
    applyRhythm,
    isWritingItem,
    pendingBridges,
    buildAdaptive,
    buildNext,
    wordsDerive,
    attachWords,
    evaluate,
    applyResult,
    finish,
    keepThisFor,
    makeRng,
    shuffle,
  };
})((globalThis.BF = globalThis.BF || {}));
