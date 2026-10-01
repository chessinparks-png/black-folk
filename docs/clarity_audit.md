# Clarity audit: player-facing questions

This audit covers every question a player sees in BLACK FOLK:
- 80 encounters, including two-choice, pick, sort, timeline, match and recall/share cards;
- 50 DISCOVER cards;
- the generated cards (RECALL, SHARE, WORDS, timeline, match);
- YOUR WORDS prompts on idea pages and in understanding checks;
- 9 thread questions, 8 debate questions and 7 world questions.

## Rules

A card fails if any of these is true:

1. The headline is a statement or remark, not a question or instruction.
2. A label, option or question is a fragment that depends on another line, especially a
   pronoun ("it", "this", "that", "they") pointing elsewhere.
3. The interaction isn't self-explanatory and has no one-line hint (sort, match,
   multi-row pick).
4. A first-time player couldn't tell what a correct answer would look like.

## What changed, and what didn't

- **Only the question, option labels and hints changed.** Correct answers (same option,
  same position), scoring, verdict lines, explanations and reveals are untouched.
- **Where framing was moved out of a question,** it now opens the reveal as a new first
  line, and the original reveal follows in full. This applies to E022, E066 and E069.
- **New fields in `content/v1_5_interactions.json`:**
  - `hint` (shown in small text under the question);
  - `reveal_lead`;
  - `lead` / `choices_relabel` overrides for cards that keep their pack form.
- **`_clarity_audit.ids` lists every changed card.**
- **What the tests check:**
  - every headline ends in "?" or begins with an instruction verb (332 headlines);
  - every sort card has a hint;
  - no option leans on a pronoun from another line;
  - on audited cards, only question fields changed, the correct answer kept its position,
    and the reveal only gained a first line.

## Passed (no change)

- **Thread, debate and world questions:** all are full questions.
- **YOUR WORDS and check prompts:** all are full questions.
- **Timeline and match cards:** they already carry a one-line hint, so rule 3 passes.
- **DISCOVER statements:** these are reading cards ("Read it. Then reveal."), not
  questions. The statement *is* the content, so they are exempt from rule 1. Their **ask**
  lines were audited; two failed (below).
- **Encounters that passed:** E002, E005, E010, E014, E018, E020, E024, E027, E029, E031,
  E032, E038, E039, E040, E042, E043, E045–E049, E053, E054, E064, E067, E076, E080.
- **Kept as you wrote them** (see "Unsure"): E056, E057 and E058.

## Failing cards

### X-WR-* (generated WORDS recall, all quotations)

**Failed:** 1 — statement after the question ("Then read it in their own words." is a
remark, and "it" / "their" point elsewhere).

| | Before | After |
| --- | --- | --- |
| Question | What was the core idea? Then read it in their own words. | Before you see the quotation: what was the core idea? |

### D046 (DISCOVER · ABOLITION)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | What replaces it? | What replaces the thing that ends? |

### D048 (DISCOVER · PAN-AFRICANISM)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | What turns it into organized solidarity? | What turns that connection into organized solidarity? |

### E001 (binary · stage: 1619 / vs. / AFRICA)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Where does the story start? | Where does Black history start? |

### E003 (binary · stage: ELLA BAKER)

**Failed:** 1 — statement, not a question

| | Before | After |
| --- | --- | --- |
| Question | Strong leadership should… | According to Ella Baker, what should strong leadership do? |

### E004 (pick · stage: IDA B. WELLS / → ?)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Complete the connection. | Which of these connects to Ida B. Wells’s work? |

### E006 (conventional)

**Failed:** 1 — statement, not a question

| | Before | After |
| --- | --- | --- |
| Question | Freedom’s Journal mattered because it gave Black communities… | What did Freedom’s Journal give Black communities? |

### E007 (pick · stage: WASHINGTON’S BET)

**Failed:** 2 — label/question leans on another line; 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Build what first? | In Booker T. Washington’s strategy, what should Black people build first? |

### E008 (binary · stage: BLACK LIFE / ↓ / ART)

**Failed:** 2 — label/question leans on another line; 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Must it be protest first? | In Zora Neale Hurston’s view, must Black life become protest before it can become art? |

### E009 (pick · stage: JAMES McCUNE SMITH / → ?)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Complete the connection. | Which of these connects to James McCune Smith’s work? |

### E011 (conventional)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Option 4 | They had identical diagnoses. | Wells and Washington had identical diagnoses. |

### E012 (pick · stage: FREEDOM’S JOURNAL / + / IDA B. WELLS)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | What connects them? | What connects Freedom’s Journal and Ida B. Wells? |

### E013 (binary · stage: COMMON RATES. / A PROTECTIVE ASSOCIATION.)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | What did the washerwomen gain? | What did the Atlanta washerwomen gain by organizing? |

### E015 (pick · stage: MARY McLEOD BETHUNE)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Inside government, or outside it? | Where did Mary McLeod Bethune build influence: inside government, outside it, or both? |

### E016 (pick · stage: EVIDENCE AS RESISTANCE)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | Which pair belongs on this thread? | Which pair belongs on the EVIDENCE AS RESISTANCE thread? |

