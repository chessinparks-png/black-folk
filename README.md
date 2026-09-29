# BLACK FOLK

A minimalist, offline-first learning game for Black intellectual history.
No accounts, no network, no backend. Progress lives on your device.

## Run it

**Easiest (no install):** open `app/index.html` in Chrome, Edge or Safari. Everything
(content, fonts, scripts) is local, so this works offline.

**With Node 18+ (recommended; also enables the offline service worker):**

```bash
npm run dev        # rebuilds content, serves http://localhost:5173
```

There are no dependencies, so `npm install` is optional (it installs nothing).

**Static production build:**

```bash
npm run build      # → dist/  (plain static files; host anywhere)
npm run preview    # serves dist/ at http://localhost:4173
```

After the first visit over http, the service worker caches the app and it keeps working
with no connection.

## Tests

```bash
npm test               # engine: starters, pacing, unlocks, scheduling, levels (no browser)
npm run test:e2e       # full playthrough in headless Chromium (needs `npm run dev` running)
npm run test:offline   # offline, PWA install, file:// (needs `npm run build && npm run preview`)
node scripts/make-icons.mjs   # regenerate PWA icons (Playwright)
```

The e2e tests use Playwright if it's installed (`npm i -D playwright`). Screenshots are
written to `tests/screens/`.

## Resetting progress

**Settings → Reset progress**, then confirm. This clears IndexedDB and local storage for
the app, which is useful for replaying onboarding.

## Project layout

```
content/                          authoritative content (edit these)
  black_folk_v1_1_tuned_playtest.json      encounters, discovery cards, starter sessions, points
  black_thought_v1_revised_curriculum.json nodes, worlds, debates, threads
  links.json                               wiring only: debate/thread/context → node ids
  words_from_brief.json                    WORDS fallback: 23 quotes transcribed verbatim from the brief
  (black_folk_words_quote_bank_v1.json)    authoritative WORDS bank — used automatically when present
  (black_folk_knowledge_map_v1.json)       authoritative map edges — merged automatically when present
docs/                             design decisions + first-three-sessions reference
app/                              the web app (static)
  index.html, styles.css, sw.js, fonts/
  data/content.js                 GENERATED from /content by `npm run data`
  js/content.js                   normalizes raw JSON into engine structures
  js/mastery.js                   player model (+ schema migration), Knowledge/levels, mastery, scheduling, unlocks
  js/graph.js                     Knowledge Map data: graph, reveal rules, node states, layout
  js/map.js                       Knowledge Map rendering (inline SVG, no library)
  js/explore.js                   EXPLORE: map, worlds, ideas, threads, debates, WORDS collection
  js/session.js                   starter + adaptive sessions, derived encounters, pacing, scoring
  js/store.js                     IndexedDB persistence (localStorage fallback)
  js/encounters.js                encounter renderer (one screen per encounter)
  js/app.js                       routing and screens: home, play, summary, explore, settings
scripts/                          build-data, build, zero-dependency static server
tests/                            engine, e2e, and offline tests
```

**Editing content:** change the JSON in `/content`, then run `npm run data` (`npm run dev`
and `npm run build` do this for you). The UI contains no curriculum text.

## How the game works

- **Sessions** have six encounters and take 5–8 minutes. New players get the three curated
  starter sessions (S01–S03) first. After that, PLAY builds adaptive sessions: 2 new ideas
  (DISCOVER), 2 reviews of ideas that are due (misses first), 1 connection or context
  encounter, and 1 higher-order encounter. They are ordered so that no more than two
  multiple-choice screens run together, and a new idea is always discovered before it is
  tested.
- **Knowledge** is the only currency, and it reflects successful learning. Nothing is
  ever subtracted. All values are tunable in `mastery.js → CONFIG`.

  | Encounter | Knowledge |
  |---|---|
  | Objective question, correct | the encounter's full value |
  | Objective question, wrong | 0 |
  | RECALL: KNEW IT / ALMOST / MISSED IT | 100% / 50% / 0 |
  | SHARE: CLEAR / ALMOST / NEEDS WORK | 100% / 50% / 0 |
  | New DISCOVER card | +5 |
  | WORDS quotation, first time only | +5 |
  | TIMELINE / MATCH | full value only when fully correct |

  ALMOST values are rounded to the nearest whole number. On TIMELINE and MATCH, mastery
  still credits each correct part. Level L starts at `100·(L−1) + 10·(L−1)²` Knowledge.
- **Mastery** is tracked invisibly per curriculum node across six dimensions (recognition,
  recall, context, connection, share, apply). Timing works like this:
  - A missed idea comes back within minutes.
  - ALMOST comes back sooner than KNEW IT.
  - Strong unaided recall pushes the next review further out.
  - Recognition alone never pushes an idea more than 3 days out.
  - EXPLORE shows only NEW, LEARNING, FAMILIAR or STRONG.
