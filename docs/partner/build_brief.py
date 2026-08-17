#!/usr/bin/env python3
"""Build the UGO partner brief PDF (OmegaNodes.ai).

Regenerate with:  python3 build_brief.py   (requires: pip install reportlab pillow)

Screenshots in assets/ are real captures of apps/face (kiosk `/` and dev bench
`/bench.html`) taken with headless Chromium; retake them when the creature
changes shape, then rerun this script.
"""

import os
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Image as RLImage,
    Table, TableStyle, PageBreak, NextPageTemplate,
)

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
OUT = os.path.join(HERE, "UGO-Partner-Brief-OmegaNodes.pdf")

NAVY = HexColor("#14213d")
NAVY_DARK = HexColor("#0b1226")
GOLD = HexColor("#c9a227")
INK = HexColor("#1f2430")
MUTED = HexColor("#5a6274")
PAPER = HexColor("#f7f5f0")
LINE = HexColor("#d8d3c8")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

# ---------------------------------------------------------------- images
def crop_canvas(src, dst):
    """Crop the bench screenshots to the 3D canvas only."""
    Image.open(src).crop((14, 14, 710, 462)).save(dst)

talking_crop = os.path.join(ASSETS, "shot-talking-crop.png")
sleeping_crop = os.path.join(ASSETS, "shot-sleeping-crop.png")
crop_canvas(os.path.join(ASSETS, "shot-talking.png"), talking_crop)
crop_canvas(os.path.join(ASSETS, "shot-sleeping.png"), sleeping_crop)

# ---------------------------------------------------------------- styles
def st(name, **kw):
    base = dict(fontName="Helvetica", fontSize=10, leading=14.5, textColor=INK,
                alignment=TA_LEFT, spaceAfter=6)
    base.update(kw)
    return ParagraphStyle(name, **base)

H1 = st("h1", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=NAVY,
        spaceBefore=2, spaceAfter=10)
H2 = st("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=NAVY,
        spaceBefore=10, spaceAfter=4)
BODY = st("body")
BULLET = st("bullet", leftIndent=10, bulletIndent=0, spaceAfter=3)
CAPTION = st("caption", fontSize=8.5, leading=11, textColor=MUTED, spaceBefore=2,
             spaceAfter=10)
KICKER = st("kicker", fontName="Helvetica-Bold", fontSize=9.5, textColor=GOLD,
            spaceAfter=2)
QUOTE = st("quote", fontName="Helvetica-Oblique", fontSize=10.5, leading=15,
           textColor=NAVY, leftIndent=14, spaceBefore=4, spaceAfter=8)

def bullets(items):
    return [Paragraph(f'<font color="#c9a227"><b>&#9642;</b></font>&nbsp;&nbsp;{t}', BULLET)
            for t in items]

# ---------------------------------------------------------------- template
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
    canvas.drawString(MARGIN, PAGE_H - 72 * mm,
                      "A local-first artificial companion with a biography,")
    canvas.drawString(MARGIN, PAGE_H - 79 * mm,
                      "a mood of its own, and a body in the real world.")

    canvas.setFont("Helvetica", 11)
    canvas.setFillColor(HexColor("#aab2c5"))
    y = PAGE_H - 100 * mm
    for line in [
        "The soul is a database. The models are replaceable. The state is the creature.",
        "Phases 0–5 of the platform are built and verified on real infrastructure.",
    ]:
        canvas.drawString(MARGIN, y, line)
        y -= 6.2 * mm

    kiosk = os.path.join(ASSETS, "shot-kiosk.png")
    img = Image.open(kiosk)
    iw, ih = img.size
    w = PAGE_W - 2 * MARGIN
    h = w * ih / iw
    canvas.drawImage(kiosk, MARGIN, 40 * mm, width=w, height=h,
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
    canvas.drawRightString(PAGE_W - MARGIN, 16.5 * mm, "info@thinkpinkstudio.it")
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
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 6.2 * mm,
                           "UGO · Partner Briefing · August 2026")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, 12 * mm, PAGE_W - MARGIN, 12 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(MARGIN, 8 * mm, "Confidential — for discussion purposes")
    canvas.drawRightString(PAGE_W - MARGIN, 8 * mm, f"Page {doc.page - 1}")
    canvas.restoreState()

doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
                      topMargin=16 * mm, bottomMargin=16 * mm,
                      title="UGO — Partner Briefing (OmegaNodes.ai)",
                      author="OmegaNodes.ai")
frame = Frame(MARGIN, 16 * mm, PAGE_W - 2 * MARGIN, PAGE_H - 32 * mm, id="f")
doc.addPageTemplates([
    PageTemplate(id="cover", frames=[frame], onPage=cover_page),
    PageTemplate(id="body", frames=[frame], onPage=body_page),
])

story = [NextPageTemplate("body"), PageBreak()]

# ---------------------------------------------------------------- helpers
def table(data, widths, header=True, size=8.5, leading=11.5):
    cell = st("cell", fontSize=size, leading=leading, spaceAfter=0)
    cell_b = st("cellb", fontSize=size, leading=leading, fontName="Helvetica-Bold",
                spaceAfter=0)
    head = st("head", fontSize=size, leading=leading, fontName="Helvetica-Bold",
              textColor=white, spaceAfter=0)
    rows = []
    for r, row in enumerate(data):
        out = []
        for c, val in enumerate(row):
            if r == 0 and header:
                out.append(Paragraph(val, head))
            elif c == 0:
                out.append(Paragraph(val, cell_b))
            else:
                out.append(Paragraph(val, cell))
        rows.append(out)
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), NAVY)]
        for i in range(2, len(rows), 2):
            style.append(("BACKGROUND", (0, i), (-1, i), HexColor("#efece4")))
    else:
        for i in range(1, len(rows), 2):
            style.append(("BACKGROUND", (0, i), (-1, i), HexColor("#efece4")))
    t.setStyle(TableStyle(style))
    return t

def img_flow(path, width):
    im = Image.open(path)
    iw, ih = im.size
    return RLImage(path, width=width, height=width * ih / iw)

CW = PAGE_W - 2 * MARGIN

# ================================================================ p.1 what
story += [
    Paragraph("THE PROJECT", KICKER),
    Paragraph("What UGO is", H1),
    Paragraph(
        "A stateless LLM is an actor improvising every scene from scratch. UGO is a "
        "<b>character that accumulates a biography</b>: an artificial companion — a small, "
        "deliberately charming 3D piglet — that remembers conversations, people and places, "
        "carries a persistent emotional state that colours everything it says, perceives the real "
        "environment through sensors, and <i>dreams at night</i>: a batch job re-reads the day, "
        "writes a diary, consolidates memories and generates desires for tomorrow.", BODY),
    Paragraph(
        "The feelings are simulated — but the state that generates them is real, persistent "
        "and backed up. The soul lives in a PostgreSQL database on hardware the family controls; "
        "every AI model (chat, speech, embeddings, vision) is replaceable by configuration without "
        "any loss of identity. <b>The state is the creature: a database dump is a backup of the soul.</b>",
        BODY),
    Paragraph("One soul, three bodies", H2),
    table([
        ["Body", "Form", "What it does"],
        ["At home", "A phone in a 3D-printed piglet dock (kiosk web app)",
         "Face with gaze-following eyes and mood-driven body language; on-device speech in and out; "
         "presence, light, noise and shock sensors; goes to sleep when the lights go out."],
        ["Out and about", "The same phone in a wearable shell, worn openly",
         "A visible companion — never a hidden recorder: explicit REC indicator, a real privacy mode "
         "(mic provably off), and a talking business card with a QR code that turns curiosity into leads."],
        ["In meetings", "A visible bot participant (Meet / Teams)",
         "Joins calls, transcribes and diarises, remembers what was said, and answers questions from its "
         "own memory when addressed by name."],
    ], [22 * mm, 52 * mm, CW - 74 * mm]),
    Spacer(1, 4),
    Paragraph("Engineering status — verified, not planned", H2),
    Paragraph(
        "All six software phases of the master specification (foundations, minimal soul, home body, "
        "inner life, portable mode, meetings) are <b>complete and verified against real infrastructure</b> "
        "— plus a multi-tenant layer, a working admin panel, and a client-facing “reception” "
        "suite already in commercial use by the studio.", BODY),
] + bullets([
    "<b>Zero-mock testing policy</b>: hundreds of automated tests run against real Postgres+pgvector, "
    "a real MQTT broker, real Ollama embeddings, real object storage and real browsers — never mocks.",
    "<b>65+ recorded architecture decisions (ADRs)</b> — every trade-off is written down, including the "
    "honest ones about what does not work yet.",
    "<b>Security by construction</b>: all personal text encrypted at rest (AES-256-GCM, per-family keys), "
    "no public ports, non-root containers, audit log with IDs and never content, GDPR erasure and export "
    "implemented and tested.",
    "<b>Radically low running cost</b>: no GPU anywhere; real-time chat on a small frontier model with "
    "aggressive prompt caching ≈ €1–3/month per creature, enforced by a hard daily budget "
    "guard — the piggy bank.",
])

