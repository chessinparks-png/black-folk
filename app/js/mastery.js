// Player model, Knowledge/levels, invisible mastery + review scheduling,
// and thread/debate unlocks. Pure logic: no DOM, no storage.
(function (BF) {
  'use strict';

  const DAY = 24 * 60 * 60 * 1000;
  const MINUTE = 60 * 1000;

  // ---- Tunables (kept together so they are easy to adjust) ----------------
  const CONFIG = {
    // Knowledge = successful learning. Wrong answers earn nothing; nothing is ever subtracted.
    discoverPoints: 5, // a new DISCOVER card (ungraded)
    wordsPoints: 5, // first time a WORDS quotation is found
    halfCredit: 0.5, // ALMOST on RECALL / SHARE
    partialCredit: false, // TIMELINE / MATCH: full points only when fully correct
    // Level L starts at 100·(L−1) + 10·(L−1)² Knowledge (LVL 2 at 110, LVL 12 at 2,310).
    levelBase: 100,
    levelCurve: 10,
    missReturnMinutes: 10, // a missed idea is due again almost immediately
    almostDays: 0.5, // ALMOST returns sooner than KNEW IT
    firstKnewDays: { unaided: 2, recognition: 1 },
    growth: { unaided: 2.5, recognition: 1.6 },
    recognitionOnlyCapDays: 3, // recognition alone cannot push review far away
    maxIntervalDays: 120,
    learnRate: 0.5,
  };

  function levelFloor(level) {
    const n = level - 1;
    return CONFIG.levelBase * n + CONFIG.levelCurve * n * n;
  }
  function levelFor(knowledge) {
    let level = 1;
    while (levelFloor(level + 1) <= knowledge) level++;
    return level;
  }

  // ---- Player ---------------------------------------------------------------
  const PLAYER_VERSION = 2;
  function newPlayer() {
    return {
      version: PLAYER_VERSION,
      createdAt: Date.now(),
      knowledge: 0,
      level: 1,
      startersCompleted: 0,
      encounters: {}, // id -> { count, lastSeen, lastResult, successes }
      nodes: {}, // id -> mastery record (see newNodeState)
      ratings: [], // self-rating log: { encounterId, rating, at }
      threadsUnlocked: {}, // id -> timestamp
      debatesUnlocked: {}, // id -> timestamp
      history: [], // finished session summaries
      map: { nodes: {}, edges: {}, lastViewed: 0 }, // Knowledge Map: discovered nodes / revealed links
      words: {}, // WORDS found: quoteId -> { at, encounterId }
    };
  }

  // Upgrade saved progress in place. Nothing is dropped: v1 fields are kept
  // as-is and the v2 map/WORDS fields are added (the map is backfilled from
  // encounter history by BF.graph.backfill).
  function migrate(saved) {
    if (!saved || typeof saved !== 'object' || !saved.version) return { player: newPlayer(), migrated: false };
    const p = saved;
    const from = p.version;
    if (p.version < 2) {
      p.map = p.map || { nodes: {}, edges: {}, lastViewed: 0 };
      p.words = p.words || {};
      p.migratedFrom = p.migratedFrom || [];
      p.migratedFrom.push({ version: from, at: Date.now() });
      p.version = 2;
    }
    const fresh = newPlayer();
    for (const k of Object.keys(fresh)) if (p[k] === undefined) p[k] = fresh[k];
    p.level = levelFor(p.knowledge);
    return { player: p, migrated: from !== p.version };
  }

  function newNodeState() {
    return {
      seen: 0,
      correct: 0,
      introduced: false,
      firstSeen: null,
      lastSeen: null,
      lastResult: null, // 'good' | 'almost' | 'miss' | 'discover'
      lapses: 0,
      recognition: 0,
      recall: 0,
      context: 0,
      connection: 0,
      share: 0,
      apply: 0,
      interval: 0, // days
      nextReview: null, // timestamp
    };
  }

  function node(player, id) {
    return (player.nodes[id] = player.nodes[id] || newNodeState());
  }

  // Curriculum learning goals → mastery dimensions.
  const TAG_DIM = {
    UNDERSTAND: 'recognition',
    RECALL: 'recall',
    CONTEXTUALIZE: 'context',
    CONNECT: 'connection',
    SHARE: 'share',
    APPLY: 'apply',
  };
  // Every mode also strengthens the dimension it inherently exercises.
  const MODE_DIM = {
    WHAT: 'recognition',
    WHO: 'recognition',
    'WHY THEN': 'context',
    CONNECT: 'connection',
    'SAME QUESTION': 'connection',
    RECALL: 'recall',
    SHARE: 'share',
    'THEN → NOW': 'apply',
    WORDS: 'connection',
    TIMELINE: 'context',
    MATCH: 'connection',
  };
  const UNAIDED = ['recall', 'share', 'apply'];

  function dimsFor(enc) {
    const dims = new Set();
    if (MODE_DIM[enc.mode]) dims.add(MODE_DIM[enc.mode]);
    for (const t of enc.mastery || []) if (TAG_DIM[t]) dims.add(TAG_DIM[t]);
    return [...dims];
  }

  // quality: 1 = correct / KNEW IT / CLEAR, 0.5 = ALMOST, 0 = miss.
  // perNode (optional) gives an individual quality per node id, used when one
  // encounter scores several ideas separately (e.g. a MATCH or TIMELINE).
  function recordEncounter(player, enc, quality, now, perNode) {
    now = now || Date.now();
    const rec = (player.encounters[enc.id] = player.encounters[enc.id] || { count: 0, successes: 0 });
    rec.count++;
    rec.lastSeen = now;

    if (enc.kind === 'discover') {
      rec.lastResult = 'discover';
      for (const id of enc.nodeIds) {
        const n = node(player, id);
        if (!n.firstSeen) n.firstSeen = now;
        n.seen++;
        n.lastSeen = now;
        if (!n.introduced) {
          n.introduced = true;
          n.lastResult = 'discover';
          n.recognition = Math.max(n.recognition, 0.15);
          n.nextReview = now; // freshly met ideas are ready to be tried
        }
      }
      return;
    }

    // A WORDS card with no question: exposure only, no mastery judgement.
    if (quality == null) {
      rec.lastResult = 'seen';
      for (const id of enc.nodeIds) {
        const n = node(player, id);
        if (!n.firstSeen) n.firstSeen = now;
        n.seen++;
        n.lastSeen = now;
      }
      return;
    }

    rec.lastResult = quality >= 1 ? 'good' : quality > 0 ? 'almost' : 'miss';
    if (quality >= 1) rec.successes++;

    const dims = dimsFor(enc);
    const unaided = dims.some((d) => UNAIDED.includes(d));
    // Single-idea encounters introduce their idea; multi-idea ones only mark it seen.
    const introduces = enc.nodeIds.length === 1;

    for (const id of enc.nodeIds) {
      const n = node(player, id);
      if (!n.firstSeen) n.firstSeen = now;
      n.seen++;
      n.lastSeen = now;
      if (introduces) n.introduced = true;
      const q = perNode && perNode[id] != null ? perNode[id] : quality;
      if (q >= 1) n.correct++;

      for (const d of dims) {
        n[d] = n[d] + (q - n[d]) * CONFIG.learnRate;
      }

      if (q <= 0) {
        n.lastResult = 'miss';
        n.lapses++;
        n.interval = 0;
        n.nextReview = now + CONFIG.missReturnMinutes * MINUTE;
        continue;
      }
      if (q < 1) {
        n.lastResult = 'almost';
        n.interval = Math.max(CONFIG.almostDays, Math.min(n.interval, CONFIG.almostDays * 4));
        n.nextReview = now + n.interval * DAY;
        continue;
      }
      n.lastResult = 'good';
      const kind = unaided ? 'unaided' : 'recognition';
      let next = n.interval > 0 ? n.interval * CONFIG.growth[kind] : CONFIG.firstKnewDays[kind];
      const hasUnaided = UNAIDED.some((d) => n[d] >= 0.5);
      if (!hasUnaided) next = Math.min(next, CONFIG.recognitionOnlyCapDays);
      n.interval = Math.min(next, CONFIG.maxIntervalDays);
      n.nextReview = now + n.interval * DAY;
    }
  }

  function addKnowledge(player, pts) {
    player.knowledge += pts;
    player.level = levelFor(player.knowledge);
  }

  // Subtle, player-facing mastery label. No numbers are ever shown.
  function label(player, id) {
    const n = player.nodes[id];
    if (!n || !n.seen) return 'NEW';
    const dims = ['recognition', 'recall', 'context', 'connection', 'share', 'apply'];
    const strong = dims.filter((d) => n[d] >= 0.6).length;
    const active = Math.max(n.recall, n.share, n.apply);
    if (n.lastResult === 'miss') return 'LEARNING';
    if (strong >= 3 && active >= 0.6 && n.interval >= 4) return 'STRONG';
    if (strong >= 2 || (strong >= 1 && active >= 0.5)) return 'FAMILIAR';
    return 'LEARNING';
  }

  function isIntroduced(player, id) {
    return !!(player.nodes[id] && player.nodes[id].introduced);
  }
  function isSeen(player, id) {
    return !!(player.nodes[id] && player.nodes[id].seen);
  }

  // ---- Threads & debates ------------------------------------------------------
  function threadProgress(C, player, thread) {
    return thread.steps.map((s) => s.nodeIds.some((id) => isSeen(player, id)));
  }

  // Returns ids newly unlocked by the current state (and records them).
  function updateUnlocks(C, player, now) {
    now = now || Date.now();
    const threads = [];
    for (const t of C.threads) {
      if (player.threadsUnlocked[t.id]) continue;
      const done = threadProgress(C, player, t).filter(Boolean).length;
      if (done >= C.threadUnlockSteps) {
        player.threadsUnlocked[t.id] = now;
        threads.push(t.id);
      }
    }
    const debates = [];
    for (const d of C.debates) {
      if (player.debatesUnlocked[d.id] || !d.prereq.length) continue;
      // Each side must have at least one introduced idea.
      const ready = d.sides.every((s) => !s.nodeIds.length || s.nodeIds.some((id) => isIntroduced(player, id)));
      if (ready) {
        player.debatesUnlocked[d.id] = now;
        debates.push(d.id);
      }
    }
    return { threads, debates };
  }

  BF.mastery = {
    CONFIG,
    DAY,
    MINUTE,
    newPlayer,
    migrate,
    PLAYER_VERSION,
    newNodeState,
    recordEncounter,
    addKnowledge,
    levelFor,
    levelFloor,
    label,
    dimsFor,
    isIntroduced,
    isSeen,
    threadProgress,
    updateUnlocks,
  };
})((globalThis.BF = globalThis.BF || {}));
