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
        return mount(exploreScreen());
      case 'world':
        return mount(worldScreen(r.arg));
      case 'idea':
        return mount(ideaScreen(r.arg));
      case 'debate':
        return mount(debateScreen(r.arg));
      case 'thread':
        return mount(threadScreen(r.arg));
      case 'settings':
        return mount(settingsScreen());
      default:
        return mount(homeScreen());
    }
  }

  // ---- HOME ---------------------------------------------------------------------
  function homeScreen() {
    const p = state.player;
    const resuming = !!state.session;
    return h(
      'main',
      { class: 'screen home' },
      h('h1', { class: 'wordmark' }, 'BLACK FOLK'),
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
      dots.append(h('li', { class: i < s.index ? 'done' : i === s.index ? 'now' : '' }))
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
        const result = S.evaluate(item.enc, response);
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

  // ---- EXPLORE ------------------------------------------------------------------
  function backLink(hash, label) {
    return h('button', { class: 'textlink back', onclick: () => (hash ? go(hash) : history.back()) }, '← ' + (label || 'Back'));
  }

  function row(opts) {
    return h(
      'li',
      {},
      h(
        'button',
        { class: 'row', onclick: () => go(opts.href) },
        h('span', {}, h('span', { class: 'name' + (opts.plain ? ' plain' : '') }, opts.name), opts.sub ? h('span', { class: 'sub' }, opts.sub) : null),
        opts.meta ? h('span', { class: 'meta ' + (opts.metaClass || '') }, opts.meta) : h('span')
      )
    );
  }

  const unlockedThreads = () => state.C.threads.filter((t) => state.player.threadsUnlocked[t.id]);
  const unlockedDebates = () => state.C.debates.filter((d) => state.player.debatesUnlocked[d.id]);

  function exploreScreen() {
    const C = state.C;
    const threads = unlockedThreads();
    const debates = unlockedDebates();
    return h(
      'main',
      { class: 'screen' },
      backLink('#/', 'Home'),
      h('p', { class: 'eyebrow' }, 'Explore'),
      h('h1', { class: 'display display--md', tabindex: '-1' }, 'Seven worlds. Seven questions.'),
      h(
        'ul',
        { class: 'rows' },
        C.worlds.map((w) => {
          const count = C.nodes.filter((n) => n.world === w.id).length;
          return row({ href: '#/world/' + w.id, name: w.id, sub: w.question, meta: count + ' ideas' });
        })
      ),
      h(
        'div',
        { class: 'block' },
        h('h2', {}, 'Threads'),
        threads.length
          ? h('ul', { class: 'rows', style: 'margin-top:0' }, threads.map((t) => row({ href: '#/thread/' + t.id, name: t.title, sub: t.question })))
          : null,
        h('p', { class: 'lede-note' }, lockedNote(C.threads.length - threads.length, 'thread', 'threads'))
      ),
      h(
        'div',
        { class: 'block' },
        h('h2', {}, 'Debates'),
        debates.length
          ? h('ul', { class: 'rows', style: 'margin-top:0' }, debates.map((d) => row({ href: '#/debate/' + d.id, name: d.title, plain: true, sub: d.question })))
          : null,
        h('p', { class: 'lede-note' }, lockedNote(C.debates.length - debates.length, 'debate', 'debates'))
      )
    );
  }

  function lockedNote(n, one, many) {
    if (!n) return '';
    return n === 1 ? 'One more ' + one + ' surfaces as you play.' : n + ' more ' + many + ' surface as you play.';
  }

  function masteryMeta(id) {
    const l = M.label(state.player, id);
    return { meta: l, metaClass: l === 'STRONG' ? 'strong' : l === 'NEW' ? 'new' : '' };
  }

  function worldScreen(id) {
    const C = state.C;
    const w = C.worlds.find((x) => x.id === id);
    if (!w) return exploreScreen();
    const nodes = C.nodes.filter((n) => n.world === id);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const threads = unlockedThreads().filter((t) => t.steps.some((s) => s.nodeIds.some((x) => nodeIds.has(x))));
    const debates = unlockedDebates().filter((d) => d.prereq.some((x) => nodeIds.has(x)));
    return h(
      'main',
      { class: 'screen' },
      backLink('#/explore', 'Explore'),
      h('p', { class: 'eyebrow' }, w.id),
      h('h1', { class: 'display display--md', tabindex: '-1' }, w.question),
      h('ul', { class: 'rows' }, nodes.map((n) => row(Object.assign({ href: '#/idea/' + n.id, name: n.subject, plain: true }, masteryMeta(n.id))))),
      threads.length
        ? h('div', { class: 'block' }, h('h2', {}, 'Threads'), h('div', { class: 'links' }, threads.map((t) => h('a', { href: '#/thread/' + t.id }, t.title))))
        : null,
      debates.length
        ? h('div', { class: 'block' }, h('h2', {}, 'Debates'), h('div', { class: 'links' }, debates.map((d) => h('a', { href: '#/debate/' + d.id }, d.title))))
        : null
    );
  }

  function relatedNodes(id) {
    const C = state.C;
    const out = new Set();
    for (const e of C.encounters) if (e.nodeIds.includes(id)) e.nodeIds.forEach((x) => x !== id && out.add(x));
    for (const t of unlockedThreads()) {
      const on = t.steps.some((s) => s.nodeIds.includes(id));
      if (on) t.steps.forEach((s) => s.nodeIds.forEach((x) => x !== id && M.isSeen(state.player, x) && out.add(x)));
    }
    return [...out].map((x) => C.nodesById[x]);
  }

  // Short name, unless two ideas share it (e.g. Du Bois, Wells).
  function displayName(n) {
    return state.C.nodes.some((o) => o.id !== n.id && o.name === n.name) ? n.subject : n.name;
  }

  function ideaScreen(id) {
    const C = state.C;
    const n = C.nodesById[id];
    if (!n) return exploreScreen();
    const label = M.label(state.player, id);
    const why = C.whyThenByNode[id];
    const debates = unlockedDebates().filter((d) => d.prereq.includes(id));
    const threads = unlockedThreads().filter((t) => t.steps.some((s) => s.nodeIds.includes(id)));
    const related = relatedNodes(id);
    const lensWrap = h('div', { class: 'block' });
    if (n.lens) {
      const btn = h(
        'button',
        {
          class: 'textlink',
          onclick: () => lensWrap.replaceChildren(h('h2', {}, 'Lens'), h('p', { class: 'quote', style: 'font-size:1.5rem' }, n.lens)),
        },
        'Lens +'
      );
      lensWrap.append(btn);
    }
    return h(
      'main',
      { class: 'screen' },
      backLink(null, 'Back'),
      h('p', { class: 'eyebrow' }, h('a', { href: '#/world/' + n.world }, n.world), h('span', { class: 'sep' }, '·'), n.era),
      h('h1', { class: 'display display--md', tabindex: '-1' }, n.subject),
      h('div', { style: 'margin-top:1rem' }, h('span', { class: 'pill' + (label === 'STRONG' ? ' strong' : '') }, label)),
      h('div', { class: 'block' }, h('h2', {}, 'Core idea'), h('p', {}, n.coreIdea)),
      why ? h('div', { class: 'block' }, h('h2', {}, 'Why then'), h('p', {}, why)) : null,
      h('div', { class: 'block' }, h('h2', {}, 'Keep this'), h('p', { class: 'quote' }, '“' + n.share + '”')),
      n.lens ? lensWrap : null,
      related.length
        ? h('div', { class: 'block' }, h('h2', {}, 'Connections'), h('div', { class: 'links' }, related.map((r) => h('a', { href: '#/idea/' + r.id }, displayName(r)))))
        : null,
      debates.length
        ? h('div', { class: 'block' }, h('h2', {}, 'Debates'), h('div', { class: 'links' }, debates.map((d) => h('a', { href: '#/debate/' + d.id }, d.title))))
        : null,
      threads.length
        ? h('div', { class: 'block' }, h('h2', {}, 'Threads'), h('div', { class: 'links' }, threads.map((t) => h('a', { href: '#/thread/' + t.id }, t.title))))
        : null,
      h('p', { class: 'source' }, h('b', {}, 'SOURCE'), n.source, h('br'), n.sourceSection)
    );
  }

  function debateScreen(id) {
    const C = state.C;
    const d = C.debatesById[id];
    if (!d) return exploreScreen();
    if (!state.player.debatesUnlocked[id]) {
      return h(
        'main',
        { class: 'screen' },
        backLink('#/explore', 'Explore'),
        h('p', { class: 'eyebrow' }, 'Debate'),
        h('h1', { class: 'display display--md' }, 'This debate opens as you play.')
      );
    }
    const contrasts = d.encounterIds.map((eid) => C.byId[eid]).filter((e) => state.player.encounters[e.id]);
    return h(
      'main',
      { class: 'screen' },
      backLink(null, 'Back'),
      h('p', { class: 'eyebrow' }, 'Debate · ' + d.title),
      h('h1', { class: 'display display--md', tabindex: '-1' }, d.question),
      h(
        'div',
        { class: 'sides' },
        d.sides.map((side) =>
          h(
            'div',
            { class: 'block', style: 'margin-top:0' },
            h('h2', {}, side.label),
            side.nodeIds.length
              ? side.nodeIds.map((nid) => {
                  const n = C.nodesById[nid];
                  return h('div', { class: 'idea' }, h('a', { href: '#/idea/' + nid }, n.subject), h('p', {}, n.coreIdea));
                })
              : h('p', { class: 'muted' }, 'More material for this side will be added from the sources.')
          )
        )
      ),
      contrasts.length
        ? h('div', { class: 'block' }, h('h2', {}, 'The contrast'), contrasts.map((e) => paras(e.reveal)))
        : null,
      h('p', { class: 'lede-note' }, 'Mastering a debate means understanding both answers, not choosing one.')
    );
  }

  function threadScreen(id) {
    const C = state.C;
    const t = C.threadsById[id];
    if (!t || !state.player.threadsUnlocked[id]) return exploreScreen();
    const progress = M.threadProgress(C, state.player, t);
    return h(
      'main',
      { class: 'screen' },
      backLink(null, 'Back'),
      h('p', { class: 'eyebrow' }, 'Thread · ' + t.title),
      h('h1', { class: 'display display--md', tabindex: '-1' }, t.question),
      h(
        'ul',
        { class: 'rows' },
        t.steps.map((st, i) => {
          const nid = st.nodeIds.find((x) => M.isSeen(state.player, x)) || st.nodeIds[0];
          if (!nid) return h('li', {}, h('div', { class: 'row', style: 'cursor:default' }, h('span', { class: 'name plain muted' }, st.label), h('span')));
          return row({ href: '#/idea/' + nid, name: st.label, plain: true, meta: progress[i] ? M.label(state.player, nid) : 'NEW', metaClass: progress[i] ? '' : 'new' });
        })
      )
    );
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
        h('p', { class: 'muted' }, 'BLACK FOLK · V1. Works offline. Content version: ' + state.C.version + '.')
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
    state.player = player && player.version === 1 ? player : M.newPlayer();
    state.player.level = M.levelFor(state.player.knowledge);
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
