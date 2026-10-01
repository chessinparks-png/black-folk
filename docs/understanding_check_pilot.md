# Check your understanding: pilot content

This is the editable reference for the YOUR WORDS understanding check. The app reads
the live content from `content/understanding_checks.json`. Edit that file, then run
`npm run data` (or `npm run dev`). This page explains the reasoning and grounding behind
each line.

## How it works

1. **Only explain-type cards with pilot content get a check.** Right now that is the
   generated RECALL and SHARE cards for Predatory Inclusion, Pan-Africanism and
   Respectability (`X-R-…` / `X-S-…`). Every other card keeps its existing flow.
2. **Input:** the player chooses **Type it** or **Say it in your head**.
   - There is no minimum length.
   - A typed answer is saved permanently with its date.
3. **The reveal unfolds one beat per screen:**
   1. **Your answer.** On a second or later attempt, "Last time you said · date" appears
      underneath. It only appears after the player saves, never before. Saying it in
      your head skips this beat.
   2. **The explanation.** It is the card's existing reveal, unchanged, with the first
      sentence in bold.
   3. **Which of these did you cover?** The player taps the must-haves they included.
      - All of them = **Got it**.
      - Some = **Partly**.
      - None = **Missed**.

      There is no separate verdict screen.
   4. **A common mix-up.** This beat appears only for Partly or Missed, showing the most
      relevant mix-up first. "See another mix-up" shows the second one.
4. **Review:** each verdict uses the card's existing self-rating.
   - Got it = KNEW IT / CLEAR. Same points as before, no bonus, no animation.
   - Partly = ALMOST. The idea comes back sooner.
   - Missed = MISSED IT / NEEDS WORK. The idea comes back within minutes.
   - Typed text is never read by anything that scores.
5. **Choosing the mix-up:**
   - Each mix-up lists the must-haves it relates to (`relates_to`).
   - Mix-ups tied to a must-have the player did *not* tap come first.
   - Ties keep the authored order, so put the key mix-up first.

## Prompt types (explain vs. reflective)

- **Explain:** asks for an idea that has one model explanation shown at the reveal.
- **Reflective:** an open question with no single right answer. Reflective prompts never
  get must-haves, mix-ups or a verdict, but their answers are still saved with dates.
- **Anything unlisted** in `prompt_types` is treated as reflective.

| Prompt | Where | Type |
| --- | --- | --- |
| E010 What is the simplest difference between legal victory and lived reality? | RECALL card | explain |
| E020 What was Callie House trying to turn reparations into? | RECALL card | explain |
| E024 Why does Claudette Colvin connect to Combahee? | RECALL card | explain |
| E027 What is the core difference between individual mobility and collective freedom? | RECALL card | explain |
| E029 Why does the Anita Hill episode matter beyond one biography? | RECALL card | explain |
| E031 "Brown changed the rule before it changed the reality." | SHARE card | explain |
| E032 Explain why Freedom's Journal was a form of power. | SHARE card | explain |
| E038 What did Du Bois's Black Reconstruction change about the story of emancipation? | RECALL card | explain |
| E039 "Protest creates attention. Organization creates continuity." | SHARE card | explain |
| E045 Why did Phillis Wheatley's writing carry a second burden? | RECALL card | explain |
| E047 Under severe repression, why do trust and information control matter? | RECALL card | explain |
| E054 What is the difference between having a right and having institutions that reliably protect it? | RECALL card | explain |
| E064 WHO IS "WE"? What is this question trying to catch? | RECALL card | explain |
| E076 When BLACK FOLK asks WHO IS "WE"?, what should your next question be? | RECALL card | explain (closest call: it asks for a method, but the card has one model answer) |
| X-R-* "What is the core idea worth remembering?" (all 50 ideas) | generated RECALL | explain |
| X-S-* "Explain this line: …" (all 50 ideas) | generated SHARE | explain |
| X-WR-* "What was the core idea? Then read it in their own words." | generated WORDS recall | explain |
| V1-045 Who gets left out when dignity becomes a condition for sympathy? | Respectability idea page | reflective |
| V1-046 How would you tell whether an institution should be repaired, replaced, or abandoned? | Abolition idea page | reflective |
| V1-047 What would meaningful Black self-determination require: control of what, by whom, and for whom? | Black Nationalism idea page | reflective |
| V1-048 What should people of African descent across different nations actually owe one another, if anything? | Pan-Africanism idea page | reflective |
| V1-049 What would you need to know before accepting that a person or group is naturally more dangerous? | Criminalization idea page | reflective |
| V1-050 What would make inclusion meaningful rather than merely formal? | Predatory Inclusion idea page | reflective |
| "How would you explain [idea] to someone new?" | idea page of the other 44 ideas (no authored prompt) | explain (no check content, so no check) |

