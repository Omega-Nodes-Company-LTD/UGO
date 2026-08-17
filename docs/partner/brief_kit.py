"""Layout kit for the UGO partner brief: styles, page furniture, flowables.

Kept apart from `build_brief.py` so the content of the deck reads as content
(CLAUDE.md rule 10 — a file that mixes 900 lines of prose with 300 lines of
drawing code is a file nobody edits twice).
"""

import os
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    Paragraph, Spacer, Image as RLImage, Table, TableStyle, Flowable, KeepTogether,
)

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")

# ── palette ──────────────────────────────────────────────────────────────
NAVY = HexColor("#14213d")
NAVY_DARK = HexColor("#0b1226")
GOLD = HexColor("#c9a227")
INK = HexColor("#1f2430")
MUTED = HexColor("#5a6274")
PAPER = HexColor("#f7f5f0")
PANEL = HexColor("#efece4")
LINE = HexColor("#d8d3c8")
CODE_BG = HexColor("#11182b")
CODE_INK = HexColor("#d7dcea")
CODE_DIM = HexColor("#7f8bab")

# Sequential ramp for the ordered stages A → B → C of the memory bench.
# Stages are ORDERED, so this is a sequential single-hue ramp (light → dark),
# not a categorical set. Checked with the dataviz validator on this surface:
# CVD separation ΔE 20.1 (protan) — well above the 8 target; the lightest step
# lands at 2.81:1 contrast, so every bar carries a direct value label, which is
# the prescribed relief.
STAGE = [HexColor("#8593b8"), HexColor("#42568c"), HexColor("#14213d")]

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CW = PAGE_W - 2 * MARGIN


# ── styles ───────────────────────────────────────────────────────────────
def st(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9.6, leading=13.8, textColor=INK,
                alignment=TA_LEFT, spaceAfter=6)
    base.update(kw)
    return ParagraphStyle(name, **base)


H1 = st("h1", fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=NAVY,
        spaceBefore=0, spaceAfter=8)
H2 = st("h2", fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=NAVY,
        spaceBefore=9, spaceAfter=3)
BODY = st("body")
SMALL = st("small", fontSize=8.6, leading=12, textColor=INK)
CAPTION = st("caption", fontSize=8.2, leading=10.8, textColor=MUTED, spaceBefore=3,
             spaceAfter=9)
KICKER = st("kicker", fontName="Helvetica-Bold", fontSize=9, textColor=GOLD, spaceAfter=2)
QUOTE = st("quote", fontName="Helvetica-Oblique", fontSize=10.5, leading=15,
           textColor=NAVY, leftIndent=12, spaceBefore=3, spaceAfter=7)
BULLET = st("bullet", leftIndent=10, bulletIndent=0, spaceAfter=3)
SOURCE = st("source", fontName="Helvetica-Oblique", fontSize=7.8, leading=10.5,
            textColor=MUTED, spaceBefore=4, spaceAfter=2)


def bullets(items, style=BULLET):
    return [Paragraph(f'<font color="#c9a227"><b>&#9642;</b></font>&nbsp;&nbsp;{t}', style)
            for t in items]


def source(text):
    """The provenance line: every claim on a page points at the file that proves it."""
    return Paragraph(f"Source in the repository: {text}", SOURCE)


# ── tables ───────────────────────────────────────────────────────────────
def table(data, widths, header=True, size=8.2, leading=10.8, zebra=True):
    cell = st("cell", fontSize=size, leading=leading, spaceAfter=0)
    cell_b = st("cellb", fontSize=size, leading=leading, fontName="Helvetica-Bold", spaceAfter=0)
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
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ]
    if header:
        style.append(("BACKGROUND", (0, 0), (-1, 0), NAVY))
    if zebra:
        start = 2 if header else 1
        for i in range(start, len(rows), 2):
            style.append(("BACKGROUND", (0, i), (-1, i), PANEL))
    t.setStyle(TableStyle(style))
    return t


