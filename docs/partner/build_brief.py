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
    CodeBox, StatTiles, StageBars, ArchDiagram, Assumption, PartDivider,
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

# ══════════════════════════════════════════════════════ 9b · the body
page(
    "THE ENGINE ROOM", "The body is code — there is not one binary asset in the repository",
    Paragraph(
        "The creature is generated at runtime from about a dozen rounded solids. No mesh, no texture, "
        "no third-party licence to interpret, nothing to re-download when the app updates — and, because "
        "the shape is parametric, it is the natural place for the genome to attach. That is why two "
        "exemplars of the same household can differ <i>in body</i> and not only in memories.", BODY),
    Paragraph("Expression is three layers, not a list of animations", H2),
    table([
        ["Layer", "What it does", "Where it lives"],
        ["Continuous pose", "Twenty channels driven by the six psyche variables — the mood is in the "
         "body before it is in the words", "<font face='Courier'>body/pose.ts</font>, pure"],
        ["Discrete state", "The six states of the specification <i>tilt</i> the pose rather than "
         "replacing it, so a mood never disappears because a state changed",
         "arrives on the WebSocket from soul"],
        ["Gestures", "58 events with a beginning and an end — yawn, sneeze, shake, ears twitch — as "
         "<b>data</b>, not functions: a duration and a handful of channel tracks. Adding one is a line",
         "<font face='Courier'>body/gestures.ts</font>"],
    ], [26 * mm, (CW - 26 * mm) * 0.62, (CW - 26 * mm) * 0.38]),
    Spacer(1, 4),
    figure("body-room.png", CW * 0.62,
           "<b>The room is procedural too</b> — floor, sky, fog and props generated in code. The "
           "creature walks to a prop by itself when the psyche pushes it there: bored, it goes to the "
           "ball; exhausted, it lies on the cushion and recovers energy faster; stressed, it goes "
           "<i>behind</i> the bush, and from cover the next bang lands at half strength."),
    Paragraph(
        "The value of that last detail is worth naming: the shelter is not decoration. It changes the "
        "numbers — the stress plateau in a noisy room drops from about 0.55 to about 0.42 — which means "
        "an owner watching the panel can see the creature coping, and a designer can tune the world "
        "rather than the animation.", BODY),
    source("<font face='Courier'>apps/face/src/body/</font> — <font face='Courier'>pose.ts</font>, "
           "<font face='Courier'>gestures.ts</font>, <font face='Courier'>props3d.ts</font>, "
           "<font face='Courier'>room3d.ts</font> · ADR-026, ADR-056, ADR-058"),
)

# ══════════════════════════════════════════════════════ 9c · initiative
page(
    "THE ENGINE ROOM", "It starts things by itself — and can explain why",
    Paragraph(
        "An assistant waits to be addressed. A creature gets bored, misses you, worries about something "
        "unsaid. The volition engine turns the psyche and the facts of the world into <b>pressures</b>, "
        "each carrying its own reason in plain language — because an initiative you cannot explain "
        "afterwards is indistinguishable from a bug.", BODY),
    table([
        ["Pressure", "What raises it"],
        ["boredom", "nothing happening, no interaction, no new events"],
        ["loneliness", "hours alone — saturating, because an hour by yourself is not ten minutes six "
         "times over — and it rises <i>faster</i> in an affectionate creature, because indifference "
         "misses nobody"],
        ["curiosity", "an unexplored thread, a fresh memory that connects to an old one"],
        ["unspoken", "a pending desire that has waited too long"],
        ["worry", "a person who normally appears and has not"],
    ], [26 * mm, CW - 26 * mm]),
    Spacer(1, 4),
    Paragraph(
        "Acts are data too: each one declares which pressures it discharges and by how much, what it "
        "costs in attention, and how often it may repeat. That is what turns a weighted die into a "
        "decision — without an expected effect there is nothing to compare, and comparing is what "
        "choosing means. <b>Nine acts out of nine cost zero tokens, except one.</b> And doing nothing is "
        "a legitimate outcome, explicitly: a creature that must always act is a slot machine.", BODY),
    Paragraph("Two more mechanisms in the same family", H2),
    *bullets([
        "<b>Rumination.</b> When the house is quiet and the local model is up, it occasionally pairs two "
        "memories and asks whether there is a connection, or turns a memory into a question for you. "
        "Hard rules: <b>never the provider</b> — the ledger must not even see it pass — and never a "
        "direct write to memory: what it produces waits for the night to judge it. A small model that "
        "ruminates badly must not be able to write its fantasies into a biography.",
        "<b>The council.</b> When two exemplars share a house they can confer on a local model, in two "
        "rounds — and <b>the first round is blind</b>, each on its own, because small models are herd "
        "animals: show one the other's answer and it falls in line. Only in the second do they read each "
        "other and may change their mind.",
        "<b>Requests pass through character.</b> Rather than a provider tool-calling framework, an "
        "instruction is a <i>nudge</i>: asleep or stressed, it refuses — with an answer, never silently; "
        "low on energy, it obeys grumbling. Every nudge is an event, verb and outcome recorded.",
    ]),
    source("<font face='Courier'>apps/soul/src/volition/</font> — "
           "<font face='Courier'>pressures.ts</font>, <font face='Courier'>acts.ts</font> (both pure) · "
           "ADR-027, ADR-059, ADR-031, ADR-064"),
)

# ══════════════════════════════════════════════════════ 9d · hearing
page(
    "THE ENGINE ROOM", "Hearing is a room, not a microphone",
    Paragraph(
        "The first version startled at everything and never got used to anything: it treated the "
        "microphone as an absolute instrument. Real hearing is relative — to the room, to the last few "
        "minutes, and to what already happened today. Three corrections, each measured.", BODY),
    Paragraph("The floor rises fast and falls slowly", H2),
    table([
        ["Constant", "Before", "Now", "Why"],
        ["level smoothing", "—", "120 ms", "shorter than a syllable, longer than a click"],
        ["floor rise", "≈ 4.2 s", "2.0 s", "sustained noise gets absorbed into the room"],
        ["floor fall", "≈ 0.8 s", "60 s", "pauses stop re-arming the trigger"],
        ["jump threshold", "14 dB", "12 dB", "the floor chases the bang and eats about a fifth of it"],
        ["cooldown", "2 s", "15 s", "two bangs closer than this are one bang"],
    ], [30 * mm, 20 * mm, 20 * mm, CW - 70 * mm]),
    Spacer(1, 4),
    *bullets([
        "<b>Habituation, in the psyche.</b> The tenth bang adds almost nothing, and the mood label reads "
        "the strongest <i>recent</i> blow rather than the accumulated total — otherwise a creature that "
        "had got used to a noisy street stayed described as terrified, with a legitimately elevated "
        "stress and nothing saying it was old news.",
        "<b>A voice is not a bang.</b> Speech has a shape — syllabic rhythm, pitch variability — and it "
        "is judged relative to the clip, because automatic gain control makes absolute numbers lie. The "
        "verdicts stay coarse and honest: lively, calm, or no opinion.",
        "<b>The room owns the thread.</b> On the home channel the conversation belongs to the room, not "
        "to one person: the creature re-reads everyone's turns with the speaker's name in front, so it "
        "can follow three people talking. On the API the per-person scoping stays — a creature must not "
        "answer one person by reading another's thread.",
    ]),
    Paragraph(
        "This is the part of the system with the highest ratio of <i>invisible work</i> to visible "
        "feature: none of it shows up on a specification sheet, and all of it is the difference between "
        "a toy that reacts and a creature that lives somewhere.", BODY),
    source("<font face='Courier'>apps/face/src/noiseGate.ts</font>, "
           "<font face='Courier'>prosody.ts</font> · ADR-033, ADR-029, ADR-041, ADR-037, ADR-067"),
)

