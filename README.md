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
npm run test:offline   # offline + file:// checks (needs `npm run build && npm run preview`)
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
  links.json                               wiring only: debate/thread → node ids
docs/                             design decisions + first-three-sessions reference
app/                              the web app (static)
  index.html, styles.css, sw.js, fonts/
  data/content.js                 GENERATED from /content by `npm run data`
  js/content.js                   normalizes raw JSON into engine structures
  js/mastery.js                   player model, Knowledge/levels, mastery, review scheduling, unlocks
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
- **Knowledge** is the only currency. Correct answers earn the encounter's point value. A
  miss earns +5 for participation, and Knowledge is never subtracted. Self-rated cards
  (RECALL, SHARE) earn full points whatever the rating, so honest ratings are never
  penalized. Level L starts at `100·(L−1) + 10·(L−1)²` Knowledge (tunable in
  `mastery.js → CONFIG`).
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

## Data notes (conflicts and gaps, and how they were resolved)

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
