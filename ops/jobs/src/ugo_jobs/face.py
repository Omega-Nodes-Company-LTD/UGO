"""Riconoscere un volto, e fondere le due risposte (ADR-045).

Il volto usa la stessa tabella `recognition_profiles` della voce, distinta dalla
`modality`: sono due misure della stessa persona, e tenerle in due posti
significherebbe cancellarne una sola quando qualcuno chiede di essere
dimenticato.

Sulla fusione, la parte importante è cosa **non** fa. Non somma i punteggi: i
due coseni vivono in spazi diversi con scale diverse, e sommarli produce un
numero che sembra una confidenza e non lo è. Fonde le **decisioni**, che sono
già calibrate ciascuna sul proprio banco — e quando le due si contraddicono non
sceglie: chiede.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import psycopg

from .crypto import decrypt_bytes
from .enrollment import Identification, _guard  # noqa: PLC2701 — stessa famiglia
from .voice import cosine, normalize, pack, thresholds_for, unpack

MODALITY = "face"


def enroll_face(
    conn: psycopg.Connection,
    *,
    gosino_id: str,
    being_id: str,
    image: np.ndarray,
    data_key: bytes,
    encoder: object,
    channel: str = "home",
) -> int:
    """Piega un volto nel centroide della persona. Ritorna sample_count."""
    from .crypto import encrypt_bytes
    from .enrollment import _audit  # noqa: PLC2701 — stessa famiglia
    from .voice import merge_centroid

    # ADR-016 vale identico per il volto: `is_minor` e `no_vision` fermano
    # l'arruolamento **prima** di codificare, non dopo.
    #
    # La `MODALITY` va passata, e per mesi non è stata passata: `_guard` senza
    # argomento controlla `no_audio`, quindi questo commento descriveva una
    # protezione che non esisteva. Il difetto stava tutto nel valore di default.
    _guard(conn, being_id, channel, MODALITY)
    coder = encoder
    fresh = coder.encode(image)  # type: ignore[attr-defined]

    row = conn.execute(
        """select payload, sample_count, model from recognition_profiles
           where being_id = %s and modality = %s""",
        (being_id, MODALITY),
    ).fetchone()
    current, count = None, 0
    if row is not None:
        payload, count, model = row
        if model == coder.model:  # type: ignore[attr-defined]
            current = unpack(decrypt_bytes(bytes(payload), data_key))
        else:
            count = 0
    merged, total = merge_centroid(current, count, fresh)

    conn.execute(
        """insert into recognition_profiles
             (being_id, household_id, modality, model, dimensions, payload,
              sample_count, updated_at)
           values (%s, (select household_id from beings where id = %s),
                   %s, %s, %s, %s, %s, now())
           on conflict (being_id, modality) do update
             set model = excluded.model, dimensions = excluded.dimensions,
                 payload = excluded.payload, sample_count = excluded.sample_count,
                 updated_at = now()""",
        (
            being_id,
            # ADR-048: la casa viene dall'essere, non da un parametro
            being_id,
            MODALITY,
            coder.model,  # type: ignore[attr-defined]
            coder.dimensions,  # type: ignore[attr-defined]
            encrypt_bytes(pack(normalize(merged)), data_key),
            total,
        ),
    )
    # come per la voce: il giornale delle percezioni è dove si va a rispondere
    # «cosa avete registrato di me», e un arruolamento che non ci finisce è
    # esattamente la riga che manca alla domanda che conta
    _audit(conn, gosino_id, being_id, "enrolled", MODALITY)
    return total


def identify_face(
    conn: psycopg.Connection,
    *,
    image: np.ndarray,
    data_key: bytes,
    household_id: str,
    encoder: object,
) -> Identification:
    """Chi è, chi potrebbe essere, o nessuno — con le soglie del suo modello."""
    coder = encoder
    probe = coder.encode(image)  # type: ignore[attr-defined]
    rows = conn.execute(
        """select p.being_id, p.payload
             from recognition_profiles p
             join beings b on b.id = p.being_id
            where p.modality = %s and p.model = %s and b.household_id = %s""",
        (MODALITY, coder.model, household_id),  # type: ignore[attr-defined]
    ).fetchall()

    best_id, best_score = None, -1.0
    for being_id, payload in rows:
        score = cosine(probe, unpack(decrypt_bytes(bytes(payload), data_key)))
        if score > best_score:
            best_id, best_score = str(being_id), score

    match_at, maybe_at = thresholds_for(coder.model)  # type: ignore[attr-defined]
    confidence = max(best_score, 0.0)
    if best_id is None or best_score < maybe_at:
        return Identification(being_id=None, candidate_being_id=None, confidence=confidence)
    if best_score < match_at:
        return Identification(being_id=None, candidate_being_id=best_id, confidence=confidence)
    return Identification(being_id=best_id, candidate_being_id=None, confidence=confidence)


@dataclass(frozen=True)
class Fused:
    """L'esito congiunto, e da cosa è venuto — perché un pannello lo deve poter dire."""

    being_id: str | None
    candidate_being_id: str | None
    confidence: float
    agreed: bool
    sources: tuple[str, ...]