## Pilot 1: Predatory Inclusion (V1-050)

**Ask:** "How would you explain predatory inclusion to someone new?"

**The explanation shown (core idea, unchanged):**

> Predatory inclusion describes access granted to people previously excluded from a
> market or institution, but on unequal or exploitative terms that can reproduce
> extraction rather than equal power.

**Must-haves**

| id | chip | grounded in |
| --- | --- | --- |
| access | Access is granted, not refused | core idea: "access granted to people previously excluded" |
| terms | On unequal or exploitative terms | core idea: "on unequal or exploitative terms" |
| extraction | Can reproduce extraction | core idea: "can reproduce extraction rather than equal power" |

**Mix-ups**

1. **Reading it as exclusion** (`exclusion`, relates to: access). This is the key
   mix-up.

   > It is easy to hear "predatory inclusion" as being kept out—refused entry, as with
   > redlining. But predatory inclusion is what happens after the door opens: formal
   > exclusion can end without ending the power imbalance underneath it. The door opens,
   > but someone else can still dictate unequal terms.

   - Grounded in the why-then text: "Formal exclusion can end without eliminating the
     power imbalance underneath it."
   - Also grounded in seed E15-050-02's reveal: "Between exclusion and control: the door
     opens, but someone else can still dictate unequal terms."
   - ⚠ **Please check:** the word *redlining* comes from your brief. It does not appear
     anywhere in the current curriculum text.

2. **Treating all inclusion as predatory** (`all-inclusion`, relates to: terms,
   extraction).

   > It is easy to take the idea further than it goes. It does not say that all inclusion
   > is predatory. It asks what access changes, what terms remain unequal, and who has the
   > power to refuse or renegotiate them.

   Grounded in the lens: "Do not imply that all inclusion is predatory. Ask what access
   changes, what terms remain unequal, and who has the power to refuse or renegotiate
   them."

## Pilot 2: Pan-Africanism (V1-048)

**Ask:** "How would you explain Pan-Africanism to someone new?"

**The explanation shown (core idea, unchanged):**

> Pan-Africanism is a family of political and cultural projects that tries to turn
> connections among African-descended peoples into deliberate solidarity, organization,
> or cooperation across national borders.

**Must-haves**

| id | chip | grounded in |
| --- | --- | --- |
| borders | Connections across national borders | core idea: "connections among African-descended peoples … across national borders" |
| organized | Turned into organized solidarity | core idea: "deliberate solidarity, organization, or cooperation"; share: "organized solidarity" |
| family | A family of different projects | core idea: "a family of political and cultural projects" |

**Mix-ups**

