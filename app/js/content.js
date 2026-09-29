// Content layer: turns the raw authoritative JSON (BF_CONTENT) into the
// normalized structures the engine uses. No UI code lives here.
(function (BF) {
  'use strict';

  const CHOICE_MODES = ['WHAT', 'WHO', 'WHY THEN', 'CONNECT', 'SAME QUESTION', 'THEN → NOW'];
  const SELF_RATED_MODES = ['RECALL', 'SHARE'];

  // Strip trailing "SELF-RATE: …" lines and a leading "MODEL:" from reveal text.
  function cleanReveal(text) {
    return String(text || '')
      .replace(/\n*\s*SELF-RATE:.*$/s, '')
      .replace(/^\s*MODEL:\s*/, '')
      .trim();
  }

  // Split prompt text into an optional eyebrow (e.g. "30 SECONDS", "LENS",
  // "BOSS ROUND · …", "Think before revealing:") and the body.
  function splitPrompt(prompt) {
    const parts = String(prompt || '').split(/\n\n+/);
    let eyebrow = null;
    if (parts.length > 1) {
      const first = parts[0].trim();
      const isLabel = first === first.toUpperCase() || /^think before revealing:?$/i.test(first);
      if (isLabel && first.length < 60) {
        eyebrow = first.replace(/:$/, '');
        parts.shift();
      }
    }
    let lead = null;
    // "Explain this line:" / "Explain this idea aloud:" followed by a quote.
    if (parts.length > 1 && /:$/.test(parts[0].trim())) lead = parts.shift().trim();
    return { eyebrow, lead, body: parts.join('\n\n').trim() };
  }

  const ARROW = /\s*→\s*/;

  function normalizeEncounter(raw, nodesById) {
    const e = {
      id: raw.id,
      mode: raw.mode,
      points: raw.points,
      nodeIds: raw.node_ids.slice(),
      difficulty: raw.difficulty || 'easy',
      mastery: (raw.mastery || []).slice(),
      source: raw.source || null,
      answerLabel: raw.answer_label || 'ANSWER',
      unlockRule: raw.unlock_rule || null,
      derived: false,
    };

    if (raw.mode === 'DISCOVER') {
      e.kind = 'discover';
      e.title = raw.title;
      e.statement = raw.statement;
      e.reveal = raw.reveal;
      e.world = raw.world || (nodesById[e.nodeIds[0]] || {}).world;
      e.mastery = ['UNDERSTAND'];
      return e;
    }

    const p = splitPrompt(raw.prompt);
    e.eyebrow = p.eyebrow;
    e.lead = p.lead;
    e.prompt = p.body;
    e.reveal = cleanReveal(raw.reveal);

    if (CHOICE_MODES.includes(raw.mode)) {
      e.kind = 'choice';
      e.choices = raw.answers.slice();
      e.correct = raw.correct_answer;
      if (!e.choices.includes(e.correct)) throw new Error(raw.id + ': correct answer not among choices');
    } else if (SELF_RATED_MODES.includes(raw.mode)) {
      e.kind = raw.mode === 'SHARE' ? 'share' : 'recall';
    } else if (raw.mode === 'TIMELINE') {
      // Correct order is given as one arrow-joined string; reveal carries the dates.
      e.kind = 'timeline';
      e.items = String(raw.correct_answer).split(ARROW);
      const dates = e.reveal.replace(/\.$/, '').split(ARROW);
      e.dates = dates.length === e.items.length ? dates : null;
    } else if (raw.mode === 'MATCH') {
      e.kind = 'match';
      e.boss = raw.difficulty === 'boss' || /BOSS/.test(raw.prompt);
      e.pairs = raw.answers.map((a) => {
        const [left, right] = a.split(ARROW);
        return { left: left.trim(), right: right.trim() };
      });
    } else {
      throw new Error('Unknown mode ' + raw.mode + ' in ' + raw.id);
    }
    return e;
  }

  // WORDS: exact quotations. Tolerant of either {quotes:[…]} or a bare array and of
  // a few field spellings, so the authoritative bank can be dropped in unchanged.
  // Wording is never modified; entries missing text or a known node are skipped.
  function normalizeWords(raw, nodesById) {
    if (!raw) return [];
    const list = Array.isArray(raw) ? raw : raw.quotes || raw.words || raw.items || [];
    const pick = (o, keys) => keys.map((k) => o[k]).find((v) => v != null && v !== '');
    const out = [];
    list.forEach((q, i) => {
      const text = pick(q, ['text', 'quote', 'quotation', 'words']);
      let nodeIds = pick(q, ['node_ids', 'nodeIds', 'linked_nodes', 'nodes', 'node_id']) || [];
      if (!Array.isArray(nodeIds)) nodeIds = [nodeIds];
      nodeIds = nodeIds.filter((id) => nodesById[id]);
      if (!text || !nodeIds.length) return;
      out.push({
        id: String(pick(q, ['id', 'quote_id']) || 'W-' + String(i + 1).padStart(2, '0')),
        text: String(text),
        speaker: pick(q, ['speaker', 'attribution', 'author', 'person', 'name']) || null,
        nodeIds,
        source: pick(q, ['source', 'source_work', 'work', 'citation']) || null,
        year: pick(q, ['year', 'date']) || null,
        sourceUrl: pick(q, ['source_url', 'url']) || null,
        raw: q, // full record preserved (verification notes, etc.)
      });
    });
    return out;
  }

  function shortName(subject) {
    return subject.split(' — ')[0].replace(/\s*\(.*\)$/, '');
  }

  function load(raw) {
    raw = raw || globalThis.BF_CONTENT;
    const cur = raw.curriculum;
    const play = raw.playtest;
    const links = raw.links || {};

    const worlds = Object.keys(cur.worlds).map((id) => ({ id, question: cur.worlds[id] }));

    const nodes = cur.playable_nodes.map((n) => ({
      id: n.id,
      subject: n.subject,
      name: shortName(n.subject),
      kind: n.kind,
      world: n.world,
      era: n.era,
      coreIdea: n.core_idea,
      share: n.share,
      lens: n.lens || null,
      source: n.source,
      sourceSection: n.source_section,
    }));
    const nodesById = Object.fromEntries(nodes.map((n) => [n.id, n]));

    const encounters = play.encounters.map((r) => normalizeEncounter(r, nodesById));
    const discovery = play.discovery_cards.map((r) => normalizeEncounter(r, nodesById));
    const all = encounters.concat(discovery);
    const byId = Object.fromEntries(all.map((e) => [e.id, e]));

    for (const e of all) {
      for (const id of e.nodeIds) if (!nodesById[id]) throw new Error(e.id + ' references unknown node ' + id);
    }

    // Debate wiring (links.json) — prerequisites are the nodes on each side.
    const debateLinks = links.debates || {};
    const debates = cur.debates.map((d) => {
      const l = debateLinks[d.id] || { sides: [[], []], side_labels: d.title.split(' ↔ '), encounters: [] };
      const prereq = [...new Set(l.sides.flat())];
      return {
        id: d.id,
        title: d.title,
        question: d.question,
        rule: d.rule,
        sides: l.sides.map((ids, i) => ({ label: l.side_labels[i], nodeIds: ids })),
        prereq,
        encounterIds: l.encounters || [],
      };
    });
    const debateByEncounter = {};
    for (const d of debates) for (const eid of d.encounterIds) debateByEncounter[eid] = d.id;
    for (const e of encounters) if (debateByEncounter[e.id]) e.debateId = debateByEncounter[e.id];

    const threadLinks = links.threads || {};
    const threads = cur.threads.map((t) => ({
      id: t.id,
      title: t.title,
      question: t.question,
      steps: t.path.map((label, i) => ({ label, nodeIds: (threadLinks[t.id] || [])[i] || [] })),
    }));

    // WHY THEN reveals give the historical-context line shown in EXPLORE.
    const whyThenByNode = {};
    for (const e of encounters) {
      if (e.mode === 'WHY THEN' && e.nodeIds.length === 1) whyThenByNode[e.nodeIds[0]] = e.reveal;
    }

    const starters = play.starter_sessions.map((s) => ({
      id: s.id,
      title: s.title,
      encounterIds: s.encounters.slice(),
      keepThis: s.keep_this,
      purpose: s.purpose,
    }));
    for (const s of starters) for (const id of s.encounterIds) if (!byId[id]) throw new Error(s.id + ' missing ' + id);

    const words = normalizeWords(raw.words, nodesById);
    const contextLinks = links.context || {};
    const context = (cur.context_cards || []).map((c) => ({
      id: c.id,
      title: c.title,
      purpose: c.purpose,
      nodeIds: (contextLinks[c.id] || []).filter((id) => nodesById[id]),
    }));

    return {
      words,
      wordsById: Object.fromEntries(words.map((w) => [w.id, w])),
      wordsSource: raw.wordsSource || null,
      context,
      knowledgeMapRaw: raw.knowledgeMap || null,
      worlds,
      nodes,
      nodesById,
      encounters,
      discovery,
      byId,
      debates,
      debatesById: Object.fromEntries(debates.map((d) => [d.id, d])),
      threads,
      threadsById: Object.fromEntries(threads.map((t) => [t.id, t])),
      threadUnlockSteps: links.thread_unlock_steps || 3,
      bossMinNodes: links.boss_min_nodes || {},
      contextCards: cur.context_cards,
      framing: cur.framing,
      whyThenByNode,
      starters,
      sessionDesign: play.session_design,
      pointsScale: play.session_design.points,
    };
  }

  BF.content = { load, CHOICE_MODES, SELF_RATED_MODES, cleanReveal, splitPrompt };
})((globalThis.BF = globalThis.BF || {}));