- **Threads** reveal themselves quietly, mid-session, once 3 of their steps have been
  encountered. **Debates** open once each side's idea has been introduced. Debate
  encounters (SAME QUESTION) never appear in adaptive play before then.

## Knowledge Map

EXPLORE opens on a map of the seven worlds. Each idea sits in its world's territory,
ordered by era.

- **Node states:** an idea is LOCKED (a faint unlabeled point) until it is met in PLAY.
  After that it moves through DISCOVERED, CONNECTED, FAMILIAR and STRONG. The state
  shows through the dot's fill, size and halo, never as a percentage.
- **The graph:** 62 relationships, drawn from:
  - encounters that link several ideas,
  - neighbouring steps of each thread,
  - the two sides of each debate.

  If `black_folk_knowledge_map_v1.json` is added, its edges are merged in.
- **When links appear:**
  - when an encounter shows the relationship;
  - when a thread or debate unlocks (only between ideas already met);
  - on their own, once both ideas are FAMILIAR or better.

  Links revealed since your last visit draw themselves in once.
- **Views:**
  - World: its own labeled map, a list of discovered ideas, undiscovered gaps, and links
    to other worlds. This is also how the map works on phones: the overview shows
    territories, and tapping a world opens its labeled close-up.
  - Idea: name, core idea, why then, WORDS, connected to, threads, debates, KEEP THIS.
    Lens, context and source are folded away.
  - Thread: "Different moments. Same question."
  - Debate: "Same question. Different answers.", with no winner.

## WORDS

WORDS are exact quotations only, never paraphrases. The wording is rendered untouched; the
curly quote marks are typography only.

- **Finding quotes:** a quote is found when it first appears in PLAY:
  - quietly under a DISCOVER card's reveal ("WORDS FOUND · +5"),
  - on a plain quote card,
  - in a WORDS question: "What is this really saying?", "Which thread?",
    recall-before-quote, and occasionally "Whose words are these?".
- **After that:** the quote stays on its idea page and in the WORDS collection, which can
  be filtered by thinker, world and thread. Quotes you haven't found are never shown.

## Saved progress and migration

Progress is stored in IndexedDB (`black-folk` → `state` → `player`). Schema v2 adds
`map.nodes`, `map.edges` and `words`.

A v1 save is upgraded in place when the app loads:
- every existing field is kept;
- the map is backfilled from your past encounters;
- the untouched original is kept as `player-backup-v1`.

Knowledge already earned under the old rules is not recalculated.

## Data notes (conflicts and gaps, and how they were resolved)

0. **The knowledge-map and quote-bank JSON files were not supplied.** WORDS uses the 23
   quotations from `docs/black_folk_knowledge_map_words_v1_brief.md`: wording, speaker
   and node links are copied verbatim, and source citations are left empty rather than
   guessed. The map is built from relationships already in the data (62, not 182). Drop
   either authoritative file into `/content` and run `npm run data`; field names are read
   tolerantly.

1. **Starter session 2 pacing.** The curated flow D005 → E005 → E014 → E007 → E027 → E018
   has three multiple-choice screens in a row, which breaks the tuned pacing rule. A
   generic pacing repair swaps E007 and E027. The content is unchanged; only the order
   changes.
2. **Curated comparisons before introductions.** S02 and S03 use E014 (Baker/King) and E034
   (Bethune/Randolph) before those thinkers have DISCOVER cards. The starter sessions are
   curated, so they are kept as written. The unlock rules apply only to adaptive play.
3. **Debates and threads had no node ids.** `content/links.json` maps them onto existing
   curriculum nodes so they can unlock. It adds no claims. Two thread steps have no
   playable node yet ("Boynton/context", "Voting Rights"). D-07's second side
   ("male-centered liberation politics") has no source-supported node yet, and EXPLORE
   says so.
4. **Packed fields.** E018's timeline and E040's match pairs are stored as arrow-joined
   strings. They are split at load time. E040 unlocks after 4 of its 5 nodes, per its
   design note.
5. **No WHY THEN field on nodes.** EXPLORE shows the era, plus the WHY THEN encounter's
   explanation where one exists (Reconstruction, Atlanta washerwomen, Anita Hill).
6. **15 nodes had no encounters.** Adaptive play derives DISCOVER, RECALL and SHARE cards
   for any node, using only the curriculum's own `share`, `core_idea` and `lens` text. It
   also derives short TIMELINE rounds from node `era` values (only for eras that don't
   overlap), and MATCH rounds that pair ideas with their `lens`. Derived encounters have
   ids starting `X-`. No new historical claims, quotations or thinkers are introduced.
7. **Context cards** have only a title and purpose, with no player-facing text. They are
   kept in the data layer but not shown yet.

Fonts: Instrument Serif and Inter, both SIL Open Font License (see `app/fonts/`).
