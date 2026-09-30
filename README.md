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
content/                          V1.5 source of truth (edit these; run `npm run data`)
  black_folk_v1_5_master_curriculum.json   50 nodes, 7 worlds, 9 threads, 8 debates, context, deepening cards
  black_folk_v1_5_encounter_pack.json      50 DISCOVER + 80 encounters, 3 starter + 5 bridge sessions
  black_folk_v1_5_knowledge_map.json       graph edges, memberships, and the verified WORDS quote bank
  links.json                               wiring only: thread steps / debate sides → node ids
  v1_5_interactions.json                   HOW each encounter is played (binary, sort, pick, recall…)
docs/                             design briefs, V1.5 build brief and encounter-pack QA
app/                              the web app (static)
  index.html, styles.css, sw.js, fonts/
  data/content.js                 GENERATED from /content by `npm run data`
  js/content.js                   normalizes raw JSON into engine structures
  js/notes.js                     YOUR WORDS (private notes)
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

## V1.5: how encounters are played

The encounter pack says **what** is learned; `content/v1_5_interactions.json` says **how**.
Most four-option questions are re-expressed as lighter forms, built from each encounter's
own correct answer, distractors and reveal. The pack's reveal always follows the action.

| Form | What the player does | Count (of 130) |
|---|---|---|
| DISCOVER | read one line, tap to reveal | 50 |
| Binary | SAME THING? / THIS · THAT: two short answers | 33 |
| Short pick | a small scenario or stage, three short options | 18 |
| Think-first recall | answer in your head, reveal, self-rate | 12 |
| Sort | place short items into 2–3 bins (LEAVE · REFORM · BUILD…) | 5 |
| Share / Match / Timeline | explain aloud, match pairs, order | 3 / 3 / 1 |
| Conventional four-option | kept on purpose (onboarding + nuanced debates) | 5 |

- **Recurring questions:** WHO IS “WE”?, WHO DECIDES? and similar appear as a quiet tag on
  a few cards. They are not threads, nodes or navigation.
- **Sessions:** after the three onboarding sessions, the five V1.5 bridge sessions
  (S04–S08) alternate with adaptive review. Adaptive sessions leave each bridge's new ideas
  for that bridge.

## Knowledge Map

EXPLORE opens on a map of the seven worlds. Each idea sits in its world's territory,
ordered by era.

- **Node states:** an idea is LOCKED (a faint unlabeled point) until it is met in PLAY.
  After that it moves through DISCOVERED, CONNECTED, FAMILIAR and STRONG. The state
  shows through the dot's fill, size and halo, never as a percentage.
- **The graph:** 121 idea-to-idea links:
  - the V1.5 knowledge map's 61 connections,
  - encounters that link several ideas,
  - neighbouring steps of each thread,
  - the two sides of each debate.
- **When links appear:**
  - when an encounter shows the relationship;
  - map links with no encounter reveal once both ideas are discovered;
  - when a thread or debate unlocks (only between ideas already met);
  - on their own, once both ideas are FAMILIAR or better.

  Links revealed since your last visit draw themselves in once. The overview draws only
  links met in PLAY. Cross-world links stay faint until you hover or focus an idea, and
  thread chains live in each thread's view.
- **Threads (9):** a thread unlocks after 2 of its ideas are introduced and one encounter
  linking two of them is played, or once 3 of its ideas are introduced. Deepening cards
  (Diaspora, Coalition, Operational Unity, Fugitive Pedagogy) appear in the thread and
  world views. They are not core nodes.
- **Debates (8):** a debate opens once each side's idea has been introduced. FIX IT OR
  END IT? also needs Criminalization.
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

## YOUR WORDS

YOUR WORDS is an optional, private notebook for explaining ideas in your own words.

- **In PLAY:** RECALL and SHARE cards offer **Write yours**. Save & reveal puts your note
  beside the model answer so you can compare for yourself. Skip reveals the model as
  usual.
- **Scoring:** there is no grading and no AI. Knowledge still comes only from your
  self-rating; a note earns 0.
- **In EXPLORE:** every idea page has a quiet YOUR WORDS section.
  - Notes are dated, newest first, and older ones are folded away.
  - You can edit a note, delete it (with confirmation), or add a new one.
  - With no notes, it reads "No notes yet."
- **Stored fields:** each note is kept in `player.yourWords` with `response_id`,
  `node_id`/`node_ids`, `encounter_id`, `text`, `created_at`, `updated_at`, `prompt` and
  `model_answer_snapshot`.
- **Privacy:** notes live only on this device. Nothing is sent anywhere.

## Saved progress and migration

Progress is stored in IndexedDB (`black-folk` → `state` → `player`). The current schema is
**v4**.

- Schema v2 adds `map.nodes`, `map.edges` and `words`.
- Schema v3 adds `yourWords`.
- Schema v4 (V1.5) remaps found WORDS ids from `W-01…` to the knowledge map's `W001…`
  (the wording is identical) and adds `bridgesCompleted`. `yourWords` and every other field
  are carried over untouched. A saved in-progress session is remapped too.

Older saves are upgraded in place when the app loads:
- every existing field is kept;
- the map is backfilled from your past encounters;
- the untouched original is kept as `player-backup-v<old version>`.

Knowledge already earned under the old rules is not recalculated.

## Data notes (V1.5)

1. **Source consolidation.** The V1.5 curriculum, encounter pack and knowledge map replace
   the earlier V1 files (still in git history). The WORDS quote bank now comes from the
   knowledge map, with verified source metadata; the old brief-based fallback was removed.
2. **Onboarding is unchanged.** S01–S03 play their curated flows. S02 keeps its pacing
   repair: E007 and E027 swap so three list-choice screens never run together.
3. **Bridges are not tutorials.** S04–S08 each run once after onboarding, alternating
   with adaptive review.
4. **Threads with deepening cards.** T-08's Diaspora and Amefricanidade steps are cards,
   not nodes. Map members missing from a thread's path (Abolition and Black Nationalism
   on T-01, Predatory Inclusion on T-07) are added as extra steps.
5. **D-08 has no reform node.** Its "Fix it" side shows a neutral one-line summary
   restating the E060 reveal. It opens when Abolition and Criminalization are introduced.
6. **Deepening cards without player-facing text** (Amefricanidade, Colonialism) stay in
   the data layer. Holds (Black Ecologies, New Jim Code) and cuts (Post-Race, Linked
   Fate) are kept as data and never shown.
7. **Hidden lenses** (*What Now?*, *The End of Running*) are data only. They shape which
   questions recur, with no visible section.

### Earlier notes (V1)

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
