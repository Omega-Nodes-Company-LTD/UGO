"""I feed, e il consiglio del mattino (ADR-060, gruppo 10).

Due metà, con due orologi diversi:

- ``run_feeds``: scarica i feed RSS/Atom iscritti dal pannello, deduplica per
  ``(feed, guid)`` e embedda le novità col modello locale. Gira in un thread
  suo a cadenza ``UGO_FEEDS_EVERY_H``, come i sync dei clienti (ADR-054);
- ``run_advise``: il passo del sogno. Incrocia le novità delle ultime 48 ore
  con la conoscenza dei clienti (``customer_chunks``) e — SOLO sopra una
  soglia alta di somiglianza — mette in fila un desiderio per il gosino
  assegnato a quel cliente: la mattina UGO si sveglia con «è uscita X,
  proporla a Rossi» in testa, e lo dice come dice il resto (``sayDesire``).

I paletti, che sono il progetto:

- il testo dei feed è PUBBLICO per definizione: sta in chiaro, e la regola 6
  protegge le persone e le conversazioni, non i comunicati stampa;
- l'incrocio feed×cliente invece è sensibile — dice a cosa lavora chi — e
  vive solo nel desiderio del gosino di CASA: non esce mai in reception;
- un consiglio al giorno per casa, al massimo: meglio uno a settimana buono
  che tre al giorno tirati. E un item consigliato non si riconsiglia mai;
- zero token del provider: fetch HTTP, embedding Ollama, incrocio pgvector,
  frase da sagoma deterministica. Il ``budget_ledger`` non vede passare nulla.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Callable
from zoneinfo import ZoneInfo

import psycopg

from .config import JobsConfig
from .embeddings import embed

#: sopra questa distanza coseno il nesso è tirato, e un consiglio tirato è
#: peggio di nessun consiglio. Taratura da banco: nomic-embed mette i testi
#: davvero affini sotto ~0.4 e il rumore sopra ~0.55.
ADVISE_MAX_DISTANCE = 0.40
#: quante novità per giro di fetch: un feed che ne pubblica cento non deve
#: mangiarsi il thread
MAX_ITEMS_PER_FETCH = 30
#: quanto indietro guarda il sogno: una novità di una settimana fa non è più
#: una novità, è un arretrato
ADVISE_WINDOW_HOURS = 48
#: il tetto: un consiglio al giorno per casa
ADVICE_PER_DAY = 1
FETCH_TIMEOUT_S = 20
RETRY_AFTER_FAILURE_S = 300


@dataclass(frozen=True)
class FeedEntry:
    guid: str
    title: str
    link: str | None
    summary: str | None
    published_at: datetime | None


def _text(node: ET.Element | None) -> str | None:
    if node is None or node.text is None:
        return None
    value = node.text.strip()
    return value or None


def _when(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        return parsedate_to_datetime(value)
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def parse_feed(xml_text: str) -> list[FeedEntry]:
    """RSS 2.0 e Atom, con la libreria standard: un parser tollerante che
    estrae il minimo che serve. Un item senza titolo non è un articolo e si
    salta; senza guid si ripiega sul link, e senza nemmeno quello sul titolo —
    il dedup deve avere QUALCOSA su cui stare in piedi."""
    root = ET.fromstring(xml_text)
    entries: list[FeedEntry] = []

    for item in root.iter("item"):  # RSS 2.0
        title = _text(item.find("title"))
        if title is None:
            continue
        link = _text(item.find("link"))
        guid = _text(item.find("guid")) or link or title
        entries.append(
            FeedEntry(
                guid=guid,
                title=title,
                link=link,
                summary=_text(item.find("description")),
                published_at=_when(_text(item.find("pubDate"))),
            )
        )

    atom = "{http://www.w3.org/2005/Atom}"
    for entry in root.iter(f"{atom}entry"):
        title = _text(entry.find(f"{atom}title"))
        if title is None:
            continue
        link_node = entry.find(f"{atom}link")
        link = link_node.get("href") if link_node is not None else None
        guid = _text(entry.find(f"{atom}id")) or link or title
        summary = _text(entry.find(f"{atom}summary")) or _text(entry.find(f"{atom}content"))
        entries.append(
            FeedEntry(
                guid=guid,
                title=title,
                link=link,
                summary=summary,
                published_at=_when(_text(entry.find(f"{atom}updated"))),
            )
        )

    return entries[:MAX_ITEMS_PER_FETCH]


def _download(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "ugo-feeds/1.0"})
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_S) as response:  # noqa: S310
        return response.read().decode("utf-8", errors="replace")


def run_feeds(
    cfg: JobsConfig,
    conn: psycopg.Connection | None = None,
    *,
    download: Callable[[str], str] = _download,
    vectorize: Callable[[JobsConfig, list[str]], list[list[float]]] = embed,
) -> dict:
    """Un giro su tutte le case: scarica, deduplica, embedda.

    ``download`` e ``vectorize`` sono iniettabili per i test (server HTTP
    locale e vettori da seme, come le factory TS); in produzione sono il
    fetch vero e l'Ollama vero.
    """
    owned = conn is None
    connection = conn or psycopg.connect(cfg.database_url)
    report: dict = {}
    try:
        feeds = connection.execute(
            "select id, household_id, url from rss_feeds where enabled order by created_at"
        ).fetchall()
        for feed_id, household_id, url in feeds:
            outcome: dict[str, object] = {"new": 0}
            try:
                entries = parse_feed(download(url))
                for entry in entries:
                    inserted = connection.execute(
                        """
                        insert into feed_items
                          (household_id, feed_id, guid, title, link, summary, published_at)
                        values (%s, %s, %s, %s, %s, %s, %s)
                        on conflict (feed_id, guid) do nothing
                        returning id
                        """,
                        (
                            household_id,
                            feed_id,
                            entry.guid,
                            entry.title,
                            entry.link,
                            entry.summary,
                            entry.published_at,
                        ),
                    ).fetchone()
                    if inserted is not None:
                        outcome["new"] = int(outcome["new"]) + 1  # type: ignore[call-overload]
                connection.execute(
                    "update rss_feeds set last_fetched_at = now(), last_status = 'ok' where id = %s",
                    (feed_id,),
                )
            except Exception as error:  # noqa: BLE001 - un feed rotto non ferma gli altri
                # la CLASSE dell'errore, mai il corpo: nel pannello basta il genere
                connection.execute(
                    "update rss_feeds set last_fetched_at = now(), last_status = %s where id = %s",
                    (type(error).__name__, feed_id),
                )
                outcome["error"] = type(error).__name__
            report[str(feed_id)] = outcome

        # l'embedding in coda, a lotti: un item senza vettore non è ancora
        # visibile al sogno, e va benissimo — lo diventa al prossimo giro
        pending = connection.execute(
            """
            select id, title, coalesce(summary, '') from feed_items
            where embedding is null order by created_at limit 50
            """
        ).fetchall()
        if pending:
            texts = [f"{title}\n{summary}".strip() for _, title, summary in pending]
            vectors = vectorize(cfg, texts)
            for (item_id, _, _), vector in zip(pending, vectors, strict=True):
                connection.execute(
                    "update feed_items set embedding = %s::vector where id = %s",
                    (json.dumps(vector), item_id),
                )
        report["embedded"] = len(pending)
        connection.commit()
        return report
    finally:
        if owned:
            connection.close()


def run_advise(conn: psycopg.Connection, cfg: JobsConfig) -> dict:
    """Il passo del sogno, per una casa: al massimo UN consiglio al giorno.

    Un item non assegnabile (nessun gosino ascolta quel cliente) resta non
    marcato: se domani l'assegnazione arriva, il consiglio pure — finché la
    finestra delle 48 ore non lo declassa da novità ad arretrato.
    """
    zone = ZoneInfo(cfg.timezone)
    today = datetime.now(zone).date().isoformat()
    (already,) = conn.execute(
        """
        select count(*) from feed_items
        where household_id = %s
          and (advised_at at time zone %s)::date = %s::date
        """,
        (cfg.household_id, cfg.timezone, today),
    ).fetchone()
    if int(already) >= ADVICE_PER_DAY:
        return {"advised": 0, "reason": "daily cap"}

    since = datetime.now(timezone.utc) - timedelta(hours=ADVISE_WINDOW_HOURS)
    candidates = conn.execute(
        """
        select id, title, link, embedding from feed_items
        where household_id = %s and embedding is not null
          and advised_at is null and created_at >= %s
        order by created_at desc limit 20
        """,
        (cfg.household_id, since),
    ).fetchall()

    best: tuple[str, str, str | None, str, str, float] | None = None
    for item_id, title, link, embedding in candidates:
        row = conn.execute(
            """
            select c.customer_id, cu.name, (c.embedding <=> %s::vector) as distance
            from customer_chunks c
            join customers cu on cu.id = c.customer_id
            where c.household_id = %s and cu.archived_at is null
            order by c.embedding <=> %s::vector asc
            limit 1
            """,
            (embedding, cfg.household_id, embedding),
        ).fetchone()
        if row is None:
            continue
        customer_id, customer_name, distance = row
        if float(distance) > ADVISE_MAX_DISTANCE:
            continue
        if best is None or float(distance) < best[5]:
            best = (str(item_id), title, link, str(customer_id), customer_name, float(distance))

    if best is None:
        return {"advised": 0, "reason": "nothing close enough"}

    item_id, title, link, customer_id, customer_name, distance = best
    listener = conn.execute(
        "select gosino_id from customer_gosini where customer_id = %s order by created_at limit 1",
        (customer_id,),
    ).fetchone()
    if listener is None:
        return {"advised": 0, "reason": "no gosino assigned"}

    tail = f" ({link})" if link else ""
    text = (
        f"Ho letto una novità che potrebbe servire a {customer_name}: «{title}» — "
        f"somiglia a quello su cui lavora, magari vale la pena proporgliela.{tail}"
    )
    conn.execute(
        "insert into desires (gosino_id, text, due_hint) values (%s, %s, 'stamattina')",
        (listener[0], text),
    )
    conn.execute("update feed_items set advised_at = now() where id = %s", (item_id,))
    conn.commit()
    return {"advised": 1, "distance": round(distance, 3)}


def feeds_every_seconds() -> float:
    return float(os.environ.get("UGO_FEEDS_EVERY_H", "6")) * 3600


def run_feeds_forever(
    cfg: JobsConfig,
    *,
    sleep=time.sleep,  # noqa: ANN001 - injectable so the loop is testable
    rounds: int | None = None,
) -> int:
    """Il thread dei feed, gemello di `run_sync_forever` (ADR-054)."""
    every = feeds_every_seconds()
    if every <= 0:
        print(json.dumps({"feeds": "off"}), flush=True)
        return 0
    done = 0
    while rounds is None or done < rounds:
        try:
            report = run_feeds(cfg)
            print(json.dumps({"feeds_report": report}), flush=True)
        except Exception as error:  # noqa: BLE001 - one bad round is not the end
            print(json.dumps({"feeds_failed": str(error)}), file=sys.stderr, flush=True)
            sleep(RETRY_AFTER_FAILURE_S)
        done += 1
        sleep(every)
    return 0
