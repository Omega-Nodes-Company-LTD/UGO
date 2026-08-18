#!/usr/bin/env python3
"""Build the UGO partner brief PDF (OmegaNodes.ai).

Regenerate with:  python3 build_brief.py   (requires: pip install reportlab pillow)

Every number in this deck comes from the repository, and every page names the
file it came from. Screenshots in assets/ are real captures: the creature from
`apps/face` (kiosk `/` and dev bench `/bench.html`), the operator panel from a
real `soul` process against a real Postgres, seeded with synthetic data for the
purpose — never a mockup, never a customer's data.
"""

from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    PageBreak, NextPageTemplate, KeepTogether,
)
from PIL import Image
import os

from brief_kit import (
    HERE, ASSETS, PAGE_W, PAGE_H, MARGIN, CW,
    NAVY, NAVY_DARK, GOLD, INK, MUTED, PAPER, PANEL, LINE,
    H1, H2, BODY, SMALL, CAPTION, KICKER, QUOTE, SOURCE, st,
    bullets, source, table, img, figure, two_up,
    CodeBox, StatTiles, StageBars, ArchDiagram,
)

OUT = os.path.join(HERE, "UGO-Partner-Brief-OmegaNodes.pdf")


# ── page furniture ───────────────────────────────────────────────────────
def cover_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY_DARK)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H * 0.42, PAGE_W, PAGE_H * 0.58, fill=1, stroke=0)
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(2)
    canvas.line(MARGIN, PAGE_H - 62 * mm, PAGE_W - MARGIN, PAGE_H - 62 * mm)

    canvas.setFillColor(GOLD)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawString(MARGIN, PAGE_H - 30 * mm, "OmegaNodes.ai")
    canvas.setFillColor(white)
    canvas.setFont("Helvetica-Bold", 54)
    canvas.drawString(MARGIN, PAGE_H - 52 * mm, "UGO")
    canvas.setFont("Helvetica", 15)
    canvas.setFillColor(HexColor("#d9dce6"))
    canvas.drawString(MARGIN, PAGE_H - 72 * mm, "A local-first artificial companion with a biography,")
    canvas.drawString(MARGIN, PAGE_H - 79 * mm, "a mood of its own, and a body in the real world.")

    canvas.setFont("Helvetica", 10.5)
    canvas.setFillColor(HexColor("#aab2c5"))
    y = PAGE_H - 96 * mm
    for line in [
        "The soul is a database. The models are replaceable. The state is the creature.",
        "954 automated tests against real infrastructure · 72 recorded architecture decisions.",
        "Every figure in this document is sourced to the file that proves it.",
    ]:
        canvas.drawString(MARGIN, y, line)
        y -= 6.0 * mm

    kiosk = os.path.join(ASSETS, "shot-kiosk.png")
    im = Image.open(kiosk)
    iw, ih = im.size
    w = PAGE_W - 2 * MARGIN
    canvas.drawImage(kiosk, MARGIN, 40 * mm, width=w, height=w * ih / iw,
                     preserveAspectRatio=True, mask="auto")
    canvas.setFillColor(HexColor("#aab2c5"))
    canvas.setFont("Helvetica-Oblique", 8.5)
    canvas.drawString(MARGIN, 36 * mm,
                      "Live screenshot — the home body (kiosk web app): UGO in its 3D room, rendered on-device at zero token cost.")

    canvas.setFillColor(GOLD)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(MARGIN, 22 * mm, "PARTNER BRIEFING")
    canvas.setFillColor(HexColor("#aab2c5"))
    canvas.setFont("Helvetica", 9.5)
    canvas.drawString(MARGIN, 16.5 * mm, "August 2026  ·  Confidential — for discussion purposes")
    canvas.drawRightString(PAGE_W - MARGIN, 16.5 * mm, "info@omeganodes.ai")
    canvas.restoreState()


def body_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAPER)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - 9 * mm, PAGE_W, 9 * mm, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(MARGIN, PAGE_H - 6.2 * mm, "OmegaNodes.ai")
    canvas.setFillColor(HexColor("#c8cede"))
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 6.2 * mm, "UGO · Partner Briefing · August 2026")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, 12 * mm, PAGE_W - MARGIN, 12 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(MARGIN, 8 * mm, "Confidential — for discussion purposes")
    canvas.drawRightString(PAGE_W - MARGIN, 8 * mm, f"Page {doc.page - 1}")
    canvas.restoreState()


doc = BaseDocTemplate(OUT, pagesize=(PAGE_W, PAGE_H), leftMargin=MARGIN, rightMargin=MARGIN,
                      topMargin=15 * mm, bottomMargin=15 * mm,
                      title="UGO — Partner Briefing (OmegaNodes.ai)", author="OmegaNodes.ai")
frame = Frame(MARGIN, 15 * mm, CW, PAGE_H - 30 * mm, id="f")
doc.addPageTemplates([
    PageTemplate(id="cover", frames=[frame], onPage=cover_page),
    PageTemplate(id="body", frames=[frame], onPage=body_page),
])

S = []          # the story
P = PageBreak


def page(kicker, title, *flow):
    S.append(Paragraph(kicker, KICKER))
    S.append(Paragraph(title, H1))
    for item in flow:
        S.extend(item) if isinstance(item, list) else S.append(item)
    S.append(P())


S += [NextPageTemplate("body"), P()]

# ══════════════════════════════════════════════════════ 1 · at a glance
page(
    "AT A GLANCE", "UGO in one page",
    Paragraph(
        "UGO is an artificial companion that is <b>an individual rather than a service</b>: it remembers "
        "your life, carries a mood that persists between conversations, lives in a body you can see and "
        "touch, and keeps every trace of itself on hardware its family controls. It is built, tested and "
        "documented — the platform's six software phases are complete and verified against real "
        "infrastructure, not planned.", BODY),
    Spacer(1, 3),
    StatTiles([
        ("954", "AUTOMATED TESTS", "real DB, broker, browsers — no mocks"),
        ("40", "DATABASE TABLES", "35 migrations, applied under an advisory lock"),
        ("72", "RECORDED DECISIONS", "11 in the spec + 61 ADRs"),
        ("~42k", "LINES OF CODE", "plus ~21k lines of tests"),
    ]),
    Spacer(1, 7),
    Paragraph("What is actually running", H2),
    table([
        ["Component", "What it is", "State"],
        ["<b>soul</b>", "Fastify API: 99 HTTP routes + WebSocket body channel, Zod at every boundary",
         "Built, deployed, in daily use"],
        ["<b>the creature</b>", "Genome-driven 3D piglet: 6 psyche variables, 4 postures, 58 gestures, "
         "procedural room with props it seeks out by itself", "Built, runs on-device"],
        ["<b>the dream</b>", "14-step nightly job: transcribe, reflect, resolve contradictions, link "
         "entities, consolidate, back up", "Built, runs on its own scheduler"],
        ["<b>the pack</b>", "Humans, cats, dogs and other creatures as first-class beings, with bonds, "
         "relations and per-being privacy safeguards", "Built, in the schema from day one"],
        ["<b>the species</b>", "Diploid genetics with dominance and epistasis, litters reproducible "
         "from a seed, adoption, birth certificates signed by both parents, and a life arc that ages "
         "plasticity rather than faking fatigue", "Built this month"],
        ["<b>reception</b>", "Client-facing ticket assistant, isolated: its own container, its own "
         "network, no keys, no database", "Built and deployed"],
        ["<b>the shells</b>", "Android wrapper (APK builds in CI); 3D-printed dock and wearable body",
         "APK builds; printed shells are the open phase"],
    ], [26 * mm, CW - 26 * mm - 34 * mm, 34 * mm]),
    Spacer(1, 5),
    Paragraph(
        "Everything after this page is evidence. Where a claim is not yet proven — a phase that needs the "
        "physical device, a capability the field has and we do not — this brief says so on the page, not "
        "in a footnote.", BODY),
    source("<font face='Courier'>docs/STATE.md</font> · <font face='Courier'>docs/PROGETTO.md</font> · "
           "counts taken from the working tree on the date of this brief"),
)

