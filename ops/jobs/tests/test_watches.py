"""Le cose che segue (ADR-133) contro Postgres vero.

La testa è lo stub di rete di soul (conftest), SearXNG e l'articolo sono un
server HTTP vero su 127.0.0.1; i vettori sono da seme come in test_feeds:
si asserisce cosa entra nel prompt, cosa resta cifrato, la soglia, i tetti e
il desiderio col link — mai cosa si inventa un modello.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import psycopg
import pytest

from conftest import TEST_DATA_KEY, db_only_config, make_gosino, make_house
from test_feeds import seed_vector
from ugo_jobs.crypto import decrypt_text, encrypt_text, parse_data_key
from ugo_jobs.safe_fetch import fetch_text, is_public_host, page_text
from ugo_jobs.watch_look import run_watch_look
from ugo_jobs.watch_note import run_watch_note

KEY = parse_data_key(TEST_DATA_KEY)
NOTE_MARKER = "rileggi quello che il tuo proprietario"
JUDGE_MARKER = "È uscito questo articolo"
UGANDA = seed_vector(7)
NOTES = {
    "nuovi": [{"tipo": "progetto", "soggetto": "andare in Uganda a febbraio",
               "ricerche": ["Uganda sicurezza viaggi", "Uganda Farnesina"], "giorni": 120}],
    "chiusi": [],
}
YES = {"pertinente": True, "frase": "Ricordo che volevi andare in Uganda: la Farnesina sconsiglia i viaggi.",
       "riassunto": "Disordini al confine nord; viaggiare sicuri invita a rinviare."}


def vectorize(_cfg, texts: list[str]) -> list[list[float]]:  # noqa: ANN001
    return [seed_vector(7, 0.05) if "Uganda" in text else seed_vector(len(text) + 300) for text in texts]


class _World(BaseHTTPRequestHandler):
    queries: list[str] = []

    def do_GET(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        if url.path == "/search":
            type(self).queries.append(parse_qs(url.query)["q"][0])
            base = f"http://127.0.0.1:{self.server.server_port}"
            body = json.dumps({"results": [
                {"title": "Uganda, la Farnesina sconsiglia i viaggi", "url": f"{base}/articolo", "content": "Uganda avviso"},
                {"title": "Ricette di fango", "url": f"{base}/fango", "content": "fango"},
            ]}).encode()
            ctype = "application/json"
        else:
            body = b"<html><script>x()</script><p>La Farnesina invita a rinviare i viaggi in Uganda.</p></html>"
            ctype = "text/html; charset=utf-8"
        self.send_response(200)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args: object) -> None:
        pass


@pytest.fixture(scope="module")
def world():
    server = HTTPServer(("127.0.0.1", 0), _World)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()


@pytest.fixture
def house(pg_url: str):
    with psycopg.connect(pg_url) as conn:
        account_id = make_house(conn, f"casa-segue-{uuid4().hex[:8]}")
        gosino_id = make_gosino(conn, account_id, "Ugo")
        conn.commit()
        yield conn, account_id, gosino_id


def say(conn, gosino_id: str, text: str, channel: str = "home", being: str | None = None) -> None:  # noqa: ANN001
    conn.execute(
        "insert into messages (gosino_id, ts, channel, role, being_id, text) values (%s, now(), %s, 'user', %s, %s)",
        (gosino_id, channel, being, encrypt_text(text, KEY)),
    )
    conn.commit()


def cfg_for(pg_url: str, batch_stub, account_id: str, gosino_id: str, **extra: object):  # noqa: ANN001, ANN201
    return db_only_config(pg_url, account_id=account_id, gosino_id=gosino_id, soul_url=batch_stub.base_url,
                          internal_token="t", **extra)


def today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def test_capisce_da_come_parla_solo_il_proprietario_e_cifra(pg_url: str, batch_stub, house) -> None:  # noqa: ANN001
    conn, account_id, gosino_id = house
    minor = conn.execute("insert into beings (account_id, display_name, is_minor) values (%s, 'Sofia', true) returning id",
                         (account_id,)).fetchone()[0]
    say(conn, gosino_id, "A febbraio voglio andare in Uganda")
    say(conn, gosino_id, "segreto della piccola", being=str(minor))
    say(conn, gosino_id, "battuta in piazza", channel="piazza")
    batch_stub.routes = [(NOTE_MARKER, NOTES)]
    batch_stub.calls = []
    report = run_watch_note(conn, cfg_for(pg_url, batch_stub, account_id, gosino_id), today(), vectorize)
    assert report == {"new": 1, "closed": 0}
    prompt = str(batch_stub.calls[-1]["prompt"])
    assert "voglio andare in Uganda" in prompt
    assert "segreto della piccola" not in prompt and "battuta in piazza" not in prompt
    subject, queries = conn.execute("select subject_enc, queries_enc from watches where account_id = %s",
                                    (account_id,)).fetchone()
    assert "Uganda" not in subject and "Uganda" not in queries
    assert decrypt_text(subject, KEY) == "andare in Uganda a febbraio"

    # il giorno dopo: «non ci vado più» chiude la numero 1
    batch_stub.routes = [(NOTE_MARKER, {"nuovi": [], "chiusi": [1]})]
    assert run_watch_note(conn, cfg_for(pg_url, batch_stub, account_id, gosino_id), today(), vectorize)["closed"] == 1


def test_senza_parole_niente_testa(pg_url: str, batch_stub, house) -> None:  # noqa: ANN001
    conn, account_id, gosino_id = house
    batch_stub.calls = []
    report = run_watch_note(conn, cfg_for(pg_url, batch_stub, account_id, gosino_id), today(), vectorize)
    assert report["new"] == 0 and batch_stub.calls == []


def watch(conn, account_id: str, gosino_id: str) -> str:  # noqa: ANN001
    return str(conn.execute(
        """insert into watches (account_id, gosino_id, kind, subject_enc, queries_enc, embedding, until)
           values (%s, %s, 'progetto', %s, %s, %s::vector, now() + interval '90 days') returning id""",
        (account_id, gosino_id, encrypt_text("andare in Uganda a febbraio", KEY),
         encrypt_text(json.dumps(["Uganda sicurezza viaggi"]), KEY), json.dumps(UGANDA)),
    ).fetchone()[0])


def test_dal_web_legge_l_articolo_e_propone_col_link(pg_url: str, batch_stub, house, world: str) -> None:  # noqa: ANN001
    conn, account_id, gosino_id = house
    conn.execute("update accounts set watch_web = true where id = %s", (account_id,))
    watch(conn, account_id, gosino_id)
    conn.commit()
    batch_stub.routes = [(JUDGE_MARKER, YES)]
    batch_stub.calls = []
    _World.queries = []
    cfg = cfg_for(pg_url, batch_stub, account_id, gosino_id, searxng_url=world)
    report = run_watch_look(conn, cfg, vectorize, fetch=lambda url: fetch_text(url, allow_private=True))
    assert report["proposed"] == 1
    assert _World.queries == ["Uganda sicurezza viaggi"]
    # ha letto l'articolo, non solo lo snippet; il fango non è mai arrivato al giudice
    judged = [str(c["prompt"]) for c in batch_stub.calls]
    assert len(judged) == 1 and "invita a rinviare i viaggi in Uganda" in judged[0]
    text, link = conn.execute("select text, link from desires where gosino_id = %s", (gosino_id,)).fetchone()
    assert text.startswith("Ricordo che volevi andare in Uganda") and link == f"{world}/articolo"
    # una al giorno: la seconda notte dello stesso giorno tace
    assert run_watch_look(conn, cfg, vectorize, fetch=lambda url: fetch_text(url, allow_private=True))["reason"] == "daily cap"


def test_senza_ricerca_web_nessuna_query_esce(pg_url: str, batch_stub, house, world: str) -> None:  # noqa: ANN001
    conn, account_id, gosino_id = house
    watch(conn, account_id, gosino_id)
    conn.commit()
    _World.queries = []
    cfg = cfg_for(pg_url, batch_stub, account_id, gosino_id, searxng_url=world)
    report = run_watch_look(conn, cfg, vectorize)
    assert report["proposed"] == 0 and _World.queries == []


def test_dai_feed_e_lo_scartato_non_si_rigiudica(pg_url: str, batch_stub, house) -> None:  # noqa: ANN001
    conn, account_id, gosino_id = house
    watch(conn, account_id, gosino_id)
    feed = conn.execute("insert into rss_feeds (account_id, url, label) values (%s, 'https://x.example/f', 'f') returning id",
                        (account_id,)).fetchone()[0]
    conn.execute(
        "insert into feed_items (account_id, feed_id, guid, title, link, embedding) values (%s, %s, 'g', %s, %s, %s::vector)",
        (account_id, feed, "Uganda, nuovo parco", "https://x.example/parco", json.dumps(seed_vector(7, 0.05))),
    )
    conn.commit()
    batch_stub.routes = [(JUDGE_MARKER, {"pertinente": False})]
    batch_stub.calls = []
    cfg = cfg_for(pg_url, batch_stub, account_id, gosino_id)
    assert run_watch_look(conn, cfg, vectorize, fetch=lambda _url: None) == {"proposed": 0, "judged": 1, "embedded": 0}
    assert conn.execute("select verdict from watch_finds where account_id = %s", (account_id,)).fetchone()[0] == "scartato"
    assert run_watch_look(conn, cfg, vectorize, fetch=lambda _url: None)["judged"] == 0
    assert len(batch_stub.calls) == 1


def test_la_rete_di_casa_resta_chiusa() -> None:
    assert not is_public_host("127.0.0.1")
    assert not is_public_host("10.0.0.5")
    assert not is_public_host("169.254.169.254")
    assert fetch_text("file:///etc/passwd") is None
    assert fetch_text("http://127.0.0.1:1/x") is None
    assert page_text("<script>rubare()</script><p>Ciao &amp; addio</p>") == "Ciao & addio"
