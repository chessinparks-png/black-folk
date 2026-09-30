// EXPLORE: the Knowledge Map and its views — worlds, ideas, threads, debates,
// and the WORDS collection. Everything shown here was revealed through PLAY.
(function (BF) {
  'use strict';

  const { h, paras, quoteBlock } = BF.ui;
  const M = BF.mastery;
  const GR = BF.graph;

  const STATE_LABEL = { discovered: 'Discovered', connected: 'Connected', familiar: 'Familiar', strong: 'Strong' };

  function row(ctx, opts) {
    return h(
      'li',
      {},
      h(
        'button',
        { class: 'row', onclick: () => ctx.go(opts.href), 'data-world': opts.world || null },
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

  const unlockedThreads = (ctx) => ctx.C.threads.filter((t) => ctx.player.threadsUnlocked[t.id]);
  const unlockedDebates = (ctx) => ctx.C.debates.filter((d) => ctx.player.debatesUnlocked[d.id]);

  function lockedNote(n, one, many) {
    if (!n) return '';
    return n === 1 ? 'One more ' + one + ' surfaces as you play.' : n + ' more ' + many + ' surface as you play.';
  }

  // Short name, unless two ideas share it (Du Bois, Wells).
  function displayName(ctx, n) {
    return ctx.C.nodes.some((o) => o.id !== n.id && o.name === n.name) ? n.subject : n.name;
  }

  function chip(ctx, n) {
    return h('a', { href: '#/idea/' + n.id, 'data-world': n.world }, h('i', { class: 'wdot', 'aria-hidden': 'true' }), displayName(ctx, n));
  }

  // Deepening cards (Diaspora, Coalition, …): supporting ideas, never core nodes.
  function deepCard(c) {
    return h('div', { class: 'deep-card' }, h('p', { class: 'deep-title' }, c.title), c.text ? h('p', { class: 'deep-text' }, c.text) : null);
  }

  function block(title, ...kids) {
    return h('section', { class: 'block' }, h('h2', {}, title), ...kids);
  }

  // ---- landing: the whole map --------------------------------------------------
  function landing(ctx) {
    const { C, G, player } = ctx;
    const threads = unlockedThreads(ctx);
    const debates = unlockedDebates(ctx);
    const discovered = C.nodes.filter((n) => GR.nodeState(G, player, n.id) !== 'locked').length;
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
      h('p', { class: 'eyebrow' }, 'Explore'),
      h('h1', { class: 'display display--md', tabindex: '-1' }, 'Seven worlds. Seven questions.'),
      h('p', { class: 'lede-note' }, discovered ? discovered + ' ideas discovered · ' + links + (links === 1 ? ' connection' : ' connections') : 'Your map fills in as you play.'),
      h('div', { class: 'map-frame' }, svg),
      h(
        'ul',
        { class: 'rows' },
        C.worlds.map((w) =>
          row(ctx, { href: '#/world/' + w.id, name: w.id, sub: w.question, meta: GR.discoveredCount(C, player, w.id) + ' discovered', world: w.id, dot: true })
        )
      ),
      block(
        'Words',
        h('ul', { class: 'rows', style: 'margin-top:0' }, row(ctx, { href: '#/words', name: 'Your collection', plain: true, sub: 'Exact quotations found in play.', meta: found + ' found' }))
      ),
      block(
        'Threads',
        threads.length ? h('ul', { class: 'rows', style: 'margin-top:0' }, threads.map((t) => row(ctx, { href: '#/thread/' + t.id, name: t.title, sub: t.question }))) : null,
        h('p', { class: 'lede-note' }, lockedNote(C.threads.length - threads.length, 'thread', 'threads'))
      ),
      block(
        'Debates',
        debates.length
          ? h('ul', { class: 'rows', style: 'margin-top:0' }, debates.map((d) => row(ctx, { href: '#/debate/' + d.id, name: d.title, plain: true, sub: d.question })))
          : null,
        h('p', { class: 'lede-note' }, lockedNote(C.debates.length - debates.length, 'debate', 'debates'))
      )
    );
  }

  // ---- a world ------------------------------------------------------------------
  function world(ctx, id) {
    const { C, G, player } = ctx;
    const w = C.worlds.find((x) => x.id === id);
    if (!w) return landing(ctx);
    const members = C.nodes.filter((n) => n.world === id);
    const open = members.filter((n) => GR.nodeState(G, player, n.id) !== 'locked');
    const locked = members.length - open.length;
    const ids = new Set(members.map((n) => n.id));
    const beyond = new Map();
    for (const n of open) for (const other of GR.connectionsOf(G, player, n.id)) if (!ids.has(other)) beyond.set(other, C.nodesById[other]);
    const threads = unlockedThreads(ctx).filter((t) => t.steps.some((s) => s.nodeIds.some((x) => ids.has(x))));
    const debates = unlockedDebates(ctx).filter((d) => d.prereq.some((x) => ids.has(x)));

    return h(
      'main',
      { class: 'screen screen--wide', 'data-world': id },
      ctx.backLink('#/explore', 'Map'),
      h('p', { class: 'eyebrow' }, h('span', { class: 'world-tag', 'data-world': id }, w.id)),
      h('h1', { class: 'display display--md', tabindex: '-1' }, w.question),
      h('div', { class: 'map-frame map-frame--world' }, BF.map.world(ctx, id)),
      open.length
        ? h(
            'ul',
            { class: 'rows' },
            open.map((n) => {
              const st = GR.nodeState(G, player, n.id);
              return row(ctx, { href: '#/idea/' + n.id, name: n.subject, plain: true, meta: STATE_LABEL[st], metaClass: st === 'strong' ? 'strong' : '' });
            })
          )
        : h('p', { class: 'lede-note' }, 'Nothing discovered here yet. This world opens as you play.'),
      locked ? h('p', { class: 'lede-note gaps' }, h('span', { class: 'gap-dots', 'aria-hidden': 'true' }, '· '.repeat(Math.min(locked, 10)).trim()), ' ' + locked + ' still undiscovered') : null,
      beyond.size ? block('Connected beyond ' + w.id.toLowerCase(), h('div', { class: 'links' }, [...beyond.values()].map((n) => chip(ctx, n)))) : null,
      threads.length ? block('Threads', h('div', { class: 'links' }, threads.map((t) => h('a', { href: '#/thread/' + t.id }, t.title)))) : null,
      debates.length ? block('Debates', h('div', { class: 'links' }, debates.map((d) => h('a', { href: '#/debate/' + d.id }, d.title)))) : null,
      open.length && worldCards(C, id).length ? block('Deepen', worldCards(C, id).map(deepCard)) : null
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

  // ---- an idea / thinker -----------------------------------------------------------
  function idea(ctx, id) {
    const { C, G, player } = ctx;
    const n = C.nodesById[id];
    if (!n) return landing(ctx);
    const st = GR.nodeState(G, player, id);
    if (st === 'locked') {
      return h(
        'main',
        { class: 'screen' },
        ctx.backLink(null, 'Back'),
        h('p', { class: 'eyebrow' }, h('span', { class: 'world-tag', 'data-world': n.world }, n.world)),
        h('h1', { class: 'display display--md' }, 'Not yet discovered.'),
        h('p', { class: 'lede-note' }, 'This idea appears on your map once you meet it in PLAY.')
      );
    }
    const why = C.whyThenByNode[id];
    const words = (G.wordsByNode[id] || []).filter((w) => GR.isFound(player, w.id));
    const unfound = (G.wordsByNode[id] || []).length - words.length;
    const connected = GR.connectionsOf(G, player, id).map((x) => C.nodesById[x]);
    const threads = unlockedThreads(ctx).filter((t) => t.steps.some((s) => s.nodeIds.includes(id)));
    const debates = unlockedDebates(ctx).filter((d) => d.prereq.includes(id));
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
      h('p', { class: 'eyebrow' }, h('a', { href: '#/world/' + n.world, class: 'world-tag', 'data-world': n.world }, n.world), h('span', { class: 'sep' }, '·'), n.era),
      h('h1', { class: 'display display--md', tabindex: '-1' }, n.subject),
      h('div', { style: 'margin-top:1rem' }, h('span', { class: 'pill pill--' + st, 'data-world': n.world }, STATE_LABEL[st])),
      block('Core idea', h('p', {}, n.coreIdea)),
      why ? block('Why then', h('p', {}, why)) : null,
      words.length || unfound
        ? block(
            'Words',
            words.map((w) => quoteBlock(w, { cite: true })),
            unfound ? h('p', { class: 'lede-note' }, words.length ? 'More words wait in play.' : 'Words wait in play.') : null
          )
        : null,
      connected.length ? block('Connected to', h('div', { class: 'links' }, connected.map((c) => chip(ctx, c)))) : null,
      threads.length ? block('Threads', h('div', { class: 'links' }, threads.map((t) => h('a', { href: '#/thread/' + t.id }, t.title)))) : null,
      debates.length ? block('Debates', h('div', { class: 'links' }, debates.map((d) => h('a', { href: '#/debate/' + d.id }, d.title)))) : null,
      block('Keep this', h('p', { class: 'quote' }, n.keepThis || n.share)),
      yourWords(ctx, n),
      more
    );
  }

  // ---- a thread -------------------------------------------------------------------
  function thread(ctx, id) {
    const { C, G, player } = ctx;
    const t = C.threadsById[id];
    if (!t || !player.threadsUnlocked[id]) return landing(ctx);
    return h(
      'main',
      { class: 'screen' },
      ctx.backLink(null, 'Back'),
      h('p', { class: 'eyebrow' }, 'Thread', h('span', { class: 'sep' }, '·'), t.title),
      h('h1', { class: 'display display--md', tabindex: '-1' }, t.question),
      h('p', { class: 'lede-note' }, 'Different moments. Same question.'),
      t.cards.filter((cid) => C.deepeningById[cid].text && !t.steps.some((s) => s.cardId === cid)).length
        ? block('Deepen', t.cards.map((cid) => C.deepeningById[cid]).filter((c) => c.text && !t.steps.some((s) => s.cardId === c.id)).map(deepCard))
        : null,
      h(
        'ol',
        { class: 'thread-steps' },
        t.steps.map((st) => {
          if (st.cardId) {
            const c = C.deepeningById[st.cardId];
            return c && c.text ? h('li', { class: 'is-card' }, h('span', { class: 'step-name' }, c.title), h('span', { class: 'step-sub' }, c.text)) : null;
          }
          const nid = st.nodeIds.find((x) => GR.nodeState(G, player, x) !== 'locked');
          if (!nid) return h('li', { class: 'is-locked' }, h('span', { class: 'muted' }, 'Not yet discovered'));
          const n = C.nodesById[nid];
          return h(
            'li',
            { 'data-world': n.world },
            h('a', { href: '#/idea/' + nid }, h('span', { class: 'step-name' }, st.label), h('span', { class: 'step-sub' }, n.share))
          );
        })
      )
    );
  }

  // ---- a debate -------------------------------------------------------------------
  function debate(ctx, id) {
    const { C, player } = ctx;
    const d = C.debatesById[id];
    if (!d) return landing(ctx);
    if (!player.debatesUnlocked[id]) {
      return h(
        'main',
        { class: 'screen' },
        ctx.backLink('#/explore', 'Map'),
        h('p', { class: 'eyebrow' }, 'Debate'),
        h('h1', { class: 'display display--md' }, 'This debate opens once both sides have been introduced in play.')
      );
    }
    const contrasts = d.encounterIds.map((eid) => C.byId[eid]).filter((e) => player.encounters[e.id]);
    return h(
      'main',
      { class: 'screen' },
      ctx.backLink(null, 'Back'),
      h('p', { class: 'eyebrow' }, 'Same question. Different answers.'),
      h('h1', { class: 'display display--md', tabindex: '-1' }, d.question),
      h('p', { class: 'title-caps', style: 'margin-top:1.25rem' }, d.title),
      h(
        'div',
        { class: 'sides' },
        d.sides.map((side) =>
          h(
            'div',
            { class: 'block side', style: 'margin-top:0' },
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
      contrasts.length ? block('The contrast', contrasts.map((e) => paras(e.reveal))) : null,
      h('p', { class: 'lede-note' }, 'Mastering a debate means understanding both answers, not choosing one.')
    );
  }

  // ---- WORDS collection -----------------------------------------------------------
  const filters = { speaker: '', world: '', thread: '' };

  function wordsScreen(ctx) {
    const { C, G, player } = ctx;
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
            h('div', { class: 'links links--small' }, w.nodeIds.filter((x) => GR.nodeState(G, player, x) !== 'locked').map((x) => chip(ctx, C.nodesById[x])))
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
    const threads = unlockedThreads(ctx).filter((t) => found.some((w) => inThread(w, t.id)));
    for (const k of Object.keys(filters)) filters[k] = '';

    draw();
    return h(
      'main',
      { class: 'screen' },
      ctx.backLink('#/explore', 'Map'),
      h('p', { class: 'eyebrow' }, 'Words'),
      h('h1', { class: 'display display--md', tabindex: '-1' }, found.length ? found.length + ' found' : 'No words yet.'),
      h('p', { class: 'lede-note' }, found.length ? 'Exact quotations, in the words of the people who said or wrote them.' : 'Quotations appear as you play. Each one you find is kept here.'),
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