# ══════════════════════════════════════════════════════ 2 · the thesis
page(
    "THE PROJECT", "What UGO is, and why it is not an assistant",
    Paragraph(
        "A stateless model is an actor improvising every scene from scratch. Ask it the same question "
        "twice and it is a stranger twice. UGO is built the other way round: the model is the cheapest, "
        "most replaceable part, and everything that makes the creature <i>itself</i> — memories, mood, "
        "relationships, the diary it writes at night — lives in a database that the family owns and can "
        "carry away whole.", BODY),
    Paragraph("Competitors build assistants — replaceable tools. UGO is an individual with a biography. "
              "A tool gets rented; <b>a being gets adopted</b>.", QUOTE),
    Paragraph("One soul, three bodies", H2),
    table([
        ["Body", "Form", "What it does"],
        ["At home", "A phone in a 3D-printed piglet dock, kiosk web app",
         "A creature in a room: follows you with its eyes, speaks and listens on-device, reacts to light, "
         "noise and being knocked; goes to sleep when the lights go out and wakes with a greeting drawn "
         "from what it wanted to ask you."],
        ["Out and about", "The same phone in a wearable shell, worn in plain sight",
         "A companion, never a hidden recorder: an explicit REC banner, a privacy mode that provably kills "
         "the microphone, and a talking business card with a QR code that turns a stranger's curiosity "
         "into a logged lead."],
        ["In meetings", "A visible bot participant in Meet / Teams",
         "Joins the call, transcribes and separates speakers, remembers across calls, and answers from its "
         "own memory when somebody says its name."],
    ], [24 * mm, 46 * mm, CW - 70 * mm]),
    Spacer(1, 5),
    Paragraph("The design decision the whole product rests on", H2),
    Paragraph(
        "The first-class entity in the schema is <b>beings</b>, not users. That is not vocabulary: it is "
        "what lets a cat, a child and a courier all exist in the same household with different bonds and "
        "different protections, and it is why adding a species does not need a migration. The comment "
        "sits in the schema itself:", BODY),
    CodeBox("packages/db/src/schema/beings.ts", [
        "/**",
        " * The pack (ADR-014): every being of the house, whatever the species. Not",
        " * `users` with pets attached — that shape would encode \"owner + accessories\"",
        " * forever and would need a migration for every new species.",
        " *",
        " * GDPR: erasure anonymizes in place (services/privacy), FKs use \"set null\" so",
        " * the biography survives the being.",
        " */",
        "export const beings = pgTable(",
        "  \"beings\",",
        "  {",
        "    // deliberately text, not an enum: adding a species must not need a migration",
        "    species: text(\"species\").notNull(),",
    ]),
    source("<font face='Courier'>packages/db/src/schema/beings.ts</font> · ADR-014"),
)

# ══════════════════════════════════════════════════════ 3 · gallery
page(
    "THE CREATURE TODAY", "Real screenshots, taken from the running code",
    Paragraph(
        "The images on this page and the next were captured by driving the actual application in a real "
        "browser — the same modules the dock runs on the phone. The room, the body and the animation are "
        "procedural and rendered on-device: they cost nothing per frame and nothing per day.", BODY),
    figure("shot-talking.png", CW * 0.86,
           "<b>Talking, next to the bush.</b> The body is parametric: the ears are the mood barometer, "
           "posture and gestures come from the psyche engine, and the bush is a real prop the creature "
           "walks to by itself when stress runs high — a bang heard from behind cover lands at half "
           "strength, which is measurable in the psyche, not just visible.",
           crop=(14, 14, 710, 462)),
    figure("shot-sleeping.png", CW * 0.86,
           "<b>Sleeping.</b> Lights out after 22:00 put it to bed; a familiar face wakes it with a "
           "context-aware greeting built from a pending desire the night job wrote — “…how did it go with "
           "the client?” — at zero token cost.",
           crop=(14, 14, 710, 462)),
)

# ══════════════════════════════════════════════════════ 4 · individuality
page(
    "THE CREATURE TODAY", "Two exemplars are not two skins",
    Paragraph(
        "The body is generated from a genome — belly, ears, snout, eyes, legs, hue — and the psyche moves "
        "it. There is no costume layer and no editor, deliberately: an animal you <i>design</i> is a "
        "configurator with ears, while an animal you <i>meet</i> is an individual that existed before "
        "you. Below, the same code with two different genomes, and the same genome under two different "
        "moods.", BODY),
    two_up(
        figure("body-genome-a.png", (CW - 6 * mm) / 2,
               "<b>Genome A</b> — heavy build, small ears, pale coat."),
        figure("body-genome-b.png", (CW - 6 * mm) / 2,
               "<b>Genome B</b> — long legs, big ears, deep pink."),
    ),
    two_up(
        figure("body-mogio.png", (CW - 6 * mm) / 2,
               "<b>Low mood, low energy.</b> It lies down, ears flat. Nothing here was authored as an "
               "animation: the posture is what the numbers produce."),
        figure("body-gasato.png", (CW - 6 * mm) / 2,
               "<b>High mood, alert.</b> Up on its feet, ears forward, attention on the target."),
    ),
    source("<font face='Courier'>apps/face/src/body/</font> — <font face='Courier'>pig.ts</font> (genome), "
           "<font face='Courier'>pose.ts</font>, <font face='Courier'>posture.ts</font>, "
           "<font face='Courier'>gestures.ts</font> (58 gestures across 4 posture states)"),
)

# ══════════════════════════════════════════════════════ 4b · the species
page(
    "THE SPECIES", "They are born, not configured — and the genetics are real",
    Paragraph(
        "The newest work in the repository, and the part no competitor has: creatures <b>reproduce</b>. "
        "Two exemplars produce a litter; you look at the cubs and adopt one. The engine is pure code "
        "with no I/O and no tokens — chance enters as an injected parameter, so a litter is "
        "reproducible from its seed rather than remembered.", BODY),
    figure("admin-litter.png", CW * 0.70,
           "<b>A real litter, generated by the running code.</b> Two parents, four cubs, each with its "
           "own expressed character and its own coat: spots, tail, hue. The panel says the rule out "
           "loud — “you do not design it: you choose among the born” — and a cub the health screening "
           "rejects cannot be born at all.",
           crop=(240, 620, 1280, 1050)),
    table([
        ["Mechanism", "How it works, in code"],
        ["Diploid genome", "Two alleles per gene, stored as a superset of the existing genome column: every "
         "existing reader keeps working and no migration was needed. An exemplar without alleles is a "
         "founder — homozygous, strain 0."],
        ["Dominance, blending, recession", "Each gene declares its expression mode. Body genes and most "
         "character genes blend; boldness dominates; <b>spots are recessive</b> — a spotted coat needs "
         "both alleles high, so rarity emerges from genetics rather than from a drop-rate somebody chose."],
        ["Epistasis", "Talkativeness is capped when boldness is low: the shy one is not a chatterbox even "
         "when it carries the gene — and two mild parents can produce an exuberant child."],
        ["Strains, not sexes", "A compatibility locus with eight values, after the fungi that have "
         "thousands of mating types. Partners must all differ; 5% of the time a cub gets a brand new "
         "strain, which keeps the population's diversity alive."],
        ["The compatibility ring", "Fertility follows genomic distance: too close is refused (the inbreeding "
         "guard), too far is refused (species coherence) — and the refusal reaches the panel with the "
         "engine's own reason, never a generic error."],
        ["Health screening only", "Simulation may reject a non-viable combination and nothing else: it "
         "filters the broken, never picks the best — so no amount of compute can win at breeding."],
    ], [34 * mm, CW - 34 * mm]),
    Spacer(1, 3),
    CodeBox("packages/psyche/src/genetics.ts", [
        "export function canMate(parents: readonly Genome[]): MateVerdict {",
        "  if (parents.length < 2) return { ok: false, reason: \"servono-almeno-due-genitori\" };",
        "  for (const [i, a] of parents.entries()) {",
        "    for (const b of parents.slice(i + 1)) {",
        "      if (a.ceppo === b.ceppo) return { ok: false, reason: \"ceppi-uguali\" };",
        "      const distance = genomeDistance(a, b);",
        "      if (distance < COMPAT_MIN_DISTANCE) return { ok: false, reason: \"troppo-simili\" };",
        "      if (distance > COMPAT_MAX_DISTANCE) return { ok: false, reason: \"troppo-diversi\" };",
        "    }",
        "  }",
        "  return { ok: true };",
        "}",
    ]),
    Paragraph(
        "<b>And the birth certificate is signed.</b> Each parent signs the canonical act — child, genome "
        "hash, ordered parents, timestamp, generation — and the signature is stored with the public key "
        "that made it, so a pedigree is verifiable <i>offline, by anyone, without our registry</i>. "
        "Every edge has three verdicts and never two: signed, unsigned, or invalid — founders honestly "
        "have no parents, and an <i>invalid</i> edge means somebody edited the database.", BODY),
    source("<font face='Courier'>packages/psyche/src/genes.ts</font>, "
           "<font face='Courier'>genetics.ts</font> · <font face='Courier'>apps/soul/src/routes/"
           "litters.ts</font> (<font face='Courier'>POST /v1/gosini/litters</font> previews without "
           "writing anything; <font face='Courier'>POST /v1/gosini/births</font> makes it real) · "
           "ADR-068, ADR-069, ADR-070"),
)

