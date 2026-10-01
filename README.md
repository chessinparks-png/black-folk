# BLACK FOLK

A minimalist, offline-first learning game for Black intellectual history.
No accounts, no network, no backend. Progress lives on your device.

**Current content version: V1.6** (arts & design):
- 50 core nodes, in 7 worlds;
- 10 formal threads;
- 8 debates;
- 14 deepening cards.

**NOW hooks** are planned as a separate, refreshable contemporary layer (see
`docs/black_folk_now_hooks_strategy.md`). They are **not yet integrated**.

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
content/                          source of truth (edit these; run `npm run data`)
  black_folk_v1_6_master_curriculum_art_design.json  V1.6: 50 nodes, 7 worlds, 10 threads, 8 debates, 14 deepening cards
  black_folk_v1_6_knowledge_map_art_design.json      V1.6: graph edges, memberships, verified WORDS quote bank
  black_folk_v1_5_encounter_pack.json      50 DISCOVER + 80 encounters, 3 starter + 5 bridge sessions
  v1_6_art_design_encounters.json          8 DISCOVER + 8 interactions for the art/design cards
  links.json                               wiring only: thread steps / debate sides → node ids; T-09 notes
  v1_5_interactions.json                   HOW each encounter is played (binary, sort, pick, recall…)
  understanding_checks.json                YOUR WORDS prompt types + pilot checks
  archive/                                 V1.5 curriculum + map (reference only)
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
- **The graph:** 172 links (V1.6, including links to the 8 playable deepening cards):
  - the knowledge map’s idea and card connections,
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
- **Threads (10):** a thread unlocks after 2 of its ideas are introduced and one encounter
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

## V1.6: art & design

The CULTURE world is deepened without adding core nodes. The material draws on three
sources, each with its own job:
- **Richard J. Powell**, *Black Art and Culture in the 20th Century*: the visual-art
  spine.
- ***The Black Experience in Design***: design as services, spaces, care and systems.
- ***Black Futures***: archive, platforms and futurity.

**What's in this layer:**
- **T-10 WHO DESIGNS THE WORLD?** is the 10th formal thread. Its path runs:
  1. The spirituals → Freedom’s Journal → Harlem Renaissance → Hurston;
  2. Who Controls the Image? → Art as Evidence → The Artist as Organizer;
  3. Black Power / AfriCOBRA → Hip-hop;
  4. Systems Are Designed Too → Design as Care → Who Owns the Platform? → Who Gets to
     Imagine the Future?

  Black Lives Matter, Black Nationalism and Who Is Black Art For? join it as map members.
  Its view links to T-03, T-05, T-06, T-08, T-09, D-05, D-06 and D-08.
- **CARD-07–CARD-14** are playable deepening cards, not core nodes. Each has:
  - a DISCOVER card;
  - one interaction;
  - a page in EXPLORE;
  - map links to the ideas it deepens.

  A card surfaces in PLAY once two of its ideas have been met, at most one per session.
  It can also anchor LEARN FROM HERE.
- **Map:** cards are drawn as small diamonds on the CULTURE world map only after they are
  met (or in Show everything). The overview map stays core-only.
- **Debates:** there is no new debate. D-06 (Hurston ↔ protest-art tradition) is
  deepened by *Who Is Black Art For?*, and D-08 by *Systems Are Designed Too*.
- **Recurring question:** *WHO DESIGNED THIS — AND WHO COULD REDESIGN IT?* is a lens like
  WHO IS “WE”?. It is shown only on the systems and platform cards.
- **No new images.** The layer uses type, color and layout only.

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

YOUR WORDS is an optional, private record of the player's own explanations.

- **In PLAY:** RECALL and SHARE cards offer **Write yours**, which saves the answer and
  shows it beside the model answer. Knowledge still comes only from the self-rating; an
  answer earns 0.
