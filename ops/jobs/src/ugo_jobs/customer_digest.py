"""Il digest «a che punto siamo», pre-calcolato dal sogno (backlog gruppo 8).

Lo stato vivo dei repository resta on-demand (ADR-054: vero solo nel momento
in cui lo chiedi), ma quando GitHub non c'è — niente repo, niente rete, PAT
scaduto — la reception rispondeva «a che punto siamo?» senza uno straccio di
stato. Qui il sogno scrive, per ogni cliente non archiviato, una fotografia
deterministica di ciò che il database già sa: ticket aperti coi titoli, fonti
e loro freschezza, quanta conoscenza è indicizzata. La reception la usa come
ripiego dichiarato, con la data accanto.

I paletti:

- **zero token**: è prosa da sagoma su conteggi e titoli, nessun modello;
- **cifrato** (regola 6): dentro ci sono titoli di ticket — il digest è
  ciphertext sotto la DEK della casa, come i ticket da cui nasce;
- **per casa**: il passo gira nel sogno della casa e tocca SOLO i suoi
  clienti; il vicino ha il suo sogno.
"""

from __future__ import annotations

from dataclasses import dataclass

import psycopg

from .config import JobsConfig
from .crypto import decrypt_text, encrypt_text, parse_data_key

#: quanti titoli di ticket entrano nel digest: oltre non è più un «a che
#: punto siamo», è il triage — e quello sta nel pannello
DIGEST_MAX_TICKETS = 5


@dataclass
class DigestResult:
    customers: int = 0


def _ticket_lines(conn: psycopg.Connection, customer_id: str, key: bytes) -> list[str]:
    rows = conn.execute(
        """
        select title, status from tickets
        where customer_id = %s and status <> 'closed'
        order by updated_at desc limit %s
        """,
        (customer_id, DIGEST_MAX_TICKETS),
    ).fetchall()
    total = conn.execute(
        "select count(*) from tickets where customer_id = %s and status <> 'closed'",
        (customer_id,),
    ).fetchone()[0]
    if total == 0:
        return ["Nessun ticket aperto."]
    lines = [f"Ticket aperti: {total}."]
    for title, status in rows:
        try:
            lines.append(f"- [{status}] {decrypt_text(title, key)}")
        except Exception:  # noqa: BLE001 — chiave ruotata: il digest va avanti senza
            continue
    return lines


def _source_lines(conn: psycopg.Connection, customer_id: str) -> list[str]:
    lines: list[str] = []
    repos = conn.execute(
        """
        select remote_url, last_commit_sha, last_indexed_at, status
        from customer_repos where customer_id = %s order by created_at
        """,
        (customer_id,),
    ).fetchall()
    for remote_url, sha, indexed_at, status in repos:
        name = str(remote_url).rstrip("/").removesuffix(".git").rsplit("/", 1)[-1]
        head = f"ultimo commit {str(sha)[:7]}" if sha else "mai indicizzato"
        when = f", indicizzato il {indexed_at:%Y-%m-%d}" if indexed_at is not None else ""
        lines.append(f"Repo {name}: {head}{when} ({status}).")
    documents = conn.execute(
        "select count(*) from customer_documents where customer_id = %s and indexed_at is not null",
        (customer_id,),
    ).fetchone()[0]
    if documents > 0:
        lines.append(f"Documenti indicizzati: {documents}.")
    chunks = conn.execute(
        "select count(*) from customer_chunks where customer_id = %s", (customer_id,)
    ).fetchone()[0]
    if chunks > 0:
        lines.append(f"Frammenti di conoscenza in indice: {chunks}.")
    return lines


def run_digest(conn: psycopg.Connection, cfg: JobsConfig) -> dict[str, object]:
    """Il passo del sogno: una fotografia per ogni cliente della casa."""
    key = parse_data_key(cfg.data_key_b64)
    rows = conn.execute(
        "select id from customers where household_id = %s and archived_at is null",
        (cfg.household_id,),
    ).fetchall()
    written = 0
    for (customer_id,) in rows:
        lines = _ticket_lines(conn, str(customer_id), key) + _source_lines(conn, str(customer_id))
        conn.execute(
            "update customers set digest = %s, digest_at = now() where id = %s",
            (encrypt_text("\n".join(lines), key), customer_id),
        )
        written += 1
    conn.commit()
    return {"customers": written}
