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
    'THEN → NOW': 'An older lens, a new situation.',
  };
  function hintFor(key) {
    const seen = (state.player.hintsSeen = state.player.hintsSeen || {});
    if (seen[key]) return seen[key] === state.session.id ? HINTS[key] : null;
    seen[key] = state.session.id; // stays visible if this screen re-renders
    return HINTS[key] || null;
  }

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

  function mount(screen) {
    const app = main();
    app.replaceChildren(screen);
    window.scrollTo(0, 0);
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
    return { C: state.C, G: state.G, player: state.player, go, backLink, save, render };
  }

  // ---- HOME ---------------------------------------------------------------------
  function homeScreen() {
    const p = state.player;
    const resuming = !!state.session;
    return h(
      'main',
      { class: 'screen home' },
      h('h1', { class: 'wordmark' }, 'BLACK FOLK'),
      h('div', { class: 'spectrum', 'aria-hidden': 'true' }, state.C.worlds.map((w) => h('span', { 'data-world': w.id }))),
      h(
        'div',
        { class: 'stats' },
        h('span', { class: 'k' }, fmt(p.knowledge) + ' KNOWLEDGE'),
        h('span', { class: 'lvl' }, 'LVL ' + p.level)
      ),
      h(
        'div',
        { class: 'actions actions--stack' },
        h('button', { class: 'btn btn--primary', onclick: () => go('#/play'), autofocus: true }, resuming ? 'Continue' : 'Play'),
        h('button', { class: 'btn', onclick: () => go('#/explore') }, 'Explore')
      ),
      h('div', { class: 'home-foot' }, h('button', { class: 'textlink', onclick: () => go('#/settings') }, 'Settings'))
    );
  }

  // ---- PLAY -----------------------------------------------------------------------
  function renderPlay() {
    if (!state.session) {
      state.session = S.buildNext(state.C, state.player);
      save();
    }
    const s = state.session;
    if (!s.begun) return mount(introScreen(s));
    if (s.pending.length) return mount(threadRevealScreen(s));
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
    return h(
      'main',
      { class: 'screen' },
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
    const ctx = {
      answer(response) {
        if (answered) return null;
        answered = true;
        const result = S.evaluate(item.enc, response, state.player);
        S.applyResult(state.C, state.player, s, result);
        save();
        if (result.points) floatPoints(result.points);
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
      // YOUR WORDS on RECALL / SHARE. Saving a note earns no Knowledge.
      canWrite: (enc) => enc.nodeIds.length > 0,
      writePrompt: (enc) => {
        const n = state.C.nodesById[enc.nodeIds[0]];
        if (enc.derived && n) return 'Explain ' + n.name + ' in 1–3 sentences.';
        return 'In 1–3 sentences.'; // the question is already on screen above
      },
      saveNote(enc, text) {
        const rec = BF.notes.add(state.player, {
          nodeIds: enc.nodeIds,
          encounterId: enc.id,
          text,
          prompt: (enc.lead ? enc.lead + ' ' : '') + enc.prompt,
          model: enc.reveal,
        });
        save();
        return rec;
      },
      worldOf: worldOfEnc,
      lensFor(enc) {
        const n = state.C.nodesById[enc.nodeIds[0]];
        return enc.kind === 'discover' && n ? n.lens : null;
      },
    };
    const body = BF.ui.render(item, ctx);
    const screen = sessionFrame(s, body);
    screen._onKey = body._onKey;
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
    const body = h(
      'section',
      { class: 'card' },
      h('p', { class: 'eyebrow' }, 'Thread revealed'),
      h('p', { class: 'title-caps' }, t.title),
      h('p', { class: 'lead', style: 'margin-bottom:1rem' }, 'Different moments. Same question:'),
      h('h1', { class: 'display', tabindex: '-1' }, t.question),
      h('ul', { class: 'path', 'aria-label': 'Thread path' }, t.steps.map((st, i) => h('li', { class: progress[i] ? 'on' : '' }, st.label))),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn--primary', onclick: cont }, 'Continue'))
    );
    const screen = sessionFrame(s, body);
    requestAnimationFrame(() => screen.querySelector('.btn--primary').focus({ preventScroll: true }));
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
    const screen = h(
      'main',
      { class: 'screen summary' },
      h('p', { class: 'eyebrow' }, 'Session complete'),
      h('p', { class: 'total' }, '+' + fmt(sum.knowledge), h('small', {}, 'KNOWLEDGE')),
      h('ul', { class: 'facts' }, facts.map((f) => h('li', {}, f))),
      sum.keepThis
        ? h('div', { class: 'keep' }, h('p', { class: 'eyebrow' }, 'Keep this'), h('p', { class: 'quote', tabindex: '-1' }, '“' + sum.keepThis + '”'))
        : null,
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
    requestAnimationFrame(() => screen.querySelector('.btn--primary').focus({ preventScroll: true }));
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
      h('div', { class: 'block' }, h('h2', {}, 'Progress'), h('p', { class: 'muted', style: 'margin-bottom:1rem' }, 'Progress is stored only on this device. Nothing is sent anywhere.'), resetArea),
      h(
        'div',
        { class: 'block' },
        h('h2', {}, 'About'),
        h('p', { class: 'muted' }, 'BLACK FOLK · V1.2. Works offline. Content version: ' + state.C.version + '.'),
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
    state.session = (await store.get('session')) || null;
    window.addEventListener('hashchange', render);
    render();

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  BF.app = { state, boot, render };
  boot();
})((globalThis.BF = globalThis.BF || {}));
