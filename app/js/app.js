// App shell: routing, screens (home, play, summary, explore, settings),
// persistence wiring. Content and rules come from the engine modules.
(function (BF) {
  'use strict';

  const { h, paras } = BF.ui;
  const M = BF.mastery;
  const S = BF.session;
  const store = BF.store;

  const state = {
    C: null,
    player: null,
    session: null, // in-progress session (persisted)
    summary: null, // last finished session summary (for the summary screen)
  };

  const main = () => document.getElementById('app');
  const fmt = (n) => n.toLocaleString('en-US');

  // ---- persistence ------------------------------------------------------------
  let saving = Promise.resolve();
  function save() {
    const p = state.player;
    const s = state.session;
    saving = saving.then(() => Promise.all([store.set('player', p), store.set('session', s || undefined)]));
    return saving;
  }

  // ---- hints shown once per player ---------------------------------------------
  const HINTS = {
    DISCOVER: 'Read it. Then reveal.',
    CHOICE: 'Choose one. A miss simply brings the idea back sooner.',
    'SAME QUESTION': 'Different thinkers, same problem. Look for the fairest contrast—not a winner.',
    RECALL: 'Answer in your head first. Then reveal, and be honest with yourself.',
    SHARE: 'Explain it out loud or in your head. Nothing is recorded.',
    CHECK: 'Type it, or say it in your head. What you type is saved for you—never graded.',
    'THEN → NOW': 'An older lens, a new situation.',
  };
  function hintFor(key) {
    const seen = (state.player.hintsSeen = state.player.hintsSeen || {});
    if (seen[key]) return seen[key] === state.session.id ? HINTS[key] : null;
    seen[key] = state.session.id; // stays visible if this screen re-renders
    return HINTS[key] || null;
  }

  // ---- NOW layer ------------------------------------------------------------------
  // Contemporary Connections (Settings) is on by default; off hides every hook.
  const nowOn = () => store.settings.get().contemporary !== 'off';
  const nowHookForItem = (item) => (nowOn() ? BF.content.nowHookFor(state.C, item.enc) : null);

  // ---- floating +KNOWLEDGE ------------------------------------------------------
  function floatPoints(points) {
    const layer = document.getElementById('floats');
    const el = h('div', { class: 'float' }, '+' + points + ' KNOWLEDGE');
    layer.append(el);
    setTimeout(() => el.remove(), 1700);
    const live = document.getElementById('live');
    live.textContent = '';
    setTimeout(() => (live.textContent = '+' + points + ' Knowledge'), 30);
  }

  // ---- routing ----------------------------------------------------------------
  function go(hash, replace) {
    if (location.hash === hash) render();
    else if (replace) {
      history.replaceState(null, '', hash);
      render();
    } else location.hash = hash;
  }
  function route() {
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').map(decodeURIComponent);
    return { name: parts[0] || 'home', arg: parts[1] };
  }

  // Scroll memory, keyed to the browser's own history entries: Back (or Forward)
  // to an entry returns you to where you were on it; a new entry starts at the
  // top; a page re-rendered in place stays put (except PLAY, which starts fresh).
  const scrollByKey = {};
  let shownKey = null;
  let nextKey = Date.now();
  window.addEventListener('scroll', () => {
    if (shownKey != null) scrollByKey[shownKey] = window.scrollY;
  }, { passive: true });

  function mount(screen) {
    const app = main();
    const hash = location.hash || '#/';
    const st = history.state;
    let key = st && st.bfKey != null ? st.bfKey : null;
    let restore = 0;
    if (key == null) {
      key = nextKey++;
      try { history.replaceState({ bfKey: key }, '', location.href); } catch (e) { /* file:// may refuse */ }
    } else if (!/^#\/(play|summary)/.test(hash)) restore = scrollByKey[key] || 0;
    shownKey = null; // ignore the scroll events the swap itself causes
    const r = route();
    const withNav = ['home', 'explore', 'world', 'idea', 'thread', 'debate', 'words', 'settings'].includes(r.name);
    app.replaceChildren(screen);
    if (withNav) app.append(navBar(r.name));
    document.body.classList.toggle('has-nav', withNav);
    window.scrollTo(0, restore);
    if (restore) requestAnimationFrame(() => window.scrollTo(0, restore));
    if (screen._afterMount) screen._afterMount(restore > 0);
    shownKey = key;
    currentScreen = screen;
  }
  let currentScreen = null;

  function render() {
    const r = route();
    switch (r.name) {
      case 'play':
        return renderPlay();
      case 'summary':
        return state.summary ? mount(summaryScreen(state.summary)) : go('#/');
      case 'explore':
      case 'world':
      case 'idea':
      case 'debate':
      case 'thread':
      case 'words':
        return mount(BF.explore.screen(r.name, r.arg, exploreCtx()));
      case 'settings':
        return mount(settingsScreen());
      default:
        return mount(homeScreen());
    }
  }

  function exploreCtx() {
    return {
      C: state.C,
      G: state.G,
      player: state.player,
      go,
      backLink,
      save,
      render,
      showAll: store.settings.get().mapVisibility === 'all',
      nowOn: nowOn(),
      fmtDate,
      frameLabel,
      debatePad,
      sessionInProgress: () => !!(state.session && state.session.begun && state.session.index > 0),
      learnFrom,
    };
  }

  // LEARN FROM HERE: a short session anchored on one idea (see session.buildAnchored).
  // Only the encounters actually answered there change progress.
  function learnFrom(nodeId) {
    state.session = S.buildAnchored(state.C, state.player, nodeId);
    state.summary = null;
    save();
    go('#/play');
  }

  // ---- HOME: your path ------------------------------------------------------------
  // The ideas you have met, in the order you met them, each a ring that fills as
  // your understanding grows (discovered → connected → familiar → strong). Threads
  // and debates sit on the path where they opened. Play continues from the next
  // node. No streaks, no goals, no timers.
  const RING = { locked: 0, discovered: 0.25, connected: 0.5, familiar: 0.75, strong: 1 };
  const STATE_WORD = { discovered: 'Discovered', connected: 'Connected', familiar: 'Familiar', strong: 'Strong' };
  function initials(name) {
    const words = name.replace(/[“”"'’()]/g, '').split(/[\s\-–—/]+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(the|of|and|a|an|to|in|on|for|as|is)$/i.test(w));
    return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || name).slice(0, 2)).toUpperCase();
  }
  function ringNode(n, st, opts) {
    const fill = RING[st] || 0;
    return h(
      'span',
      { class: 'ring ring--' + st + (opts && opts.big ? ' ring--big' : ''), 'data-world': n ? n.world : null, style: '--fill:' + fill, 'aria-hidden': 'true' },
      h('span', { class: 'ring-face' }, st === 'locked' ? lockIcon() : st === 'strong' ? h('span', { class: 'ring-check' }, '✓') : h('span', { class: 'ring-txt' }, initials(n.name)))
    );
  }
  function lockIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ico');
    svg.innerHTML = '<rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>';
    return svg;
  }
  function checkIcon(kind) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ico');
    svg.innerHTML = kind === 'debate'
      ? '<path d="M4 6h9a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" fill="currentColor"/><path d="M17 9h3a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1v3l-4-3h-3a2 2 0 0 1-2-1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
      : '<circle cx="5" cy="17" r="2.6" fill="currentColor"/><circle cx="12" cy="8" r="2.6" fill="currentColor"/><circle cx="19" cy="15" r="2.6" fill="currentColor"/><path d="M5 17 12 8l7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    return svg;
  }

  function journey() {
    const C = state.C;
    const p = state.player;
    const met = C.nodes
      .filter((n) => p.nodes[n.id] && p.nodes[n.id].introduced)
      .map((n) => ({ type: 'idea', n, at: p.nodes[n.id].firstSeen || 0 }));
    const checks = [
      ...Object.entries(p.threadsUnlocked).filter(([id]) => C.threadsById[id]).map(([id, at]) => ({ type: 'thread', t: C.threadsById[id], at })),
      ...Object.entries(p.debatesUnlocked).filter(([id]) => C.debatesById[id]).map(([id, at]) => ({ type: 'debate', d: C.debatesById[id], at })),
    ];
    return met.concat(checks).sort((a, b) => a.at - b.at || (a.type === 'idea' ? -1 : 1));
  }

  function nextLabel() {
    const s = state.session;
    if (s) return s.title;
    const C = state.C;
    const p = state.player;
    if (p.startersCompleted < C.starters.length) return C.starters[p.startersCompleted].title;
    return 'Your next session';
  }

  function homeScreen() {
    const C = state.C;
    const p = state.player;
    const resuming = !!(state.session && state.session.begun);
    const steps = journey();
    const metCount = steps.filter((x) => x.type === 'idea').length;
    const remaining = C.nodes.length - metCount;
    const WAVE = [0, 1, 2, 1, 0, -1, -2, -1];
    let i = 0;
    const offset = () => '--x:' + WAVE[i++ % WAVE.length];

    const items = steps.map((x) => {
      if (x.type === 'idea') {
        const st = BF.graph.nodeState(state.G, p, x.n.id);
        return h('li', { class: 'path-step', style: offset() },
          h('button', { class: 'path-node', 'data-world': x.n.world, 'aria-label': x.n.name + ' · ' + (STATE_WORD[st] || ''), onclick: () => go('#/idea/' + x.n.id) },
            ringNode(x.n, st),
            h('span', { class: 'path-name' }, x.n.name)));
      }
      const isT = x.type === 'thread';
      const title = isT ? x.t.title : x.d.title;
      return h('li', { class: 'path-step path-step--check', style: offset() },
        h('button', { class: 'path-check path-check--' + x.type, 'aria-label': (isT ? 'Thread · ' : 'Debate · ') + title, onclick: () => go((isT ? '#/thread/' : '#/debate/') + (isT ? x.t.id : x.d.id)) },
          h('span', { class: 'check-face', 'aria-hidden': 'true' }, checkIcon(x.type)),
          h('span', { class: 'path-name' }, h('small', {}, isT ? 'Thread' : 'Debate'), title)));
    });
    const s = state.session;
    const sessFill = s && s.begun ? s.index / s.items.length : 0;
    const startBtn = h('button', { class: 'path-start', onclick: () => go('#/play'), autofocus: true }, resuming ? 'Continue' : 'Play');
    items.push(
      h('li', { class: 'path-step path-step--next', style: offset() },
        startBtn,
        h('button', { class: 'path-node path-node--next', 'aria-hidden': 'true', tabindex: '-1', onclick: () => go('#/play') },
          h('span', { class: 'ring ring--next', style: '--fill:' + sessFill }, h('span', { class: 'ring-face' }, h('span', { class: 'ring-star' }, '★')))),
        h('span', { class: 'path-name path-name--next' }, nextLabel()))
    );
    for (let k = 0; k < Math.min(3, remaining); k++) {
      items.push(h('li', { class: 'path-step path-step--ahead', style: offset(), 'aria-hidden': 'true' }, h('span', { class: 'path-node' }, ringNode(null, 'locked'))));
    }

    const screen = h(
      'main',
      { class: 'screen home home--path' },
      h('header', { class: 'topbar' },
        h('h1', { class: 'wordmark' }, 'BLACK FOLK'),
        h('div', { class: 'stats' },
          h('span', { class: 'k' }, h('span', { class: 'stat-ico', 'aria-hidden': 'true' }, '◆'), fmt(p.knowledge) + ' KNOWLEDGE'),
          h('span', { class: 'lvl' }, 'LVL ' + p.level))),
      h('div', { class: 'spectrum', 'aria-hidden': 'true' }, C.worlds.map((w) => h('span', { 'data-world': w.id }))),
      h('section', { class: 'path-banner' },
        h('p', { class: 'eyebrow' }, 'Your path'),
        h('p', { class: 'path-banner-title' }, metCount ? metCount + ' of ' + C.nodes.length + ' ideas met' : 'Fifty ideas. Seven worlds.'),
        h('p', { class: 'lede-note' }, metCount ? 'Rings fill as your understanding grows.' : 'Your path starts with one short session.')),
      h('ol', { class: 'journey', 'aria-label': 'Your path' }, items),
      remaining > 0 ? h('p', { class: 'lede-note path-more' }, remaining === 1 ? 'One more idea to discover.' : remaining + ' more ideas to discover.') : h('p', { class: 'lede-note path-more' }, 'Every idea met. Keep deepening them.')
    );
    screen._afterMount = (restored) => {
      if (restored) return;
      const nx = screen.querySelector('.path-step--next');
      if (nx && steps.length > 4) nx.scrollIntoView({ block: 'center' });
    };
    return screen;
  }

  // Bottom navigation on Home, EXPLORE and Settings (never inside a session).
  function navBar(route) {
    const item = (hash, label, active, icon) =>
      h('button', { class: 'nav-item' + (active ? ' is-active' : ''), 'aria-current': active ? 'page' : null, onclick: () => go(hash) },
        h('span', { class: 'nav-ico', 'aria-hidden': 'true' }, icon), h('span', { class: 'nav-label' }, label));
    const exploreRoutes = ['explore', 'world', 'idea', 'thread', 'debate'];
    return h('nav', { class: 'navbar', 'aria-label': 'Main' },
      item('#/', 'Path', route === 'home', '●'),
      item('#/explore', 'Explore', exploreRoutes.includes(route), '◎'),
      item('#/words', 'Words', route === 'words', '❝'),
      item('#/settings', 'Settings', route === 'settings', '⚙'));
  }

  // ---- PLAY -----------------------------------------------------------------------
  function renderPlay() {
    if (!state.session) {
      state.session = S.buildNext(state.C, state.player);
      save();
    }
    const s = state.session;
    if (!s.begun) return mount(introScreen(s));
    if (s.pending.length) return mount(s.pending[0].type === 'thread-done' ? threadDoneScreen(s) : threadRevealScreen(s));
    // An answer was recorded but the player left before continuing.
    while (s.index < s.items.length && s.results[s.index]) s.index++;
    if (s.index >= s.items.length) return finishSession();
    mount(encounterScreen(s));
  }

  function sessionFrame(s, body) {
    const dots = h('ol', { class: 'dots', 'aria-label': 'Encounter ' + Math.min(s.index + 1, s.items.length) + ' of ' + s.items.length });
    s.items.forEach((_, i) =>
      dots.append(h('li', { class: i < s.index ? 'done' : i === s.index ? 'now' : '', 'data-world': i === s.index ? worldOfEnc(s.items[i].enc) : null }))
    );
    const current = s.items[s.index];
    return h(
      'main',
      { class: 'screen screen--play', 'data-world': current ? worldOfEnc(current.enc) : null },
      h(
        'div',
        { class: 'session-bar' },
        h('button', { class: 'close', 'aria-label': 'Leave session (progress is saved)', title: 'Leave (progress is saved)', onclick: () => go('#/') }, '×'),
        dots,
        h('span', { style: 'width:2.75rem' })
      ),
      body
    );
  }

  function worldOfEnc(enc) {
    const n = state.C.nodesById[enc.nodeIds[0]];
    return n ? n.world : null;
  }

  function introScreen(s) {
    const C = state.C;
    const begin = () => {
      s.begun = true;
      save();
      renderPlay();
    };
    let eyebrowText = 'Session';
    const notes = [];
    if (s.kind === 'starter') {
      eyebrowText = 'First sessions · ' + (s.starterIndex + 1) + ' / ' + C.starters.length;
      if (s.starterIndex === 0) {
        const premise = (C.framing || []).find((f) => f.id === 'F-02');
        if (premise) notes.push(premise.title);
        notes.push('Six short moments. Stop whenever you like.');
      } else {
        notes.push('Six short moments.');
      }
    } else if (s.kind === 'bridge') {
      eyebrowText = 'Theme';
      notes.push('Six short moments.');
    } else if (s.kind === 'anchored') {
      eyebrowText = 'Learn from here';
      notes.push('Start with this idea. Then move through its neighbours.');
    } else {
      notes.push('Six short moments.');
    }
    const screen = h(
      'main',
      { class: 'screen screen--center' },
      h('p', { class: 'eyebrow' }, eyebrowText),
      h('h1', { class: 'display', tabindex: '-1' }, s.title),
      h('div', { style: 'margin-top:1.5rem' }, notes.map((n, i) => h('p', { class: i === 0 && notes.length > 1 ? 'lead' : 'lede-note' }, n))),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn btn--primary', onclick: begin }, 'Begin'),
        h('button', { class: 'btn btn--quiet', onclick: () => go('#/') }, 'Not now')
      )
    );
    screen._onKey = (e) => {
      if (e.key === 'Enter' && document.activeElement.tagName !== 'BUTTON') {
        begin();
        return true;
      }
      return false;
    };
    requestAnimationFrame(() => screen.querySelector('.btn--primary').focus({ preventScroll: true }));
    return screen;
  }

  function encounterScreen(s) {
    const item = s.items[s.index];
    let answered = false;
    const frames = {};
    const writeFrame = (enc) => {
      if (!state.C.teachBack) return null;
      return frames[enc.id] || (frames[enc.id] = BF.notes.pickFrame(state.C, state.player, enc.nodeIds[0], { spoken: false }));
    };
    const ctx = {
      answer(response, opts) {
        if (answered) return null;
        answered = true;
        const result = S.evaluate(item.enc, response, state.player);
        S.applyResult(state.C, state.player, s, result);
        save();
        // Understanding checks answer quietly: no pop, no animation, whatever the verdict.
        if (result.points && !(opts && opts.quiet)) floatPoints(result.points);
        return result;
      },
      next() {
        if (!answered) return;
        s.index++;
        save();
        renderPlay();
      },
      hint: hintFor,
      word: (id) => state.C.wordsById[id],
      // YOUR WORDS on RECALL / SHARE. Saving an answer earns no Knowledge.
      // The writing rhythm may turn writing off on a card (item.noWrite).
      canWrite: (enc, it) => enc.nodeIds.length > 0 && !(it && it.noWrite),
      // Derived RECALL / SHARE ask with a rotating audience and a written length.
      writePrompt: (enc) => {
        const n = state.C.nodesById[enc.nodeIds[0]];
        const f = enc.derived && n ? writeFrame(enc) : null;
        if (f) return BF.notes.explainAsk(state.C, n, f);
        if (enc.derived && n) return BF.content.explainPrompt(n);
        return 'How would you put it in your own words?'; // the question is already on screen above
      },
      saveNote(enc, text) {
        const n = state.C.nodesById[enc.nodeIds[0]];
        const f = enc.derived && n ? writeFrame(enc) : null;
        return this.saveAnswer(enc, text, f ? { frame: f, prompt: BF.notes.explainAsk(state.C, n, f) } : {});
      },
      saveAnswer(enc, text, opts) {
        const rec = BF.notes.add(state.player, {
          nodeIds: enc.nodeIds,
          encounterId: enc.id,
          text,
          prompt: (opts && opts.prompt) || (enc.lead ? enc.lead + ' ' : '') + enc.prompt,
          promptType: (opts && opts.promptType) || BF.content.writeTypeOf(state.C, enc),
          model: enc.reveal,
          frame: opts && opts.frame,
          context: opts && opts.frame ? 'card' : undefined,
        });
        save();
        return rec;
      },
      // Understanding check: only explain-type cards with pilot content, and only
      // where the writing rhythm leaves writing on.
      checkFor: (it) => (it.noWrite ? null : BF.content.checkFor(state.C, it.enc)),
      previousAnswer: (nodeId, rec) => BF.notes.previousExplain(state.C, state.player, nodeId, rec),
      recordCheck(entry) {
        BF.notes.recordCheck(state.player, entry);
        save();
      },
      fmtDate: (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
      worldOf: worldOfEnc,
      nowHook: nowHookForItem,
      frameLabel: (f) => BF.notes.frameInfo(state.C, f).label,
      teachOffer: (it) => teachOffer(s, it, () => ctx.next()),
      lensFor(enc) {
        const n = state.C.nodesById[enc.nodeIds[0]];
        return enc.kind === 'discover' && n ? n.lens : null;
      },
    };
    const body = BF.ui.render(item, ctx);
    // LEAD: the contemporary hook opens the card, before the history.
    const lead = nowHookForItem(item);
    if (lead && lead.placement === 'LEAD') body.prepend(BF.ui.nowBlock(lead, { bridge: false }));
    const screen = sessionFrame(s, body);
    screen._onKey = body._onKey;
    return screen;
  }

  // ---- TEACH-BACK ------------------------------------------------------------------
  // Offered in play at most once per session (after a DISCOVER reveal, or after a
  // debate-linked card), never right before another writing card, and not for an
  // idea whose RECALL / SHARE is already in this session.
  function teachOffer(s, item, next) {
    const C = state.C;
    if (!C.teachBack || s.teachUsed) return null;
    const after = s.items[s.index + 1];
    if (after && S.isWritingItem(after)) return null;
    const enc = item.enc;
    const open = (label, build) => ({
      label,
      open(card) {
        s.teachUsed = true;
        save();
        const pad = build(() => next());
        card.replaceWith(pad);
        const scr = document.querySelector('.screen--play');
        if (scr) scr._onKey = pad._onKey;
        window.scrollTo(0, 0);
      },
    });
    if (enc.kind === 'discover' && enc.nodeIds.length === 1) {
      const id = enc.nodeIds[0];
      const writtenLater = s.items.some((it) => S.isWritingItem(it) && it.enc.nodeIds.includes(id));
      if (writtenLater || !C.nodesById[id]) return null;
      return open('Teach it back', (done) => ideaPad(id, done));
    }
    if (enc.debateId && C.debatesById[enc.debateId]) return open('Explain both sides', (done) => debatePad(enc.debateId, done));
    return null;
  }

  const fmtDate = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  const frameLabel = (f) => BF.notes.frameInfo(state.C, f).label;

  // Explain one idea: rated, and the rating only moves the idea's next review.
  function ideaPad(id, done) {
    const C = state.C;
    const n = C.nodesById[id];
    const frame = BF.notes.pickFrame(C, state.player, id);
    const ask = BF.notes.explainAsk(C, n, frame);
    return BF.ui.teachBack({
      kind: 'idea',
      ask,
      frame,
      frameLabel,
      fmtDate,
      spoken: BF.notes.frameInfo(C, frame).spoken,
      model: () => BF.ui.paras(n.coreIdea),
      previous: (rec) => BF.notes.previousExplain(C, state.player, id, rec),
      save: (texts) => {
        const rec = BF.notes.add(state.player, { nodeIds: [id], text: texts[0], prompt: ask, promptType: 'explain', model: n.coreIdea, frame, context: 'teach-back' });
        save();
        return rec;
      },
      rated: true,
      rate: (key) => {
        M.teachBackReview(state.player, id, key);
        save();
      },
      done,
    });
  }

  // Both sides of a debate, as fairly as you can, then (optionally) where you lean.
  // Reflective: never rated, never a winner.
  function debatePad(debateId, done) {
    const C = state.C;
    const d = C.debatesById[debateId];
    const tb = C.teachBack;
    const frame = BF.notes.pickFrame(C, state.player, debateId, { spoken: false });
    const ask = tb.debate.ask;
    return BF.ui.teachBack({
      kind: 'debate',
      eyebrow: 'Explain both sides',
      sub: d.title,
      context: d.question,
      ask,
      frame,
      frameLabel,
      fmtDate,
      fields: d.sides.map((side) => ({ label: side.label })),
      modelLabel: 'The two sides',
      model: () =>
        h('div', { class: 'teach-sides' },
          d.sides.map((side) =>
            h('div', { class: 'teach-side' },
              h('p', { class: 'title-caps' }, side.label),
              side.summary ? BF.ui.paras(side.summary) : null,
              side.nodeIds.map((nid) => h('p', {}, h('strong', {}, C.nodesById[nid].subject + '. '), C.nodesById[nid].coreIdea))))),
      previous: (rec) => BF.notes.previousFor(state.player, debateId, rec, 'debate'),
      save: (texts) => {
        const sides = d.sides.map((side, i) => ({ label: side.label, text: texts[i] }));
        const rec = BF.notes.add(state.player, {
          nodeIds: [],
          debateId,
          sides,
          text: sides.filter((x) => x.text.trim()).map((x) => x.label + ': ' + x.text.trim()).join('\n\n'),
          prompt: ask,
          promptType: 'reflective',
          frame,
          context: 'debate',
        });
        save();
        return rec;
      },
      lean: {
        ask: tb.debate.lean,
        save: (text) => {
          BF.notes.add(state.player, { nodeIds: [], debateId, text, prompt: tb.debate.lean, promptType: 'reflective', context: 'lean' });
          save();
        },
      },
      rated: false,
      done,
    });
  }

  // A finished thread: how do these moments answer one question? Reflective, unrated.
  function threadPad(threadId, done) {
    const C = state.C;
    const t = C.threadsById[threadId];
    const frame = BF.notes.pickFrame(C, state.player, threadId);
    const fi = BF.notes.frameInfo(C, frame);
    const ask = C.teachBack.thread.ask + ', ' + fi.audience + ', ' + fi.length + '.';
    return BF.ui.teachBack({
      kind: 'thread',
      eyebrow: 'Teach it back',
      context: t.question,
      ask,
      frame,
      frameLabel,
      fmtDate,
      spoken: fi.spoken,
      modelLabel: 'The path',
      model: () =>
        h('ol', { class: 'teach-path' },
          t.steps.map((st) => {
            const n = C.nodesById[st.nodeIds[0]];
            return h('li', {}, h('p', { class: 'title-caps' }, st.label), n ? h('p', {}, n.coreIdea) : null);
          })),
      previous: (rec) => BF.notes.previousFor(state.player, threadId, rec, 'thread'),
      save: (texts) => {
        const rec = BF.notes.add(state.player, { nodeIds: [], threadId, text: texts[0], prompt: ask + ' ' + t.question, promptType: 'reflective', frame, context: 'thread' });
        save();
        return rec;
      },
      rated: false,
      done,
    });
  }

  function threadDoneScreen(s) {
    const t = state.C.threadsById[s.pending[0].id];
    const cont = () => {
      s.pending.shift();
      save();
      renderPlay();
    };
    const body = h(
      'div',
      { class: 'thread-done' },
      h(
        'section',
        { class: 'card card--celebrate' },
        h('p', { class: 'eyebrow' }, 'Thread complete'),
        h('p', { class: 'title-caps' }, t.title),
        h('ul', { class: 'path path--done', 'aria-label': 'Thread path' }, t.steps.map((st) => h('li', { class: 'on' }, st.label)))
      ),
      threadPad(t.id, cont)
    );
    const screen = sessionFrame(s, body);
    requestAnimationFrame(() => {
      const b = screen.querySelector('.card--teach .btn--primary');
      if (b) b.focus({ preventScroll: true });
    });
    return screen;
  }

  function threadRevealScreen(s) {
    const t = state.C.threadsById[s.pending[0].id];
    const progress = M.threadProgress(state.C, state.player, t);
    const cont = () => {
      s.pending.shift();
      save();
      renderPlay();
    };
    const hook = nowOn() ? state.C.nowHooks[t.id] : null;
    const body = h(
      'section',
      { class: 'card' },
      hook && hook.placement === 'LEAD' ? BF.ui.nowBlock(hook) : null,
      h('p', { class: 'eyebrow' }, 'Thread revealed'),
      h('p', { class: 'title-caps' }, t.title),
      h('p', { class: 'lead', style: 'margin-bottom:1rem' }, 'Different moments. Same question:'),
      h('h1', { class: 'display', tabindex: '-1' }, t.question),
      h('ul', { class: 'path', 'aria-label': 'Thread path' }, t.steps.map((st, i) => h('li', { class: progress[i] ? 'on' : '' }, st.label))),
      hook && hook.placement === 'CODA' ? BF.ui.nowBlock(hook) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn btn--primary', onclick: cont }, 'Continue'))
    );
    body.classList.add('card--celebrate');
    const screen = sessionFrame(s, body);
    requestAnimationFrame(() => {
      screen.querySelector('.btn--primary').focus({ preventScroll: true });
      BF.ui.burst(screen.querySelector('.path'), { count: 12 });
    });
    return screen;
  }

  function finishSession() {
    const s = state.session;
    const summary = S.finish(state.C, state.player, s);
    summary.starterIndex = s.starterIndex;
    state.summary = summary;
    state.session = null;
    save();
    go('#/summary', true);
  }

  // ---- SUMMARY ------------------------------------------------------------------
  // "Teach one back": one optional explanation at the end, never required.
  function teachOneBack(sum) {
    const C = state.C;
    const n = sum.teachId && C.nodesById[sum.teachId];
    if (!n || !C.teachBack) return null;
    if (sum.taught) return h('p', { class: 'lede-note teach-saved' }, 'Taught back: ' + n.name + '.');
    const box = h(
      'div',
      { class: 'teach-offer' },
      h('p', { class: 'eyebrow' }, 'Teach one back'),
      h('p', { class: 'teach-offer-name' }, n.name),
      h('p', { class: 'lede-note' }, 'Explaining it in your own words is how it sticks.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => {
        const pad = ideaPad(n.id, () => {
          sum.taught = true;
          pad.replaceWith(h('p', { class: 'lede-note teach-saved' }, 'Taught back: ' + n.name + '.'));
        });
        box.replaceWith(pad);
        pad.scrollIntoView({ block: 'start' });
      } }, 'Teach it back'))
    );
    return box;
  }
  function summaryScreen(sum) {
    const C = state.C;
    const facts = [];
    facts.push(sum.strengthened + (sum.strengthened === 1 ? ' idea strengthened' : ' ideas strengthened'));
    if (sum.connections) facts.push(sum.connections + (sum.connections === 1 ? ' new connection' : ' new connections'));
    if (sum.words && sum.words.length) facts.push('Words · ' + sum.words.length + ' found');
    for (const id of sum.threads) facts.push('Thread · ' + C.threadsById[id].title);
    for (const id of sum.debates) facts.push('Debate opened · ' + C.debatesById[id].title);
    if (sum.levelAfter > sum.levelBefore) facts.push('LVL ' + sum.levelAfter);

    const more = () => {
      state.summary = null;
      state.session = S.buildNext(state.C, state.player);
      save();
      go('#/play', true);
    };
    const done = () => {
      state.summary = null;
      go('#/', true);
    };
    // Rings for the ideas this session touched, filled to where they stand now.
    const ids = (sum.strengthenedIds || []).filter((id) => C.nodesById[id]).slice(0, 6);
    const rings = ids.length
      ? h('ul', { class: 'sum-rings', 'aria-label': 'Ideas this session' }, ids.map((id) => {
          const n = C.nodesById[id];
          const st = BF.graph.nodeState(state.G, state.player, id);
          return h('li', { class: st === 'strong' ? 'is-strong' : null }, ringNode(n, st), h('span', { class: 'sum-ring-name' }, n.name), h('span', { class: 'sum-ring-state' }, STATE_WORD[st] || ''));
        }))
      : null;
    const total = h('p', { class: 'total' }, h('span', { class: 'total-n' }, '+' + fmt(sum.knowledge)), h('small', {}, 'KNOWLEDGE'));
    const screen = h(
      'main',
      { class: 'screen summary' },
      h('div', { class: 'sum-hero' },
        h('span', { class: 'sum-badge', 'aria-hidden': 'true' }, '★'),
        h('p', { class: 'eyebrow' }, 'Session complete'),
        total),
      rings,
      h('ul', { class: 'facts' }, facts.map((f) => h('li', {}, f))),
      sum.keepThis
        ? h('div', { class: 'keep' }, h('p', { class: 'eyebrow' }, 'Keep this'), h('p', { class: 'quote', tabindex: '-1' }, '“' + sum.keepThis + '”'))
        : null,
      teachOneBack(sum),
      sum.kind === 'starter' && sum.starterIndex === 0
        ? h('p', { class: 'lede-note' }, 'That’s a full session. Stopping here is fine.')
        : null,
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn btn--primary', onclick: done }, 'Done'),
        h('button', { class: 'btn', onclick: more }, 'Keep playing')
      )
    );
    requestAnimationFrame(() => {
      screen.querySelector('.btn--primary').focus({ preventScroll: true });
      BF.ui.burst(screen.querySelector('.sum-badge'), { count: 14 });
      screen.querySelectorAll('.sum-rings .is-strong .ring').forEach((r) => BF.ui.burst(r));
      // Count the Knowledge up once; the final number is already in the DOM text.
      const el = screen.querySelector('.total-n');
      const target = sum.knowledge;
      if (target > 0 && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        const t0 = performance.now();
        const tick = (t) => {
          const k = Math.min(1, (t - t0) / 700);
          el.textContent = '+' + fmt(Math.round(target * (1 - Math.pow(1 - k, 3))));
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    });
    return screen;
  }

  // ---- EXPLORE (Knowledge Map) lives in explore.js ---------------------------------
  function backLink(hash, label) {
    return h('button', { class: 'textlink back', onclick: () => (hash ? go(hash) : history.back()) }, '← ' + (label || 'Back'));
  }

  // ---- SETTINGS -------------------------------------------------------------------
  function settingsScreen() {
    const settings = store.settings.get();
    const themeBtn = (value, label) =>
      h(
        'button',
        {
          'aria-pressed': settings.theme === value ? 'true' : 'false',
          onclick: () => {
            settings.theme = value;
            store.settings.set(settings);
            applyTheme();
            render();
          },
        },
        label
      );
    // Display only: switching never changes Knowledge, mastery, discoveries, or WORDS.
    const mapBtn = (value, label) =>
      h(
        'button',
        {
          'aria-pressed': settings.mapVisibility === value ? 'true' : 'false',
          onclick: () => {
            settings.mapVisibility = value;
            store.settings.set(settings);
            render();
          },
        },
        label
      );
    // Contemporary Connections: display only; progress is unaffected either way.
    const nowBtn = (value, label) =>
      h(
        'button',
        {
          'aria-pressed': (settings.contemporary || 'on') === value ? 'true' : 'false',
          onclick: () => {
            settings.contemporary = value;
            store.settings.set(settings);
            render();
          },
        },
        label
      );
    const resetArea = h('div');
    const askReset = () => {
      resetArea.replaceChildren(
        h(
          'div',
          { class: 'confirm', role: 'alertdialog', 'aria-label': 'Confirm reset' },
          h('p', {}, 'Erase all Knowledge, mastery, and session history on this device? This cannot be undone.'),
          h(
            'div',
            { class: 'actions', style: 'padding-top:0' },
            h('button', { class: 'btn btn--primary', onclick: doReset }, 'Erase progress'),
            h('button', { class: 'btn', onclick: () => resetArea.replaceChildren(resetBtn) }, 'Cancel')
          )
        )
      );
      resetArea.querySelector('.btn--primary').focus();
    };
    const resetBtn = h('button', { class: 'btn', onclick: askReset }, 'Reset progress');
    resetArea.append(resetBtn);
    return h(
      'main',
      { class: 'screen' },
      backLink('#/', 'Home'),
      h('p', { class: 'eyebrow' }, 'Settings'),
      h('div', { class: 'block', style: 'margin-top:0' }, h('h2', {}, 'Appearance'), h('div', { class: 'seg', role: 'group', 'aria-label': 'Theme' }, themeBtn('dark', 'Dark'), themeBtn('light', 'Light'))),
      h(
        'div',
        { class: 'block' },
        h('h2', {}, 'Map visibility'),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Map visibility' }, mapBtn('gradual', 'Discover gradually'), mapBtn('all', 'Show everything')),
        h(
          'p',
          { class: 'muted', style: 'margin-top:.9rem;max-width:34rem' },
          settings.mapVisibility === 'all'
            ? 'Every idea, thread, and debate is browsable, and you can learn from any idea. Visible is not the same as learned: your progress only changes through play.'
            : 'The map reveals itself as you play. Switch to Show everything to browse the whole map and learn from any idea.'
        )
      ),
      h(
        'div',
        { class: 'block' },
        h('h2', {}, 'Contemporary connections'),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Contemporary connections' }, nowBtn('on', 'On'), nowBtn('off', 'Off')),
        h(
          'p',
          { class: 'muted', style: 'margin-top:.9rem;max-width:34rem' },
          (settings.contemporary || 'on') === 'on'
            ? 'Some ideas open with a short, sourced example from today (Now) or close with one (Still here today). The history stays the same.'
            : 'Purely historical: no contemporary examples are shown. Your progress is unaffected.'
        )
      ),
      h('div', { class: 'block' }, h('h2', {}, 'Progress'), h('p', { class: 'muted', style: 'margin-bottom:1rem' }, 'Progress is stored only on this device. Nothing is sent anywhere.'), resetArea),
      h(
        'div',
        { class: 'block' },
        h('h2', {}, 'About'),
        h('p', { class: 'muted' }, 'BLACK FOLK · V1.5. Works offline. Content: ' + state.C.version + '.'),
        h('p', { class: 'muted', style: 'margin-top:.5rem' }, 'WORDS: ' + state.C.words.length + ' quotations from ' + state.C.wordsSource + '.')
      )
    );
  }

  async function doReset() {
    await saving;
    await store.clearAll();
    state.player = M.newPlayer();
    state.session = null;
    state.summary = null;
    await save();
    go('#/');
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', store.settings.get().theme);
  }

  // ---- keyboard -------------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Typing (YOUR WORDS, filters) never triggers game shortcuts.
    const tag = e.target && e.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
    if (e.key === 'Escape' && route().name !== 'home') {
      go('#/');
      return;
    }
    if (currentScreen && currentScreen._onKey && currentScreen._onKey(e)) e.preventDefault();
  });

  // ---- boot -----------------------------------------------------------------------
  async function boot() {
    applyTheme();
    try {
      state.C = BF.content.load();
      state.C.version = globalThis.BF_CONTENT.playtest.version;
      // Maintenance only: hooks past refreshBy stay in place; developers get a quiet note.
      const stale = BF.content.staleNowHooks(state.C);
      if (stale.length && typeof console !== 'undefined') console.info('[NOW] hooks past refreshBy:', stale.map((x) => x.id + ' (' + x.refreshBy + ')').join(', '));
    } catch (err) {
      main().replaceChildren(h('main', { class: 'screen screen--center' }, h('p', { class: 'eyebrow' }, 'Content error'), h('p', {}, String(err.message))));
      throw err;
    }
    const player = await store.get('player');
    // Saved progress is upgraded in place, never discarded (see mastery.migrate).
    const original = player ? JSON.parse(JSON.stringify(player)) : null;
    const { player: upgraded, migrated } = M.migrate(player);
    state.player = upgraded;
    state.G = state.C.graph = BF.graph.build(state.C);
    if (migrated || !Object.keys(state.player.map.nodes).length) BF.graph.backfill(state.C, state.G, state.player);
    if (migrated) {
      await store.set('player-backup-v' + original.version, original);
      await store.set('player', state.player);
    }
    state.session = M.migrateSession((await store.get('session')) || null);
    window.addEventListener('hashchange', render);
    render();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  BF.app = { state, boot, render, save };
  boot();
})((globalThis.BF = globalThis.BF || {}));
