"""Dove le cose seguite guardano (ADR-133): i feed della casa e il web.

Solo somiglianza, niente parole: i vettori dei feed ci sono già, quelli dei
risultati del web li calcola Ollama in casa. Il giudizio vero è dopo, in
``watch_look``, e solo sui vicini.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Callable

import httpx
import psycopg

from .config import JobsConfig
from .watch_note import Vectorize

FEED_MAX_DISTANCE = 0.45
WEB_MAX_DISTANCE = 0.50
SEARCH_EVERY_DAYS = 7
MAX_SEARCHES = 5
QUERIES_PER_WATCH = 2
RESULTS_PER_QUERY = 5

Search = Callable[[str], "list[dict[str, str]] | None"]


@dataclass
class Candidate:
    watch_id: str
    gosino_id: str
    kind: str
    subject: str
    title: str
    url: str
    snippet: str
    distance: float


def searx(cfg: JobsConfig) -> Search | None:
    if not cfg.searxng_url:
        return None

    def search(query: str) -> list[dict[str, str]] | None:
        try:
            response = httpx.get(
                f"{cfg.searxng_url.rstrip('/')}/search",
                params={"q": query, "format": "json", "language": "it", "categories": "news", "time_range": "month"},
                timeout=15,
            )
            response.raise_for_status()
            results = response.json().get("results", [])
        except (httpx.HTTPError, ValueError):
            return None
        return [
            {"title": str(r.get("title", "")), "url": str(r.get("url", "")), "content": str(r.get("content", ""))}
            for r in results[:RESULTS_PER_QUERY]
            if r.get("url")
        ]

    return search


def cosine_distance(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return 1.0 if norm == 0 else 1.0 - dot / norm


def from_feeds(conn: psycopg.Connection, cfg: JobsConfig, subjects: dict[str, tuple[str, str, str]]) -> list[Candidate]:
    rows = conn.execute(
        """
        select w.id, f.title, f.link, coalesce(f.summary, ''), (f.embedding <=> w.embedding) as d
        from watches w join feed_items f on f.account_id = w.account_id
        where w.account_id = %s and w.status = 'attivo' and w.until > now() and w.embedding is not null
          and f.embedding is not null and f.link is not null
          and f.created_at >= now() - interval '48 hours'
          and (f.embedding <=> w.embedding) <= %s
        """,
        (cfg.account_id, FEED_MAX_DISTANCE),
    ).fetchall()
    out = []
    for watch_id, title, link, summary, distance in rows:
        gosino, kind, subject = subjects[str(watch_id)]
        out.append(Candidate(str(watch_id), gosino, kind, subject, title, link, summary, float(distance)))
    return out


def from_web(conn, cfg, watches, search: Search, vectorize: Vectorize) -> list[Candidate]:  # noqa: ANN001
    found: list[tuple[tuple, dict[str, str]]] = []
    for watch in [w for w in watches if w[6]][:MAX_SEARCHES]:
        searched = False
        for query in json.loads(watch[4])[:QUERIES_PER_WATCH]:
            results = search(query)
            if results is None:
                continue  # SearXNG giù: la prossima notte riprova
            searched = True
            found.extend((watch, result) for result in results)
        if searched:
            conn.execute("update watches set last_searched_at = now() where id = %s", (watch[0],))
    conn.commit()
    if not found:
        return []
    vectors = vectorize(cfg, [f"{r['title']}\n{r['content']}" for _, r in found])
    out = []
    for (watch, result), vector in zip(found, vectors, strict=True):
        distance = cosine_distance(watch[5], vector)
        if distance <= WEB_MAX_DISTANCE:
            out.append(Candidate(watch[0], watch[1], watch[2], watch[3], result["title"], result["url"], result["content"], distance))
    return out