def fuse(voice: Identification | None, face: Identification | None) -> Fused:
    """Fonde le **decisioni**, non i punteggi.

    Sommare i due coseni sarebbe sbagliato in modo poco appariscente: vivono in
    spazi diversi, con scale diverse e soglie diverse (0,45 e 0,30, misurate
    ciascuna sul proprio banco). Un numero che ne esce sembra una confidenza e
    non lo è, e non si può calibrare senza un corpus in cui le stesse persone
    sono riprese **e** registrate — che non esiste, e che fabbricarlo assumendo
    l'indipendenza sarebbe misurare la propria assunzione.

    Le decisioni invece sono già calibrate. Quattro casi, e il quarto è quello
    che conta:

    1. **d'accordo** → è lui, e con più fiducia di ciascuno da solo;
    2. **uno sicuro, l'altro muto** → si prende il sicuro. Il volto tace ogni
       volta che nessuno guarda la camera, e non è un disaccordo;
    3. **nessuno sicuro** → il candidato, se ce n'è uno, per chiedere;
    4. **in disaccordo** → **non si sceglie**. Due modalità che nominano due
       persone diverse sono la situazione in cui sbagliare costa di più, e la
       tentazione di credere alla più confidente è esattamente il modo in cui
       un sistema fuso diventa peggiore dei suoi pezzi. Si chiede.
    """
    sources = tuple(
        name for name, seen in (("voice", voice), ("face", face)) if seen is not None
    )
    sure = [seen for seen in (voice, face) if seen is not None and seen.being_id is not None]

    if len(sure) == 2 and sure[0].being_id == sure[1].being_id:
        return Fused(
            being_id=sure[0].being_id,
            candidate_being_id=None,
            # non una somma: il migliore dei due, che resta una confidenza vera
            confidence=max(s.confidence for s in sure),
            agreed=True,
            sources=sources,
        )
    if len(sure) == 2:
        # in disaccordo: nessuno dei due nomi vale più dell'altro
        return Fused(
            being_id=None,
            candidate_being_id=max(sure, key=lambda s: s.confidence).being_id,
            confidence=min(s.confidence for s in sure),
            agreed=False,
            sources=sources,
        )
    if len(sure) == 1:
        return Fused(
            being_id=sure[0].being_id,
            candidate_being_id=None,
            confidence=sure[0].confidence,
            agreed=True,
            sources=sources,
        )

    maybes = [
        seen
        for seen in (voice, face)
        if seen is not None and seen.candidate_being_id is not None
    ]
    if maybes:
        best = max(maybes, key=lambda s: s.confidence)
        return Fused(
            being_id=None,
            candidate_being_id=best.candidate_being_id,
            confidence=best.confidence,
            agreed=len({m.candidate_being_id for m in maybes}) == 1,
            sources=sources,
        )
    return Fused(
        being_id=None, candidate_being_id=None, confidence=0.0, agreed=True, sources=sources
    )


