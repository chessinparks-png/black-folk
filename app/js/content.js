// Content layer: turns the raw V1.5 JSON (BF_CONTENT) into the normalized
// structures the engine uses. No UI code lives here.
//
// WHAT is learned comes from the curriculum + encounter pack + knowledge map.
// HOW an encounter is played comes from v1_5_interactions.json, which can
// re-express a four-option question as a lighter form (binary, sort, pick,
// think-first recall). The pack's reveal is always kept.
(function (BF) {
  'use strict';

  const CHOICE_MODES = ['WHAT', 'WHO', 'WHY THEN', 'CONNECT', 'SAME QUESTION', 'THEN → NOW', 'APPLY'];
  const SELF_RATED_MODES = ['RECALL', 'SHARE'];
  const MATCH_MODES = ['MATCH', 'BOSS ROUND'];

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
      e.form = 'conventional';
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
    } else if (MATCH_MODES.includes(raw.mode)) {
      e.kind = 'match';
      e.boss = raw.mode === 'BOSS ROUND' || raw.difficulty === 'boss' || /BOSS/.test(raw.prompt);
      e.pairs = raw.answers.map((a) => {
        const [left, right] = a.split(ARROW);
        return { left: left.trim(), right: right.trim() };
      });
      if (raw.mode === 'BOSS ROUND' && !e.eyebrow) e.eyebrow = 'The six V1.5 ideas';
    } else {
      throw new Error('Unknown mode ' + raw.mode + ' in ' + raw.id);
    }
    return e;
  }

  // Re-express an encounter in a lighter form. The original is kept on
  // `e.original` so nothing from the pack is lost.
  function applyInteraction(e, spec) {
    if (!spec) return e;
    if (spec.lens) e.lens = spec.lens;
    // Clarity audit: a one-line hint under the question, and framing moved out of a
    // question into the first line of the reveal (the reveal itself is unchanged).
    if (spec.hint) e.hint = spec.hint;
    if (spec.reveal_lead) e.reveal = spec.reveal_lead + '\n\n' + e.reveal;
    if (spec.prompt && !spec.form) e.prompt = spec.prompt;
    if ('lead' in spec && !spec.form) e.lead = spec.lead || null;
    if (spec.choices_relabel && e.choices) {
      // Reword an option without changing which one is correct.
      const r = spec.choices_relabel;
      for (const k of Object.keys(r)) if (!e.choices.includes(k)) throw new Error(e.id + ': relabel of unknown option ' + k);
      e.choices = e.choices.map((c) => r[c] || c);
      e.correct = r[e.correct] || e.correct;
    }
    if (!spec.form) return e;
    e.original = { kind: e.kind, prompt: e.prompt, choices: e.choices, correct: e.correct };
    const need = (cond, msg) => {
      if (!cond) throw new Error(e.id + ' interaction: ' + msg);
    };
    switch (spec.form) {
      case 'binary':
      case 'pick':
        need(spec.options && spec.options.includes(spec.correct), 'correct option missing');
        need(spec.form !== 'binary' || spec.options.length === 2, 'binary needs two options');
        e.kind = spec.form === 'binary' ? 'binary' : 'choice';
        e.form = spec.form;
        e.stage = spec.stage || [];
        e.prompt = spec.question;
        e.choices = spec.options.slice();
        e.correct = spec.correct;
        e.verdict = spec.verdict || null;
        e.lead = null;
        e.eyebrow = null;
        break;
      case 'sort':
        need(spec.bins && spec.items && spec.items.every((it) => spec.bins.includes(it.bin)), 'sort item in unknown bin');
        e.kind = 'sort';
        e.form = 'sort';
        e.prompt = spec.prompt;
        e.bins = spec.bins.slice();
        e.items = spec.items.map((it) => ({ text: it.text, bin: it.bin }));
        e.lead = null;
        e.eyebrow = null;
        delete e.choices;
        delete e.correct;
        break;
      case 'recall':
        // Think first; the pack's correct answer becomes the revealed answer.
        e.kind = 'recall';
        e.form = 'recall';
        e.mode = 'RECALL';
        e.eyebrow = 'Think before revealing';
        e.lead = null;
        e.prompt = spec.prompt || e.prompt;
        e.reveal = (e.correct ? e.correct.replace(/\.?$/, '.') + '\n\n' : '') + e.reveal;
        delete e.choices;
        delete e.correct;
        if (!e.mastery.includes('RECALL')) e.mastery.push('RECALL');
        break;
      default:
        throw new Error(e.id + ': unknown interaction form ' + spec.form);
    }
    return e;
  }

  // WORDS: exact quotations from the knowledge map's verified bank. Wording is
  // never modified. Linked nodes come from its words_attached_to edges.
  function normalizeWords(mapRaw, nodesById) {
    if (!mapRaw) return [];
    const attach = {};
    for (const ed of mapRaw.edges || []) {
      if (ed.type === 'words_attached_to' && nodesById[ed.to]) (attach[ed.from] = attach[ed.from] || []).push(ed.to);
    }
    return (mapRaw.nodes || [])
      .filter((n) => n.type === 'words' && n.text && (attach[n.id] || []).length)
      .map((n) => ({
        id: n.id,
        text: String(n.text),
        speaker: n.speaker || n.label || null,
        nodeIds: attach[n.id],
        source: n.source_book || null,
        sourceSection: n.source_section || null,
        raw: n,
      }));
  }

  function shortName(subject) {
    return subject.split(' — ')[0].replace(/\s*\(.*\)$/, '');
  }

  function load(raw) {
    raw = raw || globalThis.BF_CONTENT;
    const cur = raw.curriculum;
    const play = raw.playtest;
    const links = raw.links || {};
    const mapRaw = raw.knowledgeMap || null;
    const inter = raw.interactions || { encounters: {}, discover: {} };

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
      keepThis: n.keep_this || n.share,
      whyThen: n.why_then || null,
      lens: n.lens || null,
      yourWordsPrompt: n.your_words_prompt || null,
      source: n.source,
      sourceSection: n.source_section,
    }));
    // V1.6 art/design deepening cards (CARD-07–CARD-14) are playable objects: they
    // can be discovered, reviewed, mapped and used to anchor LEARN FROM HERE, but
    // they are NOT core nodes. They live in nodesById (so every lookup works) and
    // in cardNodes; `nodes` stays the 50-node core.
    const recurring = cur.recurring_questions || [];
    const designLens = (recurring.find((q) => /^WHO DESIGNED THIS/.test(q.text || '')) || {}).text || null;
    const LENS_CARDS = ['CARD-11', 'CARD-13']; // used selectively: systems and platforms
    const art = raw.artDesign || { discovery_cards: [], encounters: [], interactions: {} };
    const playableCards = new Set(art.discovery_cards.flatMap((d) => d.node_ids));
    const cardNodes = (cur.deepening_cards || [])
      .filter((c) => playableCards.has(c.id))
      .map((c) => ({
        id: c.id,
        subject: c.title,
        name: c.title,
        kind: 'deepening',
        isCard: true,
        world: 'CULTURE',
        era: null,
        coreIdea: c.core_idea,
        share: c.keep_this,
        keepThis: c.keep_this,
        whyThen: null,
        lens: LENS_CARDS.includes(c.id) ? designLens : null,
        yourWordsPrompt: null,
        source: c.source,
        sourceSection: c.source_note || null,
        home: c.home,
        role: c.role || null,
        connections: (c.connections || []).slice(),
      }));
    const nodesById = Object.fromEntries(nodes.concat(cardNodes).map((n) => [n.id, n]));

    const interSpecs = Object.assign({}, inter.encounters || {}, art.interactions || {});
    const encounters = play.encounters.concat(art.encounters).map((r) => applyInteraction(normalizeEncounter(r, nodesById), interSpecs[r.id]));
    const discovery = play.discovery_cards.concat(art.discovery_cards).map((r) => {
      const d = normalizeEncounter(r, nodesById);
      const o = (inter.discover || {})[r.id];
      if (o) {
        d.original = { statement: d.statement, reveal: d.reveal };
        if (o.statement) d.statement = o.statement;
        if (o.reveal) d.reveal = o.reveal;
        if (o.ask) d.ask = o.ask;
        if (o.lens) d.lens = o.lens;
      }
      return d;
    });
    const all = encounters.concat(discovery);
    const byId = Object.fromEntries(all.map((e) => [e.id, e]));
    for (const e of all) {
      for (const id of e.nodeIds) if (!nodesById[id]) throw new Error(e.id + ' references unknown node ' + id);
    }
    for (const id of Object.keys(interSpecs)) if (!byId[id]) throw new Error('interaction for unknown encounter ' + id);

    // Knowledge-map memberships (thread_member / debate_member / context_for).
    const members = { thread: {}, debate: {}, context: {} };
    for (const ed of (mapRaw && mapRaw.edges) || []) {
      if (ed.type === 'thread_member') (members.thread[ed.to] = members.thread[ed.to] || []).push(ed.from);
      if (ed.type === 'debate_member') (members.debate[ed.to] = members.debate[ed.to] || []).push(ed.from);
      if (ed.type === 'context_for') (members.context[ed.from] = members.context[ed.from] || []).push(ed.to);
    }

    const deepening = (cur.deepening_cards || []).map((c) => ({
      id: c.id,
      title: c.title,
      home: c.home,
      role: c.role,
      text: c.core_idea || (links.deepening_display || {})[c.id] || null,
      keepThis: c.keep_this || null,
      source: c.source || null,
    }));
    const deepeningById = Object.fromEntries(deepening.map((c) => [c.id, c]));

    // Debates: sides from links.json; prerequisites = both sides (+ any extra).
    const debateLinks = links.debates || {};
    const debates = cur.debates.map((d) => {
      const l = debateLinks[d.id] || { sides: [members.debate[d.id] || [], []], side_labels: d.title.split(' ↔ '), encounters: [] };
      return {
        id: d.id,
        title: d.title,
        question: d.question,
        rule: d.rule,
        sides: l.sides.map((ids, i) => ({ label: l.side_labels[i], nodeIds: ids, summary: (l.side_summaries || [])[i] || null })),
        prereq: [...new Set(l.sides.flat().concat(l.prereq_extra || []))],
        prereqExtra: l.prereq_extra || [],
        encounterIds: l.encounters || [],
      };
    });
    const debateByEncounter = {};
    for (const d of debates) for (const eid of d.encounterIds) debateByEncounter[eid] = d.id;
    for (const e of encounters) if (debateByEncounter[e.id]) e.debateId = debateByEncounter[e.id];

    // Threads: path steps from links.json; map members missing from the path are
    // appended as their own steps; deepening-card steps (Diaspora…) keep their card.
    const threadLinks = links.threads || {};
    const threads = cur.threads.map((t) => {
      const steps = t.path.map((label, i) => {
        const step = { label: label.replace(/\s*\((intro concept|deepening) card\)$/, ''), nodeIds: (threadLinks[t.id] || [])[i] || [] };
        if (/card\)$/.test(label)) {
          const card = deepening.find((c) => label.startsWith(c.title));
          if (card) step.cardId = card.id;
        }
        return step;
      });
      const covered = new Set(steps.flatMap((s) => s.nodeIds));
      for (const id of members.thread[t.id] || []) {
        if (!covered.has(id) && nodesById[id]) steps.push({ label: nodesById[id].name, nodeIds: [id] });
      }
      return {
        id: t.id,
        title: t.title,
        question: t.question,
        rule: t.rule || null,
        steps,
        members: [...new Set(steps.flatMap((s) => s.nodeIds))],
        cards: deepening.filter((c) => c.home === t.id).map((c) => c.id),
        notes: ((links.thread_notes || {})[t.id] || []).map((x) => ({ id: x.id, title: x.title, text: x.text })),
      };
    });

    // WHY THEN: the node's own why_then, else a single-node WHY THEN reveal.
    const whyThenByNode = {};
    for (const e of encounters) {
      if (e.mode === 'WHY THEN' && e.nodeIds.length === 1) whyThenByNode[e.nodeIds[0]] = (e.original && e.kind === 'recall') ? e.reveal.split('\n\n').pop() : e.reveal;
    }
    for (const n of nodes) if (n.whyThen) whyThenByNode[n.id] = n.whyThen;

    const context = (cur.context_cards || []).map((c) => ({
      id: c.id,
      title: c.title,
      purpose: c.purpose,
      nodeIds: (members.context[c.id] || []).filter((id) => nodesById[id]),
    }));

    const sessionOf = (s) => ({ id: s.id, title: s.title, encounterIds: s.encounters.slice(), keepThis: s.keep_this, purpose: s.purpose });
    const starters = play.starter_sessions.map(sessionOf);
    const bridges = (play.v1_5_bridge_sessions || []).map(sessionOf);
    for (const s of starters.concat(bridges)) for (const id of s.encounterIds) if (!byId[id]) throw new Error(s.id + ' missing ' + id);

    const words = normalizeWords(mapRaw, nodesById);

    return {
      version: play.version,
      words,
      wordsById: Object.fromEntries(words.map((w) => [w.id, w])),
      wordsSource: raw.wordsSource || null,
      context,
      deepening,
      deepeningById,
      recurringQuestions: cur.recurring_questions || [],
      holds: cur.holds || [],
      cuts: cur.cuts || [],
      knowledgeMapRaw: mapRaw,
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
      threadUnlock: links.thread_unlock || { min_members: 2, min_members_without_connection: 3 },
      threadResponses: links.thread_responses || {},
      bossMinNodes: links.boss_min_nodes || {},
      framing: cur.framing,
      whyThenByNode,
      starters,
      bridges,
      sessionDesign: play.session_design,
      pointsScale: play.session_design.points,
      cardNodes,
      cardsById: Object.fromEntries(cardNodes.map((c) => [c.id, c])),
      // Card → threads / debates it deepens (from the V1.6 card connections).
      cardLinks: Object.fromEntries(cardNodes.map((c) => [c.id, c.connections.filter((x) => /^(T|D)-/.test(x))])),
      designLens,
      // V1.6: thread ↔ thread/debate links (e.g. T-10 → T-03, D-06), shown in those views.
      threadConnections: ((mapRaw && mapRaw.edges) || []).filter((e) => e.type === 'thread_connection').map((e) => ({ from: e.from, to: e.to, label: e.label })),
      promptTypes: (raw.understanding && raw.understanding.prompt_types) || {},
      checks: loadChecks(raw.understanding, nodesById),
    };
  }

  // ---- YOUR WORDS: prompt types and understanding checks ----------------------------
  // understanding_checks.json says which prompts are explain-type (one model
  // explanation) and which are reflective (open). Unlisted prompts are reflective.
  function loadChecks(u, nodesById) {
    const out = {};
    for (const [nodeId, c] of Object.entries((u && u.checks) || {})) {
      if (!nodesById[nodeId]) throw new Error('check for unknown node ' + nodeId);
      const ids = new Set(c.must_haves.map((m) => m.id));
      for (const m of c.misreadings) for (const r of m.relates_to || []) if (!ids.has(r)) throw new Error(nodeId + ': mix-up ' + m.id + ' relates to unknown ' + r);
      out[nodeId] = {
        nodeId,
        appliesTo: c.applies_to.slice(),
        ask: c.ask,
        mustHaves: c.must_haves.map((m) => ({ id: m.id, text: m.text })),
        misreadings: c.misreadings.map((m) => ({ id: m.id, title: m.title, text: m.text, relatesTo: (m.relates_to || []).slice() })),
      };
    }
    return out;
  }

  // 'explain' | 'reflective' for a card that offers writing.
  function writeTypeOf(C, enc) {
    const t = C.promptTypes || {};
    if (enc.derived) {
      const prefix = (/^(X-WR|X-R|X-S)-/.exec(enc.id) || [])[1];
      return (prefix && (t.derived || {})[prefix]) || 'reflective';
    }
    return (t.encounters || {})[enc.id] || 'reflective';
  }

  // "How would you explain X to someone new?" — deepening-card titles are quoted.
  function explainPrompt(n) {
    const what = n.isCard ? 'the idea behind “' + n.name + '”' : n.name;
    return 'How would you explain ' + what + ' to someone new?';
  }

  // The idea page's YOUR WORDS prompt: authored prompts are open questions.
  function ideaPrompt(C, n) {
    const t = (C.promptTypes || {}).idea_pages || {};
    const type = t[n.id] || (n.yourWordsPrompt ? 'reflective' : t._default || 'reflective');
    const text = n.yourWordsPrompt || explainPrompt(n);
    return { text, type };
  }

  // The pilot check for a card, only for explain-type cards it names.
  function checkFor(C, enc) {
    if (!enc || writeTypeOf(C, enc) !== 'explain') return null;
    for (const c of Object.values(C.checks || {})) if (c.appliesTo.includes(enc.id)) return c;
    return null;
  }

  BF.content = { load, writeTypeOf, ideaPrompt, explainPrompt, checkFor, CHOICE_MODES, SELF_RATED_MODES, cleanReveal, splitPrompt };
})((globalThis.BF = globalThis.BF || {}));
