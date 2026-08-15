"""The dream's own clock.

Until now the image ran the dream once and exited, and the schedule lived in
Coolify. That produced a restart loop: a platform that treats the resource as
a service restarts anything that exits, and Coolify's scheduled tasks execute
*inside* the running container — so the container has to stay up anyway.

Same lesson as the migrations: what the program must guarantee cannot live in
a configuration box someone forgets to fill. The dream keeps its own clock, so
`docker run` is enough, on any platform, with no scheduler outside.
"""

from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass, replace
from datetime import datetime, time as clock, timedelta
from zoneinfo import ZoneInfo

import psycopg

from .config import ConfigError, JobsConfig
from .dream import run_dream, yesterday

DEFAULT_AT = "02:30"
# a failed night must not become a hot loop; the markers make a retry harmless
RETRY_AFTER_FAILURE_S = 900


def parse_at(value: str) -> clock:
    """`HH:MM` → a wall-clock time. Refuses anything else instead of guessing."""
    try:
        hours, minutes = value.strip().split(":")
        return clock(hour=int(hours), minute=int(minutes))
    except (ValueError, AttributeError) as error:
        raise ConfigError(f"UGO_DREAM_AT must look like HH:MM, got {value!r}") from error


def next_run_at(now: datetime, at: clock) -> datetime:
    """The next occurrence of `at`, strictly in the future.

    Strictly: a run that finishes in under a second must not immediately
    qualify as the next one.
    """
    today = now.replace(
        hour=at.hour, minute=at.minute, second=0, microsecond=0
    )
    if today > now:
        return today
    return today + timedelta(days=1)


@dataclass(frozen=True)
class _House:
    household_id: str
    timezone: str


def _houses(cfg: JobsConfig) -> list[_House]:
    """Le case aperte, ciascuna col suo fuso.

    Con `UGO_HOUSEHOLD_ID` impostata il job serve quella sola — che e' come si
    schiera un container per famiglia. Senza, le serve tutte, che e' come gira
    oggi il vicinato su un ferro solo.
    """
    with psycopg.connect(cfg.database_url) as conn:
        if os.environ.get("UGO_HOUSEHOLD_ID"):
            rows = conn.execute(
                "select id, timezone from households where id = %s and closed_at is null",
                (cfg.household_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "select id, timezone from households where closed_at is null order by created_at"
            ).fetchall()
    return [_House(str(row[0]), str(row[1])) for row in rows]


def run_forever(
    cfg: JobsConfig,
    at_value: str = DEFAULT_AT,
    *,
    sleep=time.sleep,  # noqa: ANN001 - injectable so the loop is testable
    now=None,  # noqa: ANN001
    rounds: int | None = None,
) -> int:
    """Sleep until the hour, dream, repeat. `rounds` bounds it for tests."""
    at = parse_at(at_value)
    zone = ZoneInfo(cfg.timezone)
    clock_now = now or (lambda: datetime.now(zone))
    done = 0

    print(
        json.dumps({"scheduler": {"at": at_value, "timezone": cfg.timezone}}),
        flush=True,
    )
    while rounds is None or done < rounds:
        target = next_run_at(clock_now(), at)
        delay = (target - clock_now()).total_seconds()
        if delay > 0:
            sleep(delay)
        try:
            for house in _houses(cfg):
                # ADR-019 fase 3: «le 02:30» non e' piu' un'ora sola. Ogni casa
                # ha il suo fuso (`households.timezone`), quindi ogni casa ha
                # il suo ieri — e sveglia il sogno con il proprio, non con
                # quello del processo.
                run_cfg = replace(cfg, household_id=house.household_id, timezone=house.timezone)
                report = run_dream(run_cfg, yesterday(run_cfg))
                print(
                    json.dumps({"dream_report": report, "household": house.household_id}),
                    flush=True,
                )
        except Exception as error:  # noqa: BLE001 - one bad night is not the end
            # never crash the container: tomorrow's dream must still happen,
            # and the step markers make the retry a no-op for what succeeded
            print(json.dumps({"dream_failed": str(error)}), file=sys.stderr, flush=True)
            sleep(RETRY_AFTER_FAILURE_S)
        done += 1
    return 0


def main() -> int:
    try:
        cfg = JobsConfig.from_env()
    except ConfigError as error:
        print(str(error), file=sys.stderr)
        return 1
    # ADR-054: the customer sources keep their own interval, in a thread of
    # their own, so neither cadence bends the other. Import here, not at the
    # top: the sync loop is optional machinery the dream must not depend on.
    from threading import Thread

    from .customer_sync import run_sync_forever

    Thread(target=run_sync_forever, args=(cfg,), daemon=True).start()
    return run_forever(cfg, cfg.dream_at)


if __name__ == "__main__":
    raise SystemExit(main())
