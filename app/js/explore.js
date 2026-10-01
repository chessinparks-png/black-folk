// EXPLORE: the Knowledge Map and its views — worlds, ideas, threads, debates,
// and the WORDS collection.
//
// Two visibility modes (Settings → MAP VISIBILITY):
//   DISCOVER GRADUALLY (default) — only what PLAY has revealed is shown.
//   SHOW EVERYTHING — every idea, thread, debate and deepening card is browsable.
// Visibility never changes progress: nothing is marked discovered, no mastery,
// no Knowledge, no WORDS. Only answered encounters do that.
(function (BF) {
  'use strict';

  const { h, paras, quoteBlock } = BF.ui;
  const GR = BF.graph;

  const STATE_LABEL = { locked: 'Not yet learned', discovered: 'Discovered', connected: 'Connected', familiar: 'Familiar', strong: 'Strong' };

  function row(ctx, opts) {
    return h(
      'li',
      {},
      h(
        'button',
        { class: 'row' + (opts.dim ? ' is-dim' : ''), onclick: () => ctx.go(opts.href), 'data-world': opts.world || null },
        h(
          'span',
          {},
          h('span', { class: 'name' + (opts.plain ? ' plain' : '') }, opts.world && opts.dot ? h('i', { class: 'wdot', 'aria-hidden': 'true' }) : null, opts.name),
          opts.sub ? h('span', { class: 'sub' }, opts.sub) : null
        ),
        opts.meta ? h('span', { class: 'meta ' + (opts.metaClass || '') }, opts.meta) : h('span')
      )
    );
  }

  const isOpen = (ctx, id) => GR.nodeState(ctx.G, ctx.player, id) !== 'locked';
  const canSee = (ctx, id) => ctx.showAll || isOpen(ctx, id);
  const threadsShown = (ctx) => ctx.C.threads.filter((t) => ctx.showAll || ctx.player.threadsUnlocked[t.id]);
  const debatesShown = (ctx) => ctx.C.debates.filter((d) => ctx.showAll || ctx.player.debatesUnlocked[d.id]);
  const notOpened = (on) => (on ? null : 'Not yet opened in play');

  function lockedNote(ctx, n, one, many) {
    if (!n || ctx.showAll) return '';
    return n === 1 ? 'One more ' + one + ' surfaces as you play.' : n + ' more ' + many + ' surface as you play.';
  }

  // Short name, unless two ideas share it (Du Bois, Wells).
  function displayName(ctx, n) {
    return ctx.C.nodes.some((o) => o.id !== n.id && o.name === n.name) ? n.subject : n.name;
  }

  function chip(ctx, n, dim) {
    return h('a', { href: '#/idea/' + n.id, 'data-world': n.world, class: dim ? 'is-dim' : null }, h('i', { class: 'wdot', 'aria-hidden': 'true' }), displayName(ctx, n));
  }

  // Deepening cards (Diaspora, Coalition, Disrepute…): supporting ideas, never core nodes.
  function deepCard(c) {
    return h('div', { class: 'deep-card' }, h('p', { class: 'deep-title' }, c.title), c.text ? h('p', { class: 'deep-text' }, c.text) : null);
  }

  function block(title, ...kids) {
    return h('section', { class: 'block' }, h('h2', {}, title), ...kids);
  }

  // A filled group: related things sit together on one surface.
  function panel(cls, ...kids) {
    const items = kids.flat(Infinity).filter(Boolean);
    return items.length ? h('section', { class: 'panel ' + (cls || '') }, ...items) : null;
  }

  // World-tinted header band.
  function hero(world, ...kids) {
    return h('header', { class: 'hero', 'data-world': world || null }, ...kids);
  }

  function modeNote(ctx) {
    return ctx.showAll ? h('p', { class: 'mode-note' }, 'Showing the whole map. Visible is not the same as learned.') : null;
  }

  // ---- landing: the whole map --------------------------------------------------
  function landing(ctx) {
    const { C, G, player } = ctx;
    const threads = threadsShown(ctx);
    const debates = debatesShown(ctx);
    const discovered = C.nodes.filter((n) => isOpen(ctx, n.id)).length;
    const links = GR.visibleEdges(G, player).length;
    const found = GR.wordsFound(C, player).length;
    const svg = BF.map.overview(ctx);
    // Links revealed since the last visit draw themselves in once; then they settle.
    GR.ensure(player).lastViewed = Date.now();
    ctx.save();

    return h(
      'main',
      { class: 'screen screen--wide' },
      ctx.backLink('#/', 'Home'),
      hero(
        null,
        h('p', { class: 'eyebrow' }, 'Explore'),
        h('h1', { class: 'display display--md', tabindex: '-1' }, 'Seven worlds. Seven questions.'),
        h('p', { class: 'lede-note' }, discovered ? discovered + ' of ' + C.nodes.length + ' ideas discovered · ' + links + (links === 1 ? ' connection' : ' connections') : 'Your map fills in as you play.'),
        modeNote(ctx)
      ),
      h('div', { class: 'panel panel--map' }, h('div', { class: 'map-frame' }, svg)),
      h(
        'ul',
        { class: 'world-grid' },
        C.worlds.map((w) => {
          const n = GR.discoveredCount(C, player, w.id);
          const total = C.nodes.filter((x) => x.world === w.id).length;
          return h(
            'li',
            {},
            h(
              'button',
              { class: 'world-card', 'data-world': w.id, onclick: () => ctx.go('#/world/' + w.id) },
              h('span', { class: 'world-card-name' }, w.id),
              h('span', { class: 'world-card-q' }, w.question),
              h('span', { class: 'world-card-meta' }, ctx.showAll ? n + ' of ' + total + ' discovered' : n + ' discovered')
            )
          );
        })
      ),
      panel(
        'panel--group',
        block('Words', h('ul', { class: 'rows rows--tight' }, row(ctx, { href: '#/words', name: 'Your collection', plain: true, sub: 'Exact quotations found in play.', meta: found + ' found' }))),
        block(
          'Threads',
          threads.length
            ? h('ul', { class: 'rows rows--tight' }, threads.map((t) => row(ctx, { href: '#/thread/' + t.id, name: t.title, sub: t.question, dim: !player.threadsUnlocked[t.id], meta: notOpened(player.threadsUnlocked[t.id]), metaClass: 'new' })))
            : null,
          h('p', { class: 'lede-note' }, lockedNote(ctx, C.threads.length - threads.length, 'thread', 'threads'))
        ),
        block(
          'Debates',
          debates.length
            ? h('ul', { class: 'rows rows--tight' }, debates.map((d) => row(ctx, { href: '#/debate/' + d.id, name: d.title, plain: true, sub: d.question, dim: !player.debatesUnlocked[d.id], meta: notOpened(player.debatesUnlocked[d.id]), metaClass: 'new' })))
            : null,
          h('p', { class: 'lede-note' }, lockedNote(ctx, C.debates.length - debates.length, 'debate', 'debates'))
        )
      )
    );
  }

  // ---- a world ------------------------------------------------------------------
  function world(ctx, id) {
    const { C, G, player } = ctx;
    const w = C.worlds.find((x) => x.id === id);
    if (!w) return landing(ctx);
    const members = C.nodes.filter((n) => n.world === id);
    const open = members.filter((n) => isOpen(ctx, n.id));
    const listed = ctx.showAll ? members : open;
    const locked = members.length - open.length;
    const ids = new Set(members.map((n) => n.id));
    const beyond = new Map();
    for (const n of open) for (const other of GR.connectionsOf(G, player, n.id)) if (!ids.has(other)) beyond.set(other, C.nodesById[other]);
    const threads = threadsShown(ctx).filter((t) => t.steps.some((s) => s.nodeIds.some((x) => ids.has(x))));
    const debates = debatesShown(ctx).filter((d) => d.prereq.some((x) => ids.has(x)));
    const cards = open.length || ctx.showAll ? worldCards(C, id) : [];

    return h(
      'main',
      { class: 'screen screen--wide', 'data-world': id },
      ctx.backLink('#/explore', 'Map'),
      hero(id, h('p', { class: 'eyebrow' }, h('span', { class: 'world-tag' }, w.id)), h('h1', { class: 'display display--md', tabindex: '-1' }, w.question), modeNote(ctx)),
      h('div', { class: 'panel panel--map' }, h('div', { class: 'map-frame map-frame--world' }, BF.map.world(ctx, id))),
      panel(
        'panel--list',
        h('h2', { class: 'panel-title' }, 'Ideas'),
        listed.length
          ? h(
              'ul',
              { class: 'rows rows--tight' },
              listed.map((n) => {
                const st = GR.nodeState(G, player, n.id);
                return row(ctx, { href: '#/idea/' + n.id, name: n.subject, plain: true, meta: STATE_LABEL[st], metaClass: st === 'strong' ? 'strong' : st === 'locked' ? 'new' : '', dim: st === 'locked' });
              })
            )
          : h('p', { class: 'lede-note' }, 'Nothing discovered here yet. This world opens as you play.'),
        locked && !ctx.showAll ? h('p', { class: 'lede-note gaps' }, h('span', { class: 'gap-dots', 'aria-hidden': 'true' }, '· '.repeat(Math.min(locked, 10)).trim()), ' ' + locked + ' still undiscovered') : null
      ),
      panel(
        'panel--group',
        beyond.size ? block('Connected beyond ' + w.id.toLowerCase(), h('div', { class: 'links' }, [...beyond.values()].map((n) => chip(ctx, n)))) : null,
        threads.length ? block('Threads', h('div', { class: 'links' }, threads.map((t) => h('a', { href: '#/thread/' + t.id, class: player.threadsUnlocked[t.id] ? null : 'is-dim' }, t.title)))) : null,
        debates.length ? block('Debates', h('div', { class: 'links' }, debates.map((d) => h('a', { href: '#/debate/' + d.id, class: player.debatesUnlocked[d.id] ? null : 'is-dim' }, d.title)))) : null,
        cards.length ? block('Deepen', cards.map(deepCard)) : null
      )
    );
  }

  function worldCards(C, worldId) {
    const home = C.deepening.filter((c) => c.home === worldId);
    const children = C.deepening.filter((c) => home.some((p) => p.id === c.home));
    return home.concat(children).filter((c) => c.text);
  }

  // ---- YOUR WORDS (private notes on an idea) -----------------------------------------
  const fmtDate = (t) =>
    new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

  function yourWords(ctx, n) {
    const wrap = h('section', { class: 'block yw' });
    const ask = n.yourWordsPrompt || 'Explain ' + n.name + ' in your own words.';
    let showAll = false;

    const editor = (initial, onSave, onCancel, ask) => {
      const area = h('textarea', { class: 'yw-input', rows: '4', 'aria-label': 'Your words' });
      area.value = initial || '';
      const el = h(
        'div',
        { class: 'yw-pad' },
        ask ? h('p', { class: 'yw-ask' }, ask) : null,
        area,
        h(
          'div',
          { class: 'yw-actions' },
          h('button', { class: 'textlink yw-strong', onclick: () => onSave(area.value) }, 'Save'),
          h('button', { class: 'textlink', onclick: onCancel }, 'Cancel')
        )
      );
      requestAnimationFrame(() => area.focus());
      return el;
    };

    const entry = (rec) => {
      const li = h('li', { class: 'yw-entry' });
      const view = () => {
        li.replaceChildren(
          h('p', { class: 'yw-date' }, fmtDate(rec.created_at), rec.encounter_id ? h('span', { class: 'muted' }, ' · IN PLAY') : null, rec.updated_at ? h('span', { class: 'muted' }, ' · EDITED') : null),
          h('p', { class: 'yw-text' }, rec.text),
          h(
            'div',
            { class: 'yw-actions' },
            h('button', { class: 'textlink', onclick: edit, 'aria-label': 'Edit note from ' + fmtDate(rec.created_at) }, 'Edit'),
            h('button', { class: 'textlink', onclick: confirmDelete, 'aria-label': 'Delete note from ' + fmtDate(rec.created_at) }, 'Delete')
          )
        );
      };
      const edit = () =>
        li.replaceChildren(
          h('p', { class: 'yw-date' }, fmtDate(rec.created_at)),
          editor(rec.text, (t) => {
            if (BF.notes.update(ctx.player, rec.response_id, t)) ctx.save();
            view();
          }, view)
        );
      const confirmDelete = () =>
        li.replaceChildren(
          h('p', { class: 'yw-date' }, fmtDate(rec.created_at)),
          h('p', { class: 'yw-text muted' }, rec.text),
          h(
            'div',
            { class: 'yw-actions', role: 'alertdialog', 'aria-label': 'Confirm delete' },
            h('span', { class: 'yw-confirm' }, 'Delete this note?'),
            h('button', {
              class: 'textlink yw-strong',
              onclick: () => {
                BF.notes.remove(ctx.player, rec.response_id);
                ctx.save();
                draw();
              },
            }, 'Delete'),
            h('button', { class: 'textlink', onclick: view }, 'Keep')
          )
        );
      view();
      return li;
    };

    const draw = () => {
      const recs = BF.notes.forNode(ctx.player, n.id);
      const shown = showAll ? recs : recs.slice(0, 1);
      const addArea = h('div');
      const addBtn = h('button', {
        class: 'textlink',
        onclick: () =>
          addArea.replaceChildren(
            editor('', (t) => {
              if (BF.notes.add(ctx.player, { nodeIds: [n.id], text: t, prompt: ask })) ctx.save();
              draw();
            }, draw, ask)
          ),
      }, 'Add a new note +');
      addArea.append(addBtn);
      wrap.replaceChildren(
        h('h2', {}, recs.length ? 'Your words · ' + recs.length : 'Your words'),
        recs.length ? h('ol', { class: 'yw-list' }, shown.map(entry)) : h('p', { class: 'lede-note', style: 'margin-top:0' }, 'No notes yet.'),
        recs.length > 1
          ? h('button', {
              class: 'textlink',
              'aria-expanded': showAll ? 'true' : 'false',
              onclick: () => {
                showAll = !showAll;
                draw();
              },
            }, showAll ? 'Show latest only −' : 'Show ' + (recs.length - 1) + ' earlier +')
          : null,
        addArea
      );
    };
    draw();
    return wrap;
  }

  // ---- LEARN FROM HERE ------------------------------------------------------------
  function learnFromHere(ctx, n) {
    const area = h('div', { class: 'learn' });
    const start = () => ctx.learnFrom(n.id);
    const btn = h(
      'button',
      {
        class: 'btn btn--learn',
        onclick: () => {
          if (!ctx.sessionInProgress()) return start();
          area.replaceChildren(
            h('p', { class: 'learn-confirm' }, 'Leave your current session? Answers you already gave are kept.'),
            h('div', { class: 'learn-actions' }, h('button', { class: 'btn btn--learn', onclick: start }, 'Learn from here'), h('button', { class: 'btn btn--quiet', onclick: () => area.replaceChildren(btn, sub) }, 'Cancel'))
          );
        },
      },
      'Learn from here'
    );
    const sub = h('span', { class: 'learn-sub' }, 'A short session that starts with this idea and moves through its neighbours.');
    area.append(btn, sub);
    return area;
  }

  // ---- an idea / thinker -----------------------------------------------------------
  function idea(ctx, id) {
    const { C, G, player } = ctx;
    const n = C.nodesById[id];
    if (!n) return landing(ctx);
    const st = GR.nodeState(G, player, id);
    if (st === 'locked' && !ctx.showAll) {
      return h(
        'main',
        { class: 'screen', 'data-world': n.world },
        ctx.backLink(null, 'Back'),
        hero(n.world, h('p', { class: 'eyebrow' }, h('span', { class: 'world-tag' }, n.world)), h('h1', { class: 'display display--md' }, 'Not yet discovered.')),
        h('p', { class: 'lede-note' }, 'This idea appears on your map once you meet it in PLAY. To browse the whole map, use Settings → Map visibility.')
      );
    }
    const why = C.whyThenByNode[id];
    const words = (G.wordsByNode[id] || []).filter((w) => GR.isFound(player, w.id));
    const unfound = (G.wordsByNode[id] || []).length - words.length;
    const connected = GR.connectionsOf(G, player, id).map((x) => C.nodesById[x]);
    // Whole-map mode also shows the not-yet-revealed neighbourhood, dimmed.
    const nearby = ctx.showAll
      ? [...new Set((G.byNode[id] || []).map((e) => (e.a === id ? e.b : e.a)))].filter((x) => !connected.some((c) => c.id === x)).map((x) => C.nodesById[x])
      : [];
    const threads = threadsShown(ctx).filter((t) => t.steps.some((s) => s.nodeIds.includes(id)));
    const debates = debatesShown(ctx).filter((d) => d.prereq.includes(id));
    const context = G.contextByNode[id] || [];

    // Progressive disclosure: lens, context and source stay folded away.
    const more = h('div', { class: 'more' });
    const moreBtn = h(
      'button',
      {
        class: 'textlink',
        'aria-expanded': 'false',
        onclick: () => {
          moreBtn.remove();
          more.append(
            n.lens ? block('Lens', h('p', { class: 'quote quote--sm' }, n.lens)) : null,
            context.length ? block('Context', h('div', { class: 'links links--plain' }, context.map((c) => h('span', {}, c.title)))) : null,
            h('p', { class: 'source' }, h('b', {}, 'SOURCE'), n.source, h('br'), n.sourceSection)
          );
        },
      },
      'Lens, context & source +'
    );
    more.append(moreBtn);

    return h(
      'main',
      { class: 'screen', 'data-world': n.world },
      ctx.backLink(null, 'Back'),
      hero(
        n.world,
        h('p', { class: 'eyebrow' }, h('a', { href: '#/world/' + n.world, class: 'world-tag' }, n.world), h('span', { class: 'sep' }, '·'), n.era),
        h('h1', { class: 'display display--md', tabindex: '-1' }, n.subject),
        h('div', { class: 'hero-row' }, h('span', { class: 'pill pill--' + st, 'data-world': n.world }, STATE_LABEL[st]), learnFromHere(ctx, n))
      ),
      panel('panel--understand', block('Core idea', h('p', {}, n.coreIdea)), why ? block('Why then', h('p', {}, why)) : null),
      panel('panel--keep', block('Keep this', h('p', { class: 'quote' }, n.keepThis || n.share))),
      words.length || unfound
        ? panel(
            'panel--words',
            block(
              'Words',
              words.map((w) => quoteBlock(w, { cite: true })),
              unfound ? h('p', { class: 'lede-note' }, words.length ? 'More words wait in play.' : 'Words wait in play.') : null
            )
          )
        : null,
      panel(
        'panel--group',
        connected.length ? block('Connected to', h('div', { class: 'links' }, connected.map((c) => chip(ctx, c)))) : null,
        nearby.length ? block('Nearby on the map', h('div', { class: 'links' }, nearby.map((c) => chip(ctx, c, true)))) : null,
        threads.length ? block('Threads', h('div', { class: 'links' }, threads.map((t) => h('a', { href: '#/thread/' + t.id, class: player.threadsUnlocked[t.id] ? null : 'is-dim' }, t.title)))) : null,
        debates.length ? block('Debates', h('div', { class: 'links' }, debates.map((d) => h('a', { href: '#/debate/' + d.id, class: player.debatesUnlocked[d.id] ? null : 'is-dim' }, d.title)))) : null
      ),
      panel('panel--notes', yourWords(ctx, n)),
      more
    );
  }

  // ---- a thread -------------------------------------------------------------------
  function thread(ctx, id) {
    const { C, G, player } = ctx;
    const t = C.threadsById[id];
    if (!t || !(player.threadsUnlocked[id] || ctx.showAll)) return landing(ctx);
    const responses = (C.threadResponses || {})[id] || [];
    const extraCards = t.cards.map((cid) => C.deepeningById[cid]).filter((c) => c.text && !t.steps.some((s) => s.cardId === c.id));
    return h(
      'main',
      { class: 'screen' },
      ctx.backLink(null, 'Back'),
      hero(
        null,
        h('p', { class: 'eyebrow' }, 'Thread', h('span', { class: 'sep' }, '·'), t.title),
        h('h1', { class: 'display display--md', tabindex: '-1' }, t.question),
        h('p', { class: 'lede-note' }, 'Different moments. Same question.'),
        player.threadsUnlocked[id] ? null : modeNote(ctx)
      ),
      responses.length ? panel('panel--group', block('Historical responses', h('div', { class: 'links links--plain' }, responses.map((r) => h('span', {}, r))))) : null,
      h(
        'ol',
        { class: 'thread-steps panel' },
        t.steps.map((st) => {
          if (st.cardId) {
            const c = C.deepeningById[st.cardId];
            return c && c.text ? h('li', { class: 'is-card' }, h('span', { class: 'step-name' }, c.title), h('span', { class: 'step-sub' }, c.text)) : null;
          }
          const nid = st.nodeIds.find((x) => isOpen(ctx, x)) || (ctx.showAll ? st.nodeIds[0] : null);
          if (!nid) return h('li', { class: 'is-locked' }, h('span', { class: 'muted' }, 'Not yet discovered'));
          const n = C.nodesById[nid];
          return h(
            'li',
            { 'data-world': n.world, class: isOpen(ctx, nid) ? null : 'is-dim' },
            h('a', { href: '#/idea/' + nid }, h('span', { class: 'step-name' }, st.label), h('span', { class: 'step-sub' }, n.share))
          );
        })
      ),
      extraCards.length ? panel('panel--group', block('Deepen', extraCards.map(deepCard))) : null
    );
  }

  // ---- a debate -------------------------------------------------------------------
  function debate(ctx, id) {
    const { C, player } = ctx;
    const d = C.debatesById[id];
    if (!d) return landing(ctx);
    if (!player.debatesUnlocked[id] && !ctx.showAll) {
      return h(
        'main',
        { class: 'screen' },
        ctx.backLink('#/explore', 'Map'),
        hero(null, h('p', { class: 'eyebrow' }, 'Debate'), h('h1', { class: 'display display--md' }, 'This debate opens once both sides have been introduced in play.'))
      );
    }
    const contrasts = d.encounterIds.map((eid) => C.byId[eid]).filter((e) => player.encounters[e.id]);
    return h(
      'main',
      { class: 'screen' },
      ctx.backLink(null, 'Back'),
      hero(
        null,
        h('p', { class: 'eyebrow' }, 'Same question. Different answers.'),
        h('h1', { class: 'display display--md', tabindex: '-1' }, d.question),
        h('p', { class: 'title-caps', style: 'margin:1rem 0 0' }, d.title),
        player.debatesUnlocked[id] ? null : modeNote(ctx)
      ),
      h(
        'div',
        { class: 'sides' },
        d.sides.map((side) =>
          h(
            'div',
            { class: 'side-card', 'data-world': side.nodeIds.length ? C.nodesById[side.nodeIds[0]].world : null },
            h('h2', {}, side.label),
            side.nodeIds.length
              ? side.nodeIds.map((nid) => {
                  const n = C.nodesById[nid];
                  return h('div', { class: 'idea', 'data-world': n.world }, h('a', { href: '#/idea/' + nid }, n.subject), h('p', {}, n.coreIdea));
                })
              : h('p', {}, side.summary || 'Material for this side will be added from the sources.')
          )
        )
      ),
      contrasts.length ? panel('panel--keep', block('The contrast', contrasts.map((e) => paras(e.reveal)))) : null,
      h('p', { class: 'lede-note' }, 'Mastering a debate means understanding both answers, not choosing one.')
    );
  }

  // ---- WORDS collection -----------------------------------------------------------
  // WORDS stay "found in play" only, in either visibility mode.
  const filters = { speaker: '', world: '', thread: '' };

  function wordsScreen(ctx) {
    const { C, player } = ctx;
    const found = GR.wordsFound(C, player).sort((a, b) => player.words[a.id].at - player.words[b.id].at);
    const listEl = h('div', { class: 'words-list' });

    const inThread = (w, tid) => {
      const t = C.threadsById[tid];
      return t.steps.some((s) => s.nodeIds.some((x) => w.nodeIds.includes(x)));
    };
    const draw = () => {
      const shown = found.filter(
        (w) =>
          (!filters.speaker || w.speaker === filters.speaker) &&
          (!filters.world || w.nodeIds.some((x) => C.nodesById[x].world === filters.world)) &&
          (!filters.thread || inThread(w, filters.thread))
      );
      listEl.replaceChildren(
        ...shown.map((w) =>
          h(
            'article',
            { class: 'words-item', 'data-world': C.nodesById[w.nodeIds[0]].world },
            quoteBlock(w, { cite: true }),
            h('div', { class: 'links links--small' }, w.nodeIds.filter((x) => canSee(ctx, x)).map((x) => chip(ctx, C.nodesById[x])))
          )
        )
      );
      if (!shown.length) listEl.append(h('p', { class: 'lede-note' }, 'No quotations match these filters yet.'));
    };

    const select = (label, key, options) =>
      h(
        'label',
        { class: 'filter' },
        h('span', {}, label),
        h(
          'select',
          {
            onchange: (e) => {
              filters[key] = e.target.value;
              draw();
            },
          },
          h('option', { value: '' }, 'All'),
          options.map(([v, t]) => {
            const o = h('option', { value: v }, t);
            if (filters[key] === v) o.selected = true;
            return o;
          })
        )
      );

    const speakers = [...new Set(found.map((w) => w.speaker).filter(Boolean))].sort();
    const worlds = C.worlds.filter((w) => found.some((q) => q.nodeIds.some((x) => C.nodesById[x].world === w.id)));
    const threads = C.threads.filter((t) => player.threadsUnlocked[t.id] && found.some((w) => inThread(w, t.id)));
    for (const k of Object.keys(filters)) filters[k] = '';

    draw();
    return h(
      'main',
      { class: 'screen' },
      ctx.backLink('#/explore', 'Map'),
      hero(
        null,
        h('p', { class: 'eyebrow' }, 'Words'),
        h('h1', { class: 'display display--md', tabindex: '-1' }, found.length ? found.length + ' found' : 'No words yet.'),
        h('p', { class: 'lede-note' }, found.length ? 'Exact quotations, in the words of the people who said or wrote them.' : 'Quotations appear as you play. Each one you find is kept here.')
      ),
      found.length > 3
        ? h(
            'div',
            { class: 'filters' },
            select('Thinker', 'speaker', speakers.map((x) => [x, x])),
            select('World', 'world', worlds.map((w) => [w.id, w.id])),
            threads.length ? select('Thread', 'thread', threads.map((t) => [t.id, t.title])) : null
          )
        : null,
      listEl
    );
  }

  function screen(name, arg, ctx) {
    switch (name) {
      case 'world':
        return world(ctx, arg);
      case 'idea':
        return idea(ctx, arg);
      case 'thread':
        return thread(ctx, arg);
      case 'debate':
        return debate(ctx, arg);
      case 'words':
        return wordsScreen(ctx);
      default:
        return landing(ctx);
    }
  }

  BF.explore = { screen, STATE_LABEL };
})((globalThis.BF = globalThis.BF || {}));
