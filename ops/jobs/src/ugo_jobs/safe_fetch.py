"""Scaricare una pagina del web senza aprire la rete di casa (ADR-133).

Gli URL arrivano da fuori — da un feed, da un motore di ricerca — e il job
gira nella rete privata dove stanno Postgres, Ollama e soul. Un link che
punta a ``http://10.0.0.5:5432`` non è una notizia: è una porta sul retro.
Quindi: solo http/https, solo indirizzi pubblici (controllati DOPO la
risoluzione del nome), niente redirect seguiti alla cieca, un tetto ai byte
e al tempo.
"""

from __future__ import annotations

import html
import ipaddress
import re
import socket
from urllib.parse import urlparse

import httpx

MAX_BYTES = 1_000_000
TIMEOUT_S = 10
MAX_REDIRECTS = 3
TEXT_CHARS = 6_000


def is_public_host(host: str) -> bool:
    """Ogni indirizzo a cui il nome risolve è pubblico? Uno solo privato basta a dire no."""
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            return False
    return bool(infos)


def page_text(raw: str) -> str:
    """Il testo leggibile di una pagina HTML: niente script, stili, tag."""
    cleaned = re.sub(r"(?is)<(script|style|noscript|svg|nav|footer|header)[^>]*>.*?</\1>", " ", raw)
    cleaned = re.sub(r"(?s)<[^>]+>", " ", cleaned)
    cleaned = html.unescape(cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()[:TEXT_CHARS]


def fetch_text(url: str, allow_private: bool = False) -> str | None:
    """Il testo della pagina, o None: un articolo che non si scarica non ferma la notte.

    ``allow_private`` esiste per i test, che servono le pagine da 127.0.0.1;
    in produzione nessuno lo passa.
    """
    current = url
    try:
        for _ in range(MAX_REDIRECTS + 1):
            parsed = urlparse(current)
            if parsed.scheme not in ("http", "https") or not parsed.hostname:
                return None
            if not allow_private and not is_public_host(parsed.hostname):
                return None
            with httpx.stream(
                "GET",
                current,
                timeout=TIMEOUT_S,
                follow_redirects=False,
                headers={"user-agent": "UGO/1.0 (+lettore notturno)", "accept": "text/html,*/*;q=0.5"},
            ) as response:
                if response.is_redirect:
                    location = response.headers.get("location", "")
                    current = str(response.url.join(location))
                    continue
                if response.status_code != 200:
                    return None
                body = b""
                for chunk in response.iter_bytes():
                    body += chunk
                    if len(body) > MAX_BYTES:
                        break
                return page_text(body.decode(response.encoding or "utf-8", errors="replace"))
        return None
    except httpx.HTTPError:
        return None
