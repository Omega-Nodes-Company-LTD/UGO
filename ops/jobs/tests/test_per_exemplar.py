"""ADR-019 fase 3: il sogno cicla sugli esemplari.

I due difetti che questi test coprono non davano errore. Il marcatore era per
data+passo, quindi il primo esemplare che finiva `reflect` faceva risultare
fatto il passo per tutti, e il secondo non sognava mai — in silenzio, ogni
notte. E il self-join dell'igiene non confrontava il gosino, quindi due
creature che avevano vissuto la stessa cosa si vedevano i ricordi fusi, con
uno dei due **cancellato**.
"""

from __future__ import annotations

import psycopg
from conftest import db_only_config, make_gosino, make_house
from ugo_jobs.dream import exemplars_of
from ugo_jobs.hygiene import run_hygiene
from ugo_jobs.markers import mark_step_done, step_done

DREAM_DATE = "2026-08-11"


def _memory(conn: psycopg.Connection, gosino_id: str, text: str) -> str:
    """Un ricordo con un embedding costante: due cosi' sono quasi identici."""
    return str(
        conn.execute(
            """
            insert into memories (gosino_id, kind, text, importance, embedding)
            values (%s, 'fact', %s, 0.5, array_fill(0.1::real, ARRAY[768])::vector)
            returning id
            """,
            (gosino_id, text),
        ).fetchone()[0]
    )


def test_the_marker_belongs_to_one_exemplar(pg_url: str) -> None:
    with psycopg.connect(pg_url) as conn:
        casa = make_house(conn, "casa-marcatori")
        cucina = make_gosino(conn, casa, "ugo-cucina")
        studio = make_gosino(conn, casa, "ugo-studio")
        conn.commit()

        mark_step_done(conn, DREAM_DATE, "reflect", gosino_id=cucina)

        assert step_done(conn, DREAM_DATE, "reflect", gosino_id=cucina) is True
        # e questo e' il punto: il secondo non ha ancora sognato
        assert step_done(conn, DREAM_DATE, "reflect", gosino_id=studio) is False


def test_the_loop_finds_every_living_creature_of_one_house(pg_url: str) -> None:
    with psycopg.connect(pg_url) as conn:
        nostra = make_house(conn, "casa-ciclo-nostra")
        vicini = make_house(conn, "casa-ciclo-vicini")
        primo = make_gosino(conn, nostra, "ugo-primo")
        secondo = make_gosino(conn, nostra, "ugo-secondo")
        loro = make_gosino(conn, vicini, "ugo-loro")
        conn.commit()

        found = exemplars_of(conn, nostra)
        assert found == [primo, secondo]
        assert loro not in found

        # e uno ritirato non sogna piu'
        conn.execute("update gosini set retired_at = now() where id = %s", (secondo,))
        conn.commit()
        assert exemplars_of(conn, nostra) == [primo]


def test_hygiene_does_not_merge_across_creatures(pg_url: str) -> None:
    with psycopg.connect(pg_url) as conn:
        casa = make_house(conn, "casa-igiene")
        cucina = make_gosino(conn, casa, "igiene-cucina")
        studio = make_gosino(conn, casa, "igiene-studio")
        mio = _memory(conn, cucina, "la lavatrice fa un rumore strano")
        suo = _memory(conn, studio, "la lavatrice fa un rumore strano")
        conn.commit()

        result = run_hygiene(conn, db_only_config(pg_url, gosino_id=cucina), DREAM_DATE)
        assert result.merged == 0

        alive = conn.execute(
            "select id from memories where id = any(%s)", ([mio, suo],)
        ).fetchall()
        assert len(alive) == 2, "un ricordo e' stato cancellato attraverso il confine"


def test_hygiene_still_merges_two_of_the_same_creature(pg_url: str) -> None:
    """Il contrario, o il test sopra passerebbe anche con l'igiene rotta."""
    with psycopg.connect(pg_url) as conn:
        casa = make_house(conn, "casa-igiene-doppioni")
        solo = make_gosino(conn, casa, "igiene-solo")
        _memory(conn, solo, "il corriere passa il martedi'")
        _memory(conn, solo, "il corriere passa il martedi'")
        conn.commit()

        result = run_hygiene(conn, db_only_config(pg_url, gosino_id=solo), DREAM_DATE)
        assert result.merged == 1

        left = conn.execute(
            "select count(*) from memories where gosino_id = %s", (solo,)
        ).fetchone()[0]
        assert left == 1
