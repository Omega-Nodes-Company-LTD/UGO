"""ADR-012 (accepted): a heavy day nudges the umore baseline down, clamped in
[0.35, 0.7]; an average day changes nothing. Real Postgres, same drizzle
migrations as production.

Da ADR-071 il passo NON è più fisso: è scalato sulla plasticità dell'età, e
questi test lo provano dove conta — la stessa giornata pesante sposta un
cucciolo molto più di un anziano.
"""

from __future__ import annotations

import psycopg

from conftest import PRIME_GOSINO_ID, db_only_config
from ugo_jobs.hygiene import BASELINE_STEP, plasticity_at, run_hygiene

HEAVY_DATE = "2026-08-01"
CALM_DATE = "2026-08-02"


def _seed_day(conn: psycopg.Connection, date: str, umore: float) -> None:
    conn.execute(
        "insert into psyche_snapshots (gosino_id, ts, vars, label) values "
        f"('{PRIME_GOSINO_ID}', '{date} 10:00:00+00', '{{\"umore\": {umore}}}', 'test'),"
        f"('{PRIME_GOSINO_ID}', '{date} 16:00:00+00', '{{\"umore\": {umore}}}', 'test')"
    )
    conn.commit()


def _age_days(conn: psycopg.Connection, days: int) -> None:
    """Quanti giorni ha vissuto.

    L'età non si conserva, si calcola — e da ADR-077 si calcola da
    `mortal_from`, non da `born_at`: chi non ha accettato la mortalità non sta
    percorrendo nessun arco. Scriverne una sola delle due qui vorrebbe dire
    misurare un esemplare che nella realtà non esiste.
    """
    conn.execute(
        """
        update gosini
           set born_at = now() - make_interval(days => %s),
               mortal_from = now() - make_interval(days => %s),
               life_jitter_days = 0
         where id = %s
        """,
        (days, days, PRIME_GOSINO_ID),
    )
    conn.execute(
        "delete from psyche_baselines where gosino_id = %s and variable = 'umore'",
        (PRIME_GOSINO_ID,),
    )
    conn.commit()


def _umore(conn: psycopg.Connection) -> float:
    row = conn.execute(
        "select baseline from psyche_baselines where variable = 'umore'"
    ).fetchone()
    assert row is not None
    return float(row[0])


def test_heavy_day_lowers_umore_baseline_with_clamp(pg_url: str) -> None:
    with psycopg.connect(pg_url) as conn:
        _age_days(conn, 0)  # appena nato: la plasticità è al massimo
        _seed_day(conn, HEAVY_DATE, 0.30)
        result = run_hygiene(conn, db_only_config(pg_url), HEAVY_DATE)
        assert result.baseline_adjusted is True
        expected = 0.55 - BASELINE_STEP * plasticity_at(0.0)
        assert abs(_umore(conn) - expected) < 1e-6

        # many heavy days can never push below the clamp floor
        for _ in range(40):
            run_hygiene(conn, db_only_config(pg_url), HEAVY_DATE)
        assert _umore(conn) >= 0.35


def test_average_day_leaves_the_baseline_alone(pg_url: str) -> None:
    with psycopg.connect(pg_url) as conn:
        before = conn.execute(
            "select baseline from psyche_baselines where variable = 'umore'"
        ).fetchone()
        _seed_day(conn, CALM_DATE, 0.55)
        result = run_hygiene(conn, db_only_config(pg_url), CALM_DATE)
        assert result.baseline_adjusted is False
        after = conn.execute(
            "select baseline from psyche_baselines where variable = 'umore'"
        ).fetchone()
        assert before == after


def test_the_same_bad_day_moves_a_cub_more_than_an_elder(pg_url: str) -> None:
    """ADR-071, la prova che conta: invecchia la PLASTICITÀ, non l'energia.

    Stessa giornata, stesso database, due età: quanto il carattere si sposta è
    l'unica differenza — ed è quella che rende un anziano «uno che ha finito di
    diventare sé stesso» invece di uno stanco.
    """
    with psycopg.connect(pg_url) as conn:
        _seed_day(conn, HEAVY_DATE, 0.30)

        _age_days(conn, 1)
        run_hygiene(conn, db_only_config(pg_url), HEAVY_DATE)
        cub_move = 0.55 - _umore(conn)

        _age_days(conn, 1300)  # oltre la vita attesa media: convergente
        run_hygiene(conn, db_only_config(pg_url), HEAVY_DATE)
        elder_move = 0.55 - _umore(conn)

        assert cub_move > 0
        assert elder_move > 0  # non zero: un vecchio impara poco, non niente
        assert cub_move > elder_move * 5


def test_a_founder_who_has_not_accepted_mortality_stays_plastic(pg_url: str) -> None:
    """ADR-077: senza `mortal_from` non c'è arco, e quindi non c'è vecchiaia.

    Non è un caso limite: è lo stato di ogni esemplare nato prima di
    quell'ADR, finché il proprietario non accetta dal pannello. Un vecchio per
    `born_at` che invecchiasse comunque sarebbe l'orologio retroattivo che
    l'ADR vieta.
    """
    with psycopg.connect(pg_url) as conn:
        _seed_day(conn, HEAVY_DATE, 0.30)

        _age_days(conn, 1300)
        run_hygiene(conn, db_only_config(pg_url), HEAVY_DATE)
        elder_move = 0.55 - _umore(conn)

        # stessa creatura, stessi 1300 giorni vissuti, mortalità NON accettata
        conn.execute(
            "update gosini set mortal_from = null where id = %s", (PRIME_GOSINO_ID,)
        )
        conn.execute(
            "delete from psyche_baselines where gosino_id = %s and variable = 'umore'",
            (PRIME_GOSINO_ID,),
        )
        conn.commit()
        run_hygiene(conn, db_only_config(pg_url), HEAVY_DATE)
        immortal_move = 0.55 - _umore(conn)

        assert immortal_move > elder_move * 5


def test_a_genome_without_longevity_still_ages(pg_url: str) -> None:
    """Un genoma di prima di ADR-071 non ha il gene: vale la media, non un crash."""
    with psycopg.connect(pg_url) as conn:
        conn.execute(
            "update trait_sets set traits = '{\"calm\": 0.5}'::jsonb where gosino_id = %s",
            (PRIME_GOSINO_ID,),
        )
        _age_days(conn, 10)
        _seed_day(conn, HEAVY_DATE, 0.30)
        result = run_hygiene(conn, db_only_config(pg_url), HEAVY_DATE)
        assert result.baseline_adjusted is True
        assert _umore(conn) < 0.55