# ── chi non sappiamo ancora chi sia (ADR-052) ────────────────────────────────
#
# ⚠️ Da qui in giù si maneggiano **dati biometrici di chi non ha acconsentito**.
# È una scelta consapevole del proprietario, e il prezzo si paga per intero:
# cifrati come tutto il resto, a scadenza, cancellabili uno per uno, e distrutti
# dall'oblio. Il codice qui sotto è il posto in cui quelle promesse o si
# mantengono o non esistono.

#: Quanto si conserva un'impronta che nessuno ha rivendicato (giorni).
UNKNOWN_RETENTION_DAYS = 30

#: Sopra questo coseno due impronte ignote sono la stessa persona che ripassa.
#: Volutamente più alto della soglia di riconoscimento: qui si sta decidendo se
#: *unire* due tracce, e unire due estranei in uno solo produce un'impronta che
#: non è di nessuno — un errore che poi nessuno può più sciogliere.
SAME_STRANGER = 0.72


def remember_unknown(
    conn: psycopg.Connection,
    *,
    household_id: str,
    image: np.ndarray,
    data_key: bytes,
    encoder: object,
) -> tuple[str, int]:
    """Conserva il volto di uno sconosciuto. Ritorna (id, quante volte visto).

    Se assomiglia abbastanza a un'impronta ignota già conservata, le due si
    fondono invece di moltiplicarsi: senza, una persona che passa dieci volte
    diventerebbe dieci sconosciuti, e il pannello mostrerebbe dieci domande
    identiche sulla stessa faccia.
    """
    from .crypto import encrypt_bytes
    from .voice import merge_centroid

    coder = encoder
    fresh = coder.encode(image)  # type: ignore[attr-defined]
    rows = conn.execute(
        """select id, payload, seen_count from unknown_prints
            where household_id = %s and modality = %s and model = %s""",
        (household_id, MODALITY, coder.model),  # type: ignore[attr-defined]
    ).fetchall()

    best_id, best_score, best_payload, best_seen = None, -1.0, None, 0
    for print_id, payload, seen in rows:
        score = cosine(fresh, unpack(decrypt_bytes(bytes(payload), data_key)))
        if score > best_score:
            best_id, best_score, best_payload, best_seen = str(print_id), score, payload, seen

    if best_id is not None and best_score >= SAME_STRANGER and best_payload is not None:
        merged, total = merge_centroid(
            unpack(decrypt_bytes(bytes(best_payload), data_key)), best_seen, fresh
        )
        conn.execute(
            """update unknown_prints
                  set payload = %s, seen_count = %s, last_seen_at = now()
                where id = %s""",
            (encrypt_bytes(pack(normalize(merged)), data_key), total, best_id),
        )
        return best_id, total

    row = conn.execute(
        """insert into unknown_prints
             (household_id, modality, model, dimensions, payload)
           values (%s, %s, %s, %s, %s)
           returning id""",
        (
            household_id,
            MODALITY,
            coder.model,  # type: ignore[attr-defined]
            coder.dimensions,  # type: ignore[attr-defined]
            encrypt_bytes(pack(normalize(fresh)), data_key),
        ),
    ).fetchone()
    if row is None:  # pragma: no cover — l'insert o riesce o solleva
        raise RuntimeError("insert returned nothing")
    return str(row[0]), 1


