"""Il salvadanaio dal lato della notte (ADR-023, ADR-050, ADR-125).

Ogni chiamata a pagamento dei job — la chat del sogno (`batch.py`) e gli
embedding (`embeddings.py`) — lascia QUI la propria riga su `budget_ledger`,
con una sola forma d'inserimento. Stava dentro `batch.py`, scritta per la sola
chat; il giorno in cui gli embedding sono diventati a pagamento (direttiva del
2026-11-09: Ollama non esiste piu') una seconda copia dell'insert sarebbe stata
esattamente il modo in cui un registro comincia a divergere.

Il costo non si calcola qui: lo dichiara OpenRouter in `usage.cost` (ADR-125
§5). Un listino copiato in questo file e' come il registro e' arrivato, una
volta, a dichiarare la meta' di quel che il sogno spendeva.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

import psycopg

from .config import JobsConfig

PROVIDER = "openrouter"


class BudgetExhausted(RuntimeError):
    """The house has spent its day. Not a failure — a declared degradation."""


@dataclass(frozen=True)
class Spend:
    """Quel che una risposta di OpenRouter dichiara di aver consumato."""

    model: str
    tokens_in: int
    tokens_out: int
    cost_usd: float

    @staticmethod
    def from_usage(model: str, usage: object) -> Spend:
        """`usage` di OpenRouter, letto con prudenza: un campo assente vale
        zero, e una riga a zero e' un dato (si vede), non un'eccezione che
        farebbe perdere la riga intera dopo che il denaro e' gia' speso."""
        fields = usage if isinstance(usage, dict) else {}
        return Spend(
            model=model,
            tokens_in=int(fields.get("prompt_tokens", 0) or 0),
            tokens_out=int(fields.get("completion_tokens", 0) or 0),
            cost_usd=float(fields.get("cost", 0.0) or 0.0),
        )


def today(cfg: JobsConfig) -> str:
    """Oggi, per questa casa. Lo scheduler mette in `cfg.timezone` il fuso della
    famiglia prima di svegliare il sogno, quindi qui e' gia' quello giusto."""
    return datetime.now(ZoneInfo(cfg.timezone)).date().isoformat()


def spent_today_usd(conn: psycopg.Connection, cfg: JobsConfig) -> float:
    """This house's ledger for today, always summed server-side (ADR-019).

    «Oggi» e' il giorno della **casa** (ADR-050), non di Postgres. Correggere la
    sola scrittura avrebbe fatto di peggio che lasciare tutto com'era: la spesa
    su un giorno e il controllo del tetto su un altro, cioe' un limite che non
    limita e non lo dice.
    """
    row = conn.execute(
        """
        select coalesce(sum(cost_usd), 0)::float from budget_ledger
        where account_id = %s and date = %s
        """,
        (cfg.account_id, today(cfg)),
    ).fetchone()
    return float(row[0]) if row else 0.0


def daily_budget_usd(conn: psycopg.Connection, cfg: JobsConfig) -> float:
    """The house's own ceiling when it has one, the process default otherwise."""
    row = conn.execute(
        "select daily_budget_usd from accounts where id = %s",
        (cfg.account_id,),
    ).fetchone()
    if row is not None and row[0] is not None:
        return float(row[0])
    return cfg.daily_budget_usd


def budget_left(conn: psycopg.Connection, cfg: JobsConfig) -> bool:
    return spent_today_usd(conn, cfg) < daily_budget_usd(conn, cfg)


def record_spend(conn: psycopg.Connection, cfg: JobsConfig, spend: Spend) -> None:
    """La riga, sulla connessione data e SENZA commit: decide il chiamante
    quando la transazione si chiude (la chat committa subito, gli embedding
    scrivono su una connessione tutta loro — vedi `ledger_connection`).

    ADR-050: il giorno del ledger e' quello della CASA, non del server.
    `current_date` e' la data di Postgres, mentre `LlmClient` in soul calcola
    la propria con il fuso della famiglia: due strade che scrivono sulla stessa
    colonna e in fusi diversi rispondevano date diverse, cioe' un tetto
    giornaliero che si azzera due volte o mai.
    """
    conn.execute(
        """
        insert into budget_ledger
          (date, provider, model, tokens_in, tokens_out, cost_usd, account_id, gosino_id)
        values (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            today(cfg),
            PROVIDER,
            spend.model,
            spend.tokens_in,
            spend.tokens_out,
            round(spend.cost_usd, 6),
            cfg.account_id,
            cfg.gosino_id,
        ),
    )


def ledger_connection(cfg: JobsConfig) -> psycopg.Connection:
    """Una connessione dedicata al registro, gia' dichiarata alla casa.

    Gli embedding vengono chiesti DENTRO transazioni altrui — `replace_chunks`
    cancella l'indice vecchio e scrive il nuovo in un colpo solo, e un sync
    fallito deve lasciare il vecchio intatto. Scrivere la riga su quella
    connessione voleva dire scegliere fra due torti: committare (e rompere
    l'atomicita' del chiamante) o non committare (e perdere la riga se il
    chiamante torna indietro, mentre il denaro e' speso comunque). Una
    connessione sua, in autocommit, rende la riga vera appena il costo e' noto.

    ADR-062: sotto l'utenza applicativa le politiche RLS leggono
    `app.account_id`, quindi la casa si dichiara prima di scrivere.
    """
    conn = psycopg.connect(cfg.database_url, autocommit=True)
    conn.execute("select set_config('app.account_id', %s, false)", (cfg.account_id,))
    return conn


def charged_gosino(conn: psycopg.Connection, cfg: JobsConfig) -> str:
    """L'esemplare a cui intestare una spesa della casa `cfg.account_id`.

    `budget_ledger.gosino_id` non ammette NULL (ADR-015): ogni centesimo e' di
    una creatura. Quando il job gira per un esemplare (il sogno) e' il suo;
    quando gira per la casa intera (feed, fonti dei clienti) e `cfg.gosino_id`
    appartiene a un'altra casa, si intesta all'anziano vivo di questa. Una casa
    senza esemplari non ha nessuno a cui addebitare, e quindi non spende: si
    solleva PRIMA della chiamata a pagamento, mai dopo.
    """
    own = conn.execute(
        "select 1 from gosini where id = %s and account_id = %s",
        (cfg.gosino_id, cfg.account_id),
    ).fetchone()
    if own is not None:
        return cfg.gosino_id
    eldest = conn.execute(
        "select id from gosini where account_id = %s and retired_at is null "
        "order by born_at limit 1",
        (cfg.account_id,),
    ).fetchone()
    if eldest is None:
        raise RuntimeError(
            "no living exemplar in this house to charge the spend to: "
            "nothing is spent without a ledger row (CLAUDE.md rule 3)"
        )
    return str(eldest[0])