### E017 (binary · stage: MALCOLM X)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | Where did he increasingly place the struggle? | Where did Malcolm X increasingly place the Black freedom struggle? |

### E019 (binary · stage: PLESSY LOST IN COURT.)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | What does the case show? | What does Plessy v. Ferguson show? |

### E021 (pick · stage: WELLS BOYCOTT / → RANDOLPH’S PROTEST THREAT / → ?)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Complete the LEVERAGE sequence. | Which is another example of LEVERAGE, like the two above? |

### E022 (sort)

**Failed:** 1 — statement, not a question; 3 — interaction needs a hint

| | Before | After |
| --- | --- | --- |
| Question | Integration and Black Power asked different questions. | Which question did each movement ask? |
| Hint | — | Pick one for each row. |
| Reveal first line | — | Integration and Black Power asked different questions. |

### E023 (binary · stage: RACE · GENDER · CLASS · SEXUALITY)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | One at a time, or together? | Did the Combahee River Collective treat race, gender, class, and sexuality one at a time, or together? |

### E025 (pick · stage: FRED HAMPTON’S COALITION)

**Failed:** 1 — statement, not a question; 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | It depended most on… | What did Fred Hampton’s coalition depend on most? |

### E026 (pick · stage: WHAT IS EDUCATION FOR?)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | Which three belong here? | Which three belong on the WHAT IS EDUCATION FOR? thread? |

### E028 (binary · stage: HIP-HOP)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | Why is it in an intellectual-history game? | Why is hip-hop part of an intellectual-history game? |

### E030 (pick · stage: WHO DEFINES BLACKNESS?)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Which pairing fits best? | Which pair belongs on the WHO DEFINES BLACKNESS? thread? |

### E033 (sort)

**Failed:** 1 — statement, not a question; 3 — interaction needs a hint

| | Before | After |
| --- | --- | --- |
| Question | A first comparison—not a permanent box. Both thinkers changed. | Which emphasis belongs to each thinker, at first? |
| Hint | — | Pick one for each row. |

### E034 (pick · stage: INSIDE ACCESS / + / OUTSIDE PRESSURE)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | Which pair shows both? | Which pair combined inside access with outside pressure? |

### E035 (binary · stage: INVITED IN. / LITTLE SAY OVER THE RULES.)

**Failed:** 1 — statement, not a question; 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Which older question? | Being invited in, with little say over the rules, repeats which older question? |

### E036 (binary · stage: A PUBLIC STORY BLAMES A COMMUNITY.)

**Failed:** 1 — statement, not a question

| | Before | After |
| --- | --- | --- |
| Question | Wells would ask first: | What would Ida B. Wells ask first? |

### E037 (sort)

**Failed:** 3 — interaction needs a hint

| | Before | After |
| --- | --- | --- |
| Question | Place each on LEAVE · REFORM · BUILD. | Is each example leaving, reforming, or building? |
| Hint | — | Pick one for each row. |

### E041 (binary · stage: COLONIAL LAW ASSIGNED STATUS BY RACE.)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Option 1 | Only recorded it | Law only recorded race |
| Option 2 (correct) | Helped make it | Law helped make race |

### E044 (binary · stage: THE FREEDOM CHURCH)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Only a place of worship? | Was the freedom church only a place of worship? |

### E050 (binary · stage: WHERE YOU LIVE SHAPES / SAFETY · WAGES · POLITICAL POSSIBILITY)

**Failed:** 1 — statement, not a question

| | Before | After |
| --- | --- | --- |
| Question | Moving becomes… | When where you live shapes safety, wages, and political possibility, what does moving become? |

### E051 (binary · stage: A STEREOTYPE)

**Failed:** 1 — statement, not a question

| | Before | After |
| --- | --- | --- |
| Question | Baldwin’s answer: | How did James Baldwin answer narrow stereotypes of Black life? |

### E052 (binary · stage: RACISM)

**Failed:** 1 — statement, not a question; 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | The Black Left treated it as… | How did the Black Left understand racism? |

### E055 (binary · stage: BLACK LIVES MATTER)

**Failed:** 1 — statement, not a question; 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | It organized through… | How did Black Lives Matter organize? |

### E059 (binary · stage: ABOLITION / = ending something)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | Is that the whole idea? | Is ending something the whole idea of abolition? |

### E060 (binary · stage: FIX IT. / vs. / END IT AND BUILD SOMETHING ELSE.)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | Both agree it causes harm. What do they disagree about? | Both sides agree an institution causes harm. What do they disagree about? |

### E061 (binary · stage: SLAVERY ENDED. / ↓ / FREEDOM BUILT.)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Same job? | Is ending slavery the same job as building freedom? |

### E062 (binary · stage: BLACK NATIONALISM)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | One program, or many? | Is Black nationalism one program, or many? |

### E063 (binary · stage: BLACK FACES IN THE ROOM / vs. / BLACK CONTROL OF THE ROOM)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Same thing? | Are Black faces in the room the same thing as Black control of the room? |