1. **Treating it as Black Nationalism** (`nationalism`, relates to: borders, organized).
   This is the key mix-up.

   > It is easy to use Pan-Africanism and Black Nationalism as if they meant the same
   > thing. They overlap, but they ask different questions. Black nationalism asks what
   > Black self-determination requires in power, institutions, culture, and resources.
   > Pan-Africanism tries to turn global Black connection into organized solidarity across
   > borders. Du Bois is the case that splits them: a lifelong Pan-Africanist who was not
   > a Black nationalist for most of his career.

   - Grounded in the V1-047 share line ("Black nationalism asks what Black
     self-determination requires in power, institutions, culture, and resources").
   - Grounded in the V1-048 share line ("Pan-Africanism tries to turn global Black
     connection into organized solidarity").
   - The curriculum already places Du Bois among Pan-African figures (seed E15-048-03:
     "Connect Du Bois, Garvey, Malcolm X, and Kwame Ture").
   - ⚠ **Please check:** the claim that Du Bois was "a lifelong Pan-Africanist who was
     not a Black nationalist for most of his career" comes from your brief. It is not
     stated in the current curriculum text.

2. **Treating connection as automatic agreement** (`automatic`, relates to: organized,
   family).

   > It is easy to assume that shared ancestry already is Pan-Africanism. Diaspora
   > describes connection; Pan-Africanism tries to organize it. And global Blackness is
   > not automatic agreement: Pan-African projects have disagreed over who belongs, what
   > solidarity requires, and whether unity should be cultural, political, economic, or
   > state-based.

   - Grounded in KEEP THIS: "Diaspora describes connection. Pan-Africanism tries to
     organize it."
   - Grounded in the lens: "Do not treat global Blackness as automatic agreement; Pan-African
     projects have disagreed over who belongs, what solidarity requires, and whether unity
     should be cultural, political, economic, or state-based."

## Pilot 3: Respectability (V1-045)

This is consistent with `docs/respectability_revision.md`:
- it is framed as a pressure set under unequal power;
- nothing presents respectability as a strategy that works;
- refusal is never scored as the answer.

**Ask:** "How would you explain respectability to someone new?"

**The explanation shown (core idea, unchanged):**

> Respectability is the pressure or strategy of meeting dominant standards of behavior,
> appearance, morality, class, gender, sexuality, or public presentation in hopes of
> being treated as worthy of protection, opportunity, legitimacy, or sympathy.

**Must-haves**

| id | chip | grounded in |
| --- | --- | --- |
| pressure | A pressure, or a strategy | core idea: "the pressure or strategy" |
| standards | Meeting dominant standards | core idea: "of meeting dominant standards of behavior, appearance, …" |
| worthy | To be treated as worthy | core idea: "in hopes of being treated as worthy of protection, opportunity, legitimacy, or sympathy" |

**Mix-ups**

1. **Blurring it with criminalization** (`criminalization`, relates to: worthy). This is
   the key mix-up.

   > It is easy to fold respectability into criminalization. They are connected, but not
   > the same system. Criminalization asks who gets marked dangerous; respectability asks
   > who gets marked worthy. One helps define who is punishable. The other helps define
   > who is considered deserving of protection or sympathy.

   - Grounded in E058's prompt and its reveal, word for word: "One helps define who is
     punishable. The other helps define who is considered deserving of protection or
     sympathy."
   - Also grounded in seed E15-049-03 and the S04 bridge purpose ("who gets marked
     dangerous, who gets marked worthy").

2. **Hearing it as good manners or a lifestyle** (`manners`, relates to: pressure,
   standards).

   > It is easy to hear respectability as simple good manners or a personal lifestyle.
   > Here it names standards set under unequal power. Many poor, criminalized, unlettered,
   > queer, or otherwise 'non-respectable' Black people could not meet them, or would not.

   - Grounded in the why-then text: "Those standards were set under unequal power—and many
     poor, criminalized, unlettered, queer, or otherwise 'non-respectable' Black people
     could not meet them, or would not."
   - Grounded in the T-09 rule: "a standard imposed under unequal power, not a lifestyle
     choice to market."

## Reasoning notes

- **Must-haves** come straight from the core idea, because that is the explanation the
  player sees on the explanation beat. The player can always check a chip against text
  that is on screen.
- **Each must-have is six words or fewer.** The engine tests enforce this.
- **Mix-ups add no new quotations.** WORDS stay verified literal quotes only. The two
  facts taken from your brief are marked ⚠ above.
- **Tone:**
  - Each mix-up opens with "It is easy to…" so it reads as a common, understandable
    mix-up rather than an error.
  - There is no red, no X marks, no score, and the word "wrong" never appears.

## Adding the next idea

1. Add an entry under `checks` in `content/understanding_checks.json`:
   - `applies_to` (card ids);
   - `ask`;
   - 2–3 `must_haves` (id, text of six words or fewer);
   - `misreadings` (id, `relates_to`, title, text), key mix-up first.
2. Make sure each card listed is explain-type in `prompt_types`.
3. Run `npm run data && npm test`.