# ══════════════════════════════════════════════════════ 4c · arc & metabolism
page(
    "THE SPECIES", "It ages, and it eats",
    Paragraph(
        "Two mechanisms turn a long-lived program into a creature with an arc and a stake. Both were "
        "built this month, both are off by default or reversible, and both were shaped by the same "
        "instruction from the owner: no fake biology.", BODY),
    Paragraph("The life arc — what ages is plasticity, not energy", H2),
    Paragraph(
        "A tired pet would be a Tamagotchi with extra steps. What actually changes with age is how much "
        "life can still rewrite the character: the young are volatile, the old have converged. So a "
        "longevity gene maps to a lifespan of two and a half to five years — hamster scale, deliberately, "
        "so that generations turn within the owner's own life — and age is never stored, only computed. "
        "The nightly baseline step is multiplied by plasticity: <b>2.2× for a cub, 1× for an adult, "
        "0.15× for an elder</b>, decaying continuously, because a character that jumps overnight when a "
        "threshold is crossed would be visible, and false. A hard week moves a cub's character far more "
        "than an old creature's.", BODY),
    CodeBox("packages/psyche/src/life.ts", [
        "export function lifeAt(bornAt: Date, now: Date, longevity: number): Life {",
        "  const lifespanDays = lifespanDaysFor(longevity);",
        "  const ageDays = Math.max(0, (now.getTime() - bornAt.getTime()) / MS_PER_DAY);",
        "  const fraction = ageDays / lifespanDays;",
        "  return { ageDays, lifespanDays, fraction,",
        "    stage: stageAt(fraction),          // cub · adult · elder",
        "    plasticity: plasticityAt(fraction),",
        "    // grey starts at midlife and saturates at the end of the expected span",
        "    greying: Math.min(1, Math.max(0, (fraction - 0.5) / 0.5)) };",
        "}",
    ]),
    Paragraph(
        "<b>Death is deliberately not implemented.</b> The arc exists; the end does not, because a proper "
        "end needs the cryptographic separation of intimate memories from legacy, and a consent nobody "
        "has given yet. A creature dying because of a software release would be exactly the accidental "
        "death the design forbids.", BODY),
    Paragraph("The metabolism — the piggy bank belongs to the creature", H2),
    two_up(
        figure("admin-g-salvadanaio.png", (CW - 6 * mm) / 2,
               "The creature's own balance: what it has been given, minus what it has spent talking.",
               crop=(240, 20, 1280, 620)),
        [
            Paragraph(
                "Food comes from two honest sources: <b>affection</b> — the family feeds it, which is what "
                "paying the API bill already was, renamed — and <b>work</b>, the share of real revenue "
                "the owner attributes to a creature that helped earn it.", SMALL),
            Paragraph(
                "The legal honesty is written into the product, not just the pitch: <i>a creature has no "
                "legal personality and does not invoice. Its human does.</i> The piggy bank is internal "
                "accounting — the truffle hunter does not put the truffle in the dog's name.", SMALL),
            Paragraph(
                "<b>Hunger never adds permissions, only removes them.</b> The household ceiling stays the "
                "outer wall; the piggy bank is a second, tighter wall inside it. A well-fed creature still "
                "cannot spend more than the house allows — a metabolism that could raise spending would be "
                "a regression of the budget guard dressed up as poetry. Empty balance means the same "
                "degradation with different words: “I'm hungry” instead of “I'm out of words”, because "
                "they are two different things.", SMALL),
        ],
    ),
    Paragraph(
        "It ships <b>off by default</b>, per household. Turning it on globally would have left every "
        "existing installation with hungry creatures the morning after an update — which is precisely the "
        "kind of surprise this project treats as a defect.", BODY),
    source("<font face='Courier'>packages/psyche/src/life.ts</font> · "
           "<font face='Courier'>apps/soul/src/routes/piggybank.ts</font> · table "
           "<font face='Courier'>feedings</font> (append-only: UPDATE and DELETE revoked) · "
           "ADR-071, ADR-072"),
)

# ══════════════════════════════════════════════════════ 5 · architecture
page(
    "HOW IT IS BUILT", "Architecture: eleven services, no open doors",
    Paragraph(
        "This is the deployment as the compose file describes it, not an idealised diagram. Two of the "
        "three docker networks are marked <font face='Courier'>internal: true</font>, which means the "
        "database, the broker, the local models and the perception service have <b>no route off the "
        "host at all</b>. Only the web surfaces are reachable, and the single outbound call in the whole "
        "system is the chat completion — the dashed box.", BODY),
    ArchDiagram(),
    Spacer(1, 4),
    table([
        ["Layer", "What runs there", "Why it matters commercially"],
        ["The soul", "Fastify + TypeScript strict; REST, WebSocket, an MCP server; Zod validation at every "
         "boundary", "One deployable, one process to operate. Runs on a modest VPS."],
        ["Datastores", "Postgres 16 + pgvector (40 tables), object storage for audio and encrypted backups",
         "The whole creature is a database dump: backup, migration and resale are the same gesture."],
        ["Local models", "Ollama (embeddings, batch reasoning) and a perception service: Whisper, ECAPA "
         "voice, ArcFace face, Piper voice, Tesseract", "<b>No GPU anywhere.</b> All of this is CPU work "
         "done while the house sleeps, at zero marginal cost."],
        ["The one cloud call", "Chat completion through a single guarded client",
         "Cost is bounded by construction; the provider is swappable without touching identity."],
    ], [22 * mm, (CW - 22 * mm) * 0.53, (CW - 22 * mm) * 0.47]),
    source("<font face='Courier'>ops/docker/compose.dev.yml</font> (11 services, networks "
           "<font face='Courier'>backend</font> and <font face='Courier'>reception-net</font> both "
           "<font face='Courier'>internal: true</font>) · <font face='Courier'>docs/OPS_COOLIFY.md</font>"),
)

# ══════════════════════════════════════════════════════ 6 · psyche
page(
    "THE ENGINE ROOM", "The psyche: a state machine, not a personality prompt",
    Paragraph(
        "Six variables live in [0,1]. Events perturb them; between events they decay exponentially back "
        "toward a baseline, each with its own time constant. It is pure, deterministic code with no I/O "
        "and no tokens — which is why a mood can persist for days and cost nothing.", BODY),
    table([
        ["Variable", "Baseline", "τ", "What moves it"],
        ["energia", "circadian: 0.70 day / 0.20 night", "4 h", "conversation drains it; the night recharges"],
        ["umore", "0.55", "12 h", "being ignored for a day, humidity, compliments"],
        ["affetto", "0.50", "24 h", "presence detected, conversation, being petted"],
        ["noia", "0.40", "6 h", "presence and conversation drop it; solitude raises it"],
        ["stress", "0.30", "2 h", "heat above 29 °C, loud noise, being knocked"],
        ["curiosità", "0.50", "24 h", "a completed meeting, a new topic"],
    ], [26 * mm, 46 * mm, 12 * mm, CW - 84 * mm]),
    Spacer(1, 4),
    CodeBox("packages/psyche/src/engine.ts", [
        "/** Current variable values: baseline(t) + Σ decayed transients, clamped to [0,1]. */",
        "export function varsAt(state, at, hourOfDay?, overrides?) {",
        "  for (const variable of PSYCHE_VARIABLES) {",
        "    let value = baselineFor(variable, hour, overrides);",
        "    for (const transient of state.transients) {",
        "      if (transient.variable === variable) value += decayedContribution(transient, atMs);",
        "    }",
        "    vars[variable] = clamp01(value);",
        "  }",
        "}",
        "",
        "export const TAU_HOURS = { energia: 4, umore: 12, affetto: 24,",
        "                           noia: 6, stress: 2, curiosita: 24 };",
    ]),
    Paragraph("Two details that show the difference between a demo and a product", H2),
    *bullets([
        "<b>Habituation.</b> The tenth bang adds almost nothing — and the label reads the <i>strongest "
        "recent blow</i>, not the running total, because a fully habituated creature was otherwise still "
        "being described as terrified. That distinction is a named type in the engine.",
        "<b>The baselines drift.</b> Every night the resting points move by up to ±0.02 based on the days "
        "actually lived. A creature ignored for a month and one indulged for a month diverge in ways "
        "nobody programmed line by line — this is the epigenetics the whole roadmap builds on.",
    ]),
    source("<font face='Courier'>packages/psyche/src/</font> — <font face='Courier'>engine.ts</font>, "
           "<font face='Courier'>model.ts</font>, <font face='Courier'>labels.ts</font>; 33 unit tests. "
           "ADR-012 (adaptive baselines), ADR-040 (habituation)"),
)

