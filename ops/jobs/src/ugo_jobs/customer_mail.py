"""Read the customer's mail history, and never write it (ADR-054).

stdlib ``imaplib``/``email`` — zero new dependencies. Only UIDs above the
stored high-water mark are fetched; quoted replies are stripped so the index
holds each sentence once. SMTP does not exist anywhere in this codebase, on
purpose: the reception is where conversation happens.
"""

from __future__ import annotations

import email
import email.policy
import email.utils
import imaplib
import json

import psycopg

from .config import JobsConfig
from .crypto import decrypt_text, parse_data_key
from .customer_chunks import chunk_text, replace_chunks

MAX_MESSAGES_PER_SYNC = 200


def _plain_text(message: email.message.EmailMessage) -> str:
    body = message.get_body(preferencelist=("plain",))
    if body is None:
        return ""
    try:
        return str(body.get_content())
    except (KeyError, LookupError):
        return ""


def address_allowed(message: email.message.EmailMessage, senders: str | None) -> bool:
    """Il pre-filtro del proprietario (2026-08-16): la casella non è tutta sua.

    «Io gli do la casella, ma lui non deve usare per quel cliente la casella
    [intera]: posso dargli mittenti e destinatari tra cui leggere.» Le voci
    sono indirizzi o domini separati da virgola («mario@rossi.it,
    @rossisrl.it»); un messaggio passa se UNO fra mittente e destinatari
    combacia. Vuoto o null = tutta la cartella, il comportamento di prima.
    Pura, e quindi provabile senza un server IMAP.
    """
    if senders is None or senders.strip() == "":
        return True
    entries = [entry.strip().lower() for entry in senders.split(",") if entry.strip()]
    fields: list[str] = []
    for header in ("from", "to", "cc"):
        fields.extend(str(value) for value in (message.get_all(header) or []))
    addresses = [address.lower() for _n, address in email.utils.getaddresses(fields) if address]
    for address in addresses:
        for entry in entries:
            if entry.startswith("@"):
                if address.endswith(entry):
                    return True
            elif address == entry:
                return True
    return False


def strip_quotes(text: str) -> str:
    """Drop quoted reply lines and the 'Il giorno X ha scritto:' scaffolding."""
    kept: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(">"):
            continue
        if stripped.lower().endswith("ha scritto:") or stripped.lower().endswith("wrote:"):
            continue
        kept.append(line)
    return "\n".join(kept).strip()


def sync_mail_account(conn: psycopg.Connection, cfg: JobsConfig, account: dict) -> dict:
    key = parse_data_key(cfg.data_key_b64)
    try:
        password = decrypt_text(account["password"], key)
        port = int(account["imap_port"])
        # 993 is IMAPS and gets TLS, full stop. A non-standard port means a
        # lab or a test fixture (GreenMail): plain IMAP, declared as such.
        client = (
            imaplib.IMAP4_SSL(account["imap_host"], port)
            if port == 993
            else imaplib.IMAP4(account["imap_host"], port)
        )
        try:
            client.login(account["username"], password)
            client.select(account["folder"], readonly=True)
            status, data = client.uid("search", None, f"UID {int(account['last_uid']) + 1}:*")
            if status != "OK":
                raise RuntimeError("imap_search_failed")
            uids = [int(uid) for uid in (data[0].split() if data and data[0] else [])]
            uids = [uid for uid in uids if uid > int(account["last_uid"])]
            uids = sorted(uids)[:MAX_MESSAGES_PER_SYNC]

            indexed = 0
            highest = int(account["last_uid"])
            for uid in uids:
                status, payload = client.uid("fetch", str(uid), "(RFC822)")
                if status != "OK" or not payload or payload[0] is None:
                    continue
                raw = payload[0][1] if isinstance(payload[0], tuple) else None
                if raw is None:
                    continue
                message = email.message_from_bytes(raw, policy=email.policy.default)
                # il pre-filtro PRIMA di ogni indicizzazione: un messaggio
                # fuori perimetro non lascia traccia — nemmeno un chunk — ma
                # il suo UID si consuma comunque, o lo rileggeremmo per sempre
                if not address_allowed(message, account.get("senders")):
                    highest = max(highest, uid)
                    continue
                text = strip_quotes(_plain_text(message))
                subject = str(message.get("subject", "")).strip()
                message_id = str(message.get("message-id", f"uid-{uid}")).strip()
                if text or subject:
                    pieces = chunk_text(f"{subject}\n{text}".strip(), message_id)
                    indexed += replace_chunks(
                        conn,
                        cfg,
                        account_id=str(account["account_id"]),
                        customer_id=str(account["customer_id"]),
                        source_type="email",
                        source_id=str(account["id"]),
                        pieces=pieces,
                        # each message appends: the account's index grows by UID
                        append=True,
                    )
                highest = max(highest, uid)
            conn.execute(
                "update customer_mail_accounts set status = 'ok', last_error = null, "
                "last_uid = %s, last_synced_at = now() where id = %s",
                (highest, str(account["id"])),
            )
            return {"account": str(account["id"]), "messages": len(uids), "chunks": indexed}
        finally:
            try:
                client.logout()
            except OSError:
                pass
    except Exception as error:  # noqa: BLE001 - one broken mailbox must not stop the round
        conn.execute(
            "update customer_mail_accounts set status = 'error', last_error = %s where id = %s",
            ("imap_unreachable", str(account["id"])),
        )
        return {"account": str(account["id"]), "error": type(error).__name__}


def run_mail(conn: psycopg.Connection, cfg: JobsConfig, account_id: str) -> list[dict]:
    rows = conn.execute(
        """
        select m.id, m.account_id, m.customer_id, m.imap_host, m.imap_port,
               m.username, m.password, m.folder, m.senders, m.last_uid
        from customer_mail_accounts m
        join customers c on c.id = m.customer_id
        where m.account_id = %s and c.archived_at is null
        order by m.created_at
        """,
        (account_id,),
    ).fetchall()
    columns = [
        "id",
        "account_id",
        "customer_id",
        "imap_host",
        "imap_port",
        "username",
        "password",
        "folder",
        "senders",
        "last_uid",
    ]
    reports = []
    for row in rows:
        account = dict(zip(columns, row, strict=True))
        reports.append(sync_mail_account(conn, cfg, account))
        conn.commit()
    if reports:
        print(json.dumps({"customer_mail": reports}), flush=True)
    return reports
