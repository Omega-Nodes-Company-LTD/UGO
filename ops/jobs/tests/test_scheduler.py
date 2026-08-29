"""The dream's clock (no sleeping in the tests, and no database either).

The scheduling maths is pure, so it is unit-tested; what it drives is already
covered by the dream's own integration tests.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from conftest import db_only_config, make_house
from ugo_jobs.config import ConfigError
from ugo_jobs.scheduler import next_run_at, parse_at, run_forever

ROME = ZoneInfo("Europe/Rome")


def at(text: str = "02:30"):  # noqa: ANN201
    return parse_at(text)


def test_waits_until_tonight_when_the_hour_is_still_ahead() -> None:
    now = datetime(2026, 8, 11, 22, 0, tzinfo=ROME)
    assert next_run_at(now, at()) == datetime(2026, 8, 12, 2, 30, tzinfo=ROME)


def test_waits_for_tomorrow_when_the_hour_has_passed() -> None:
    now = datetime(2026, 8, 11, 9, 0, tzinfo=ROME)
    assert next_run_at(now, at()) == datetime(2026, 8, 12, 2, 30, tzinfo=ROME)


def test_never_returns_the_instant_it_was_asked_about() -> None:
    """A dream that finishes in under a second must not qualify as the next
    one: that is exactly the restart loop we are getting rid of."""
    now = datetime(2026, 8, 11, 2, 30, tzinfo=ROME)
    assert next_run_at(now, at()) == datetime(2026, 8, 12, 2, 30, tzinfo=ROME)


@pytest.mark.parametrize(
    "moment",
    [
        datetime(2026, 3, 29, 1, 0, tzinfo=ROME),  # the night the clocks go forward
        datetime(2026, 10, 25, 1, 0, tzinfo=ROME),  # and the night they go back
        datetime(2026, 12, 31, 23, 59, tzinfo=ROME),  # across the year
    ],
)
def test_always_lands_in_the_future(moment: datetime) -> None:
    target = next_run_at(moment, at())
    assert target > moment
    assert target - moment <= timedelta(days=1, hours=2)


def test_refuses_an_hour_it_cannot_read_instead_of_guessing() -> None:
    for bad in ["", "2.30", "25:00", "half past two", "02:61"]:
        with pytest.raises(ConfigError):
            parse_at(bad)


def test_one_bad_night_does_not_kill_the_container(monkeypatch) -> None:  # noqa: ANN001
    """A crash used to take the process down; the platform restarted it and the
    dream ran again immediately. Now it is logged and the loop survives."""
    from ugo_jobs import scheduler

    slept: list[float] = []
    monkeypatch.setattr(
        scheduler, "run_dream", lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("pg_dump"))
    )
    monkeypatch.setattr(scheduler, "yesterday", lambda _cfg: "2026-08-10")
    # ADR-019 fase 3: il ciclo passa dalle case, e questo file non ha un
    # database — quel che e' sotto prova qui e' che una notte storta non
    # ammazzi il container, non come si elencano le famiglie
    monkeypatch.setattr(
        scheduler, "_houses", lambda _cfg: [scheduler._House("00000000-0000-4000-8000-000000000002", "Europe/Rome")]
    )

    # una JobsConfig vera, perche' il ciclo ne fa una copia per casa
    # (`dataclasses.replace`) e un finto oggetto non si lascia copiare
    cfg = db_only_config("postgres://unused")

    exit_code = run_forever(
        cfg,
        "02:30",
        sleep=slept.append,
        now=lambda: datetime(2026, 8, 11, 2, 29, 30, tzinfo=ROME),
        rounds=2,
    )
    assert exit_code == 0
    # two nights attempted, each followed by a back-off instead of a hot loop
    assert len(slept) == 4
    assert scheduler.RETRY_AFTER_FAILURE_S in slept


def test_dream_audit_writes_a_journal_row(pg_url) -> None:  # noqa: ANN001
    """Il sogno lascia la sua impronta nel giornale dell'audit: che la notte
    sia andata bene o male, il pannello e i monitor devono poterla leggere.
    Solo id e verbi, mai contenuti (la regola 6 vale anche qui)."""
    import psycopg

    from ugo_jobs.scheduler import _record_dream_audit

    with psycopg.connect(pg_url) as conn:
        house = make_house(conn, "casa-audit-sogno")

    cfg = db_only_config(pg_url, account_id=house)
    _record_dream_audit(cfg, "dream_completed", "ok")

    with psycopg.connect(pg_url) as conn:
        rows = conn.execute(
            "select verb, outcome, resource_type, account_id "
            "from audit_log where verb = 'dream_completed' and account_id = %s",
            (house,),
        ).fetchall()
    assert [(verb, outcome, rtype, str(account)) for verb, outcome, rtype, account in rows] == [
        ("dream_completed", "ok", "dream", house)
    ]


def test_dream_audit_never_raises(pg_url) -> None:  # noqa: ANN001
    """Una scrittura che fallisce (es. database irraggiungibile) non deve
    spegnere il sogno: il giornale è prezioso, non indispensabile."""
    import psycopg

    from ugo_jobs.scheduler import _record_dream_audit

    cfg = db_only_config("postgres://utente:errata@127.0.0.1:1/db_inesistente", account_id="x")
    # non solleva: si limita a loggare il fallimento
    _record_dream_audit(cfg, "dream_failed", "error")
