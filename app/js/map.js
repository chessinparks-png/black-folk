// Knowledge Map rendering (inline SVG, no library). Only what the player has
// revealed is drawn: locked ideas are faint unlabeled points, and links
// appear one by one as they are encountered in PLAY.
(function (BF) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const GR = BF.graph;

  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  function curve(a, b, c, pull) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const cx = mx + (c.x - mx) * pull;
    const cy = my + (c.y - my) * pull;
    return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }

  const RADIUS = { locked: 3.2, discovered: 6, connected: 6.5, familiar: 7.5, strong: 7.5 };

  function nodeMark(ctx, n, pos, state, opts) {
    const r = RADIUS[state] * (opts.scale || 1);
    const g = s('g', { class: 'mnode is-' + state, 'data-world': n.world });
    if (state === 'strong') g.append(s('circle', { class: 'halo', cx: pos.x, cy: pos.y, r: r + 5 * (opts.scale || 1) }));
    g.append(s('circle', { class: 'dot', cx: pos.x, cy: pos.y, r }));
    if (state === 'locked') {
      g.setAttribute('aria-hidden', 'true');
      return g;
    }
    // Label radially outward from the cluster centre.
    const cos = Math.cos(pos.angle);
    const sin = Math.sin(pos.angle);
    const off = r + 8 * (opts.scale || 1);
    const anchor = cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle';
    const ly = pos.y + sin * off + (anchor === 'middle' ? (sin > 0 ? 12 : -4) * (opts.scale || 1) : 5 * (opts.scale || 1));
    g.append(
      s('circle', { class: 'hit', cx: pos.x, cy: pos.y, r: 18 * (opts.scale || 1) }),
      s('text', { class: 'mlabel', x: pos.x + cos * off, y: ly, 'text-anchor': anchor }, opts.label ? opts.label(n) : n.name)
    );
    const a = s('a', { href: '#/idea/' + n.id, 'aria-label': n.subject + ', ' + state }, g);
    return a;
  }

  // ---- whole map ---------------------------------------------------------------
  function overview(ctx) {
    const { C, G, player } = ctx;
    const L = G.layout;
    const map = GR.ensure(player);
    const lastViewed = map.lastViewed || 0;
    const svg = s('svg', {
      class: 'kmap kmap--overview',
      viewBox: `0 0 ${L.size} ${L.size}`,
      role: 'img',
      'aria-label': 'Knowledge Map: seven worlds and the ideas you have discovered in them.',
    });

    // Quiet territories.
    for (const w of C.worlds) {
      const pos = L.worlds[w.id];
      const count = C.nodes.filter((n) => n.world === w.id).length;
      const any = GR.discoveredCount(C, player, w.id) > 0;
      svg.append(s('circle', { class: 'territory' + (any ? ' is-lit' : ''), 'data-world': w.id, cx: pos.x, cy: pos.y, r: 62 + count * 6 + 30 }));
    }

    // Revealed links only.
    const edges = s('g', { class: 'medges' });
    // The overview draws only links met in PLAY (encounters / both ideas met).
    // Thread chains live in each thread's own view, keeping the map from
    // becoming a spiderweb as threads unlock.
    for (const e of GR.visibleEdges(G, player)) {
      if (!e.kinds.has('encounter') && !e.kinds.has('discovered')) continue;
      const a = L.nodes[e.a];
      const b = L.nodes[e.b];
      const fresh = map.edges[e.id] > lastViewed && lastViewed > 0;
      const wa = C.nodesById[e.a].world;
      const far = wa !== C.nodesById[e.b].world;
      // Links inside a world stay close to it; links between worlds bow gently and recede.
      const d = far ? curve(a, b, L.center, 0.18) : curve(a, b, L.worlds[wa], 0.45);
      edges.append(s('path', { class: 'medge' + (far ? ' is-far' : '') + (fresh ? ' is-new' : ''), 'data-world': wa, 'data-a': e.a, 'data-b': e.b, d, pathLength: 1 }));
    }
    svg.append(edges);

    const nodes = s('g', { class: 'mnodes' });
    for (const n of C.nodes) {
      const mark = nodeMark(ctx, n, L.nodes[n.id], GR.nodeState(G, player, n.id), {});
      // Focus: hovering or tabbing to an idea lights up its links, including
      // the faint links that cross into other worlds.
      if (mark.tagName === 'a') {
        const on = (v) => () => {
          svg.classList.toggle('has-focus', v);
          edges.querySelectorAll('[data-a="' + n.id + '"],[data-b="' + n.id + '"]').forEach((p) => p.classList.toggle('is-focus', v));
        };
        mark.addEventListener('mouseenter', on(true));
        mark.addEventListener('mouseleave', on(false));
        mark.addEventListener('focus', on(true));
        mark.addEventListener('blur', on(false));
      }
      nodes.append(mark);
    }
    svg.append(nodes);

    // World names sit at the centre of their territory and open that world.
    for (const w of C.worlds) {
      const pos = L.worlds[w.id];
      const any = GR.discoveredCount(C, player, w.id) > 0;
      svg.append(
        s(
          'a',
          { href: '#/world/' + w.id, class: 'mworld' + (any ? ' is-lit' : ''), 'data-world': w.id, 'aria-label': w.id + ': ' + w.question },
          s('rect', { class: 'hit', x: pos.x - 90, y: pos.y - 26, width: 180, height: 44 }),
          s('text', { x: pos.x, y: pos.y + 7, 'text-anchor': 'middle' }, w.id)
        )
      );
    }
    return svg;
  }

  function shortLabel(n) {
    const name = n.name;
    if (name.length <= 14) return name;
    if (/^thinker/.test(n.kind)) {
      const words = name.split(' / ')[0].replace(/,?\s+Jr\.$/, '').split(' ');
      return words[words.length - 1];
    }
    return name.slice(0, 13).trim() + '…';
  }

  // ---- one world, larger and labelled -----------------------------------------------
  function world(ctx, worldId) {
    const { C, G, player } = ctx;
    const L = GR.worldLayout(C, worldId);
    const svg = s('svg', {
      class: 'kmap kmap--world',
      // Extra side margin so long labels ("Stokely Carmichael / Kwame Ture") never clip.
      viewBox: `-230 0 ${L.width + 460} ${L.height}`,
      role: 'img',
      'aria-label': 'Map of ' + worldId,
      'data-world': worldId,
    });
    svg.append(s('text', { class: 'mworld-center', x: L.center.x, y: L.center.y + 8, 'text-anchor': 'middle', 'data-world': worldId }, worldId));

    const edges = s('g', { class: 'medges' });
    const overviewL = G.layout;
    for (const e of GR.visibleEdges(G, player)) {
      const inA = L.nodes[e.a];
      const inB = L.nodes[e.b];
      if (inA && inB) {
        edges.append(s('path', { class: 'medge', 'data-world': worldId, d: curve(inA, inB, L.center, 0.3) }));
      } else if (inA || inB) {
        // A link that leaves this world: a short stub pointing toward the other world.
        const here = inA ? e.a : e.b;
        const there = inA ? e.b : e.a;
        const p = L.nodes[here];
        const ow = overviewL.worlds[C.nodesById[there].world];
        const hw = overviewL.worlds[worldId];
        const ang = Math.atan2(ow.y - hw.y, ow.x - hw.x);
        const end = { x: p.x + Math.cos(ang) * 46, y: p.y + Math.sin(ang) * 46 };
        edges.append(
          s('line', { class: 'mstub', 'data-world': C.nodesById[there].world, x1: p.x, y1: p.y, x2: end.x, y2: end.y }),
          s('circle', { class: 'mstub-dot', 'data-world': C.nodesById[there].world, cx: end.x, cy: end.y, r: 3.5 })
        );
      }
    }
    svg.append(edges);
    // Phones: larger type, so long names use a short form (the full list sits below the map).
    const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;
    const label = narrow ? shortLabel : (n) => n.name;
    const nodes = s('g', { class: 'mnodes' });
    for (const n of C.nodes.filter((x) => x.world === worldId)) {
      nodes.append(nodeMark(ctx, n, L.nodes[n.id], GR.nodeState(G, player, n.id), { scale: narrow ? 1.8 : 1.35, label }));
    }
    svg.append(nodes);
    return svg;
  }

  BF.map = { overview, world };
})((globalThis.BF = globalThis.BF || {}));