- **On idea pages:**
  - Each idea page shows its YOUR WORDS prompt and **Write an answer +**.
  - Below it is **Your answers over time**: every dated answer for that idea, newest
    first, collapsed by default. Answers to reflective prompts are included.
- **Answers are permanent.** There is no edit or delete; only Reset progress clears
  them.
- **Stored fields:** each answer is kept in `player.yourWords`:
  - `response_id`, `node_id` / `node_ids`, `encounter_id`, `text`;
  - `created_at`, `answered_at`;
  - `prompt`, `prompt_type`, `model_answer_snapshot`.
- **Privacy:** answers live only on this device. Nothing is sent anywhere.

### Check your understanding (pilot)

`content/understanding_checks.json` marks every YOUR WORDS prompt as **explain** (one
model explanation) or **reflective** (open question; never checked). Unlisted prompts
are reflective. It also holds the pilot checks for Predatory Inclusion, Pan-Africanism
and Respectability. The reasoning, grounding and full lists are in
`docs/understanding_check_pilot.md`.

On a pilot card the player chooses **Type it** (saved, dated) or **Say it in your
head**. The reveal then unfolds one beat per screen:

1. **Your answer.** From the second attempt on, "Last time you said · date" appears,
   only after saving.
2. **The full explanation, unchanged,** with the first sentence in bold.
3. **Tap the must-haves you covered.** That tap is the verdict: all = Got it,
   some = Partly, none = Missed.
4. **Partly / Missed only:** a common mix-up, with "See another mix-up".

Verdicts map onto the card's existing self-rating, so review uses the existing scheduler:
- Got it = KNEW IT, with nothing extra and no animation;
- Partly = ALMOST;
- Missed = MISSED IT.

Typed text is never scored. Verdicts are stored in `player.checks`.

**Writing rhythm:** in every session,
- writing cards (RECALL / SHARE) are never back to back;
- each writing card has at least two tap cards right before it;
- no session ends on one.

Sessions are only reordered to meet these rules. Where a 6-card session has more writing
cards than the rules allow, the extras are played in full without the writing option.
Pilot check cards keep the writing slot first.

## Map visibility and LEARN FROM HERE

**Settings → Map visibility** has two options. **Discover gradually** is the default.

- **Show everything:**
  - makes all 50 ideas, 10 threads, 8 debates and all 14 deepening cards browsable in EXPLORE;
  - draws undiscovered ideas on the map as hollow, dashed "not yet learned" points;
  - marks unopened threads and debates "Not yet opened in play".
- **Visible is not learned.** Browsing never changes Knowledge, mastery, discoveries, WORDS,
  history or YOUR WORDS. WORDS stay found-only.
- **Switching back** hides undiscovered content again. Nothing is lost.
- **Where it is stored:** the setting is display-only and lives in localStorage
  (`black-folk:settings`), not in the player save. Reset
  progress clears it.

**Learn from here** is a quiet button on every idea page, including not-yet-learned ones
in Show everything. It builds a short session (up to 6 cards) anchored on that idea:

1. the idea's DISCOVER card;
2. a context encounter, preferring WHY THEN;
3. connected ideas taken from the knowledge graph:
   - neighbours that share a small encounter first, then map, thread and debate links;
   - each new neighbour is introduced with DISCOVER before it is tested;
4. a recall of the anchor to close.

Progress comes only from the answers you give. If a session is in progress, the button asks
before replacing it. Normal PLAY (starters, bridges, adaptive review) is unchanged.

## NOW layer (contemporary connections)

`content/black_folk_now_hooks.json` holds 48 short, sourced present-day hooks (18 LEAD, 30
CODA). The other 20 items have none, and nothing is drawn for them, not even an empty
container. Hooks are editorial moments inside the existing lesson, not a separate section.

- **LEAD (label "Now"):**
  - appears above the historical content of the item's card or page;
  - in PLAY, its bridge line appears only after the reveal, handing back to the history.
