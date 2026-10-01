// Reusable encounter renderer. Each encounter kind is one screen with its own
// small state machine: prompt → answer → reveal → continue.
(function (BF) {
  'use strict';

  // Tiny DOM helper: h('div', {class: 'x', onclick: fn}, child, 'text', …)
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  // Native append/replaceChildren print null as text "null". Our UI often passes
  // optional children, so skip null/false everywhere, once.
  if (typeof Element !== 'undefined' && !Element.prototype.__bfSafe) {
    const native = Element.prototype.replaceChildren;
    Element.prototype.replaceChildren = function (...kids) {
      return native.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false));
    };
    Element.prototype.__bfSafe = true;
  }

  // Append children, skipping null/false (native append would print "null").
  function put(el, ...kids) {
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k);
    return el;
  }

  // Paragraph-aware text: blank lines become separate paragraphs.
  function paras(text, cls) {
    return String(text)
      .split(/\n\n+/)
      .map((p) => h('p', { class: cls }, p));
  }

  const MODE_LABEL = {
    DISCOVER: 'Discover',
    WHAT: 'What',
    WHO: 'Who',
    'WHY THEN': 'Why then',
    CONNECT: 'Connect',
    'SAME QUESTION': 'Same question',
    RECALL: 'Recall',
    SHARE: 'Share',
    'THEN → NOW': 'Then → Now',
    WORDS: 'Words',
    APPLY: 'Apply',
    'BOSS ROUND': 'Boss round',
    TIMELINE: 'Timeline',
    MATCH: 'Match',
  };

  function eyebrow(enc, world) {
    const bits = [];
    if (enc.boss) bits.push('Boss round');
    else if (enc.kind === 'sort') bits.push('Sort');
    else bits.push(MODE_LABEL[enc.mode] || enc.mode);
    let extra = enc.eyebrow;
    if (extra && /^BOSS ROUND\s*·\s*/.test(extra)) extra = extra.replace(/^BOSS ROUND\s*·\s*/, '');
    if (extra && !/^think before revealing$/i.test(extra)) bits.push(extra);
    const el = h('p', { class: 'eyebrow' });
    bits.forEach((b, i) => {
      if (i) el.append(h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'));
      el.append(b);
    });
    if (world) {
      el.append(h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'), h('span', { class: 'world-tag', 'data-world': world }, world));
    }
    return el;
  }

  // A recurring question (WHO IS “WE”?, WHO DECIDES?, …) shown quietly above a card.
  function lensTag(enc) {
    return enc.lens ? h('p', { class: 'lens-tag' }, enc.lens) : null;
  }

  // A small visual stage: short lines, with ↓ / vs. / + / → as quiet connectors.
  function stageBlock(lines) {
    if (!lines || !lines.length) return null;
    const el = h('div', { class: 'stage' });
    for (const line of lines) {
      if (/^(↓|vs\.|\+|→ \?)$/.test(line)) el.append(h('span', { class: 'stage-join', 'aria-hidden': line === '↓' ? 'true' : null }, line));
      else if (/^[^a-z]*[A-Z][^a-z]*$/.test(line)) el.append(h('span', { class: 'stage-line' }, line));
      else el.append(h('span', { class: 'stage-note' }, line));
    }
    return el;
  }

  // WORDS: an exact quotation, typographically distinct from our own prose.
  // Wording is rendered untouched; the curly marks are typography only.
  function quoteBlock(w, opts) {
    opts = opts || {};
    return h(
      'figure',
      { class: 'words' + (opts.large ? ' words--large' : '') },
      h('blockquote', { class: 'words-text' }, '“' + w.text + '”'),
      opts.hideSpeaker ? null : h('figcaption', { class: 'words-by' }, '— ' + (w.speaker || 'Unattributed'), opts.cite && w.source ? h('span', { class: 'words-src' }, ' · ' + w.source + (w.sourceSection ? ', ' + w.sourceSection : '')) : null)
    );
  }

  // Quiet line shown the first time a quotation is found.
  function wordsFoundLine(res, wid) {
    if (!res || !res.wordsFound || !res.wordsFound.includes(wid)) return null;
    return h('p', { class: 'words-found', role: 'status' }, h('span', {}, 'Words found'), h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'), '+5');
  }

  function promptBlock(enc) {
    return h(
      'div',
      { class: 'prompt' },
      enc.subject ? h('p', { class: 'subject' }, enc.subject) : null,
      enc.lead ? h('p', { class: 'prompt-lead' }, enc.lead) : null,
      h('h1', { class: 'display display--md', tabindex: '-1' }, enc.prompt.split(/\n\n+/).join(' '))
    );
  }

  function hint(text) {
    return text ? h('p', { class: 'hint' }, text) : null;
  }

  function continueBtn(ctx, label) {
    const b = h('button', { class: 'btn btn--primary', onclick: () => ctx.next() }, label || 'Continue');
    return h('div', { class: 'actions' }, b);
  }

  function revealBlock(label, text) {
    return h('div', { class: 'reveal', role: 'status' }, label ? h('span', { class: 'label' }, label) : null, paras(text));
  }

  function focusFirst(el, selector) {
    requestAnimationFrame(() => {
      const t = el.querySelector(selector);
      if (t) t.focus({ preventScroll: true });
    });
  }

  // ---- DISCOVER ---------------------------------------------------------------
  function discover(item, ctx) {
    const enc = item.enc;
    const root = h('section', { class: 'card' });
    const lens = ctx.lensFor(enc);
    const statement = h('h1', { class: 'display', tabindex: '-1' }, enc.statement);
    const actions = h('div', { class: 'actions' });
    const revealBtn = h('button', { class: 'btn btn--primary', onclick: doReveal }, 'Reveal');
    actions.append(revealBtn);
    // Title, statement and question sit together on one world-tinted surface.
    put(root, lensTag(enc), eyebrow(enc, ctx.worldOf(enc)),
      h('div', { class: 'concept' }, h('p', { class: 'title-caps' }, enc.title), statement, enc.ask ? h('p', { class: 'ask' }, enc.ask) : null),
      hint(ctx.hint('DISCOVER')), actions);

    let revealed = false;
    function doReveal() {
      if (revealed) return;
      revealed = true;
      const res = ctx.answer({});
      const r = revealBlock(null, enc.reveal);
      const w = item.quoteId && ctx.word(item.quoteId);
      if (w) r.append(h('div', { class: 'words-wrap' }, wordsFoundLine(res, w.id) || h('p', { class: 'words-found' }, 'Words'), quoteBlock(w)));
      if (lens) {
        const lensWrap = h('div', { class: 'lens' });
        const lensBtn = h(
          'button',
          {
            class: 'textlink',
            'aria-expanded': 'false',
            onclick: () => {
              lensBtn.remove();
              lensWrap.append(h('span', { class: 'label' }, 'Lens'), h('p', {}, lens));
            },
          },
          'Lens +'
        );
        lensWrap.append(lensBtn);
        r.append(lensWrap);
      }
      actions.before(r);
      actions.replaceChildren(h('button', { class: 'btn btn--primary', onclick: () => ctx.next() }, 'Continue'));
      focusFirst(actions, 'button');
    }
    root._onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (document.activeElement && document.activeElement.tagName === 'BUTTON') return false;
        revealed ? ctx.next() : doReveal();
        return true;
      }
      return false;
    };
    focusFirst(root, 'h1');
    return root;
  }

  // ---- multiple choice (WHAT / WHO / WHY THEN / CONNECT / SAME QUESTION / THEN → NOW)
  function choice(item, ctx) {
    const enc = item.enc;
    const root = h('section', { class: 'card' });
    const list = h('ol', { class: 'choices', role: 'list' });
    const buttons = item.order.map((text, i) => {
      const b = h(
        'button',
        { class: 'choice', onclick: () => pick(text, b) },
        h('span', { class: 'key', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', {}, text),
        h('span', { class: 'tag' })
      );
      list.append(h('li', {}, b));
      return b;
    });
    const hintKey = enc.mode === 'SAME QUESTION' ? 'SAME QUESTION' : enc.mode === 'THEN → NOW' ? 'THEN → NOW' : 'CHOICE';
    const w = enc.quoteId && ctx.word(enc.quoteId);
    if (w) {
      // The quotation leads; the question sits beneath it, smaller.
      put(root, lensTag(enc), eyebrow(enc), quoteBlock(w, { large: true, hideSpeaker: enc.hideSpeaker }),
        h('h1', { class: 'prompt-under', tabindex: '-1' }, enc.prompt), list);
    } else if (enc.form === 'pick') {
      // Short scenario → pick: a small stage, one short question, three short options.
      list.classList.add('choices--short');
      put(root, lensTag(enc), eyebrow(enc), stageBlock(enc.stage), h('h1', { class: 'question', tabindex: '-1' }, enc.prompt), list);
    } else {
      put(root, lensTag(enc), eyebrow(enc), promptBlock(enc), hint(ctx.hint(hintKey)), list);
    }

    let done = false;
    function pick(text, btn) {
      if (done) return;
      done = true;
      const res = ctx.answer({ choice: text });
      list.classList.add('is-answered');
      buttons.forEach((b, i) => {
        b.disabled = true;
        const isCorrect = item.order[i] === enc.correct;
        if (isCorrect) {
          b.classList.add('is-correct');
          b.querySelector('.tag').textContent = '✓ ' + (enc.answerLabel === 'BEST FIT' ? 'Best fit' : 'Answer');
        }
        if (b === btn && !isCorrect) {
          b.classList.add('is-chosen');
          b.querySelector('.tag').textContent = 'Your choice';
        }
      });
      const label = res.correct ? (enc.answerLabel === 'BEST FIT' ? 'Best fit' : 'Yes') : null;
      const rb = revealBlock(label, enc.reveal);
      if (w) {
        if (enc.hideSpeaker) rb.append(h('p', { class: 'words-by', style: 'margin-top:.75rem' }, '— ' + w.speaker));
        const f = wordsFoundLine(res, w.id);
        if (f) rb.prepend(f);
      }
      put(root, rb, continueBtn(ctx));
      focusFirst(root, '.actions button');
    }
    root._onKey = (e) => {
      const n = parseInt(e.key, 10);
      if (!done && n >= 1 && n <= buttons.length) {
        buttons[n - 1].click();
        return true;
      }
      if (done && e.key === 'Enter' && document.activeElement.tagName !== 'BUTTON') {
        ctx.next();
        return true;
      }
      return false;
    };
    focusFirst(root, 'h1');
    return root;
  }

  // ---- RECALL / SHARE (think, reveal, self-rate) ------------------------------
  function selfRated(item, ctx) {
    const enc = item.enc;
    const isShare = enc.kind === 'share';
    const root = h('section', { class: 'card' });
    let actions = h('div', { class: 'actions' });
    const revealBtn = h('button', { class: 'btn btn--primary', onclick: doReveal }, isShare ? 'Reveal model' : 'Reveal');
    // YOUR WORDS: optional. Writing never changes the score; the self-rating does.
    const writeBtn = ctx.canWrite && ctx.canWrite(enc, item) ? h('button', { class: 'btn btn--quiet', onclick: openWriting }, 'Write yours') : null;
    put(actions, revealBtn, writeBtn);
    put(root, 
      lensTag(enc),
      eyebrow(enc),
      promptBlock(enc),
      isShare ? h('div', { class: 'timer', 'aria-hidden': 'true' }, h('span')) : null,
      hint(ctx.hint(isShare ? 'SHARE' : 'RECALL')),
      actions
    );

    let yours = null; // the note saved on this card, if any
    function openWriting() {
      if (stage !== 'think') return;
      const area = h('textarea', {
        class: 'yw-input',
        rows: '4',
        'aria-label': 'Your words',
        placeholder: 'In your own words…',
      });
      const pad = h(
        'div',
        { class: 'yw-pad' },
        h('p', { class: 'yw-label' }, 'Your words'),
        h('p', { class: 'yw-ask' }, ctx.writePrompt(enc)),
        area,
        h(
          'div',
          { class: 'actions', style: 'padding-top:1.25rem' },
          h('button', {
            class: 'btn btn--primary',
            onclick: () => {
              yours = ctx.saveNote(enc, area.value);
              doReveal();
            },
          }, 'Save & reveal'),
          h('button', { class: 'btn btn--quiet', onclick: doReveal }, 'Skip')
        )
      );
      actions.replaceWith(pad);
      actions = pad; // doReveal replaces whatever holds the actions
      requestAnimationFrame(() => area.focus());
    }

    const options = isShare
      ? [['clear', 'Clear'], ['almost', 'Almost'], ['needs', 'Needs work']]
      : [['knew', 'Knew it'], ['almost', 'Almost'], ['missed', 'Missed it']];
    let stage = 'think';
    function doReveal() {
      if (stage !== 'think') return;
      stage = 'rate';
      const timer = root.querySelector('.timer');
      if (timer) timer.remove();
      const r = revealBlock(isShare ? 'Model' : 'Answer', enc.reveal);
      // Your note sits beside the model so you can compare for yourself. No grading.
      if (yours) r.prepend(h('div', { class: 'yw-compare' }, h('span', { class: 'label' }, 'Your words · saved'), h('p', { class: 'yw-text' }, yours.text)));
      const qw = enc.quoteId && ctx.word(enc.quoteId);
      if (qw) r.append(h('div', { class: 'words-wrap' }, h('p', { class: 'words-found' }, 'In their words'), quoteBlock(qw)));
      const ratings = h(
        'div',
        { class: 'ratings', role: 'group', 'aria-label': 'How did you do?' },
        options.map(([key, label], i) =>
          h('button', { class: 'btn', 'data-rating': key, onclick: (ev) => rate(key, ev.currentTarget) }, label)
        )
      );
      actions.replaceWith(h('div', {}, r, h('p', { class: 'hint' }, isShare ? 'How clear was your explanation?' : 'How close were you?'), ratings));
      focusFirst(root, '.ratings button');
    }
    function rate(key, btn) {
      if (stage !== 'rate') return;
      stage = 'done';
      btn.classList.add('is-picked');
      root.querySelectorAll('.ratings button').forEach((b) => (b.disabled = b !== btn));
      ctx.answer({ rating: key });
      setTimeout(() => ctx.next(), 650);
    }
    root._onKey = (e) => {
      if (stage === 'think' && (e.key === 'Enter' || e.key === ' ') && !['BUTTON', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        doReveal();
        return true;
      }
      const n = parseInt(e.key, 10);
      if (stage === 'rate' && n >= 1 && n <= 3) {
        root.querySelectorAll('.ratings button')[n - 1].click();
        return true;
      }
      return false;
    };
    focusFirst(root, 'h1');
    return root;
  }


  // ---- CHECK YOUR UNDERSTANDING (explain-type RECALL / SHARE with a pilot check) ----
  // Think → Type it (saved, dated) or Say it in your head → then one beat per
  // screen: your answer (+ "Last time you said") → the full explanation → tap
  // the must-haves you covered (that tap IS the verdict) → a common mix-up if
  // anything was left out. Typed text is never scored; nothing is shortened.

  // Split off the first sentence (ignores initials such as "W.E.B.").
  function firstSentence(text) {
    const re = /([.!?][”"’)]?)\s+(?=[“"‘(]?[A-Z])/g;
    let m;
    while ((m = re.exec(text))) {
      const before = text.slice(0, m.index);
      const word = (/(\S+)$/.exec(before) || [''])[0];
      if (/^[A-Z](\.[A-Z])*$/.test(word.replace(/[“"‘(]/g, '')) || /^(Mr|Mrs|Ms|Dr|Jr|Sr|St|U\.S)$/.test(word)) continue;
      const cut = m.index + m[1].length;
      return [text.slice(0, cut), text.slice(cut).trim()];
    }
    return [text, ''];
  }
  function explanationBlock(text) {
    return String(text)
      .split(/\n\n+/)
      .map((para, i) => {
        if (i > 0) return h('p', {}, para);
        const [first, rest] = firstSentence(para);
        return h('p', {}, h('strong', { class: 'first-sentence' }, first), rest ? ' ' + rest : null);
      });
  }

  function checkCard(item, ctx) {
    const enc = item.enc;
    const check = ctx.checkFor(item);
    const isShare = enc.kind === 'share';
    const nodeId = check.nodeId;
    const root = h('section', { class: 'card card--check' });
    let stage = 'think';
    let saved = null; // this attempt's typed answer, if any

    const header = () => h('div', { class: 'check-head' }, eyebrow(enc), enc.subject ? h('p', { class: 'subject' }, enc.subject) : null);
    // One beat = one clean world-tinted panel and its action.
    function beat(name, label, body, actions) {
      stage = name;
      root.replaceChildren(
        header(),
        h('div', { class: 'beat beat--' + name, 'data-beat': name, role: 'group', 'aria-label': label },
          h('p', { class: 'beat-label', tabindex: '-1' }, label), body),
        h('div', { class: 'actions actions--beat' }, actions)
      );
      focusFirst(root, '.beat-label');
    }
    const btn = (label, onclick, cls) => h('button', { class: 'btn ' + (cls || 'btn--primary'), onclick }, label);

    // 0) Think: the card's own question, then type it or say it in your head.
    const actions = h('div', { class: 'actions actions--choice' },
      btn('Type it', openTyping),
      btn('Say it in your head', () => afterInput(null), 'btn'));
    put(root, lensTag(enc), eyebrow(enc), promptBlock(enc),
      h('p', { class: 'check-ask' }, check.ask),
      isShare ? h('div', { class: 'timer', 'aria-hidden': 'true' }, h('span')) : null,
      hint(ctx.hint('CHECK')), actions);

    function openTyping() {
      if (stage !== 'think') return;
      stage = 'typing';
      const area = h('textarea', { class: 'yw-input', rows: '4', 'aria-label': 'Your answer', placeholder: 'In your own words…' });
      const pad = h('div', { class: 'yw-pad' },
        h('p', { class: 'yw-label' }, 'Your words'),
        h('p', { class: 'yw-ask' }, check.ask),
        area,
        h('div', { class: 'actions actions--choice', style: 'padding-top:1.25rem' },
          btn('Save', () => afterInput(area.value)),
          btn('Say it in your head instead', () => afterInput(null), 'btn btn--quiet')));
      actions.replaceWith(pad);
      requestAnimationFrame(() => area.focus());
    }

    // a) Your answer — and only now, what you said last time.
    function afterInput(text) {
      if (stage !== 'think' && stage !== 'typing') return;
      const timer = root.querySelector('.timer');
      if (timer) timer.remove();
      saved = text && text.trim() ? ctx.saveAnswer(enc, text, { promptType: 'explain', prompt: check.ask }) : null;
      if (!saved) return showExplanation();
      const prev = ctx.previousAnswer(nodeId, saved);
      beat('yours', 'Your answer',
        [h('p', { class: 'yw-text beat-yours' }, saved.text),
          prev ? h('div', { class: 'beat-last' }, h('p', { class: 'beat-last-label' }, 'Last time you said · ' + ctx.fmtDate(BF.notes.dateOf(prev))), h('p', { class: 'yw-text' }, prev.text)) : null],
        btn('Continue', showExplanation));
    }

    // b) The full explanation, unchanged. First sentence bold.
    function showExplanation() {
      const qw = enc.quoteId && ctx.word(enc.quoteId);
      beat('explain', 'The explanation',
        [h('div', { class: 'explanation' }, explanationBlock(enc.reveal)),
          qw ? h('div', { class: 'words-wrap' }, h('p', { class: 'words-found' }, 'In their words'), quoteBlock(qw)) : null],
        btn('Continue', showChips));
    }

    // c) Tap what you covered. The taps are the verdict; there is no other step.
    function showChips() {
      const covered = new Set();
      const chips = check.mustHaves.map((m) =>
        h('button', {
          class: 'check-chip', 'aria-pressed': 'false', 'data-id': m.id,
          onclick: (ev) => {
            const b = ev.currentTarget;
            if (covered.has(m.id)) covered.delete(m.id); else covered.add(m.id);
            b.setAttribute('aria-pressed', covered.has(m.id) ? 'true' : 'false');
          },
        }, h('span', { class: 'check-mark', 'aria-hidden': 'true' }), m.text));
      beat('chips', 'Which of these did you cover?',
        [h('p', { class: 'beat-note' }, 'Tap each one you included.'), h('div', { class: 'check-chips' }, chips)],
        btn('Continue', () => settle([...covered])));
    }

    function settle(coveredIds) {
      if (stage !== 'chips') return;
      const verdict = BF.notes.verdictFor(check, coveredIds);
      ctx.recordCheck({ nodeId, encounterId: enc.id, responseId: saved && saved.response_id, covered: coveredIds, offered: check.mustHaves.map((m) => m.id), verdict });
      ctx.answer({ rating: BF.notes.ratingFor(enc.kind, verdict) }, { quiet: true });
      if (verdict === 'got') return ctx.next();
      const list = BF.notes.misreadingsFor(check, coveredIds);
      showMixup(list, 0);
    }

    // d) Partly / Missed: the most relevant common mix-up, then optionally another.
    function showMixup(list, i) {
      const m = list[i];
      const more = list[i + 1] ? btn('See another mix-up', () => showMixup(list, i + 1), 'btn btn--quiet') : null;
      beat('mixup', 'A common mix-up',
        [h('h2', { class: 'mixup-title' }, m.title), h('p', {}, m.text)],
        [btn('Continue', () => ctx.next()), more]);
      root.querySelector('.beat').setAttribute('data-mixup', m.id);
    }

    root._onKey = (e) => {
      if (stage === 'think' && (e.key === 'Enter' || e.key === ' ') && !['BUTTON', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        afterInput(null);
        return true;
      }
      return false;
    };
    focusFirst(root, 'h1');
    return root;
  }
  function recallOrCheck(item, ctx) {
    return ctx.checkFor && ctx.checkFor(item) ? checkCard(item, ctx) : selfRated(item, ctx);
  }

  // ---- drag helpers (mouse); tap/keyboard is always available ------------------
  function draggable(el, payload) {
    el.setAttribute('draggable', 'true');
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', payload);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('is-dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('is-dragging'));
  }
  function dropzone(el, onDrop) {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.classList.add('is-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('is-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('is-over');
      onDrop(e.dataTransfer.getData('text/plain'));
    });
  }

  // ---- TIMELINE -----------------------------------------------------------------
  function timeline(item, ctx) {
    const enc = item.enc;
    const n = enc.items.length;
    const root = h('section', { class: 'card' });
    let placed = []; // item indices in the player's order
    let done = false;
    const slotsEl = h('ol', { class: 'slots', 'aria-label': 'Your order' });
    const poolEl = h('ul', { class: 'pool', 'aria-label': 'Cards to place' });
    const poolLabel = h('p', { class: 'section-label' }, 'Cards');
    const actions = h('div', { class: 'actions' });
    const checkBtn = h('button', { class: 'btn btn--primary', disabled: true, onclick: check }, 'Check order');
    actions.append(checkBtn);
    put(root, 
      eyebrow(enc),
      promptBlock(enc),
      h('p', { class: 'hint' }, 'Tap the cards from earliest to latest. Tap a placed card to remove it.'),
      slotsEl,
      poolLabel,
      poolEl,
      actions
    );

    function place(idx, at) {
      placed = placed.filter((x) => x !== idx);
      if (at == null || at > placed.length) placed.push(idx);
      else placed.splice(at, 0, idx);
      draw();
    }
    function draw() {
      slotsEl.replaceChildren();
      for (let i = 0; i < n; i++) {
        const idx = placed[i];
        const filled = idx != null;
        const slot = h(
          'button',
          {
            class: 'slot' + (filled ? ' is-filled' : ''),
            'aria-disabled': filled ? null : 'true',
            'aria-label': filled ? 'Position ' + (i + 1) + ': ' + enc.items[idx] + '. Tap to remove.' : 'Position ' + (i + 1) + ', empty',
            onclick: () => {
              if (!filled || done) return;
              placed = placed.filter((x) => x !== idx);
              draw();
            },
          },
          h('span', { class: 'n' }, String(i + 1).padStart(2, '0')),
          h('span', {}, filled ? enc.items[idx] : ''),
          h('span')
        );
        if (filled) draggable(slot, String(idx));
        dropzone(slot, (payload) => place(+payload, i));
        slotsEl.append(h('li', {}, slot));
      }
      poolEl.replaceChildren();
      item.order
        .filter((idx) => !placed.includes(idx))
        .forEach((idx) => {
          const chip = h('button', { class: 'chip', onclick: () => place(idx) }, enc.items[idx]);
          draggable(chip, String(idx));
          poolEl.append(h('li', {}, chip));
        });
      poolLabel.hidden = placed.length === n;
      checkBtn.disabled = placed.length !== n;
    }
    function check() {
      if (done || placed.length !== n) return;
      done = true;
      const res = ctx.answer({ order: placed });
      poolEl.remove();
      poolLabel.remove();
      root.querySelector('.hint').remove();
      // Show the true order with dates, marking where the player matched it.
      slotsEl.replaceChildren();
      slotsEl.setAttribute('aria-label', 'Chronological order');
      for (let i = 0; i < n; i++) {
        const ok = placed[i] === i;
        slotsEl.append(
          h(
            'li',
            {},
            h(
              'div',
              { class: 'slot is-filled' + (ok ? ' is-right' : '') },
              h('span', { class: 'n' }, String(i + 1).padStart(2, '0')),
              h('span', {}, enc.items[i], enc.dates ? h('span', { class: 'date' }, '  ' + enc.dates[i]) : null),
              h('span', { class: 'mark' }, ok ? '✓' : 'Moved')
            )
          )
        );
      }
      const label = res.correct ? 'In order' : 'Chronological order';
      actions.before(revealBlock(label, enc.reveal));
      actions.replaceChildren(h('button', { class: 'btn btn--primary', onclick: () => ctx.next() }, 'Continue'));
      focusFirst(actions, 'button');
    }
    root._onKey = (e) => {
      const k = parseInt(e.key, 10);
      if (!done && k >= 1 && k <= 9) {
        const remaining = item.order.filter((idx) => !placed.includes(idx));
        if (remaining[k - 1] != null) place(remaining[k - 1]);
        return true;
      }
      return false;
    };
    draw();
    focusFirst(root, 'h1');
    return root;
  }

  // ---- MATCH / BOSS -------------------------------------------------------------
  function match(item, ctx) {
    const enc = item.enc;
    const letters = 'ABCDEFG';
    const root = h('section', { class: 'card' });
    const pairs = {}; // leftIdx -> rightIdx
    let selected = null;
    let done = false;
    const leftEl = h('ul', { 'aria-label': 'Items' });
    const rightEl = h('ul', { 'aria-label': 'Matches' });
    const actions = h('div', { class: 'actions' });
    const checkBtn = h('button', { class: 'btn btn--primary', disabled: true, onclick: check }, 'Check matches');
    actions.append(checkBtn);
    put(root, 
      eyebrow(enc),
      promptBlock(enc),
      hint('Tap an item on the left, then its match. Tap again to change.'),
      h('div', { class: 'match' }, leftEl, rightEl),
      actions
    );

    const rightOf = (r) => Object.keys(pairs).find((l) => pairs[l] === r);
    function pair(l, r) {
      const prev = rightOf(r);
      if (prev != null) delete pairs[prev];
      pairs[l] = r;
      selected = null;
      // Auto-select the next unpaired item to keep tapping fast.
      const next = enc.pairs.findIndex((_, i) => pairs[i] == null);
      if (next !== -1) selected = next;
      draw();
    }
    function draw() {
      leftEl.replaceChildren();
      enc.pairs.forEach((p, i) => {
        const r = pairs[i];
        const pos = r != null ? item.order.indexOf(r) + 1 : null;
        const chip = h(
          'button',
          {
            class: 'chip' + (selected === i ? ' is-selected' : ''),
            'aria-pressed': selected === i ? 'true' : 'false',
            onclick: () => {
              selected = i;
              draw();
            },
          },
          h('span', { class: 'pairtag' }, letters[i] + '  '),
          p.left,
          pos ? h('span', { class: 'pairtag' }, ' → ' + pos) : null
        );
        draggable(chip, String(i));
        leftEl.append(h('li', {}, chip));
      });
      rightEl.replaceChildren();
      item.order.forEach((r, pos) => {
        const l = rightOf(r);
        const t = h(
          'button',
          {
            class: 'target' + (l != null ? ' is-paired' : ''),
            'aria-label': (pos + 1) + '. ' + enc.pairs[r].right + (l != null ? ' — matched with ' + enc.pairs[l].left : ''),
            onclick: () => {
              if (selected != null) pair(selected, r);
              else if (l != null) {
                delete pairs[l];
                selected = +l;
                draw();
              }
            },
          },
          h('span', {}, h('span', { class: 'pairtag' }, pos + 1 + '  '), enc.pairs[r].right),
          h('span', { class: 'pairtag' }, l != null ? letters[l] : '')
        );
        dropzone(t, (payload) => pair(+payload, r));
        rightEl.append(h('li', {}, t));
      });
      checkBtn.disabled = Object.keys(pairs).length !== enc.pairs.length;
    }
    function check() {
      if (done) return;
      done = true;
      const res = ctx.answer({ pairs });
      const list = h('ul', { class: 'results' });
      enc.pairs.forEach((p, i) => {
        const ok = pairs[i] === i;
        list.append(
          h(
            'li',
            {},
            h('span', { class: 'glyph' + (ok ? '' : ' off'), 'aria-label': ok ? 'Matched' : 'Not matched' }, ok ? '✓' : '○'),
            h(
              'div',
              {},
              h('span', { class: 'who' }, p.left),
              h('span', { class: 'what' }, ' — ' + p.right),
              ok ? null : h('span', { class: 'was' }, 'You matched: ' + enc.pairs[pairs[i]].right)
            )
          )
        );
      });
      root.querySelector('.match').replaceWith(list);
      root.querySelector('.hint').remove();
      actions.before(revealBlock(res.correct ? 'All matched' : null, enc.reveal));
      actions.replaceChildren(h('button', { class: 'btn btn--primary', onclick: () => ctx.next() }, 'Continue'));
      focusFirst(actions, 'button');
    }
    selected = 0;
    draw();
    focusFirst(root, 'h1');
    return root;
  }

  // ---- BINARY: SAME THING? / THIS · THAT / PICK ONE OF TWO ---------------------------
  function binary(item, ctx) {
    const enc = item.enc;
    const root = h('section', { class: 'card card--binary' });
    const w = enc.quoteId && ctx.word(enc.quoteId);
    const row = h('div', { class: 'binary', role: 'group', 'aria-label': enc.prompt });
    const buttons = item.order.map((text, i) => {
      const b = h('button', { class: 'bin-opt', onclick: () => pick(text, b) }, h('span', { class: 'bin-text' }, text), h('span', { class: 'tag' }));
      row.append(b);
      return b;
    });
    put(
      root,
      lensTag(enc),
      eyebrow(enc),
      w ? quoteBlock(w, { large: true, hideSpeaker: enc.hideSpeaker }) : stageBlock(enc.stage),
      h('h1', { class: 'question', tabindex: '-1' }, enc.prompt),
      row
    );
    let done = false;
    function pick(text, btn) {
      if (done) return;
      done = true;
      const res = ctx.answer({ choice: text });
      row.classList.add('is-answered');
      buttons.forEach((b, i) => {
        b.disabled = true;
        const isCorrect = item.order[i] === enc.correct;
        if (isCorrect) {
          b.classList.add('is-correct');
          b.querySelector('.tag').textContent = '✓';
        }
        if (b === btn && !isCorrect) {
          b.classList.add('is-chosen');
          b.querySelector('.tag').textContent = 'Your choice';
        }
      });
      const rb = h('div', { class: 'reveal', role: 'status' });
      if (enc.verdict) rb.append(h('p', { class: 'verdict' }, enc.verdict));
      else if (res.correct && enc.answerLabel === 'BEST FIT') rb.append(h('span', { class: 'label' }, 'Best fit'));
      rb.append(...paras(enc.reveal));
      if (w) {
        if (enc.hideSpeaker) rb.append(h('p', { class: 'words-by', style: 'margin-top:.75rem' }, '— ' + w.speaker));
        const f = wordsFoundLine(res, w.id);
        if (f) rb.prepend(f);
      }
      put(root, rb, continueBtn(ctx));
      focusFirst(root, '.actions button');
    }
    root._onKey = (e) => {
      const n = parseInt(e.key, 10);
      if (!done && (n === 1 || n === 2)) {
        buttons[n - 1].click();
        return true;
      }
      if (done && e.key === 'Enter' && document.activeElement.tagName !== 'BUTTON') {
        ctx.next();
        return true;
      }
      return false;
    };
    focusFirst(root, 'h1');
    return root;
  }

  // ---- SORT: place short items into two or three bins ----------------------------------
  function sort(item, ctx) {
    const enc = item.enc;
    const root = h('section', { class: 'card' });
    const placed = {}; // itemIndex -> bin
    let done = false;
    const list = h('ul', { class: 'sort' });
    const checkBtn = h('button', { class: 'btn btn--primary', disabled: true, onclick: check }, 'Check');
    const actions = h('div', { class: 'actions' }, checkBtn);
    put(root, lensTag(enc), eyebrow(enc), h('h1', { class: 'question', tabindex: '-1' }, enc.prompt), list, actions);

    function draw() {
      list.replaceChildren();
      for (const i of item.order) {
        const it = enc.items[i];
        const group = h('div', { class: 'sort-bins', role: 'group', 'aria-label': it.text });
        for (const bin of enc.bins) {
          const on = placed[i] === bin;
          const cls = 'sort-bin' + (on ? ' is-on' : '') + (done && bin === it.bin ? ' is-correct' : '') + (done && on && bin !== it.bin ? ' is-chosen' : '');
          group.append(
            h('button', {
              class: cls,
              'aria-pressed': on ? 'true' : 'false',
              disabled: done ? true : null,
              onclick: () => {
                placed[i] = bin;
                draw();
              },
            }, done && bin === it.bin ? '✓ ' + bin : bin)
          );
        }
        list.append(h('li', { class: 'sort-item' + (done ? (placed[i] === it.bin ? ' is-right' : ' is-moved') : '') }, h('span', { class: 'sort-text' }, it.text), group));
      }
      checkBtn.disabled = Object.keys(placed).length !== enc.items.length;
    }
    function check() {
      if (done || Object.keys(placed).length !== enc.items.length) return;
      done = true;
      const res = ctx.answer({ bins: placed });
      draw();
      actions.before(h('div', { class: 'reveal', role: 'status' }, res.correct ? h('span', { class: 'label' }, 'All placed') : null, paras(enc.reveal)));
      actions.replaceChildren(h('button', { class: 'btn btn--primary', onclick: () => ctx.next() }, 'Continue'));
      focusFirst(actions, 'button');
    }
    draw();
    focusFirst(root, 'h1');
    return root;
  }

  // ---- WORDS card (no question) -----------------------------------------------------
  function quoteCard(item, ctx) {
    const enc = item.enc;
    const w = ctx.word(enc.quoteId);
    const root = h('section', { class: 'card' });
    const res = ctx.answer({}); // the quotation has appeared: it is found now
    put(
      root,
      eyebrow(enc, ctx.worldOf(enc)),
      wordsFoundLine(res, w.id),
      quoteBlock(w, { large: true }),
      h('p', { class: 'words-link' }, 'Connected to ', h('strong', {}, enc.subject)),
      continueBtn(ctx)
    );
    root._onKey = (e) => {
      if (e.key === 'Enter' && document.activeElement.tagName !== 'BUTTON') {
        ctx.next();
        return true;
      }
      return false;
    };
    focusFirst(root, '.actions button');
    return root;
  }

  const RENDERERS = { discover, choice, binary, sort, recall: recallOrCheck, share: recallOrCheck, timeline, match, quote: quoteCard };

  function render(item, ctx) {
    const fn = RENDERERS[item.enc.kind];
    if (!fn) throw new Error('No renderer for ' + item.enc.kind);
    return fn(item, ctx);
  }

  BF.ui = { h, paras, render, MODE_LABEL, quoteBlock, firstSentence };
})((globalThis.BF = globalThis.BF || {}));