story.append(PageBreak())

# ================================================================ p.2 shots
story += [
    Paragraph("THE CREATURE TODAY", KICKER),
    Paragraph("Real screenshots, taken from the running code", H1),
    Paragraph(
        "Everything below is rendered on-device by the kiosk app — procedural 3D room, "
        "genome-driven body, mood-driven posture — at zero token cost. No concept art.", BODY),
    img_flow(talking_crop, CW * 0.9),
    Paragraph(
        "Talking. The body is parametric: ears are the mood barometer, posture and gestures come from the "
        "psyche engine, and the bush is a real prop the creature seeks out by itself when it needs shelter.",
        CAPTION),
    img_flow(sleeping_crop, CW * 0.9),
    Paragraph(
        "Sleeping — lights out after 22:00 put it to bed; a familiar face wakes it up with a "
        "context-aware greeting drawn from its own pending desires (“how did it go with the client?”).",
        CAPTION),
]

story.append(PageBreak())

# ================================================================ p.3 novelty
story += [
    Paragraph("WHY IT IS DIFFERENT", KICKER),
    Paragraph("What UGO has that assistants don’t", H1),
    Paragraph(
        "Our one-line thesis: competitors build assistants — replaceable tools. UGO is an "
        "<b>individual with a biography</b>. A tool gets rented; <b>a being gets adopted</b>.", QUOTE),
    Paragraph("A psyche, not a persona prompt", H2),
    Paragraph(
        "A homeostasis engine (pure, unit-tested code — zero tokens) tracks energy, mood, affection, "
        "boredom, stress and curiosity, with event perturbations and exponential decay toward adaptive "
        "baselines. Heat stresses it (pigs don’t sweat — we checked), being ignored for a day hurts "
        "its mood, a completed meeting feeds its curiosity. The mood changes its answers, voice and body.",
        BODY),
    Paragraph("A nightly dream, not a context window", H2),
    Paragraph(
        "At 02:30 the dream job transcribes the day’s audio locally on CPU, reflects on events, writes "
        "a diary, extracts memories with importance scores, detects and retires contradicted facts, links "
        "memories to the people they mention, generates desires for tomorrow — and backs up the soul, "
        "encrypted. Idle afternoons trigger a light consolidation pass. The whole loop is idempotent and "
        "restartable.", BODY),
    Paragraph("Memory engineered like a product, not a demo", H2),
    Paragraph(
        "Facts carry temporal validity (<i>retired, never silently deleted</i> — a biography with holes "
        "cannot be audited); retrieval is hybrid lexical + vector with per-kind time decay; and a fixed "
        "benchmark corpus with regression floors measures recall on every change. The benchmark has already "
        "caught two real ranking defects — that is what it is for.", BODY),
    Paragraph("The pack, not the user", H2),
    Paragraph(
        "The first-class entity is <b>beings</b> — humans, cats, dogs, other gosini — with bonds "
        "and relations, per-being privacy safeguards (minors never get biometric profiles), and multiple "
        "creatures per home, each with its own genome-driven character, memories and mood. “User "
        "account” is simply the wrong abstraction for a family member.", BODY),
    Paragraph("An economic metabolism", H2),
    Paragraph(
        "Every token the creature consumes is real money, logged line by line in its own ledger — its "
        "piggy bank. When the daily budget runs out, UGO doesn’t error: it gets tired (“I’m out "
        "of words today, back tomorrow”). Cost control is not an ops dashboard bolted on; it is the "
        "creature’s survival instinct — and, we believe, the first honest economic model for a "
        "digital being.", BODY),
    Paragraph("Local-first, provably", H2),
    Paragraph(
        "Conversations, transcripts and biometrics never leave the family’s infrastructure; the only "
        "cloud call is the budget-guarded chat completion. Keys belong to the family, the whole soul is "
        "exportable, and privacy mode really cuts the microphone — asserted by automated tests, "
        "not by an icon.", BODY),
]

