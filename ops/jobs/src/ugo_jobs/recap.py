"""Il recap del mattino (backlog gruppo 2): il diario di ieri, consegnato.

Il sogno scrive il diario da sempre (``reflect``), ma nessuno lo consegnava:
il racconto restava in ``diary_entries`` finché qualcuno non apriva il
pannello — e un digest che devi andare a cercare non è una consegna. Qui
diventa un desiderio con ``due_hint`` «stamattina», e da lì in poi viaggia
sui canali che esistono già: il saluto del risveglio (``wakeUpGreeting``)
o l'iniziativa, quando decide che è il momento di dire qualcosa.

I paletti:

- **zero token**: la prima frase del diario è già il riassunto — il diario
  l'ha scritto un modello stanotte, riscriverlo con un altro è spesa senza
  guadagno. La sagoma è deterministica;
- **una volta per notte e per esemplare**: il marcatore del passo (come per
  ogni altro passo del sogno) — un crash a metà non produce due recap;
- **niente diario, niente recap**: una giornata in cui ``reflect`` non ha
  scritto (nessun evento, budget finito) non va raccontata con un segnaposto.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import psycopg

from .config import JobsConfig

#: la frase va detta a voce: oltre questa misura non è più un recap, è una
#: rilettura — e il diario intero sta comunque nel pannello
RECAP_MAX_CHARS = 240

RECAP_DUE_HINT = "stamattina"


@dataclass
class RecapResult:
    written: int = 0


def first_sentence(text: str) -> str:
    """La prima frase del diario, o l'inizio se la punteggiatura non aiuta."""
    cleaned = " ".join(text.split())
    head = re.split(r"(?<=[.!?])\s", cleaned, maxsplit=1)[0]
    if len(head) <= RECAP_MAX_CHARS:
        return head
    return head[: RECAP_MAX_CHARS - 1].rstrip() + "…"


def run_recap(conn: psycopg.Connection, cfg: JobsConfig, dream_date: str) -> dict[str, object]:
    """Il passo del sogno: il diario di ``dream_date`` diventa un desiderio."""
    row = conn.execute(
        "select text from diary_entries where gosino_id = %s and date = %s",
        (cfg.gosino_id, dream_date),
    ).fetchone()
    diary = str(row[0]).strip() if row is not None and row[0] is not None else ""
    if diary == "":
        return {"written": 0}

    # le sue parole di stanotte, non una parafrasi: il desiderio è ciò che
    # UGO dirà ad alta voce quando qualcuno c'è
    conn.execute(
        "insert into desires (gosino_id, text, due_hint, status) values (%s, %s, %s, 'pending')",
        (
            cfg.gosino_id,
            f"Racconta com'è andata ieri: {first_sentence(diary)}",
            RECAP_DUE_HINT,
        ),
    )
    conn.commit()
    return {"written": 1}