# ── images ───────────────────────────────────────────────────────────────
def img(name, width, crop=None):
    path = os.path.join(ASSETS, name)
    im = Image.open(path)
    if crop is not None:
        cropped = os.path.join(ASSETS, f"_crop_{name}")
        im.crop(crop).save(cropped)
        path, im = cropped, Image.open(cropped)
    iw, ih = im.size
    return RLImage(path, width=width, height=width * ih / iw)


def figure(name, width, caption, crop=None):
    """Image plus its caption, as a list — a table cell can measure a list of
    flowables, but not a KeepTogether, and these go in two-up cells."""
    return [img(name, width, crop), Paragraph(caption, CAPTION)]


def two_up(left, right, gap=6 * mm):
    w = (CW - gap) / 2
    t = Table([[left, right]], colWidths=[w, w])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


# ── code excerpt ─────────────────────────────────────────────────────────
class CodeBox(Flowable):
    """A verbatim excerpt from the repository, with its path as the caption.

    Verbatim on purpose: this deck's claim is that the code is the evidence,
    and a paraphrased snippet proves nothing.
    """

    def __init__(self, path, lines, width=CW, size=7.4, leading=9.8):
        super().__init__()
        self.path = path
        self.lines = lines
        self.width = width
        self.size = size
        self.leading = leading
        self.pad = 7
        self.header = 11
        self.height = self.header + self.pad * 2 + leading * len(lines) + 3

    def wrap(self, availWidth, availHeight):
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        c.setFillColor(CODE_BG)
        c.roundRect(0, 0, self.width, self.height, 3, fill=1, stroke=0)
        c.setFillColor(GOLD)
        c.setFont("Courier-Bold", 6.8)
        c.drawString(self.pad, self.height - self.pad - 5, self.path)
        y = self.height - self.pad - self.header - 4
        for line in self.lines:
            stripped = line.strip()
            is_comment = stripped.startswith(("//", "#", "*", "/*"))
            c.setFillColor(CODE_DIM if is_comment else CODE_INK)
            c.setFont("Courier-Oblique" if is_comment else "Courier", self.size)
            c.drawString(self.pad, y, line[:118])
            y -= self.leading


# ── stat tiles ───────────────────────────────────────────────────────────
class StatTiles(Flowable):
    """A row of hero numbers. No plot, so no hover layer and no legend: the
    label under each number carries the identity."""

    def __init__(self, tiles, width=CW, height=21 * mm):
        super().__init__()
        self.tiles = tiles
        self.width = width
        self.height = height

    def wrap(self, availWidth, availHeight):
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        gap = 4
        n = len(self.tiles)
        w = (self.width - gap * (n - 1)) / n
        for i, (value, label, sub) in enumerate(self.tiles):
            x = i * (w + gap)
            c.setFillColor(PANEL)
            c.roundRect(x, 0, w, self.height, 3, fill=1, stroke=0)
            c.setFillColor(GOLD)
            c.rect(x, 0, 2.2, self.height, fill=1, stroke=0)
            c.setFillColor(NAVY)
            c.setFont("Helvetica-Bold", 17)
            c.drawString(x + 9, self.height - 21, value)
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 7.6)
            c.drawString(x + 9, self.height - 32, label)
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 6.9)
            c.drawString(x + 9, self.height - 41, sub)


