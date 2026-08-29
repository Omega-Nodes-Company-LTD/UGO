"""Passo del sogno — il lessico della casa (Orizzonti 1+4, "si adotta non si
configura").

UGO non si configura con "i termini della famiglia": li IMPARA, ascoltando.
Passa dai transcript della giornata e conta le parole ricorrenti, escludendo
le funzioni italiane comuni: se una parola emerge davvero (non è una funzione,
non è una parola sola), diventa per la famiglia una memoria `preference` —
"in questa casa si dice così", gratuita come tutto ciò che nasce dal contare
e non da un modello.

Il tetto è di UNA memoria per notte: la gamma possibile è piccola, e una
memoria per notte di rumore è già troppo.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass

import psycopg

#: Le parole che non possono essere "il dialetto della casa": funzioni della
#: lingua, non del luogo. Correttamente incompleto — il filtro serve a non
#: scrivere una memory per «che», «ma» o «perché», non a tenere fuori il
#: lessico vero.
STOPWORDS = {
    "che", "e", "di", "a", "il", "la", "le", "lo", "gli", "un", "una", "uno",
    "in", "con", "su", "per", "tra", "fra", "da", "ma", "o", "se", "come",
    "quando", "dove", "perche", "anche", "piu", "meno", "cosa", "chi", "cui",
    "questo", "questa", "quello", "quella", "esser", "essere", "avevo", "avere",
    "sono", "sei", "e", "abbiamo", "avete", "hanno", "era", "era", "stato",
    "fatto", "fare", "dice", "detto", "bene", "male", "poi", "ora", "adesso",
    "domani", "ieri", "oggi", "volta", "cose", "qualcosa", "niente", "nulla",
    "tutto", "tutti", "molto", "troppo", "davvero", "magari", "certo", "forse",
    "grazie", "prego", "ciao", "buongiorno", "buonasera", "siamo", "siete",
    "fanno", "fai", "faccio", "detto", "andiamo", "andare", "vado", "vai",
    "viene", "venire", "vediamo", "vedere", "chiama", "chiamare", "della",
    "delle", "dei", "dello", "al", "alla", "allo", "ai", "agli", "nel", "nella",
    "nelle", "nei", "negli", "sul", "sulla", "sulle", "sui", "mi", "ti", "si",
    "ci", "vi", "lo", "la", "le", "l", "lui", "lei", "loro", "io", "tu", "noi",
    "voi", "un", "me", "te",
}  # type: ignore[reportUnnecessaryTypeIgnoreComment]  # ripetuti di proposito, un set è un set

WORD = re.compile(r"[a-zàèéìòù']{4,}")


@dataclass(frozen=True)
class DialectCandidate:
    word: str
    count: int
    texts: list[str]


def _tokens(texts: list[str]) -> Counter[str]:
    counter: Counter[str] = Counter()
    for text in texts:
        counter.update(WORD.findall(text.lower()))
    return counter


def candidate_words(texts: list[str], min_occurrences: int = 3) -> list[DialectCandidate]:
    """Le parole che una casa usa davvero, dal ripetersi nei suoi transcript.

    `min_occurrences` impedisce che una parola capita per sbaglio diventi un
    ricordo: serve che si sia ripetuta, non che sia comparsa.
    """
    counter = _tokens(texts)
    by_text: dict[str, list[str]] = {}
    for text in texts:
        for word in WORD.findall(text.lower()):
            by_text.setdefault(word, []).append(text)
    out: list[DialectCandidate] = []
    for word, count in counter.most_common():
        if count < min_occurrences:
            break
        if word in STOPWORDS:
            continue
        out.append(DialectCandidate(word=word, count=count, texts=by_text[word][:2]))
    return out


def best_candidate(texts: list[str], min_occurrences: int = 3) -> DialectCandidate | None:
    """L'unica parola che vale la pena di ricordare stanotte, se c'è è una."""
    candidates = candidate_words(texts, min_occurrences)
    if not candidates:
        return None
    # la più frequente è la più sicura: una parola che si ripete per davvero
    return candidates[0]


def run_dialect(conn: psycopg.Connection, cfg: JobsConfig, dream_date: str) -> dict[str, object]:  # noqa: ANN001
    """Passo del sogno: la parola della casa che è emersa oggi, se c'è.

    Legge i transcript della giornata, ne conta le parole e — se una parola
    non ovvia si è ripetuta — la scrive come memoria `preference` della casa.
    Zero modelli, zero token: è il contare, non il generare, che dice cos'è
    di questo posto.
    """
    rows = conn.execute(
        """
        select coalesce(ts.speaker, 'voce'), ts.text
        from transcript_segments ts
        join meetings m on m.id = ts.meeting_id
        where m.gosino_id = %s and m.started_at between %s::date and %s::date + interval '1 day'
        order by m.started_at asc, ts.t0 asc
        """,
        (cfg.gosino_id, dream_date, dream_date),
    ).fetchall()
    texts = [str(row[1]) for row in rows if row[1]]
    candidate = best_candidate(texts)
    if candidate is None:
        return {"kept": False, "texts": len(texts)}

    from .embeddings import embed

    (vector,) = embed(cfg, [f"in questa casa si dice «{candidate.word}»"])
    conn.execute(
        """
        insert into memories (gosino_id, kind, text, embedding, importance, source_refs)
        values (%s, 'preference', %s, %s, 0.5, %s)
        """,
        (
            cfg.gosino_id,
            f"in questa casa si dice «{candidate.word}» ({candidate.count} volte oggi)",
            json.dumps(vector),
            json.dumps({"dream_date": dream_date, "dialect": True}),
        ),
    )
    conn.commit()
    return {"kept": True, "word": candidate.word, "count": candidate.count, "texts": len(texts)}