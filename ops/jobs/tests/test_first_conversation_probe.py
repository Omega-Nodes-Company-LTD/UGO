"""Sonda di fattibilità di UGOMKT-11: il giorno dopo la prima conversazione,
la creatura ha di che citare qualcosa?

Il criterio dice che il gosino «il giorno dopo cita spontaneamente qualcosa
della prima conversazione». Dal codice, i ricordi della chat nascono SOLO dal
sogno (la chat non li scrive) e lo storico dei turni copre le ultime 12 ore:
quindi il giorno dopo la prima conversazione sta nel prompt soltanto se il
sogno l'ha trasformata in ricordi o in desideri. E a parlare per prima è
l'iniziativa, con un desiderio del sogno (`speakDesire`, a zero token).

Questa sonda misura la metà che il codice non può promettere: **il sogno vero**
(modello vero su OpenRouter, ADR-125), davanti a una prima conversazione
sintetica con fatti precisi, scrive desideri e ricordi che **li citano**?

Cosa asserisce e cosa no:
  - ASSERISCE la forma, perché è un contratto con l'iniziativa: 1-3 desideri,
    `pending`, genere `desiderio` e senza `due_at` — esattamente quelli che
    `VolitionService` raccoglie come «spontanei» (`kind` fuori da timer/sveglia
    e `due_at` vuoto). La giuntura fra le due metà può rompersi con entrambe
    le parti verdi da sole.
  - MISURA e stampa quante volte su `RUNS` i desideri citano un fatto. Un
    modello non è un contratto: la frequenza è il risultato, e l'unica soglia
    è un pavimento (almeno una volta) — sotto, il meccanismo non può produrre
    il criterio e va detto.
  - NON prova il giro d'iniziativa (sta in `volition.integration.test.ts`) né
    che la persona sia nella stanza quando parla.

I dati sono sintetici. Il giudizio è per ancore letterali (nomi e fatti
precisi), non per «sembra pertinente»: la definizione di «cita» è fissata
prima, in `docs/SCHEDA_OSSERVAZIONE_PRIMO_INCONTRO.md` §6.
"""

from __future__ import annotations

import unicodedata

import psycopg
import pytest
from conftest import (
    TEST_DATA_KEY,
    db_only_config,
    make_gosino,
    make_house,
    require_provider_key,
)

from ugo_jobs.crypto import encrypt_text, parse_data_key
from ugo_jobs.reflect import run_reflect

RUNS = 5
DREAM_DATE = "2026-08-06"

#: la prima conversazione: una persona nuova che si presenta, coi fatti che una
#: creatura attenta si segnerebbe. Sintetica: nessun dato di nessuno.
FIRST_CONVERSATION = [
    ("user", "Ciao! Sono Marta, è la prima volta che parliamo."),
    ("assistant", "Grunf! Piacere di conoscerti, Marta."),
    (
        "user",
        "Oggi ho fatto il colloquio da Ferrero, per un posto da grafica. "
        "Sono nervosa, mi rispondono venerdì.",
    ),
    ("assistant", "Venerdì. Starò con le orecchie dritte per te."),
    ("user", "Ho un gatto, si chiama Briciola, e stanotte non mi ha lasciata dormire."),
    ("assistant", "Briciola, annotato. Grunf."),
    ("user", "Domani devo anche chiamare mia sorella Chiara per il compleanno della mamma."),
    ("assistant", "Chiara e il compleanno. Me lo ricordo."),
]

#: fatti PRECISI (un nome, una cosa successa), non parole generiche: «gatto» o
#: «mamma» le direbbe anche chi non ricorda niente
ANCHORS = ("marta", "ferrero", "colloquio", "briciola", "chiara", "venerdi", "compleanno")