# ── grouped bars ─────────────────────────────────────────────────────────
class StageBars(Flowable):
    """Grouped bars over ordered stages, one group per question family.

    Sequential ramp (one hue, light → dark) because the stages are ordered;
    every bar is directly labelled, which is also the contrast relief the
    lightest step requires. Legend below, so identity is never colour alone.
    """

    def __init__(self, groups, series, width=CW, height=52 * mm, ymax=1.0, title=""):
        super().__init__()
        self.groups = groups          # [(label, [v_a, v_b, v_c]), ...]
        self.series = series          # ["A · …", "B · …", "C · …"]
        self.width = width
        self.height = height
        self.ymax = ymax
        self.title = title

    def wrap(self, availWidth, availHeight):
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        left, right = 22, 6
        # room for the direct value labels sitting on top of a full-height bar,
        # which is what collided with the title the first time round
        top = 28 if self.title else 12
        bottom = 34
        plot_w = self.width - left - right
        plot_h = self.height - top - bottom
        base_y = bottom

        if self.title:
            c.setFillColor(NAVY)
            c.setFont("Helvetica-Bold", 8.6)
            c.drawString(0, self.height - 10, self.title)

        # recessive grid + axis labels
        c.setFont("Helvetica", 6.6)
        for frac in (0, 0.25, 0.5, 0.75, 1.0):
            y = base_y + plot_h * frac
            c.setStrokeColor(LINE)
            c.setLineWidth(0.4)
            c.line(left, y, left + plot_w, y)
            c.setFillColor(MUTED)
            c.drawRightString(left - 4, y - 2, f"{frac * self.ymax:.2f}")

        n_groups = len(self.groups)
        group_w = plot_w / n_groups
        bar_w = min(13, (group_w - 14) / len(self.series))
        for gi, (label, values) in enumerate(self.groups):
            gx = left + gi * group_w
            span = bar_w * len(self.series) + 2 * (len(self.series) - 1)
            x0 = gx + (group_w - span) / 2
            for si, v in enumerate(values):
                x = x0 + si * (bar_w + 2)      # 2pt surface gap between bars
                h = max(0.6, plot_h * (v / self.ymax))
                c.setFillColor(STAGE[si])
                c.roundRect(x, base_y, bar_w, h, 2, fill=1, stroke=0)
                c.setFillColor(INK if v > 0 else MUTED)
                c.setFont("Helvetica-Bold", 6.4)
                c.drawCentredString(x + bar_w / 2, base_y + h + 2.5, f"{v:.2f}")
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 7.4)
            for li, line in enumerate(label.split("\n")):
                c.drawCentredString(gx + group_w / 2, base_y - 11 - li * 8.4, line)

        # legend
        lx = left
        ly = 4
        for si, name in enumerate(self.series):
            c.setFillColor(STAGE[si])
            c.roundRect(lx, ly, 7, 7, 1.5, fill=1, stroke=0)
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 6.8)
            c.drawString(lx + 10, ly + 1.5, name)
            lx += 10 + c.stringWidth(name, "Helvetica", 6.8) + 14


