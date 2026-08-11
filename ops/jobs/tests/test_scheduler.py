"""The dream's clock (no sleeping in the tests, and no database either).

The scheduling maths is pure, so it is unit-tested; what it drives is already
covered by the dream's own integration tests.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

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

    class Cfg:
        timezone = "Europe/Rome"

    exit_code = run_forever(
        Cfg(),
        "02:30",
        sleep=slept.append,
        now=lambda: datetime(2026, 8, 11, 2, 29, 30, tzinfo=ROME),
        rounds=2,
    )
    assert exit_code == 0
    # two nights attempted, each followed by a back-off instead of a hot loop
    assert len(slept) == 4
    assert scheduler.RETRY_AFTER_FAILURE_S in slept