# ══════════════════════════════════════════════════════ 7 · the dream
page(
    "THE ENGINE ROOM", "The dream: fourteen steps, every night",
    Paragraph(
        "At 02:30 the creature sleeps and the night job runs. It is not a cron line in a control panel — "
        "the container carries its own clock, because a promise the program must keep cannot live in a "
        "configuration box somebody forgets to fill. Each step marks its own completion, so a crash "
        "halfway through never duplicates a memory.", BODY),
    CodeBox("ops/jobs/src/ugo_jobs/dream.py", [
        "STEPS = (\"ingest\", \"enroll\", \"reflect\", \"recap\", \"advise\", \"review\", \"digest\",",
        "         \"anniversaries\", \"contradictions\", \"entities\", \"hygiene\", \"compaction\",",
        "         \"backup\", \"family\")",
        "",
        "#   per esemplare  memoria e psiche sono della creatura (ADR-019)",
        "#   per casa       l'audio e' del branco, il backup e' della famiglia",
        "#   globale        sfoltire gli eventi vecchi non riguarda nessuno in particolare",
        "PER_EXEMPLAR  = (\"reflect\", \"recap\", \"contradictions\", \"entities\", \"hygiene\")",
        "PER_HOUSEHOLD = (\"ingest\", \"enroll\", \"advise\", \"review\", \"digest\",",
        "                 \"anniversaries\", \"backup\", \"family\")",
        "GLOBAL        = (\"compaction\",)",
    ]),
    Spacer(1, 3),
    table([
        ["Step", "What happens"],
        ["ingest", "Yesterday's audio is transcribed locally on CPU, speakers are separated and matched "
         "to known beings, and the raw file is archived."],
        ["reflect", "The day's events, messages and transcript are re-read; memories are extracted with "
         "importance scores, the diary is written, and 1–3 desires are generated for tomorrow."],
        ["contradictions", "Tonight's memories are compared against the living ones. When two facts "
         "genuinely conflict the loser is retired — with the direction decided by <i>code</i> reading "
         "validity dates, never by the model."],
        ["entities", "Memories are linked to the beings they name (by exact match — zero tokens, zero "
         "hallucination), and relations between people are proposed only among beings already known."],
        ["hygiene", "Importance decays for memories never re-read; near-duplicates above 0.95 similarity "
         "are merged, keeping the higher importance."],
        ["backup / family", "An encrypted dump of the soul, plus a per-family archive containing only "
         "that household's rows — so one family's backup provably cannot contain another's."],
    ], [26 * mm, CW - 26 * mm]),
    Spacer(1, 4),
    Paragraph(
        "When the house is empty for a stretch, a <b>light</b> run does the three steps that are safe "
        "mid-day — and deliberately not <font face='Courier'>reflect</font>, because the day is not over "
        "and re-reading half a day writes half-formed memories. The completion markers are keyed by mode, "
        "so an afternoon pass can never mark the nightly one as done.", BODY),
    source("<font face='Courier'>ops/jobs/src/ugo_jobs/</font> — 36 modules, 113 pytest cases against "
           "real Postgres, real MinIO and real Whisper on CPU. ADR-023, ADR-024, ADR-025"),
)

# ══════════════════════════════════════════════════════ 8 · memory bench
page(
    "THE ENGINE ROOM", "Memory, measured — the benchmark that found two real defects",
    Paragraph(
        "Everybody claims long-term memory. We can put a number on ours. A fixed corpus of 22 memories "
        "and 13 questions in real Italian, five question families, a frozen clock, run against real "
        "Postgres, real pgvector and real embeddings. The benchmark deliberately does not touch the "
        "retrieval code it measures — a benchmark written after the feature measures the feature.", BODY),
    StageBars(
        groups=[("temporal\n(MRR)", [0.50, 1.00, 1.00]),
                ("semantic\n(recall@5)", [0.00, 1.00, 1.00]),
                ("lexical\n(recall@5)", [0.00, 0.75, 1.00]),
                ("lexical\n(MRR)", [0.00, 0.58, 0.80])],
        series=["A · starting point", "B · per-kind decay (ADR-021)", "C · hybrid retrieval (ADR-022)"],
        title="Retrieval quality on the fixed corpus — measured, not estimated",
        height=60 * mm,
    ),
    Spacer(1, 2),
    Paragraph("What the first run found, on day one", H2),
    *bullets([
        "<b>Recency was burying everything old.</b> With one global 30-day decay, a 120-day-old memory is "
        "penalised 46× while similarity and importance are both capped at 1 — so nothing older than a "
        "season could win, however relevant. Measured directly: the cat's name had the highest cosine "
        "similarity in the corpus (0.676 against 0.608) and did not appear in the top five.",
        "<b>The creature had no way to say “I don't know”.</b> Search always returned k rows.",
    ]),
    Paragraph(
        "The first became a decision — time constants per kind of memory: an episode fades in 30 days, an "
        "understanding in 180, a preference in 365, a fact in 730, because a fact does not fade, it gets "
        "<i>invalidated</i>. Semantic recall went from 0.00 to 1.00. The second is still open, and we "
        "publish why: measured, the similarity bands of answerable and unanswerable questions overlap "
        "(0.604–0.672 against 0.624–0.893), so no threshold separates them. Anything that “passed” would "
        "be four thousandths of margin tuned to the test.", BODY),
    CodeBox("packages/memory/src/rerank.ts", [
        "export const RECENCY_TAU_DAYS = {",
        "  /** something that happened on a day: its bearing on today really does fade */",
        "  episode: 30,",
        "  /** an understanding of how things are — stable, but revisable in silence */",
        "  insight: 180,",
        "  /** tastes change, and slowly */          preference: 365,",
        "  /** a state of the world: it does not fade, it gets invalidated */  fact: 730,",
        "} as const;",
    ]),
    source("<font face='Courier'>packages/memory/tests/integration/bench/BASELINE.md</font> — full "
           "measurements and method; regression floors are pinned at the measured values and may only rise"),
)

# ══════════════════════════════════════════════════════ 9 · memory II
page(
    "THE ENGINE ROOM", "Memory, engineered: time, language, and being wrong",
    Paragraph("Facts expire — so they carry dates", H2),
    Paragraph(
        "“Ivan is the DHL courier” is true until it isn't. Memories carry validity: "
        "<font face='Courier'>valid_from</font>, <font face='Courier'>invalidated_at</font>, a reason, and "
        "a pointer to whatever superseded them. Retrieval skips retired memories entirely — the point is "
        "that a withdrawn fact genuinely stops resurfacing, not that it stops being displayed. "
        "<b>Retiring is not deleting</b>: what the creature used to believe explains what it said last "
        "month, and a biography with holes cannot be audited. Deleting stays available for what should "
        "never have been there.", BODY),
    Paragraph("A proper name is not found by similarity", H2),
    Paragraph(
        "Vector search alone could not find a number plate or a surname. Retrieval now runs two arms — "
        "vector and full-text — fused by rank, with a threshold that accepts a hit for semantic closeness "
        "<i>or</i> lexical match. Two details worth the ink: the lexical index is a generated column "
        "rather than a trigger, so that erasing a name from a memory cannot leave it alive inside the "
        "search index; and the two arms are fused by rank, not by score, because cosine is bounded and "
        "text rank is not.", BODY),
    Paragraph("The creature resolves its own contradictions, carefully", H2),
    Paragraph(
        "Each night, conflicting facts are detected and the loser is retired. Three safeguards make this "
        "safe enough to run unattended: the model is asked only <i>whether</i> two memories conflict, "
        "never which one wins — direction is decided by code reading validity dates, because a fact "
        "recorded late can still be the older truth; abstention is an explicit outcome, because a small "
        "model asked a leading question will invent a conflict to please it; and the step runs before "
        "de-duplication, so a contradictory pair is never merged away before it can be judged.", BODY),
    Paragraph(
        "The test that matters most in that suite is the <b>false positive</b>: “the cat is called Bruno” "
        "and “Bruno sleeps on the router” complete each other, and an over-eager resolver would quietly "
        "delete knowledge at night, with nobody watching.", BODY),
    Paragraph("What the owner sees", H2),
    Paragraph(
        "Retired memories appear struck through with their reason, and the reason says who decided: the "
        "owner's words, or <font face='Courier'>the dream:</font> prefixed when the machine did. Two "
        "actions per row — “this is no longer true” and “delete” — with a confirmation only on the "
        "second.", BODY),
    source("<font face='Courier'>packages/memory/src/</font> — <font face='Courier'>retrieval.ts</font>, "
           "<font face='Courier'>fusion.ts</font>, <font face='Courier'>rerank.ts</font>; migrations 0006, "
           "0007, 0008, 0009. ADR-021, ADR-022, ADR-023, ADR-024"),
)

