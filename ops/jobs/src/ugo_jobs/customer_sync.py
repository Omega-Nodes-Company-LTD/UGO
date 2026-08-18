"""The sources' own clock (ADR-054).

The dream keeps the night; the customer sync keeps its own interval
(``UGO_CUSTOMER_SYNC_EVERY_H``, default 6 hours, 0 = off), in a loop of its
own so neither cadence bends the other. Same resilience contract as the
dream: one bad round is logged and the loop survives.
"""

from __future__ import annotations

import json
import os
import sys
import time

import psycopg

from .config import JobsConfig
from .customer_docs import run_docs
from .customer_mail import run_mail
from .customer_repos import run_repos


def sync_every_seconds() -> float:
    return float(os.environ.get("UGO_CUSTOMER_SYNC_EVERY_H", "6")) * 3600


def run_customer_sync(cfg: JobsConfig, conn: psycopg.Connection | None = None) -> dict:
    """One full round: every open house, every source kind."""
    owned = conn is None
    connection = conn or psycopg.connect(cfg.database_url)
    try:
        houses = connection.execute(
            "select id from accounts where closed_at is null order by created_at"
        ).fetchall()
        report: dict = {}
        for (account_id,) in houses:
            # ADR-062/098: la casa si dichiara alla sessione prima del suo
            # giro — la connessione serve le case in serie, e sotto l'utenza
            # applicativa le fonti di una casa non dichiarata sono zero righe
            connection.execute(
                "select set_config('app.account_id', %s, false)", (str(account_id),)
            )
            report[str(account_id)] = {
                "repos": run_repos(connection, cfg, str(account_id)),
                "mail": run_mail(connection, cfg, str(account_id)),
                "docs": run_docs(connection, cfg, str(account_id)),
            }
        connection.commit()
        return report
    finally:
        if owned:
            connection.close()


def run_sync_forever(
    cfg: JobsConfig,
    *,
    sleep=time.sleep,  # noqa: ANN001 - injectable so the loop is testable
    rounds: int | None = None,
) -> int:
    every = sync_every_seconds()
    if every <= 0:
        print(json.dumps({"customer_sync": "off"}), flush=True)
        return 0
    done = 0
    while rounds is None or done < rounds:
        try:
            run_customer_sync(cfg)
        except Exception as error:  # noqa: BLE001 - one bad round is not the end
            print(json.dumps({"customer_sync_failed": str(error)}), file=sys.stderr, flush=True)
        done += 1
        sleep(every)
    return 0