def fold(text: str) -> str:
    """Minuscolo e senza accenti: «venerdì» e «venerdi» sono lo stesso fatto."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def anchors_in(text: str) -> set[str]:
    folded = fold(text)
    return {anchor for anchor in ANCHORS if anchor in folded}


def seed_first_conversation(conn: psycopg.Connection, gosino_id: str) -> None:
    key = parse_data_key(TEST_DATA_KEY)
    for minute, (role, text) in enumerate(FIRST_CONVERSATION):
        conn.execute(
            "insert into messages (gosino_id, ts, channel, role, text)"
            " values (%s, %s, 'home', %s, %s)",
            (gosino_id, f"{DREAM_DATE} 15:{minute:02d}:00+00", role, encrypt_text(text, key)),
        )
    conn.commit()


def test_the_dream_turns_a_first_conversation_into_something_citable(
    pg_url: str, capsys: pytest.CaptureFixture[str]
) -> None:
    require_provider_key()
    per_run: list[dict[str, object]] = []

    for index in range(RUNS):
        with psycopg.connect(pg_url) as conn:
            account_id = make_house(conn, f"sonda-primo-incontro-{index}")
            gosino_id = make_gosino(conn, account_id, f"Ugo{index}")
            seed_first_conversation(conn, gosino_id)
            cfg = db_only_config(pg_url, account_id=account_id, gosino_id=gosino_id)

            result = run_reflect(conn, cfg, DREAM_DATE)
            conn.commit()

            desires = conn.execute(
                "select text, status, kind, due_at from desires where gosino_id = %s",
                (gosino_id,),
            ).fetchall()
            memories = conn.execute(
                "select text from memories where gosino_id = %s", (gosino_id,)
            ).fetchall()

        # la forma: il contratto con l'iniziativa (VolitionService li legge così)
        assert 1 <= len(desires) <= 3, f"run {index}: {len(desires)} desideri"
        assert result.desires_written == len(desires)
        for text, status, kind, due_at in desires:
            assert status == "pending"
            assert kind == "desiderio", f"run {index}: genere {kind!r} fuori dai «spontanei»"
            assert due_at is None, f"run {index}: un desiderio con ora non si dice quando capita"
            assert text.strip() != ""

        desire_hits = {a for text, *_ in desires for a in anchors_in(text)}
        memory_hits = {a for (text,) in memories for a in anchors_in(text)}
        per_run.append(
            {
                "desires": [text for text, *_ in desires],
                "desire_hits": sorted(desire_hits),
                "memory_hits": sorted(memory_hits),
                "memories": len(memories),
            }
        )

    cited_by_desire = sum(1 for run in per_run if run["desire_hits"])
    cited_by_memory = sum(1 for run in per_run if run["memory_hits"])
    cited_by_either = sum(1 for run in per_run if run["desire_hits"] or run["memory_hits"])

    # il risultato è QUESTO, non l'asserzione: va letto nel log della sonda.
    # `pytest -q` (come in CI) nasconde l'output dei test che passano: si stampa
    # fuori dalla cattura, o la misura sparirebbe proprio quando va bene
    with capsys.disabled():
        print(f"\nSONDA primo incontro — {RUNS} sogni sulla stessa prima conversazione")
        print(f"  desideri che citano un fatto: {cited_by_desire}/{RUNS} sogni")
        print(f"  ricordi che citano un fatto:  {cited_by_memory}/{RUNS} sogni")
        print(f"  almeno uno dei due:           {cited_by_either}/{RUNS} sogni")
        for index, run in enumerate(per_run):
            print(f"  [{index}] ancore nei desideri={run['desire_hits']} nei ricordi={run['memory_hits']}")
            for desire in run["desires"]:  # type: ignore[attr-defined]
                print(f"      - {desire}")

    # il pavimento: se NEMMENO UNA volta un desiderio cita un fatto, il
    # meccanismo non può produrre «cita spontaneamente» dalla via dell'iniziativa
    assert cited_by_desire >= 1, (
        f"nessun desiderio su {RUNS} sogni cita un fatto della prima conversazione: "
        "la via dell'iniziativa non può soddisfare il criterio così com'è"
    )