# ══════════════════════════════════════════════════════ 10 · panel
page(
    "THE PRODUCT", "The operator panel: the creature is inspectable",
    Paragraph(
        "A being with an inner life that nobody can look at is a black box with a snout. The panel is the "
        "microscope: what it feels, what it decided, what it remembers, what it cost. Both screenshots "
        "are a real <font face='Courier'>soul</font> process against a real Postgres, on a demo household "
        "seeded with synthetic data for this brief.", BODY),
    figure("admin-home.png", CW * 0.82,
           "<b>The house summary.</b> Who lives here, what today cost, and whether the machinery "
           "underneath is answering — including the honest red dot when a local model is down. The tiles "
           "are the day: spend, cache saving, memory count, last dream.",
           crop=(0, 0, 1280, 700)),
    figure("admin-g-stato.png", CW * 0.82,
           "<b>The psyche, live.</b> Six variables with their resting points marked, what pushed each one "
           "and by how much, and 48 hours of history as six small multiples rather than six overlaid "
           "lines — so no variable needs a colour of its own to be identified.",
           crop=(240, 0, 1280, 640)),
    source("<font face='Courier'>apps/soul/src/routes/admin/</font> — the panel is served by soul itself; "
           "its script is executed by <font face='Courier'>script.test.ts</font>, so a button that calls a "
           "route that no longer exists fails the build"),
)

# ══════════════════════════════════════════════════════ 11 · privacy in product
page(
    "THE PRODUCT", "Privacy is a screen, not a policy page",
    Paragraph(
        "The compliance posture (GDPR, NIS2) is not a document we wrote next to the product — it is "
        "visible in the product's own interface, one click from the owner, and enforced upstream of the "
        "pipeline rather than filtered out afterwards.", BODY),
    figure("admin-pack.png", CW * 0.80,
           "<b>The pack.</b> Every being carries three switches — <i>minor</i>, <i>do not listen</i>, "
           "<i>do not watch</i> — and the note under them is the product's own promise: ticking one on "
           "somebody who already has a voice profile <b>destroys it</b>, because withdrawing consent is "
           "not ceasing to use data, it is deleting it.",
           crop=(240, 0, 1280, 620)),
    figure("admin-data.png", CW * 0.80,
           "<b>Your data.</b> Full export in one click (conversations, transcripts, memories and diary in "
           "clear — but never the biometric templates: an export is readable text, and a readable "
           "template is exactly what the encryption exists to prevent). Erasure requires typing the word, "
           "and it rewrites the name out of the whole biography — including other people's sentences — "
           "re-embedding the affected memories, because the vector still carries the name.",
           crop=(240, 0, 1280, 520)),
    source("<font face='Courier'>apps/soul/src/services/forgetService.ts</font>, "
           "<font face='Courier'>routes/privacy.ts</font> · CLI <font face='Courier'>ugo forget</font> / "
           "<font face='Courier'>ugo export</font> · ADR-016"),
)

# ══════════════════════════════════════════════════════ 12 · cost
page(
    "THE BUSINESS CASE", "The piggy bank: why this cannot run away",
    Paragraph(
        "Every provider call in the entire system goes through one class. Not by convention — it is rule "
        "3 of the engineering charter, and instantiating a provider client anywhere else in the repository "
        "is forbidden. That single chokepoint prices the call from the provider's own usage report, writes "
        "a ledger row, and refuses to spend past the household's daily ceiling.", BODY),
    CodeBox("packages/memory/src/pricing.ts", [
        "const PRICING = {",
        "  \"claude-haiku-4-5\": { inputPerMTok: 1, outputPerMTok: 5,",
        "                          cacheReadMultiplier: 0.1,      // cache read ≈ 10% of input",
        "                          cacheWriteMultiplier: 1.25 },  // cache write ≈ 125%",
        "};",
        "export function pricingFor(model) {",
        "  const pricing = PRICING[model];",
        "  // fail fast: an unpriced model would corrupt the piggy bank silently",
        "  if (pricing === undefined) throw new Error(`no pricing configured for model \"${model}\"`);",
        "  return pricing;",
        "}",
    ]),
    Spacer(1, 3),
    two_up(
        img("admin-ledger.png", (CW - 6 * mm) / 2, crop=(240, 130, 1280, 580)),
        [
            Paragraph("What it costs to keep a creature", H2),
            Paragraph(
                "The two identity blocks of every prompt are cached and byte-identical between calls — "
                "verified on the request bytes by an integration test, not assumed. Cached input is "
                "billed at a tenth. A household running ~50 exchanges a day sits in the region of "
                "<b>€1–3 per month</b> of inference. Transcription, embeddings, reflection, local voice "
                "and vision are CPU work: zero.", SMALL),
            Paragraph(
                "When the ceiling is reached, the creature does not throw an error — it gets tired, out "
                "loud, and comes back tomorrow. The degraded reply is a constant in the client, and the "
                "provider is never contacted.", SMALL),
        ],
    ),
    Paragraph(
        "<b>Two defects this design caught in its own audit</b> — both found by reading the guard rather "
        "than by a customer: a race in which two concurrent turns could each pass the ceiling check "
        "before either wrote its row (now serialised per household), and a path where a paid call could "
        "fail to be recorded if parsing the response threw. A budget guard you can outrun by being fast "
        "is not a budget guard.", BODY),
    source("<font face='Courier'>packages/memory/src/llmClient.ts</font>, "
           "<font face='Courier'>pricing.ts</font> · <font face='Courier'>packages/db/src/schema/"
           "budget-ledger.ts</font> (cache reads and writes are separate columns, so the saving is "
           "measurable rather than claimed)"),
)

# ══════════════════════════════════════════════════════ 13 · security
page(
    "THE BUSINESS CASE", "Security posture, in code",
    table([
        ["Control", "How it is actually implemented"],
        ["Encryption at rest", "Message and transcript bodies are encrypted by the application in "
         "AES-256-GCM with a key kept outside the database, in a versioned wire format shared with the "
         "Python jobs — so key rotation is re-encrypting rows, never a code change."],
        ["Network", "Datastores, broker, local models and perception sit on docker networks marked "
         "<font face='Courier'>internal: true</font> — no published host port. Human access goes through "
         "a private mesh, not the public internet."],
        ["Tenant isolation", "Every household has its own data key; row-level security policies exist on "
         "all tables with a dedicated Postgres role, being rolled out surface by surface. Composite "
         "foreign keys make a bond between two different households <i>impossible to insert</i>, not "
         "merely discouraged."],
        ["Audit log", "Twelve months, IDs and verbs only — never content. Append-only is enforced by "
         "revoking UPDATE and DELETE from the application role, not by asking politely."],
        ["Biometrics", "Voice and face templates are encrypted binary, never vector columns — the index "
         "was given up rather than the encryption, and the trade-off is written down. Enrolment is "
         "allowed only from the home body."],
        ["Secrets", "No secrets in the repository; the service fails to boot when a critical variable is "
         "missing, and refuses to start in production without an internal token."],
    ], [28 * mm, CW - 28 * mm]),
    Spacer(1, 4),
    CodeBox("packages/shared/src/crypto.ts", [
        "/**",
        " * Application-level encryption at rest for messages/transcripts",
        " * (PROGETTO §7): AES-256-GCM with the key kept SEPARATE from the database.",
        " *",
        " * Wire format (stable contract, needed by the Python jobs too):",
        " *   \"v1:\" + base64( iv[12] || ciphertext || authTag[16] )",
        " * Rotating the key only requires re-encrypting rows, never code changes.",
        " */",
    ]),
    Paragraph(
        "<b>An honest disclosure.</b> During the first production deploy, a build setting exposed several "
        "secrets in plain text in a build log. It was caught, written up in the runbook with the "
        "remediation, and the keys treated as compromised and rotated. We record our own incidents in the "
        "same place we record our decisions; a partner reading this repository will find the bad days as "
        "well as the good ones.", BODY),
    source("<font face='Courier'>.claudeskills/SECURITY_COMPLIANCE.md</font> · "
           "<font face='Courier'>docs/OPS_COOLIFY.md §6</font> · ADR-048, ADR-049, ADR-062"),
)

