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
    account_id: str
    timezone: str


# ADR-125: i piani che sognano. Lo stesso elenco sta in TypeScript
# (`packages/shared/src/plans.ts`): `test_shared_constants.py` li confronta.
DREAM_PLANS = ("pro", "allevamento")
LIVE_SUBSCRIPTION = ("active", "trialing", "past_due")

# Davanti a internet (UGO_PUBLIC=on) sogna solo chi ha il sogno nel piano:
# un abbonamento vivo o una concessione dell'operatore. In casa sognano tutte,
# come prima dei piani — un'installazione del proprietario non vende a se stessa.
_DREAMERS = """
    select a.id, a.timezone from accounts a
    left join subscriptions s on s.account_id = a.id
    where a.closed_at is null
      and (%(everyone)s
           or a.plan_grant = any(%(plans)s)
           or (s.plan = any(%(plans)s) and s.status = any(%(live)s)))
"""


def _houses(cfg: JobsConfig) -> list[_House]:
    """Le case aperte che sognano, ciascuna col suo fuso.

    Con `UGO_HOUSEHOLD_ID` impostata il job serve quella sola — che e' come si
    schiera un container per famiglia. Senza, le serve tutte, che e' come gira
    oggi il vicinato su un ferro solo.
    """
    params = {
        "everyone": os.environ.get("UGO_PUBLIC", "off") != "on",
        "plans": list(DREAM_PLANS),
        "live": list(LIVE_SUBSCRIPTION),
    }
    with psycopg.connect(cfg.database_url) as conn:
        if os.environ.get("UGO_HOUSEHOLD_ID"):
            rows = conn.execute(
                _DREAMERS + " and a.id = %(account)s", {**params, "account": cfg.account_id}
            ).fetchall()
        else:
            rows = conn.execute(_DREAMERS + " order by a.created_at", params).fetchall()
    return [_House(str(row[0]), str(row[1])) for row in rows]


def _record_dream_audit(cfg: JobsConfig, verb: str, outcome: str) -> None:
    """Una riga nel giornale dell'audit (ADR-049), per casa: che la notte sia
    andata bene o male, deve essercene traccia leggibile dal pannello e dai
    monitor. Solo id e verbi, mai contenuti — la stessa disciplina del lato TS.
    Una scrittura che fallisce NON fa fallire il sogno: la riga è preziosa,
    ma un giornale non deve poter bloccare chi sta sognando.
    """
    try:
        with psycopg.connect(cfg.database_url) as conn:
            conn.execute(
                "insert into audit_log (account_id, verb, outcome, resource_type) "
                "values (%s, %s, %s, 'dream')",
                (cfg.account_id, verb, outcome),
            )
            conn.commit()
    except Exception:  # noqa: BLE001 - un audit mancante non deve spegnere la notte
        print(
            json.dumps({"audit_write_failed": verb, "account": cfg.account_id}),
            file=sys.stderr,
            flush=True,
        )


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
        failed = 0
        # Il `try` sta DENTRO il ciclo, e non attorno. Con l'`except` fuori,
        # la prima casa che sollevava — un bucket irraggiungibile, un esemplare
        # ritirato — faceva uscire dal ciclo, e tutte le case successive non
        # sognavano affatto quella notte. Il log diceva `dream_failed` una
        # volta sola e non nominava nemmeno chi era rimasto fuori: una famiglia
        # poteva restare senza sogno per settimane senza che niente lo dicesse.
        # Ora un guasto è di UNA casa, e le altre proseguono.
        for house in _houses(cfg):
            try:
                # ADR-019 fase 3: «le 02:30» non e' piu' un'ora sola. Ogni casa
                # ha il suo fuso (`accounts.timezone`), quindi ogni casa ha
                # il suo ieri — e sveglia il sogno con il proprio, non con
                # quello del processo.
                run_cfg = replace(cfg, account_id=house.account_id, timezone=house.timezone)
                report = run_dream(run_cfg, yesterday(run_cfg))
                print(
                    json.dumps({"dream_report": report, "account": house.account_id}),
                    flush=True,
                )
                _record_dream_audit(run_cfg, "dream_completed", "ok")
            except Exception as error:  # noqa: BLE001 - one bad night is not the end
                # never crash the container: tomorrow's dream must still happen,
                # and the step markers make the retry a no-op for what succeeded
                failed += 1
                print(
                    json.dumps(
                        {"dream_failed": str(error), "account": house.account_id}
                    ),
                    file=sys.stderr,
                    flush=True,
                )
                _record_dream_audit(run_cfg, "dream_failed", "error")
        if failed:
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
    from .feeds import run_feeds_forever

    Thread(target=run_sync_forever, args=(cfg,), daemon=True).start()
    # ADR-060: i feed hanno il loro passo, come le fonti dei clienti — un
    # thread a cadenza propria, e il sogno non dipende da nessuno dei due
    Thread(target=run_feeds_forever, args=(cfg,), daemon=True).start()
    return run_forever(cfg, cfg.dream_at)


if __name__ == "__main__":
    raise SystemExit(main())