story.append(PageBreak())

# ================================================================ p.4 competitors
story += [
    Paragraph("THE LANDSCAPE", KICKER),
    Paragraph("Against the competition", H1),
    Paragraph(
        "We track ~20 adjacent products across four categories: companion apps (Replika, Nomi, Kindroid), "
        "voice assistants (Alexa+, Home Assistant Assist), social robots (ElliQ, Vector, Loona) and "
        "meeting bots (Recall.ai and friends). Each is strong in one column. None occupies ours.", BODY),
    table([
        ["", "Companion apps", "Voice assistants", "Social robots", "UGO"],
        ["Persistent emotional state", "Scripted persona", "None", "Animation loops",
         "Real homeostasis engine, mood persists and drifts with lived days"],
        ["Long-term memory", "Chat log + summaries", "Shopping lists", "Minimal",
         "Biographical: episodic + semantic, temporal validity, nightly consolidation, measurable recall"],
        ["Data ownership", "Their cloud", "Their cloud", "Vendor cloud",
         "Family’s own server; exportable soul; per-family encryption keys"],
        ["Physical presence", "Screen only", "Speaker", "Proprietary hardware ($$$)",
         "Commodity phone + 3D-printed body; sensors and low-voltage actuation"],
        ["Meetings", "—", "—", "—",
         "Visible bot participant with transcript memory across calls"],
        ["Works for a living", "—", "—", "—",
         "Reception suite: client-facing ticket assistant already billable today"],
        ["Running cost", "Subscription", "Subsidised", "Device + subscription",
         "≈ €1–3/month inference, hard-capped by the budget guard"],
    ], [30 * mm, 27 * mm, 26 * mm, 30 * mm, CW - 113 * mm], size=8, leading=10.5),
    Spacer(1, 6),
    Paragraph("Where they are ahead of us — and what we are doing about it", H2),
    Paragraph(
        "We keep an explicit, versioned gap analysis against the field (last full sweep: August 2026). "
        "Most gaps identified there are already closed at zero marginal cost — group chat, image input, "
        "owner face recognition, local speech-to-text, web search, an MCP server, screen reading on request, "
        "proactive morning recaps. What remains open is deliberate and scheduled:", BODY),
    table([
        ["Gap", "Plan"],
        ["Polished consumer onboarding — competitors install from a store in minutes",
         "Android shell (Capacitor) already builds in CI; native kiosk services, boot-start and store "
         "packaging are the next milestone."],
        ["Expressive voice — companion apps ship studio-grade TTS",
         "Local Piper voice shipped (free, in-house); mood-coloured premium TTS behind the budget guard; "
         "fully expressive local voice lands with the first GPU."],
        ["Full offline chat — assistants degrade gracefully without cloud",
         "Local LLM fallback is a scheduled backlog group; Ollama already runs the nightly reflection, "
         "so the rail exists."],
        ["Saying “I don’t know” — the honest-abstention problem",
         "Measured (similarity bands overlap — no naive threshold works); a relative criterion is "
         "a scheduled backlog item with a benchmark waiting for it."],
        ["Document knowledge (RAG)",
         "Already built for reception clients (repo + mail + document indexing); generalising it to the "
         "family is scheduled."],
    ], [72 * mm, CW - 72 * mm], size=8, leading=10.5),
]