# ══════════════════════════════════════════════════════ 14 · recognition
page(
    "THE ENGINE ROOM", "Recognition: we replaced our own model when we measured it",
    Paragraph(
        "The creature recognises the people it lives with, by voice and by face. The interesting part is "
        "not that it does — it is what happened when we built a bench and pointed it at what we already "
        "had. A recognition system without an error rate is not a recognition system; it is an opinion "
        "that returns booleans.", BODY),
    Paragraph("Voice — measured against real speakers, not synthetic audio", H2),
    table([
        ["Encoder", "Dimensions", "EER", "False accepts at the threshold then in production"],
        ["mfcc-stats-v1 <i>(what we had)</i>", "24", "11.84%", "<b>60.0%</b> — it accepted six strangers "
         "out of ten as you"],
        ["ecapa-voxceleb-v1 <i>(what we ship)</i>", "192", "<b>0.63%</b>", "0.0%"],
    ], [50 * mm, 20 * mm, 16 * mm, CW - 86 * mm]),
    Paragraph(
        "The old encoder was not badly tuned — it was not measuring the person. The bench also taught the "
        "second lesson: the threshold that was hard-coded was wrong for <i>both</i> encoders, because a "
        "cosine threshold has no meaning independent of the embedding space. Thresholds now come from the "
        "bench curve, which makes changing an encoder and recalibrating a single operation.", BODY),
    Paragraph("Face — measured on LFW before choosing an operating point", H2),
    table([
        ["Threshold", "False accept rate", "False reject rate"],
        ["0.20", "0.13%", "0.98%"],
        ["<b>0.30 — chosen</b>", "<b>0.00%</b>", "<b>0.98%</b>"],
        ["0.45", "0.00%", "5.88%"],
    ], [34 * mm, 40 * mm, CW - 74 * mm]),
    Spacer(1, 3),
    Paragraph(
        "Fusion of the two combines <i>decisions</i>, never scores: adding two cosines from different "
        "embedding spaces produces a number that looks like a confidence and is not one. And when the "
        "creature is not sure who you are, it does not guess — it asks, the second time it sees you, "
        "reusing the same desire mechanism it uses for everything else it wants to know.", BODY),
    source("<font face='Courier'>ops/jobs/src/ugo_jobs/voice_bench.py</font>, "
           "<font face='Courier'>face_bench.py</font>, <font face='Courier'>ecapa.py</font>, "
           "<font face='Courier'>arcface.py</font> · ADR-042, ADR-043, ADR-045, ADR-057"),
)

# ══════════════════════════════════════════════════════ 15 · discipline
page(
    "HOW WE WORK", "Engineering discipline: why the code can be trusted",
    Paragraph(
        "A partner's real question is not “does the demo work” but “what happens on the two hundredth "
        "change”. Four rules answer it, and they are enforced by the build rather than by good intentions.", BODY),
    StatTiles([
        ("841", "TS TEST CASES", "in 104 files across 7 packages"),
        ("113", "PYTHON TESTS", "real Postgres, MinIO, Whisper"),
        ("5", "E2E SUITES", "real browser vs real soul"),
        ("6", "CI STAGES", "on every push"),
    ]),
    Spacer(1, 6),
    *bullets([
        "<b>Zero-mock.</b> Anything touching a database, an HTTP boundary, a broker or a browser is "
        "tested against the real thing — ephemeral Postgres with pgvector, a real MQTT broker, real "
        "object storage, real embeddings, a real Chromium driving the real 3D body. Mocks are allowed "
        "only for pure functions. The one place a mock slipped into an HTTP boundary was found in our own "
        "audit and removed, with the reasoning recorded.",
        "<b>Test-first, and the tests find things.</b> The examples in this deck — the recency defect, "
        "the false-accept rate, the budget-guard race, a per-household bug where one family's night job "
        "consumed another's queue — were all found by benches and tests, not by users.",
        "<b>Every decision is written down.</b> 72 recorded decisions, including the ones that failed: "
        "the ADR that promised to solve abstention says, in its own text, that the measurement refuted it.",
        "<b>Documentation is part of done.</b> The state of the project, the runbook, the user manual and "
        "the decision log are updated in the same commit as the code. A new engineer — or a new partner's "
        "technical reviewer — starts from three files and knows where everything is.",
    ]),
    Spacer(1, 3),
    Paragraph("The pipeline that runs on every push", H2),
    table([
        ["Stage", "What it proves"],
        ["build · lint · typecheck · unit", "TypeScript strict with zero <font face='Courier'>any</font>; "
         "lint with zero warnings tolerated"],
        ["integration (real containers)", "Schema, retrieval, routes and the WebSocket body channel "
         "against real infrastructure"],
        ["e2e (real browser vs real soul)", "The kiosk, the portable mode and the operator panel, driven "
         "in Chromium against production entrypoints"],
        ["jobs (dream, whisper on CPU)", "The night job end to end, including a real transcription"],
        ["docker images build", "The images that ship actually build, and contain the bundle they claim"],
        ["android shell (debug apk)", "The APK builds and is published as a rolling release"],
    ], [46 * mm, CW - 46 * mm]),
    source("<font face='Courier'>.github/workflows/ci.yml</font> · "
           "<font face='Courier'>.claudeskills/TESTING_PLAYBOOK.md</font> · "
           "<font face='Courier'>CLAUDE.md</font> (the engineering charter)"),
)

# ══════════════════════════════════════════════════════ 16 · reception
page(
    "THE BUSINESS CASE", "The working pack: a creature that already earns",
    Paragraph(
        "The most direct commercial proof in the repository is not the pet — it is the pet with a job. "
        "<b>Reception</b> is a client-facing assistant: a studio's customers open a voice-first web suite, "
        "ask questions about their own project, and open tickets. The creature answering knows their "
        "repository, their mail thread and their documents, and is the same species as the one at home — "
        "the same soul architecture, a different room.", BODY),
    table([
        ["Design decision", "Why a partner should care"],
        ["The client is not family", "Customers are a separate entity with their own tokens, never beings "
         "in the household. A client can never reach the family's memories, and the panel keeps the two "
         "worlds visibly apart."],
        ["The suite holds no keys", "The public container has no API key and no database connection: it "
         "talks to a narrow backend surface on an isolated network. Compromising the public app yields "
         "nothing worth having."],
        ["Three walls against cost", "An hourly quota per client, a daily ceiling, and an answer cache "
         "keyed by exact and semantic match. A repeated question costs zero tokens and is answered "
         "instantly."],
        ["Knowledge per client", "Their repository is cloned and indexed, a filtered mailbox is read "
         "read-only, and their documents come from private storage — with the filter applied <i>before</i> "
         "indexing, so a shared mailbox only ever yields that client's mail."],
        ["It never advises across clients", "The morning advice loop that cross-references news against "
         "client knowledge is barred from reception by construction: a client must never see the creature "
         "advising somebody else on the basis of their repository."],
    ], [34 * mm, CW - 34 * mm]),
    Spacer(1, 4),
    Paragraph(
        "This matters strategically because it is the first instance of the economic model in the vision: "
        "creatures that are <i>useful</i> as well as loved. The service is the studio's to bill; the "
        "revenue share that feeds the individual creature's piggy bank is designed and not yet wired — we "
        "say which is which.", BODY),
    source("<font face='Courier'>apps/reception/</font> (Next.js, voice-first) · "
           "<font face='Courier'>apps/soul/src/routes/reception.ts</font> · migrations 0016–0018 · "
           "ADR-051 … ADR-055 · deployment runbook <font face='Courier'>docs/OPS_COOLIFY.md §2.7</font>"),
)