- **CODA (label "Still here today"):** appears after the reveal or lesson.
- **Where hooks appear:**
  - **PLAY:** an idea's hook rides its DISCOVER card. A debate's hook rides its linked encounter (D-03 → E014, D-05 → E022, D-08 → E060). A thread's hook appears on the thread-revealed screen.
  - **EXPLORE:** on idea, thread and debate pages, LEAD sits before the core content and CODA sits after it.
- **Source:** a closed **Source** control shows the publisher, title and date, plus an "Open source" link that opens in a new tab. The lesson never shows a raw URL.
- **Hooks are never questions.** They award no Knowledge or mastery, leave no progress records, and do not change LEARN FROM HERE routing or the knowledge graph.
- **`refreshBy`:** read for maintenance only and never shown. On boot, stale hooks are logged to the console (`[NOW] hooks past refreshBy`). They are never hidden or removed. The app makes no network calls.
- **Settings → Contemporary connections:** On (default) or Off.
  - Off hides every hook in PLAY and EXPLORE.
  - The setting is stored with the other display settings in localStorage (`black-folk:settings`, key `contemporary`). There is no save-schema change.

## Respectability (revised)

Respectability is framed as a pressure set under unequal power: *who has to prove they
deserve protection?* It is not presented as a strategy to recommend.

- E056, E057 and E058 were rewritten.
- T-09 asks "What happens when protection depends on acceptability?" and lists historical
  responses: accommodation, strategic presentation, refusal, disrepute, self-defense,
  cultural rejection, queer and "deviant" politics, Black is beautiful, and art that
  refuses the demand. No response is scored as the right one.
- Two notes were added to T-09: *Disrepute* and *Who counts as a thinker?* In V1.5 they
  were deepening cards. In V1.6 they are T-09 thread notes, because V1.6 assigns
  CARD-07–CARD-14 to the art/design layer. V1.6 is re-applied with this revision, so
  the revised wording stays canonical.

Sources and rationale are in `docs/respectability_revision.md`.

## Question clarity

Every question headline ends in "?" or starts with an instruction verb ("Match…",
"Put…"), and sort cards carry a one-line hint ("Pick one for each row."). The audit, with
before/after for each rewritten card, is in `docs/clarity_audit.md`. Rewrites live in
`content/v1_5_interactions.json`, which uses these fields:
- `hint`;
- `reveal_lead`, which adds a first line to a reveal;
- `lead` / `choices_relabel`;
- `_clarity_audit.ids`.

Correct answers, scoring and explanations are unchanged, and a test enforces this.

## Look: quiet, not empty

Each screen carries one world colour as structure:
- PLAY uses tinted concept/prompt panels with a thin world band, filled answer blocks, and
  a grouped reveal with a world rule;
- EXPLORE uses a tinted hero band and filled panels (map, understand, keep, words, notes).

There are no gradients, neon, mascots or confetti.

## Saved progress and migration

Progress is stored in IndexedDB (`black-folk` → `state` → `player`). The current schema is
**v5**.

- Schema v2 adds `map.nodes`, `map.edges` and `words`.
- Schema v3 adds `yourWords`.
- Schema v4 (V1.5) remaps found WORDS ids from `W-01…` to the knowledge map's `W001…`
  (the wording is identical) and adds `bridgesCompleted`. `yourWords` and every other field
  are carried over untouched. A saved in-progress session is remapped too.
- Schema v5 adds `checks` (understanding-check verdicts). Every existing YOUR WORDS answer
  becomes a dated entry in its idea's history. It gains `answered_at`, set to the best
  available date: the edit date, else the creation date, else the save's start date.
  Every other field is kept exactly.

Older saves are upgraded in place when the app loads:
- every existing field is kept;
- the map is backfilled from your past encounters;
- the untouched original is kept as `player-backup-v<old version>`.

Knowledge already earned under the old rules is not recalculated.

## Data notes (V1.5 encounter pack)

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