# ── architecture diagram ─────────────────────────────────────────────────
class ArchDiagram(Flowable):
    """The deployment as it actually is in ops/docker/compose.dev.yml: what
    talks to what, and which network each box sits on."""

    def __init__(self, width=CW, height=92 * mm):
        super().__init__()
        self.width = width
        self.height = height

    def wrap(self, availWidth, availHeight):
        return (self.width, self.height)

    def _box(self, x, y, w, h, title, sub, fill, ink=white, dashed=False):
        c = self.canv
        c.setFillColor(fill)
        c.setStrokeColor(fill)
        if dashed:
            c.setDash(2, 2)
            c.setStrokeColor(MUTED)
            c.setFillColor(PAPER)
        c.roundRect(x, y, w, h, 3, fill=1, stroke=1)
        c.setDash()
        c.setFillColor(MUTED if dashed else ink)
        c.setFont("Helvetica-Bold", 7.4)
        c.drawString(x + 6, y + h - 11, title)
        c.setFont("Helvetica", 6.4)
        for i, line in enumerate(sub):
            c.drawString(x + 6, y + h - 20 - i * 7.6, line)

    def _arrow(self, x1, y1, x2, y2, label="", dashed=False):
        c = self.canv
        c.setStrokeColor(MUTED)
        c.setLineWidth(0.7)
        if dashed:
            c.setDash(2, 2)
        c.line(x1, y1, x2, y2)
        c.setDash()
        # arrow head
        import math
        ang = math.atan2(y2 - y1, x2 - x1)
        for d in (2.6, -2.6):
            c.line(x2, y2, x2 - 4.5 * math.cos(ang - d * 0.12 * 3), y2 - 4.5 * math.sin(ang - d * 0.12 * 3))
        if label:
            c.setFillColor(MUTED)
            c.setFont("Helvetica", 5.9)
            c.drawCentredString((x1 + x2) / 2, (y1 + y2) / 2 + 3, label)

    def draw(self):
        c = self.canv
        W, H = self.width, self.height

        # the server frame
        c.setStrokeColor(LINE)
        c.setLineWidth(0.8)
        c.roundRect(W * 0.26, 6, W * 0.74 - 6, H - 26, 4, fill=0, stroke=1)
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 6.6)
        c.drawString(W * 0.26 + 7, H - 26, "THE SERVER — one host, docker networks marked internal: no datastore port is published")

        bw, bh = W * 0.205, 15 * mm
        col1 = W * 0.28
        col2 = col1 + bw + 8
        col3 = col2 + bw + 8

        # bodies (left)
        self._box(2, H - 30 * mm, W * 0.23, bh, "HOME BODY", ["phone in a dock", "kiosk web app"], NAVY)
        self._box(2, H - 52 * mm, W * 0.23, bh, "WEARABLE BODY", ["same phone, worn", "visible REC"], NAVY)
        self._box(2, H - 74 * mm, W * 0.23, bh, "MEETING BOT", ["Meet / Teams", "visible participant"], NAVY)

        # server column 1: soul
        self._box(col1, H - 30 * mm, bw, bh, "soul-api", ["Fastify · REST + WS", "93 routes, Zod at edges"], NAVY)
        self._box(col1, H - 52 * mm, bw, bh, "jobs", ["the dream, nightly", "own scheduler"], NAVY)
        self._box(col1, H - 74 * mm, bw, bh, "reception", ["client suite", "isolated network"], NAVY)

        # server column 2: datastores
        self._box(col2, H - 30 * mm, bw, bh, "postgres + pgvector",
                  ["38 tables · 30 migrations", "the soul lives here"], HexColor("#2c3a5e"))
        self._box(col2, H - 52 * mm, bw, bh, "ollama (CPU)",
                  ["embeddings · batch", "no GPU anywhere"], HexColor("#2c3a5e"))
        self._box(col2, H - 74 * mm, bw, bh, "percezione (CPU)",
                  ["whisper · ECAPA", "ArcFace · piper"], HexColor("#2c3a5e"))

        # server column 3: side services
        self._box(col3, H - 30 * mm, bw, bh, "object storage", ["audio + encrypted", "soul backups"], HexColor("#44506e"))
        self._box(col3, H - 52 * mm, bw, bh, "mosquitto", ["MQTT, ambient", "sensors"], HexColor("#44506e"))
        self._box(col3, H - 74 * mm, bw, bh, "searxng", ["private web", "search"], HexColor("#44506e"))

        # the one outbound call
        self._box(col3, H - 96 * mm + 6, bw, 12 * mm, "provider API",
                  ["the ONLY outbound call", "budget-guarded"], PAPER, dashed=True)

        y1 = H - 30 * mm + bh / 2
        self._arrow(W * 0.23 + 2, y1, col1 - 2, y1, "WS")
        self._arrow(W * 0.23 + 2, H - 52 * mm + bh / 2, col1 - 2, y1 - 6, "HTTPS")
        self._arrow(W * 0.23 + 2, H - 74 * mm + bh / 2, col1 - 2, y1 - 12, "poll")
        self._arrow(col1 + bw + 2, y1, col2 - 2, y1)
        self._arrow(col1 + bw + 2, H - 52 * mm + bh / 2, col2 - 2, H - 52 * mm + bh / 2)
        self._arrow(col2 + bw + 2, y1, col3 - 2, y1)
        self._arrow(col1 + bw / 2, H - 30 * mm, col1 + bw / 2, H - 52 * mm + bh, "")
        self._arrow(col3 + bw / 2, H - 74 * mm, col3 + bw / 2, H - 96 * mm + 6 + 12 * mm, "", dashed=True)