# ══════════════════════════════════════════════════════ 17 · competitors
page(
    "THE LANDSCAPE", "Against the competition",
    Paragraph(
        "We track roughly twenty adjacent products across four categories: companion apps (Replika, Nomi, "
        "Kindroid), voice assistants (Alexa+, Home Assistant Assist), social robots (ElliQ, Vector, Loona) "
        "and meeting bots. Each is strong in one column. None occupies ours — and the gap is structural, "
        "not a feature list.", BODY),
    table([
        ["", "Companion apps", "Voice assistants", "Social robots", "UGO"],
        ["Persistent emotional state", "Scripted persona", "None", "Animation loops",
         "Six-variable homeostasis with habituation; baselines drift with lived days"],
        ["Long-term memory", "Chat log + summaries", "Shopping lists", "Minimal",
         "Episodic + semantic, temporal validity, nightly consolidation, <b>measured recall</b>"],
        ["Data ownership", "Their cloud", "Their cloud", "Vendor cloud",
         "Family's server, family's keys, whole soul exportable"],
        ["Physical presence", "Screen only", "Speaker", "Proprietary hardware",
         "Commodity phone + printed body; ambient sensors and low-voltage actuation"],
        ["Recognises people", "No", "Voice match", "Basic face",
         "Voice 0.63% EER + face 0.98% EER, fused as decisions, consent per being"],
        ["Reproduction &amp; lineage", "—", "—", "—",
         "Litters from real genetics; adoption; birth certificates signed by both parents and "
         "verifiable offline"],
        ["Meetings", "—", "—", "—", "Visible participant with memory across calls"],
        ["Works for a living", "—", "—", "—", "Reception: a deployed, client-facing service"],
        ["Running cost", "Subscription", "Subsidised", "Device + subscription",
         "≈ €1–3/month inference, hard-capped by the guard"],
    ], [28 * mm, 25 * mm, 24 * mm, 26 * mm, CW - 103 * mm], size=7.8, leading=10.2),
    Spacer(1, 5),
    Paragraph("The structural advantage, stated plainly", H2),
    Paragraph(
        "A cloud assistant cannot offer “take the whole soul home” because its soul <i>is</i> its service: "
        "there is no state to hand over, only an account. Ours has been a portable, encrypted, "
        "family-keyed database since the first commit — which also means that when conversations with an "
        "assistant become a subpoena target and an advertising asset, we are on the right side of that "
        "shift by construction rather than by promise.", BODY),
    source("<font face='Courier'>docs/BACKLOG.md</font> — competitive sweeps of 2026-08-10 and 2026-08-16, "
           "kept as versioned work items rather than a slide"),
)

# ══════════════════════════════════════════════════════ 18 · gaps
page(
    "THE LANDSCAPE", "Where they are ahead, and what we are doing about it",
    Paragraph(
        "This is the page most decks do not have. We keep the competitive gap analysis as a versioned "
        "backlog, one item per commit, and most of what the sweep found is already closed at zero "
        "marginal cost — because the hardware is already paid for and the local models sit idle most of "
        "the day.", BODY),
    Paragraph("Closed since the last sweep, at no additional running cost", H2),
    table([
        ["Capability", "How it was closed"],
        ["Group conversation", "On the home channel the thread belongs to the <i>room</i>: the creature "
         "re-reads everyone's turns with the speaker's name in front and follows a multi-party conversation."],
        ["Image input", "A photo is downscaled on the device, described by a local vision model, and only "
         "the <i>description</i> reaches the provider — the pixels never leave the house and are never stored."],
        ["Local speech to text", "Whisper on CPU behind the perception service, with a relative-floor "
         "utterance gate; the browser engine remains the default until it is measured on a real phone."],
        ["Local voice", "A house voice (Piper) as the middle rung: free, nothing leaves home, with the "
         "expressive premium voice above it and the system voice below."],
        ["Web search, screen reading", "Both on explicit gesture only, answered before the provider is "
         "involved, and barred from reception."],
        ["Tool use, its own way", "Rather than a provider tool framework, requests are <i>nudges</i> that "
         "pass through character: a tired creature obeys grumbling, a stressed one refuses — <b>with an "
         "answer</b>, never silently."],
    ], [34 * mm, CW - 34 * mm]),
    Spacer(1, 4),
    Paragraph("Open, deliberate, and scheduled", H2),
    table([
        ["Gap", "The honest status"],
        ["Consumer-grade onboarding", "Competitors install from a store in three minutes. Our Android "
         "shell builds in CI and installs; the native kiosk services — recording with the screen off, "
         "boot start, task lock — are written up and not yet built. <b>This is the biggest single gap.</b>"],
        ["Saying “I don't know”", "Measured and unsolved: no similarity threshold separates answerable "
         "from unanswerable questions on our corpus. It needs a relative criterion or a verification pass; "
         "the benchmark is waiting for it."],
        ["Fully offline chat", "“Local-first” carries an asterisk: without the provider, chat stops. The "
         "local fallback is a scheduled item and the rail already exists — the same local models run the "
         "nightly reflection."],
        ["Facts crowd out episodes", "A measured side effect of per-kind decay: ask “what broke in the "
         "house?” and the top five are all facts. Recorded as a failing test so whoever changes the "
         "ranking learns it from a red build."],
        ["Physical validation", "Battery life across a working day, the printed shells, and the meeting "
         "stack against a live call need the device and the server. The software side of each is done and "
         "the acceptance criteria are written."],
    ], [34 * mm, CW - 34 * mm]),
    source("<font face='Courier'>docs/BACKLOG.md</font> · <font face='Courier'>docs/STATE.md §7</font>"),
)

# ══════════════════════════════════════════════════════ 19 · economics
page(
    "THE BUSINESS", "Economic strategy: we define a species, not a chatbot",
    Paragraph(
        "The strategic bet: the protocol — genome format, birth and death registry, pedigree — is open, "
        "and we operate the institutions around it. Closed, we would own 100% of a small market; open, a "
        "share of every act of an entire species plus the pieces with the highest margin. Six streams, "
        "all with the same incentive: we earn only if the species thrives.", BODY),
    table([
        ["Stream", "Model", "Analogy"],
        ["1 · The registry", "Micro-fees on registry acts: births, transfers, pedigree certificates. "
         "<b>Step one exists</b> — certificates signed by the parents, verifiable offline; the federated "
         "ledger that orders them and stops double-selling is step two. Species data only, never "
         "memories, never personal data.", "Kennel clubs (ENCI / AKC)"],
        ["2 · The foundation kennel", "Every pedigree traces back to UGO-zero, which is ours: the founding "
         "lines are the most prestigious by construction.", "Ferrari"],
        ["3 · The bodies", "Open body protocol, reference hardware ours: shells, docks, and the "
         "self-contained appliance — the soul on a €100 mini-PC in the creature's belly.", "Android / Pixel"],
        ["4 · The fold", "Subscription hosting for families without a home server: encrypted per-family "
         "souls, a provably blind custodian, and a guaranteed right to move out.", "Managed hosting"],
        ["5 · Breeder tooling", "Stable software, line screening, attested biographies, certification and "
         "shows for third-party breeders — customers, not competitors.", "Shopify"],
        ["6 · The working pack", "Creatures that earn their keep, starting with reception. The piggy "
         "bank that receives the attributed share <b>now exists per creature</b>, with two food sources — "
         "affection and work.", "Working animals"],
    ], [30 * mm, CW - 62 * mm, 32 * mm]),
    Spacer(1, 5),
    Paragraph("Why the cost structure is the moat", H2),
    *bullets([
        "<b>No GPU in the critical path.</b> The heavy work — transcription, reflection, embeddings, "
        "voice, face, OCR — is CPU work done at night on hardware already bought. Inference is coffee money.",
        "<b>Commodity hardware.</b> The body is a phone in a shell we print for cents. No custom "
        "electronics to finance, no inventory risk, no supply chain to defend.",
        "<b>Costs are governed by construction.</b> One chokepoint, one ledger, hard ceilings per "
        "household: a runaway bill is not a monitoring problem here, it is architecturally excluded.",
        "<b>Adoption economics, not app churn.</b> A family feeds a being it loves; a business feeds a "
        "being that works. Ten thousand years of domestication suggest which retention curve that is.",
    ]),
    source("<font face='Courier'>docs/VISIONE.md</font> — horizon 0, the six flows"),
)