### E065 (binary · stage: BLACK POPULATIONS IN MANY COUNTRIES)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | Is that Pan-Africanism yet? | Do Black populations in many countries already add up to Pan-Africanism? |

### E066 (sort)

**Failed:** 1 — statement, not a question; 2 — label/question leans on another line; 3 — interaction needs a hint

| | Before | After |
| --- | --- | --- |
| Question | Two words that are easy to blur. | Which word fits each description? |
| Row 1 | Describes connection | Describes how people of African descent around the world are connected |
| Row 2 | Tries to organize it | Tries to turn that connection into an organized movement |
| Hint | — | Pick one for each row. |
| Reveal first line | — | These two are easy to blur: diaspora describes the connection; Pan-Africanism tries to organize it. |

### E068 (binary · stage: CRIMINALIZATION)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | What does it study? | What does the idea of criminalization examine? |

### E069 (sort)

**Failed:** 1 — statement, not a question; 2 — label/question leans on another line; 3 — interaction needs a hint

| | Before | After |
| --- | --- | --- |
| Question | Two close ideas. Keep them apart. | Which idea does each example belong to? |
| Row 1 | Category-making | Creating racial categories |
| Row 2 | Danger-making | Marking people as dangerous |
| Hint | — | Pick one for each row. |
| Reveal first line | — | Two close ideas—keep them apart. |

### E070 (binary · stage: SAME BEHAVIOR. / “TROUBLED” / vs. / “DANGEROUS”)

**Failed:** 1 — statement, not a question

| | Before | After |
| --- | --- | --- |
| Question | Investigate first: | What should you investigate first? |

### E071 (binary · stage: THE DOOR OPENS. / You can buy the house. / PRICE ↑ · QUALITY ↓ · LOAN COST ↑)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Progress? | Is being let in on these terms progress? |

### E072 (pick · stage: LEGAL VICTORY · LIVED REALITY / names a gap.)

**Failed:** 4 — unclear what a correct answer looks like; 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | What does Predatory Inclusion add? | What does predatory inclusion add to the gap between legal victory and lived reality? |
| Option 3 | That inclusion equals exclusion | Proof that inclusion equals exclusion |

### E073 (pick · stage: A HOUSING PROGRAM LETS YOU IN. / INFLATED PRICE · POOR PROPERTY · COSTLY LOAN)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Best fit? | Which idea best fits this situation? |

### E074 (binary · stage: A NIGERIAN AMERICAN / A JAMAICAN LONDONER / AN AFRO-BRAZILIAN)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | What do you look for? | Comparing these three people, what should you look for? |

### E075 (pick · stage: AN ARTIST IS TOLD: / SHOW AN “UPLIFTING” IMAGE OF BLACK LIFE.)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Which thread appears? | Which thread does this situation raise? |

### E077 (match)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Lead | Match each strategy to the best example: | — |
| Question | Match each example to a strategy. | Match each example to the strategy it shows. |

### E078 (pick · stage: THREE GROUPS DISAGREE ON IDEOLOGY. / THEY AGREE ON ONE CONCRETE GOAL.)

**Failed:** 4 — unclear what a correct answer looks like

| | Before | After |
| --- | --- | --- |
| Question | Best fit? | Which idea best fits this situation? |

### E079 (pick · stage: BLACK EDUCATORS TEACH / AROUND A HOSTILE SCHOOL SYSTEM.)

**Failed:** 2 — label/question leans on another line

| | Before | After |
| --- | --- | --- |
| Question | Which thread does this deepen? | Which thread does this kind of teaching deepen? |

## Unsure: please review

- **DISCOVER statements (all 50) were exempted from rule 1.** They are deliberately
  statements to read before revealing. If you want each one to carry a question, that is
  a separate design change. It would touch every DISCOVER card.
- **E056 "What changed?", E057 "Who disappears?" and E058 "Same system?" were left as
  written.** You specified this wording in the Respectability revision, and the stage
  above each one gives the context. By the strict reading of rule 4, "What changed?" is
  the most ambiguous. A candidate is "When people first ask whether you were proper, safe,
  and moral, what changed?"
- **E006** lost the "mattered because…" framing. The reveal already explains why it
  mattered, so I did not add a reveal line.
- **E021 and E073 / E078 / E075 say "the two above" / "this situation"**, pointing at the
  stage. The stage sits directly above the question on the same panel, so I judged an
  explicit noun ("this situation") clear enough.
- **E071 "Not that simple"** is kept as an answer option. It is the natural "no" to the
  question, like "Yes" beside it.
- **E015** now spells out all three options in the question ("inside government, outside
  it, or both?"). That may feel slightly leading.
- **Understanding-check chips** such as "To be treated as worthy" and "A pressure, or a
  strategy" are fragments by design. Each is a checklist item under "Which of these did
  you cover?", capped at six words.
- **Rules applied by judgement:** a few cards failed on rule 4 only (E001, E013, E044,
  E061–E063). These are clarity tightenings. The originals were readable with the stage,
  but a first-time player could not be sure what was being asked.