def claim_unknown(
    conn: psycopg.Connection,
    *,
    print_id: str,
    being_id: str,
    gosino_id: str,
    household_id: str,
    data_key: bytes,
    channel: str = "home",
) -> int:
    """«Quello è Marco»: l'impronta ignota diventa il profilo di una persona.

    Il rifiuto qui è la parte delicata. Se la persona nominata è un minore, o ha
    detto «non guardarmi», l'arruolamento non deve avvenire — **e l'impronta va
    distrutta lo stesso**. Conservarla dopo un rifiuto sarebbe il peggiore dei
    due mondi: la protezione applicata al profilo, e la faccia comunque in un
    cassetto. Quindi si cancella qualunque cosa succeda, e poi si solleva.
    """
    from .crypto import encrypt_bytes
    from .enrollment import EnrollmentRefused, _audit, _guard  # noqa: PLC2701
    from .voice import merge_centroid

    row = conn.execute(
        """select payload, seen_count, model, dimensions from unknown_prints
            where id = %s and household_id = %s""",
        (print_id, household_id),
    ).fetchone()
    if row is None:
        raise EnrollmentRefused("unknown_print")
    payload, seen, model, dimensions = row

    try:
        _guard(conn, being_id, channel, MODALITY)
    except EnrollmentRefused:
        # la protezione ha detto di no: l'impronta se ne va comunque, e anzi
        # proprio per quello — è l'unico gesto che la rende vera
        conn.execute("delete from unknown_prints where id = %s", (print_id,))
        raise

    fresh = unpack(decrypt_bytes(bytes(payload), data_key))
    existing = conn.execute(
        """select payload, sample_count, model from recognition_profiles
            where being_id = %s and modality = %s""",
        (being_id, MODALITY),
    ).fetchone()
    current, count = None, 0
    if existing is not None:
        old_payload, count, old_model = existing
        if old_model == model:
            current = unpack(decrypt_bytes(bytes(old_payload), data_key))
        else:
            count = 0
    merged, total = merge_centroid(current, count, fresh)

    conn.execute(
        """insert into recognition_profiles
             (being_id, household_id, modality, model, dimensions, payload,
              sample_count, updated_at)
           values (%s, (select household_id from beings where id = %s),
                   %s, %s, %s, %s, %s, now())
           on conflict (being_id, modality) do update
             set model = excluded.model, dimensions = excluded.dimensions,
                 payload = excluded.payload, sample_count = excluded.sample_count,
                 updated_at = now()""",
        (
            being_id,
            being_id,
            MODALITY,
            model,
            dimensions,
            encrypt_bytes(pack(normalize(merged)), data_key),
            total,
        ),
    )
    # rivendicata è sparita: da qui in poi quella faccia ha un nome, e tenerne
    # una seconda copia senza nome sarebbe conservare due volte la stessa
    # persona con due regole di retention diverse
    conn.execute("delete from unknown_prints where id = %s", (print_id,))
    _audit(conn, gosino_id, being_id, "enrolled", MODALITY)
    return total


def forget_unknown(
    conn: psycopg.Connection,
    *,
    household_id: str | None = None,
    print_id: str | None = None,
    older_than_days: int | None = None,
) -> int:
    """Distrugge impronte ignote. Ritorna quante.

    Tre chiamanti e tre motivi: il pannello ne cancella una, l'oblio le porta
    via tutte di una casa, il job notturno fa scadere le vecchie. Una funzione
    sola perché la cancellazione dev'essere **un solo posto**: tre `delete`
    sparsi sono tre occasioni per dimenticarne uno il giorno che la tabella
    prende una colonna.
    """
    clauses, params = [], []
    if household_id is not None:
        clauses.append("household_id = %s")
        params.append(household_id)
    if print_id is not None:
        clauses.append("id = %s")
        params.append(print_id)
    if older_than_days is not None:
        clauses.append("last_seen_at < now() - make_interval(days => %s)")
        params.append(older_than_days)
    if not clauses:
        # nessun filtro cancellerebbe le impronte di ogni casa: un errore di
        # chiamata non deve poter diventare una cancellazione totale
        raise ValueError("forget_unknown senza filtri")
    result = conn.execute(
        f"delete from unknown_prints where {' and '.join(clauses)}",  # noqa: S608
        tuple(params),
    )
    return result.rowcount