# ══════════════════════════════════════════════════════ 20 · horizons
page(
    "THE DIRECTION", "Six horizons — and two of them are already code",
    Paragraph(
        "The vision is written down and filtered hard: does it serve the creature, does it respect the "
        "constraints, and is it unclaimed because nobody thought of it — or because it is useless? What "
        "follows passes all three. Two horizons stopped being a plan this month — the species and the "
        "life arc are running code — and the rest still waits its turn: the specification commands, one "
        "phase at a time.", BODY),
    table([
        ["Horizon", "What it means", "The first stone, today"],
        ["1 · A species", "Creatures are born: genomes recombine with mutation, dominance and epistasis; "
         "litters can have more than two parents; compatibility uses N strains rather than two sexes. Pups "
         "inherit character, never memories. Pedigrees make lineage <i>and lived biography</i> verifiable, "
         "so breeding cannot be won by renting servers — a genome without a life on it is a seed, not an "
         "animal. Character is selectable; permissions never are.",
         "<b>Built, this month</b>: the genetic engine, litters, adoption and signed pedigrees. "
         "Open: the federated chain, and births across households"],
        ["2 · The soul relocates", "One soul, a wardrobe of bodies — dock, wearable and meeting bot today; "
         "the van, the house, a plush toy, a robot tomorrow. Every body's senses feed one biography.",
         "Three body contracts already run against one soul in production"],
        ["3 · Knowledge travels", "The dowry: curated knowledge and chosen stories move with the creature "
         "— gifted to a school, passed to a child, or sold with an attested biography — while intimate "
         "memories stay sealed. Third parties' data is filtered out by construction.",
         "Per-family keys, provenance on memories, the erasure machinery reused as curation"],
        ["4 · A society", "Federation between packs: curated memories travel, each house dreams on them, "
         "and culture drifts. Village fairs where creatures meet — and litters are born.",
         "Multi-tenant isolation and the encounter protocol"],
        ["5 · The inviolable confidant", "The soul belongs to the family wherever it sleeps: home server, "
         "self-contained appliance, or our fold — always family-held keys, always a right to leave.",
         "Exportable encrypted soul; the hosting architecture is built"],
        ["6 · A life arc", "Creatures age honestly — plasticity decays, character converges — and complete "
         "at a known span, sealing intimate memories cryptographically while the curated legacy remains. "
         "Scarcity becomes biological; the evolutionary loop closes.",
         "<b>Built, this month</b>: the longevity gene and the plasticity curve the night job already "
         "applies. Deliberately not built: death, which needs key separation and a consent nobody gave"],
    ], [26 * mm, (CW - 26 * mm) * 0.60, (CW - 26 * mm) * 0.40], size=7.6, leading=10),
    source("<font face='Courier'>docs/VISIONE.md</font> — with, on each horizon, the honest note about "
           "what is still only a design"),
)

# ══════════════════════════════════════════════════════ 21 · roadmap
page(
    "THE PLAN", "What happens next",
    Paragraph("The platform's own phases", H2),
    table([
        ["Phase", "Content", "State"],
        ["0 — Foundations", "Monorepo, schema, migrations, containers, CI", "Complete, evidence recorded"],
        ["1 — Minimal soul", "Psyche, memory, guarded chat, prompt caching", "Complete, evidence recorded"],
        ["2 — Home body", "The creature, senses, voice, the WebSocket channel", "Software complete; "
         "on-device validation pending"],
        ["3 — Inner life", "The dream, diary, desires, backups", "Complete, evidence recorded"],
        ["4 — Out and about", "Portable mode, REC, privacy mode, audio pipeline", "Software complete; "
         "battery and mesh need the device"],
        ["5 — Meetings", "Join, live ingest, voice trigger, digest", "Integration complete; a live call "
         "needs the meeting stack deployed"],
        ["6 — Shells", "Parametric dock and wearable, calipers and printer", "Open — needs physical "
         "measurement"],
    ], [28 * mm, (CW - 28 * mm) * 0.52, (CW - 28 * mm) * 0.48]),
    Spacer(1, 5),
    Paragraph("The next period, in priority order", H2),
    table([
        ["Workstream", "Why it is next"],
        ["<b>Finish tenant isolation</b>", "Row-level security is in place but inert until every surface "
         "runs through the scoped connection. It is the precondition for hosting anybody else's creature — "
         "which is revenue stream 4."],
        ["<b>The native shell</b>", "Recording with the screen off, boot start and task lock turn a web app "
         "into an appliance. It is the difference between a project and a product somebody's parent can use."],
        ["<b>The printed bodies</b>", "Dock and wearable, with branding and a scannable QR. The creature "
         "becomes an object, and the object is the marketing."],
        ["<b>Independence from the provider</b>", "A local chat fallback removes the last asterisk from "
         "“local-first” and makes the appliance genuinely self-contained."],
        ["<b>The registry, in its first federated form</b>", "The protocol is the business. Publishing the "
         "genome format and the first registrar node opens the ecosystem — and the fee base with it."],
    ], [42 * mm, CW - 42 * mm]),
    source("<font face='Courier'>docs/PROGETTO.md §8</font> (phases and acceptance criteria) · "
           "<font face='Courier'>docs/BACKLOG.md</font> (groups) · "
           "<font face='Courier'>docs/STATE.md</font> (current state, updated every task)"),
)

# ══════════════════════════════════════════════════════ 22 · partnership
page(
    "WORKING TOGETHER", "What we bring, what we seek",
    Paragraph("What OmegaNodes.ai brings", H2),
    *bullets([
        "<b>A working platform, not a prototype.</b> Six phases verified against real infrastructure, "
        "954 automated tests, a green pipeline, deployment runbooks, a user manual, and a decision log "
        "that includes the mistakes.",
        "<b>A position competitors cannot copy without rebuilding.</b> The family-owned, exportable soul "
        "is structurally unavailable to cloud incumbents; the species-and-registry model turns openness "
        "into the revenue base rather than a giveaway.",
        "<b>A deployed commercial surface.</b> Reception serves the studio's own clients today, on the "
        "same architecture, with the cost walls already in place.",
        "<b>Cost discipline as a design property.</b> No GPU, commodity hardware, one guarded chokepoint. "
        "The unit economics work at one creature and improve with volume.",
        "<b>A way of working that scales past its founders.</b> Everything is written down where the next "
        "engineer looks first — which is also what let this brief be assembled from the code itself.",
    ]),
    Spacer(1, 5),
    Paragraph("Where a partner accelerates us", H2),
    table([
        ["Area", "What we are looking for"],
        ["Hardware &amp; distribution", "Shells, docks and the self-contained appliance at volume; retail "
         "and operator channels. We have the design constraints and the printing pipeline; we do not have "
         "manufacturing scale."],
        ["Hosting at scale", "The fold: managed, provably blind infrastructure for families without a home "
         "server. The multi-tenant architecture exists; the operations organisation does not."],
        ["Vertical deployments", "The working pack beyond our own studio — receptions, shops, practices "
         "that want a companion who knows their business."],
        ["Capital &amp; ecosystem", "Seeding the first third-party breeders and the registry's federation, "
         "so the species has a second kennel and the protocol becomes genuinely permissionless."],
    ], [36 * mm, CW - 36 * mm]),
    Spacer(1, 6),
    Paragraph("A note to our own team", H2),
    Paragraph(
        "This brief doubles as our north star. The horizons are the work of the coming period, and the "
        "standard it sets is the one we hold ourselves to: every claim on every page here is traceable to "
        "a file in the repository. If a page cannot be sourced, the page is wrong — not the source.", BODY),
    Spacer(1, 10),
    Table([[Paragraph(
        '<font color="#c9a227"><b>OmegaNodes.ai</b></font>  ·  '
        '<font color="#ffffff">info@omeganodes.ai  ·  August 2026</font>',
        st("contact", fontSize=10.5, leading=14, alignment=TA_CENTER, textColor=white))]],
        colWidths=[CW],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), NAVY),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ])),
)

if S and isinstance(S[-1], PageBreak):
    S.pop()

doc.build(S)
print("built", OUT)