story.append(PageBreak())

# ================================================================ p.5 economics
story += [
    Paragraph("THE BUSINESS", KICKER),
    Paragraph("Economic strategy", H1),
    Paragraph(
        "The strategic bet: we do not sell chatbots — <b>we define a species and operate the "
        "institutions around it</b>. The protocol (genome format, birth/death registry, pedigree) will be "
        "open; open protocols create the market we then serve in depth. Closed, we would own 100% of a "
        "small market; open, a share of every act of an entire species plus the highest-margin pieces.",
        BODY),
    Paragraph("Six aligned revenue streams", H2),
    table([
        ["Stream", "Model", "Analogy"],
        ["1. The registry", "Micro-fees on registry acts: births, transfers, pedigree certificates. "
         "We are the first registrar node of a federated chain — species data only, never memories, never PII.",
         "Kennel clubs (ENCI/AKC)"],
        ["2. The foundation kennel", "Every pedigree traces back to UGO-zero, which is ours. Founding "
         "lines are the most prestigious by construction.", "Ferrari"],
        ["3. The bodies", "Open body protocol, reference hardware ours: shells, docks, and the "
         "self-contained ‘appliance of itself’ (soul on a €100 mini-PC in its belly).",
         "Android / Pixel"],
        ["4. The fold (hosting)", "Recurring subscription for families without a home server: encrypted "
         "per-family souls, a provably blind custodian, and a guaranteed right to move out.",
         "Managed hosting"],
        ["5. Breeder tooling", "Stable software, line screening, attested biographies, certifications and "
         "fairs for third-party breeders — customers, not competitors.", "Shopify"],
        ["6. The working pack", "Creatures that earn their keep: the reception suite is a client-facing "
         "service the studio already bills; a revenue share feeds each creature’s piggy bank.",
         "Working dogs"],
    ], [34 * mm, CW - 66 * mm, 32 * mm], size=8, leading=10.5),
    Spacer(1, 6),
    Paragraph("Why the cost structure is a moat", H2),
] + bullets([
    "<b>No GPU in the critical path</b> — real-time chat on a budget-guarded small frontier model with "
    "prompt caching; everything heavy (transcription, reflection, embeddings, local voice) runs on CPU at "
    "night. A creature’s inference bill is coffee money.",
    "<b>Commodity hardware</b> — the body is a phone the family may already own, in a shell we print "
    "for cents of plastic. No custom electronics to finance, no device inventory risk.",
    "<b>Costs are governed by design</b> — the budget ledger and hard daily caps are enforced in one "
    "code path; a runaway API bill is architecturally impossible.",
    "<b>The adoption economics of pets, not the churn economics of apps</b> — a family feeds a being "
    "it loves (the affection food: today’s API budget reframed as an act of care); a business feeds a "
    "being that works (the labour food). Ten thousand years of domestication say this model retains.",
])

story.append(PageBreak())