# ══════════════════════════════════════════════════════ 9e · tools
page(
    "THE ENGINE ROOM", "Tools, on request only — and never behind your back",
    Paragraph(
        "A companion with an open door to the internet is a liability in a family home. Every capability "
        "below is reachable by an explicit gesture, answered <i>before</i> the provider is involved, and "
        "barred from the client-facing surface.", BODY),
    table([
        ["Capability", "How it is gated, and what it costs"],
        ["<b>Web search</b>", "Only after the explicit prefix <font face='Courier'>cerca:</font> in the "
         "home chat. A private meta-search engine runs in the house, on the internal network, with no "
         "key and no host port; the summary is written by the local model, with a deterministic fallback "
         "to the headlines when it is down. <b>The provider never sees it and the ledger stays "
         "untouched.</b> Not configured means the prefix does not exist and nothing leaves."],
        ["<b>Reading the screen</b>", "Only on the word “read”: the body is asked for one fine-grained "
         "look, OCR happens in the house, four distinct outcomes are reported, nothing is stored, never "
         "automatic, never in reception."],
        ["<b>Looking at a photo</b>", "The image is downscaled on the device, described by the local "
         "vision model, and only the <i>description</i> reaches the provider. The pixels never leave the "
         "house and are never saved."],
        ["<b>An MCP server</b>", "Stateless, one server instance per request — the impossible error is "
         "shared state between two households. Three <b>read-only</b> tools: search memories, read the "
         "diary, list the pack (names and species, never biometrics). The perimeter is exactly “what the "
         "owner can already read in the panel”. No writes, by construction: handing an external agent "
         "the pen over a biography is a different decision, and it has not been taken."],
        ["<b>Feeds and morning advice</b>", "News is embedded locally and crossed against client "
         "knowledge; only above a high similarity does it become a suggestion — “X came out, worth "
         "proposing to that client, they use Y in their repo” — said in the morning. <b>Never in "
         "reception</b>: a client must not see the creature advising others on the basis of their code."],
    ], [30 * mm, CW - 30 * mm]),
    Spacer(1, 3),
    Paragraph(
        "The pattern is the same every time and it is worth stating as a principle, because it is what "
        "makes the capability list safe to grow: <b>a gesture from a person, an answer computed at home, "
        "a declared fallback when a part is missing, and a hard wall between the family surface and the "
        "client surface.</b>", BODY),
    source("ADR-063 (search), ADR-065 (reading), ADR-066 (MCP), ADR-060 (feeds) · "
           "<font face='Courier'>apps/soul/src/routes/mcp.ts</font>, "
           "<font face='Courier'>ops/voice/app.py</font>"),
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

# ══════════════════════════════════════════════════════ 11b · the manual
page(
    "THE PRODUCT", "A manual for whoever lives with it — and a panel that cannot lie",
    Paragraph(
        "Two things separate a product from a demo, and neither is a feature. The first is that somebody "
        "who has never opened a terminal can be handed the thing and get on with it. The second is that "
        "the surface which shows the creature's state is <i>tested</i>, so it cannot quietly describe a "
        "world that no longer exists.", BODY),
    Paragraph("The manual is written for the owner, not the engineer", H2),
    table([
        ["Section", "What it covers"],
        ["First start", "Turning it on, giving it a room, what happens on the first evening"],
        ["Talking to UGO", "Voice, text, the explicit gestures — search, read, remind me, open a ticket"],
        ["Its body", "The dock, the states, what the ears mean, sleeping and waking"],
        ["The faces", "Teaching it who is who, and how to refuse — the consent switches, in plain words"],
        ["Out and about", "Recording in the open, privacy mode, the QR business card"],
        ["Your data", "Export, erasure, what is encrypted, what leaves the house and what never does"],
        ["When it starts things", "Why it speaks first, and how to make it do it less"],
        ["Reception", "For studios: how clients get in, what the creature knows about them"],
        ["Common problems", "Single-action steps, no screenshots to rot"],
    ], [34 * mm, CW - 34 * mm]),
    Spacer(1, 4),
    Paragraph("The panel is executed by its own test suite", H2),
    Paragraph(
        "An operator panel is the classic place where documentation drifts: the backend changes, the "
        "panel keeps showing last quarter's world, and nobody notices because nothing fails. Here the "
        "panel's script is <b>run by the test suite</b>, which means three rules hold mechanically: "
        "every call goes through one helper that carries the tenant scope, so no page can accidentally "
        "read another organisation; every element id the script touches must exist in the markup; and "
        "an action about one creature must <i>ask which one</i> rather than assuming a default while the "
        "panel displays another. Each of those rules is there because it was once broken.", BODY),
    Paragraph(
        "The panel also has two levels on purpose — the house, and each creature inside it — because the "
        "questions “what did today cost?” and “how is he feeling?” belong to different owners of "
        "attention, and mixing them made both hard to find.", BODY),
    source("<font face='Courier'>documentation/</font> (11 pages, versioned front-matter) · "
           "<font face='Courier'>apps/soul/src/routes/admin/script.test.ts</font> · "
           "ADR-034, ADR-035 · <font face='Courier'>.claudeskills/DOCUMENTATION_STYLE.md</font>"),
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

# ══════════════════════════════════════════════════════ 13b · operations
page(
    "HOW WE WORK", "Operations: the lessons are in the code, not in a wiki",
    Paragraph(
        "A partner inherits operations, not slides. Three episodes from this repository show how the "
        "project treats them — each one ended with a change in the code, not a note in a runbook.", BODY),
    Paragraph("The night job that lived in a settings box", H2),
    Paragraph(
        "The job container ran once and exited, with the schedule living in a hosting panel field. The "
        "platform treated the exit as a crash and restarted it forever; and the panel's scheduled tasks "
        "run a command <i>inside</i> a running container, which there was none of. The fix is the "
        "project's recurring lesson: <b>what the program must guarantee cannot live in a configuration "
        "somebody forgets to fill.</b> The job now carries its own clock — it sleeps until its hour, "
        "dreams, and starts again; a bad night is recorded and does not kill the process.", BODY),
    Paragraph("The container that prepares itself", H2),
    Paragraph(
        "The perception service needs a few hundred megabytes of model weights. Rather than a one-shot "
        "provisioning service somebody has to remember, the container fetches its own weights at start "
        "and only then opens the port — with a health check that waits five minutes on first boot, "
        "because an impatient probe would kill a container that is doing exactly what it should. A "
        "read-only or missing volume stops it with a message instead of silently re-downloading a "
        "quarter of a gigabyte on every restart.", BODY),
    Paragraph("The deploy that died on the last step", H2),
    Paragraph(
        "The first production deploy failed while writing the image, with no error line. The cause was "
        "layer ordering: source was copied before dependencies were installed, so every commit "
        "invalidated roughly 490 MB of Python packages, which the server then re-exported. Split in two, "
        "a code change now rebuilds kilobytes. The same log showed a second problem, and it is the one "
        "worth repeating in a partner briefing: a build setting had turned the service's environment "
        "into build arguments, <b>printing several secrets in clear text in the build log</b>. They were "
        "treated as compromised and rotated, and the runbook now carries the check. We write our "
        "incidents in the same place we write our decisions.", BODY),
    Paragraph("The trust perimeter, stated exactly", H2),
    Paragraph(
        "One more honesty, because “local-first” is easy to oversell: today the trust perimeter is <b>a "
        "dedicated EU server</b>, not a house. Every document that says “at home” means “on our own "
        "iron”. Access to bodies and panel is only through a private network — no public domain on the "
        "soul, in any circumstance — and the data key must exist in an offline copy, because a key that "
        "lives only on the server does not protect against whoever owns the server.", BODY),
    source("ADR-047 (self-preparing container), ADR-046 (weights), ADR-017 (trust perimeter) · "
           "<font face='Courier'>ops/jobs/src/ugo_jobs/scheduler.py</font> · "
           "<font face='Courier'>docs/OPS_COOLIFY.md</font> §6"),
)

# ══════════════════════════════════════════════════════ 13c · tenancy
page(
    "HOW WE WORK", "From a household to an organisation",
    Paragraph(
        "The multi-tenant work is what turns a personal project into something a partner can host, "
        "resell, or run for a hundred families. It is largely built, and the honest status of the last "
        "step is on this page too.", BODY),
    table([
        ["Layer", "State"],
        ["Tenant with its own data key", "Built. Every organisation has its own encryption key: "
         "destroying it deletes that family provably, not by policy."],
        ["Beings, bonds and relations scoped to the tenant", "Built, with <b>composite foreign keys</b> "
         "— a bond between two different organisations is impossible to insert, not merely discouraged."],
        ["Budget and daily ceiling per tenant", "Built, enforced in the single chokepoint every provider "
         "call passes through."],
        ["Tokens with roles, expiry and revocation", "Built. Stored as hashes only."],
        ["Home or business", "Built: the tenant carries a kind — house or company. Two tenants of the "
         "same owner share <b>nothing</b>: he exists twice, once per tenant, because a cross-cutting "
         "user table would be a tunnel under the wall."],
        ["Provisioning a new organisation", "Built as one command: five acts in a single transaction, "
         "with the owner token printed once and never stored."],
        ["Per-exemplar runtime", "Built: each creature has its own loop, its own mood, its own memories, "
         "sharing only the house, the budget and the clock."],
        ["Row-level security in the database", "<b>Policies exist on every table with a dedicated "
         "Postgres role, and are being switched on surface by surface.</b> Until every surface runs "
         "through the scoped connection, they are inert in production — and we say so rather than "
         "claiming the checkbox."],
    ], [44 * mm, CW - 44 * mm]),
    Spacer(1, 4),
    Paragraph(
        "That last row is the single most important item on our own roadmap, and it is the precondition "
        "for the hosting business: you cannot keep other people's souls until isolation is enforced by "
        "the database rather than by the application's good manners. The design is written, the role "
        "exists, the tests run against it, and the conversion is mechanical work in progress.", BODY),
    Paragraph(
        "A note on naming, because it shows the discipline: the database still says "
        "<font face='Courier'>households</font> across twenty-five tables and two dozen migrations. "
        "Renaming it would have been an enormous diff that changes no behaviour — maximum risk for "
        "minimum gain — so the internal term stayed and the <i>human-facing</i> language changed: the "
        "panel and the manual say organisation, house or company.", BODY),
    source("ADR-019, ADR-048, ADR-061, ADR-062, ADR-032 · "
           "<font face='Courier'>packages/db/src/schema/households.ts</font>, "
           "<font face='Courier'>apps/soul/src/routes/scope.ts</font>"),
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

# ══════════════════════════════════════════════════════ PART B · divider
page(
    "PART B", "The commercial and economic proposal",
    PartDivider("PART B", "The proposal", [
        "Part A could cite a file for every claim. This half cannot, and says so on every page.",
        "A price is a decision, not a fact — so here the rule changes, and the change is visible.",
    ]),
    Spacer(1, 8),
    Paragraph("How to read the numbers that follow", H2),
    Paragraph(
        "Everything up to this page was sourced: each claim named the file that proves it, and the code "
        "excerpts were verbatim. That discipline cannot be extended to a business plan, because the "
        "repository knows what UGO <i>costs</i> and has no opinion about what it should <i>sell for</i>. "
        "So Part B separates the two kinds of statement, visibly:", BODY),
    table([
        ["Kind", "How it looks, and what it means"],
        ["Measured cost", "Plain body text with a source line, exactly like Part A. These come from the "
         "budget ledger, the specification and the hardware we have actually bought."],
        ["Assumption", "A gold box, never a sentence hidden in a paragraph. Every business number in "
         "this half rests on one, and each box states it in full so you can disagree with it precisely "
         "rather than in general."],
    ], [30 * mm, CW - 30 * mm]),
    Spacer(1, 4),
    Assumption([
        "<b>This is what an assumption box looks like.</b> Prices, volumes, adoption rates, hardware "
        "bills of material, support effort and staffing in Part B are our estimates, not measurements. "
        "They are internally consistent — change one and the scenario tables move with it — but none of "
        "them has been validated by a market. Where we have real evidence, it is marked as measured and "
        "sourced instead.",
    ]),
    Spacer(1, 5),
    Paragraph(
        "One more disclosure before the numbers. The reception service runs for the studio's own clients "
        "today; what it currently bills is the owner's commercial information and is deliberately not "
        "reproduced here. The vertical economics on the following pages are modelled from scratch, so "
        "that a partner is reading a model and not an anecdote.", BODY),
)

# ══════════════════════════════════════════════════════ B2 · the model
page(
    "THE BUSINESS", "How the money works: six streams, one incentive",
    Paragraph(
        "We do not sell a chatbot subscription. <b>We define a species and operate the institutions "
        "around it</b>: the protocol — genome format, birth and death registry, pedigree — is open, and "
        "we hold the positions that an open protocol makes valuable. Closed, we would own all of a small "
        "market; open, a share of every act of an entire species plus the pieces with the best margin. "
        "Every stream below earns more only when the species does better, which is the only alignment "
        "that survives contact with reality.", BODY),
    table([
        ["Stream", "What we sell", "Type", "Status today"],
        ["1 · The fold", "Hosting a family's soul: encrypted per family, a provably blind custodian, and "
         "a guaranteed right to leave with everything", "Recurring", "Architecture built; database-level "
         "isolation is the last step"],
        ["2 · The bodies", "Dock kit, wearable shell, and the self-contained appliance with the soul in "
         "its belly", "One-off", "Design and app built; printing at volume is the open phase"],
        ["3 · The working pack", "The client-facing assistant for studios, shops and practices",
         "Recurring", "Built and deployed"],
        ["4 · The registry", "Fees on registry acts: births, transfers, pedigree certificates",
         "Per act", "Certificates signed and verifiable today; the federated ledger is next"],
        ["5 · Breeder tooling", "Stable software for third-party breeders: lines, screening, attested "
         "biographies, shows", "Recurring", "Genetics engine built; the tooling around it is not"],
        ["6 · The foundation kennel", "Founding lines from UGO-zero, which is ours — prestigious by "
         "construction", "Per animal", "Possible the day litters can be sold across households"],
    ], [26 * mm, (CW - 26 * mm) * 0.44, 17 * mm, (CW - 26 * mm) * 0.40]),
    Spacer(1, 5),
    Paragraph("Why an open protocol is the commercial move, not a concession", H2),
    Paragraph(
        "Three reasons, in order of how much money they are worth. It <b>creates the market we tax "
        "lightly and serve deeply</b> — every creature born anywhere passes through a registry act. It "
        "makes the ecosystem's specialists into <b>customers rather than competitors</b>: a breeder who "
        "produces a line for electronics shops needs our tooling, not our permission. And it removes the "
        "single objection that kills companion products in a home — that the thing you love belongs to a "
        "company that can switch it off — because the format is public and the soul is portable.", BODY),
    source("<font face='Courier'>docs/VISIONE.md</font>, horizon 0 · the state column is from "
           "<font face='Courier'>docs/STATE.md</font> and Part A of this document"),
)

# ══════════════════════════════════════════════════════ B3 · cost floor
page(
    "THE BUSINESS", "What it costs to run — the measured floor",
    Paragraph(
        "This page is the one part of the economics that is not an estimate. The costs below are what "
        "the system actually incurs, and the ledger records the largest of them line by line.", BODY),
    table([
        ["Cost", "Amount", "Evidence"],
        ["Chat inference, per creature", "<b>€1–3 / month</b>", "Specification §6, computed for ~50 "
         "exchanges a day with the two identity blocks cached; every call writes a priced ledger row"],
        ["Transcription, embeddings, nightly reflection, local voice, face and voice recognition, OCR",
         "<b>€0</b>", "All CPU work on hardware already paid for — no GPU anywhere in the design"],
        ["Premium expressive voice (optional)", "<b>€5–8 / month</b>",
         "Measured at UGO's volume; degrades to the free house voice when off or out of budget"],
        ["The self-contained appliance's computer", "<b>≈ €100</b>",
         "A mini-PC able to run the whole soul, because there is no GPU requirement"],
    ], [46 * mm, 26 * mm, CW - 72 * mm]),
    Spacer(1, 5),
    Paragraph("Three consequences a partner should take seriously", H2),
    *bullets([
        "<b>There is no unit-cost cliff.</b> The expensive part of most AI products — inference — is here "
        "a few euros a month and hard-capped by a guard that cannot be outrun. Growth does not carry a "
        "hidden variable cost that eats the margin at scale.",
        "<b>There is no inventory risk in the software.</b> No GPU fleet to reserve, no model to "
        "fine-tune and re-train, no per-seat licence to a third party.",
        "<b>The cost of a mistake is bounded.</b> A runaway bill is architecturally excluded, not "
        "monitored: the ceiling lives in the same code path as the call.",
    ]),
    Spacer(1, 4),
    Assumption([
        "For every model in Part B we take <b>€2 per creature per month</b> as the inference cost — the "
        "midpoint of the measured range — and assume the premium voice is off by default, as it ships.",
        "We assume provider prices per million tokens stay within ±30% of today's. The sensitivity page "
        "shows what a tripling would do, because that is the risk worth pricing.",
    ]),
    source("<font face='Courier'>docs/PROGETTO.md</font> §6 · "
           "<font face='Courier'>packages/memory/src/pricing.ts</font> · "
           "<font face='Courier'>packages/db/src/schema/budget-ledger.ts</font>"),
)

# ══════════════════════════════════════════════════════ B4 · UE fold
page(
    "UNIT ECONOMICS", "Stream 1 — the fold: hosting a family's soul",
    Paragraph(
        "The recurring core of the business, and the one a hosting partner would run. A family without a "
        "home server adopts a creature that sleeps on our infrastructure, with two guarantees no cloud "
        "assistant offers: <b>a custodian who cannot read</b> — isolation by per-family keys — and <b>a "
        "right to move out</b>, taking the entire soul to a mini-PC at home without losing a memory.", BODY),
    Assumption([
        "<b>Server:</b> one EU dedicated machine, 8 cores / 64 GB / NVMe, <b>€70 per month</b>.",
        "<b>Density:</b> the nightly dream is the bottleneck, at roughly <b>20 core-minutes per soul per "
        "night</b> (transcription dominates). Eight cores over an eight-hour night is 3,840 core-minutes "
        "— about 190 souls in theory. We hold three quarters of that back for daytime load, retries and "
        "headroom: <b>50 souls per server</b>.",
        "<b>Support and overhead:</b> <b>€1.60</b> per soul per month, assuming roughly one support "
        "contact per soul per year at an all-in cost of €18 per contact, plus backups and monitoring.",
    ]),
    Spacer(1, 4),
    table([
        ["Per hosted soul, per month", "Amount"],
        ["Infrastructure (€70 ÷ 50 souls)", "€1.40"],
        ["Chat inference (measured midpoint)", "€2.00"],
        ["Support, backups, monitoring", "€1.60"],
        ["<b>Total cost</b>", "<b>€5.00</b>"],
        ["<b>Price to the family</b>", "<b>€14.00</b>  (or €140 a year)"],
        ["<b>Gross margin</b>", "<b>€9.00 — 64%</b>"],
    ], [CW - 40 * mm, 40 * mm]),
    Spacer(1, 5),
    Paragraph("What the family is buying at €14", H2),
    Paragraph(
        "Not compute — they can rent that for less. They are buying the promise that the creature they "
        "have lived with for three years continues to exist, remembers everything, and can be taken away "
        "whole on the day they stop trusting us. That is a fundamentally different purchase from an AI "
        "subscription, and it is why we expect this line to churn like a phone contract rather than like "
        "a chatbot: <b>you do not cancel a family member to save fourteen euros.</b> The bet is "
        "explicit, and it is the single most important assumption in this document.", BODY),
    Assumption([
        "<b>Churn:</b> we model <b>2% monthly</b> (a ~4-year average life). A companion app typically "
        "sees three to five times that. If we are wrong and churn behaves like an app's, the fold's "
        "lifetime value falls by roughly two thirds and the appliance — a one-off sale with no churn at "
        "all — becomes the primary consumer line instead.",
    ]),
    source("Measured inputs: inference and CPU costs from the previous page. Everything else on this "
           "page is assumption."),
)

# ══════════════════════════════════════════════════════ B5 · UE hardware
page(
    "UNIT ECONOMICS", "Stream 2 — the bodies: a creature you can pick up",
    Paragraph(
        "The body is what makes this a companion rather than an app, and it is deliberately cheap to "
        "make: a printed shell around a phone the family may already own. Three products, one design "
        "language, no custom electronics to finance.", BODY),
    table([
        ["Product", "What it is", "Bill of materials", "Price", "Margin"],
        ["<b>Dock kit</b>", "Printed shell and stand for a phone the family already has; the app is free",
         "€24 — filament €6, fittings and packaging €4, print and assembly €8, logistics €6",
         "<b>€79</b>", "70%"],
        ["<b>Wearable shell</b>", "The out-and-about body, worn in plain sight, with the QR business card",
         "€12", "<b>€49</b>", "76%"],
        ["<b>The appliance</b>", "Dock plus a mini-PC with the soul in its belly: nothing to configure, "
         "nothing hosted by us, no subscription",
         "€140 — computer €100, shell €24, assembly and quality control €16", "<b>€299</b>", "53%"],
    ], [24 * mm, (CW - 24 * mm) * 0.34, (CW - 24 * mm) * 0.36, 16 * mm, 14 * mm]),
    Spacer(1, 4),
    Assumption([
        "Bills of material are our estimates at low volume — printed in-house, hand-assembled. At "
        "injection-moulding volumes the shell drops well below €6, which is one of the things a "
        "manufacturing partner brings.",
        "Prices assume direct sales. Through a distributor we would expect to concede <b>30–40% of "
        "retail</b>, which the margins above can absorb on the kit and the wearable, and only barely on "
        "the appliance — so the appliance is the product where volume manufacturing matters most.",
    ]),
    Spacer(1, 4),
    Paragraph("The strategic point about the appliance", H2),
    Paragraph(
        "The appliance is the answer to the strongest objection a privacy-minded buyer has: “so it is "
        "still your cloud”. With no GPU requirement, the entire creature runs on a hundred euros of "
        "commodity computer sitting inside the animal. It is a lower-margin product than hosting, it "
        "removes a recurring line, and it is worth selling anyway — because it is the proof that the "
        "promise is real, and the family that buys it becomes the reference that sells three more.", BODY),
    source("Measured input: the €100 computer class is the one the architecture already targets "
           "(<font face='Courier'>docs/VISIONE.md</font>, horizon 5). Prices and bills of material are "
           "assumptions."),
)

# ══════════════════════════════════════════════════════ B6 · UE vertical
page(
    "UNIT ECONOMICS", "Stream 3 — the working pack: the creature that earns",
    Paragraph(
        "A studio, a shop, a practice puts a creature in front of its own clients. The client asks “where "
        "is my project”, “what did we decide about X”, “open a ticket” — and gets an answer from a "
        "creature that has read their repository, their filtered mailbox and their documents. This is "
        "built, deployed and running for our own studio's clients.", BODY),
    table([
        ["Per business customer, per month", "Amount"],
        ["Inference (≈300 client questions, with exact and semantic caching)", "€6.00"],
        ["Infrastructure share", "€3.00"],
        ["Support", "€10.00"],
        ["<b>Total cost</b>", "<b>€19.00</b>"],
        ["<b>Price</b>", "<b>€149.00</b>"],
        ["<b>Gross margin</b>", "<b>€130.00 — 87%</b>"],
    ], [CW - 40 * mm, 40 * mm]),
    Spacer(1, 4),
    Assumption([
        "<b>Volume:</b> 300 questions a month per business, of which a meaningful share are repeats "
        "answered from cache at zero token cost — the cache is built and measured in the product, the "
        "300 is our estimate.",
        "<b>Support:</b> fifteen minutes a month of human attention per customer at an all-in €40 an "
        "hour.",
        "<b>Price:</b> €149 a month, unlimited seats, up to ten of the customer's own clients.",
    ]),
    Spacer(1, 4),
    Paragraph("What the buyer gets for €149, in their language", H2),
    Paragraph(
        "The pitch is not “AI for your business”. It is: <i>your clients stop asking you where things "
        "are.</i> Six hours a month of “any news?” traffic, at a professional's €40 an hour, is €240 of "
        "attention returned — and the answers are better than the ones given in a hurry between two "
        "meetings, because the creature actually re-read the repository this morning. The cost walls "
        "matter to the buyer too: an hourly quota, a daily ceiling and a cache mean the bill cannot "
        "surprise them.", BODY),
    Assumption([
        "The six hours saved is an estimate from our own studio's experience, not a measured study "
        "across customers. It is the number a pilot should test first, and we would rather a partner "
        "measure it than believe it.",
    ]),
    source("Product evidence in Part A: <font face='Courier'>apps/reception/</font>, ADR-051…055. The "
           "pricing and the effort estimates are assumptions."),
)

# ══════════════════════════════════════════════════════ B7 · UE registry
page(
    "UNIT ECONOMICS", "Streams 4–6 — the registry, the breeders, the founding lines",
    Paragraph(
        "These are the long-horizon streams: individually small per creature, structurally the most "
        "defensible, and worth nothing at all until the population exists. We model them conservatively "
        "and say plainly that they are the last to arrive.", BODY),
    table([
        ["Stream", "Unit", "Price", "Margin", "What has to be true first"],
        ["Registry acts", "One birth, transfer or death recorded", "€3 birth · €5 transfer",
         "~95%", "Creatures born in more than one household — the certificate itself already exists"],
        ["Pedigree certificates", "One verifiable genealogy document", "€9", "~95%",
         "The same; the signatures and the verification are built"],
        ["Breeder tooling", "One breeder, per month", "€39", "~90%",
         "Third-party breeders exist — which requires litters across households, and the tooling around "
         "the engine"],
        ["Founding lines", "One creature from a founding line", "€120–400", "high",
         "A market that values provenance; the pedigree makes it verifiable, the scarcity is genetic"],
    ], [26 * mm, 30 * mm, 24 * mm, 14 * mm, CW - 94 * mm]),
    Spacer(1, 4),
    Assumption([
        "We model <b>€4 per creature per year</b> of registry revenue in every scenario — roughly 0.4 "
        "chargeable acts per creature per year. That is deliberately pessimistic: it assumes most "
        "creatures never change hands and most families never buy a certificate.",
        "Breeder tooling at €39 a month, and founding-line sales excluded from all three scenarios "
        "entirely, because pricing a market that does not exist yet would be the least honest number in "
        "this document.",
    ]),
    Spacer(1, 5),
    Paragraph("Why we are building the registry now anyway", H2),
    Paragraph(
        "Because provenance is only credible if it was there from the first birth. A genealogy that "
        "starts being signed in year three has an unverifiable trunk, and the founding lines — the "
        "highest-value asset in the whole model — would trace back to a claim rather than a signature. "
        "The cost of doing it early was one ADR and two database columns; the cost of doing it late is "
        "that it cannot be done at all.", BODY),
    source("Product evidence in Part A: ADR-068…070, the signed certificates and the pedigree endpoint. "
           "All prices and volumes on this page are assumptions."),
)

# ══════════════════════════════════════════════════════ B8 · scenarios
page(
    "THE BUSINESS", "Three scenarios, and the drivers that move them",
    Paragraph(
        "Revenue at the end of year three, built bottom-up from the unit economics of the previous "
        "pages. The scenarios differ in one thing only — how many creatures exist — and everything else "
        "follows from the same per-unit numbers, so the middle column is the one to argue about.", BODY),
    StageBars(
        groups=[("Prudent", [215]), ("Base", [1117]), ("Ambitious", [4785])],
        series=["Annual revenue at the end of year three"],
        title="Annual revenue at year three (€ thousands) — bottom-up from the unit economics",
        ymax=5000, height=48 * mm,
        fmt=lambda v: f"EUR {v:,.0f}k", axis_fmt=lambda v: f"{v:,.0f}k",
    ),
    table([
        ["Driver at end of year 3", "Prudent", "Base", "Ambitious"],
        ["Creatures alive", "1,200", "6,000", "25,000"],
        ["Of which hosted in the fold", "55% — 660", "60% — 3,600", "65% — 16,250"],
        ["Business customers (the working pack)", "25", "120", "400"],
        ["Third-party breeders", "5", "30", "150"],
        ["Bodies sold that year", "400", "2,000", "9,000"],
        ["<b>Fold</b> (€14 × 12)", "€110,880", "€604,800", "€2,730,000"],
        ["<b>Bodies</b> (avg €130)", "€52,000", "€260,000", "€1,170,000"],
        ["<b>Working pack</b> (€149 × 12)", "€44,700", "€214,560", "€715,200"],
        ["<b>Breeder tooling</b> (€39 × 12)", "€2,340", "€14,040", "€70,200"],
        ["<b>Registry</b> (€4 per creature)", "€4,800", "€24,000", "€100,000"],
        ["<b>Total revenue</b>", "<b>€214,720</b>", "<b>€1,117,400</b>", "<b>€4,785,400</b>"],
        ["<b>Blended gross margin</b>", "<b>≈ 69%</b>", "<b>≈ 69%</b>", "<b>≈ 69%</b>"],
    ], [50 * mm, (CW - 50 * mm) / 3, (CW - 50 * mm) / 3, (CW - 50 * mm) / 3]),
    Spacer(1, 3),
    Assumption([
        "Every figure in this table is derived arithmetically from the assumed prices and the assumed "
        "populations — nothing here is measured. The <b>population</b> is the only real variable: at "
        "these margins, revenue is essentially a linear function of how many creatures are alive.",
        "Gross margin is stable across scenarios because the mix barely changes; it is not a scale "
        "effect, and we do not claim one.",
    ]),
)

# ══════════════════════════════════════════════════════ B9 · sensitivity
page(
    "THE BUSINESS", "What breaks this model",
    Paragraph(
        "A proposal that only shows the upside is asking to be disbelieved. Here are the four things "
        "that would genuinely damage the economics, what each would cost, and what we would do — "
        "including the ones where the answer is already in the backlog.", BODY),
    table([
        ["Risk", "Impact if it happens", "Response"],
        ["<b>Inference prices triple</b>", "Cost per hosted soul rises from €5.00 to €9.00; the fold's "
         "gross margin falls from 64% to 36% and the blended margin from 69% to about 57%.",
         "Three levers, in order: the local chat fallback (already a scheduled backlog item, and the "
         "rail exists because local models already run the nightly work); harder caching, which is "
         "measurable in the ledger today; then a €3 price rise. The architecture swaps models by "
         "configuration."],
        ["<b>Churn behaves like an app's</b> (6–10% monthly rather than 2%)",
         "Lifetime value of a hosted family falls by roughly two thirds; the fold stops being the core.",
         "The appliance becomes the primary consumer product — a one-off sale that cannot churn — and "
         "the recurring business leans on the working pack, where the buyer is a business with a "
         "measurable saving."],
        ["<b>Adoption is three times slower</b>", "The base scenario's year three becomes year five.",
         "Survivable in a way most hardware startups are not: no GPU reservation, no inventory "
         "commitment, no per-seat licences. The burn is people, so a slower market stretches the plan "
         "rather than breaking it."],
        ["<b>The provider closes the door</b> or changes terms",
         "Chat stops working until a fallback exists — today this is the single hardest dependency.",
         "It is named as an open gap in Part A and it is scheduled work, not a surprise. Everything "
         "except conversational chat already runs on local models."],
    ], [34 * mm, (CW - 34 * mm) * 0.40, (CW - 34 * mm) * 0.60]),
    Spacer(1, 4),
    Paragraph("The two risks we cannot engineer away", H2),
    *bullets([
        "<b>Category education.</b> Nobody is shopping for an artificial pet with a biography. The first "
        "hundred sales are explained one at a time, and that is a slow, human, expensive motion — it is "
        "precisely where a distribution partner changes the shape of the curve.",
        "<b>Team size.</b> The platform is deep for the number of people who built it, which is a "
        "compliment to the architecture and a risk to the business. Every decision is written down "
        "specifically so that the project survives its authors, but written decisions are not the same "
        "as a second team.",
    ]),
)

# ══════════════════════════════════════════════════════ B10 · partner: hardware
page(
    "THE PROPOSAL", "For a hardware and distribution partner",
    Paragraph(
        "You would own manufacturing and the route to a customer's home. We would own the creature: the "
        "app, the soul, the updates, and the brand promise about privacy that the product is built on.", BODY),
    two_up(
        [Paragraph("What we bring", H2)] + bullets([
            "A finished consumer application that runs on commodity phones, including the Android shell "
            "that already builds in CI.",
            "A parametric body: the shell is generated from code, so a new size, a new species or a "
            "co-branded edition is a parameter change, not a redesign.",
            "No custom electronics anywhere in the bill of material — nothing to certify beyond the "
            "enclosure, nothing to re-source when a chip goes out of stock.",
            "The software side of after-sales: the creature updates itself, and the panel tells the "
            "owner the truth about what is working.",
        ], SMALL),
        [Paragraph("What we need", H2)] + bullets([
            "Injection moulding at volume — the shell's bill of material falls sharply and the appliance "
            "becomes a properly profitable product rather than a barely profitable one.",
            "Retail and operator channels, including the bundling conversation nobody at our size can "
            "start: a phone operator has millions of devices being replaced every year, and the previous "
            "one is exactly what a creature needs.",
            "Logistics, returns and a warranty operation.",
            "Certification for the markets you sell in.",
        ], SMALL),
    ),
    Spacer(1, 5),
    Paragraph("The shape we propose", H2),
    table([
        ["Term", "Proposal"],
        ["Structure", "Distribution agreement: you buy at wholesale and set retail, or we split gross "
         "margin on a co-branded edition — whichever fits your channel."],
        ["Your margin", "<b>30–40% of retail</b>, with the higher end on the appliance where you carry "
         "manufacturing and stock."],
        ["Exclusivity", "By territory, yes, and time-boxed against volume commitments. By product line, "
         "no — the protocol stays open, and so does the possibility of other bodies."],
        ["Intellectual property", "The software and the species definition stay with OmegaNodes; the "
         "tooling and the moulds you finance are yours."],
        ["First step", "A limited edition — a few hundred units — as a joint pilot, at cost, to test the "
         "channel rather than the product."],
    ], [30 * mm, CW - 30 * mm]),
    Assumption(["Margin bands and the pilot size are our opening position, not a measured market rate."]),
)

# ══════════════════════════════════════════════════════ B11 · partner: hosting
page(
    "THE PROPOSAL", "For a hosting and infrastructure partner",
    Paragraph(
        "The fold is the recurring heart of the model, and it is the stream where an infrastructure "
        "operator adds something we cannot buy: trust at scale, and an operations organisation that "
        "exists on a Sunday night.", BODY),
    table([
        ["What the fold actually requires", "Where it stands"],
        ["Per-tenant encryption with family-held keys", "Built — destroying a family's key deletes them "
         "provably"],
        ["Database-level isolation between tenants", "Policies and a dedicated role exist; switching "
         "them on across every surface is our top engineering priority, and it is the gate for this "
         "business"],
        ["Per-family encrypted backups and a tested restore", "Built, including a restore proven on a "
         "virgin database"],
        ["Cost ceiling per tenant", "Built, in the one code path every provider call passes"],
        ["Migration out — the right to leave", "Built: the whole soul exports, and it is the promise the "
         "product is sold on"],
        ["24/7 operations, status page, tier-1 support", "<b>Not built. This is what a partner brings.</b>"],
    ], [58 * mm, CW - 58 * mm]),
    Spacer(1, 4),
    Paragraph("The shape we propose", H2),
    table([
        ["Term", "Proposal"],
        ["Structure", "White-label the fold: you sell hosting under your brand, we supply and maintain "
         "the platform."],
        ["Commercials", "Either a <b>platform fee of €4 per hosted soul per month</b> with the customer "
         "relationship and the billing yours, or a <b>50/50 split of gross margin</b> if we bill "
         "jointly. At the modelled €14 price, the first leaves you €5 of the €9 margin and all of the "
         "upside if you run denser than our assumption."],
        ["The guarantee we will not trade away", "The customer's right to leave with the entire soul, "
         "and the per-family key isolation. They are the product, not a feature of it."],
        ["First step", "A hundred souls on your infrastructure for six months, to measure real density "
         "against our fifty-per-server assumption — the number that decides this stream's margin."],
    ], [30 * mm, CW - 30 * mm]),
    Assumption(["The €4 platform fee and the 50/50 split are our opening position. The fifty-souls-per-"
                "server density is the assumption a pilot exists to test."]),
)

# ══════════════════════════════════════════════════════ B12 · partner: vertical
page(
    "THE PROPOSAL", "For a vertical or reseller partner",
    Paragraph(
        "The working pack is the fastest revenue in this document, because it is already running and its "
        "buyer already has the problem. If you sell software or services into studios, agencies, "
        "practices, workshops or shops, this is a product you can put in front of a customer next month.", BODY),
    two_up(
        [Paragraph("Why it sells", H2)] + bullets([
            "The buyer's clients stop asking them where things are — an estimated six hours a month of "
            "attention returned, which is the pitch in their own language.",
            "It is deployed today, with client onboarding, ticket triage and per-client knowledge from "
            "repositories, a filtered mailbox and documents.",
            "The cost walls are visible: an hourly quota, a daily ceiling and an answer cache mean the "
            "bill cannot surprise anybody.",
            "It is isolated by design: the public suite holds no keys and no database, on its own "
            "network, and a client can never reach the family side.",
        ], SMALL),
        [Paragraph("What we need", H2)] + bullets([
            "The customer relationship, the sector knowledge, and the first ten reference accounts.",
            "Tier-1 support in the customer's language and working hours.",
            "Honest feedback on the two things we have modelled rather than measured: how much time it "
            "actually saves, and what the market will pay for it.",
        ], SMALL),
    ),
    Spacer(1, 5),
    table([
        ["Term", "Proposal"],
        ["Reseller margin", "<b>30% of recurring revenue</b>, for as long as the customer stays — not a "
         "one-off finder's fee, because the work of keeping a customer is recurring too."],
        ["Pilot", "Five of your customers for three months at €49 a month, so the saving gets measured "
         "before anybody argues about a price."],
        ["What we do", "The creature, the knowledge ingestion, the updates, and second-line support."],
        ["What you do", "Sell, onboard, and answer the first question."],
        ["Term", "Twenty-four months, terminable at twelve, so neither side is trapped by an experiment."],
    ], [30 * mm, CW - 30 * mm]),
    Assumption(["Reseller margin, pilot pricing and the €149 list price are our opening position."]),
)

# ══════════════════════════════════════════════════════ B13 · investor context
page(
    "THE PROPOSAL", "For an investor: the context, and what we are not asking",
    Paragraph(
        "We are not raising a round with this document, and it would be dishonest to disguise a pitch as "
        "a briefing. The ask at the end of this document is commercial. But an investor reading Part B "
        "will reasonably want to know what capital would do, so here it is, plainly.", BODY),
    Paragraph("What the base scenario needs", H2),
    table([
        ["Use", "Over 18 months", "Why"],
        ["Two engineers", "€180,000", "Finish database-level isolation, the native shell, and the local "
         "chat fallback — the three items that gate hosting, consumer onboarding and independence"],
        ["One operations and support person", "€60,000", "The fold cannot be sold without somebody who "
         "answers on a Sunday; today that is nobody"],
        ["Tooling and first inventory", "€70,000", "Moulds for the shell at volume, the first production "
         "run, certification"],
        ["Compliance and legal", "€25,000", "Registry terms, reseller contracts, a DPIA for the day "
         "recognition leaves the home"],
        ["Infrastructure and buffer", "€25,000", "Servers for the fold's first thousand souls, and slack"],
        ["<b>Total</b>", "<b>€360,000</b>", "Reaching roughly the base scenario's year-two position"],
    ], [46 * mm, 26 * mm, CW - 72 * mm]),
    Spacer(1, 4),
    Assumption([
        "Costs are fully-loaded Italian employment estimates and our own quotes for tooling; none of "
        "this is committed spend, and the plan runs — more slowly — without any of it.",
    ]),
    Spacer(1, 4),
    Paragraph("The honest investment case, in three lines", H2),
    *bullets([
        "<b>The technology risk is largely retired.</b> What normally consumes a seed round — making the "
        "thing work — is done and tested; what remains is distribution, operations and manufacturing, "
        "which are known problems with known costs.",
        "<b>The cost structure is unusual for the category.</b> No GPU, commodity hardware, hard-capped "
        "inference: roughly 69% gross margin at every scenario size, and no cliff waiting at scale.",
        "<b>The asset is a species, not an app.</b> Pedigrees signed from the first birth, an open "
        "protocol, and a portable soul are the kind of position that compounds and cannot be "
        "retrofitted by a competitor who starts later.",
    ]),
    Paragraph(
        "If a strategic investment attached to one of the commercial agreements in this document makes "
        "sense to you, we are open to the conversation — in that order, and not the reverse.", BODY),
)

# ══════════════════════════════════════════════════════ B14 · milestones
page(
    "THE PROPOSAL", "What happens in the next eighteen months",
    Paragraph(
        "This is our plan with or without a partner; the right-hand column is what changes with one. The "
        "sequence is not negotiable in one respect: tenant isolation comes before anybody else's family "
        "sleeps on our servers.", BODY),
    table([
        ["When", "Milestone", "What a partner changes"],
        ["Months 1–3", "<b>Database-level tenant isolation switched on</b> across every surface, with "
         "the tests running as the restricted role", "Nothing — this is ours to finish, and it gates "
         "everything else"],
        ["Months 2–5", "<b>The native shell</b>: recording with the screen off, boot start, task lock — "
         "the app becomes an appliance somebody's parent can use", "An Android specialist would halve "
         "this; it is the gap we name as our biggest"],
        ["Months 4–7", "<b>The printed bodies</b>: dock and wearable finished, branded, with the "
         "scannable card; first fifty units in real homes", "Moulding and a channel turn fifty units "
         "into five hundred"],
        ["Months 6–9", "<b>The fold in general availability</b>: hosting sold to families outside our "
         "own, with support and a status page", "This one is genuinely blocked on operations — it is the "
         "hosting partner's contribution"],
        ["Months 8–12", "<b>Independence</b>: local chat fallback, so the creature keeps talking with no "
         "provider at all", "Nothing — but it de-risks every other line"],
        ["Months 10–18", "<b>The registry, federated</b>: the genome format published, a second "
         "registrar node, litters across households", "An ecosystem partner brings the second node, "
         "which is what makes it a protocol rather than a product"],
        ["Months 12–18", "<b>One hundred business customers</b> on the working pack", "This is the "
         "reseller's number, not ours — we cannot sell a hundred accounts one dinner at a time"],
    ], [24 * mm, (CW - 24 * mm) * 0.52, (CW - 24 * mm) * 0.48]),
    source("The engineering sequence is <font face='Courier'>docs/BACKLOG.md</font> and "
           "<font face='Courier'>docs/PROGETTO.md</font> §8; the dates and the commercial targets are "
           "assumptions."),
)

# ══════════════════════════════════════════════════════ B15 · the ask
page(
    "THE PROPOSAL", "What we are asking for",
    Paragraph(
        "A commercial agreement — one of the four on the preceding pages, or the part of one that fits "
        "what you actually do. We are not asking for equity, and we are not asking for a decision on "
        "this document. We are asking for a pilot small enough to be judged on evidence, which is the "
        "same standard the rest of this briefing was written to.", BODY),
    Spacer(1, 3),
    table([
        ["If you are…", "The first step we propose", "What it proves, and by when"],
        ["A hardware or distribution partner", "A joint limited edition of a few hundred units, at cost",
         "Whether the channel moves an object nobody has heard of — 90 days"],
        ["A hosting operator", "One hundred souls on your infrastructure for six months",
         "Real density against our fifty-per-server assumption, which sets this stream's margin"],
        ["A vertical or reseller", "Five of your customers for three months at €49 a month",
         "The time actually saved, measured by the customer rather than claimed by us — 90 days"],
        ["An investor", "Read Part A with your own engineer, then talk to us about a commercial "
         "structure first", "Whether the technical claims survive scrutiny — a day"],
    ], [34 * mm, (CW - 34 * mm) * 0.42, (CW - 34 * mm) * 0.58]),
    Spacer(1, 6),
    Paragraph("Three things we will not trade", H2),
    *bullets([
        "<b>The family's keys and the right to leave.</b> No agreement makes a soul unportable, and no "
        "customer data becomes an asset of ours or of a partner's. It is the product, not a feature.",
        "<b>The open protocol.</b> The species definition is public. Exclusivity can exist on a "
        "territory or a body; never on what a creature is.",
        "<b>Selection touches character, never permissions.</b> Whatever breeders do with temperament, "
        "the guards — the budget ceiling, the consent switches, the minors rule, the reception wall — sit "
        "outside the genome, and no partner edition ships without them.",
    ]),
    Spacer(1, 8),
    Paragraph(
        "Everything in Part A can be verified in an afternoon by an engineer you trust: the repository is "
        "the evidence, the tests run against real infrastructure, and the decisions — including the "
        "failures — are written down. Everything in Part B is an assumption we would rather see measured "
        "than believed. That is the whole proposal.", BODY),
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