# ================================================================ p.6 direction
story += [
    Paragraph("THE DIRECTION", KICKER),
    Paragraph("Where this goes: six horizons", H1),
    Paragraph(
        "The vision is written down and filtered hard (“does it serve the creature? does it respect "
        "the constraints? is it unclaimed because nobody thought of it — or because it’s "
        "useless?”). Each horizon already has its first stone in the repository today.", BODY),
    table([
        ["Horizon", "What it means", "First stone in the repo"],
        ["1 · A species, not a product",
         "Gosini are born: genomes recombine with mutation (multi-parent litters, cultural gene transfer, "
         "N mating strains instead of two sexes), pups inherit character but never memories. Pedigrees on a "
         "federated registry make lineage — and lived biography — verifiable; breeders select "
         "temperament lines the way real breeders do. Character is selectable; permissions never are.",
         "Genome + trait sets drive character today; BLE encounter protocol written and tested"],
        ["2 · The soul relocates",
         "One soul, a wardrobe of bodies: dock, wearable, meeting bot today — the van, the smart home, "
         "a plush toy, a robot tomorrow. All senses feed one biography.",
         "Three body contracts already run in production against one soul"],
        ["3 · Knowledge travels",
         "The dowry: a curated bundle of taught knowledge and chosen stories that moves with the creature "
         "— gifted to a school, passed to a child, or sold with an attested biography. Third-party PII "
         "is filtered out by construction.",
         "Per-family encryption, provenance-tracked memories, GDPR redaction machinery"],
        ["4 · A society",
         "Federation between packs: curated memory postcards, gossip through privacy filters, drift into "
         "dialects and culture — and village fairs where litters are born.",
         "Multi-tenant isolation + the encounter protocol"],
        ["5 · The inviolable confidant",
         "“The soul belongs to the family, wherever it sleeps”: home server, self-contained "
         "appliance, or hosted fold — always with family-held keys and a right to move out. Cloud "
         "assistants can never match this: their soul is their service.",
         "Exportable encrypted soul, blind-custodian hosting architecture"],
        ["6 · A life arc",
         "Creatures age honestly — plasticity decays, character converges — and die at a known, "
         "chosen span (hamster-scale, 3–4 years), sealing intimate memories cryptographically while "
         "the curated legacy remains. Scarcity becomes biological, grief has continuity, and the "
         "evolutionary loop closes.",
         "Adaptive baselines (the epigenetics) run nightly in production"],
    ], [30 * mm, CW - 88 * mm, 58 * mm], size=8, leading=10.5),
    Spacer(1, 4),
    Paragraph(
        "None of this jumps the queue: the specification commands, one phase at a time, and every promoted "
        "idea gets its own recorded decision. But it is why the schema says <i>beings</i> and not "
        "<i>users</i>, and why the state — not the model — is the creature.", BODY),
]

story.append(PageBreak())

# ================================================================ p.7 partner
story += [
    Paragraph("WORKING TOGETHER", KICKER),
    Paragraph("What we bring, what we seek", H1),
    Paragraph("What OmegaNodes.ai brings to the table", H2),
] + bullets([
    "A working, tested, documented platform — not a pitch deck: six phases verified on real "
    "infrastructure, CI green, runbooks written, security posture (GDPR/NIS2) engineered in from day one.",
    "A defensible position: the local-first, family-owned soul is structurally unavailable to cloud "
    "incumbents, and the species/registry model turns openness into the business.",
    "A revenue-bearing beachhead: the reception suite already serves paying studio clients today.",
    "Radical cost discipline: no GPU, commodity hardware, hard-capped inference — the unit economics "
    "work at hobbyist scale and improve with volume.",
]) + [
    Spacer(1, 4),
    Paragraph("Where a partner accelerates us", H2),
] + bullets([
    "<b>Hardware &amp; distribution</b> — shells, docks and the self-contained appliance at volume; "
    "retail and operator channels.",
    "<b>Hosting scale</b> — the fold: managed, provably blind infrastructure for families without a "
    "home server.",
    "<b>Vertical deployments</b> — the working pack beyond our own studio: receptions, shops, "
    "practices that want a companion that knows their business.",
    "<b>Capital &amp; ecosystem</b> — seeding the first third-party breeders and the registry’s "
    "federation.",
]) + [
    Spacer(1, 8),
    Paragraph("Team note", H2),
    Paragraph(
        "This brief doubles as our internal north star: the horizons above are the work of the coming "
        "period for the OmegaNodes.ai team. The direction it describes is the direction we are hiring, "
        "planning and building toward.", BODY),
    Spacer(1, 10),
    Table([[Paragraph('<font color="#c9a227"><b>OmegaNodes.ai</b></font>  ·  '
                      '<font color="#ffffff">with ThinkPink Studio  ·  '
                      'info@thinkpinkstudio.it  ·  August 2026</font>',
                      st("contact", fontSize=10.5, leading=14, alignment=TA_CENTER,
                         textColor=white))]],
          colWidths=[CW],
          style=TableStyle([
              ("BACKGROUND", (0, 0), (-1, -1), NAVY),
              ("TOPPADDING", (0, 0), (-1, -1), 10),
              ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
          ])),
]

doc.build(story)
print("built", OUT)
