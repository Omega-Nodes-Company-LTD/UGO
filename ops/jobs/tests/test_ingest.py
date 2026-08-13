"""Audio ingest test (Fase 4): a real recording (synthetic espeak voice — no
real person's voice ever enters the repo or the tests, SECURITY_COMPLIANCE
§10) uploaded to inbox/ becomes encrypted, embedded transcript segments and
the file is archived. Whisper runs for real on CPU (base model).
"""

from __future__ import annotations

import subprocess
from dataclasses import replace

import boto3
import numpy as np
import psycopg
import pytest

from ugo_jobs.crypto import decrypt_text, parse_data_key
from ugo_jobs.ingest import run_ingest
from conftest import TEST_DATA_KEY, make_being, make_house
from test_dream import make_config

PHRASE = "Buongiorno a tutti, oggi parliamo del progetto dei gusci stampati"
AUDIO_KEY = "inbox/2026-08-06_1530_riunione-gusci.wav"


@pytest.fixture(scope="module")
def audio_env(pg_url: str, minio: dict[str, str], ollama_url: str, batch_stub, tmp_path_factory):  # noqa: ANN001
    cfg = make_config(pg_url, minio, ollama_url, batch_stub.base_url)
    wav_path = tmp_path_factory.mktemp("audio") / "speech.wav"
    subprocess.run(["espeak-ng", "-v", "it", PHRASE, "-w", str(wav_path)], check=True, timeout=60)

    client = boto3.client(
        "s3",
        endpoint_url=cfg.s3_endpoint,
        aws_access_key_id=cfg.s3_access_key,
        aws_secret_access_key=cfg.s3_secret_key,
    )
    try:
        client.head_bucket(Bucket=cfg.s3_bucket_audio)
    except Exception:
        client.create_bucket(Bucket=cfg.s3_bucket_audio)
    client.upload_file(str(wav_path), cfg.s3_bucket_audio, AUDIO_KEY)
    return cfg, client


def test_inbox_recording_becomes_encrypted_segments(audio_env) -> None:  # noqa: ANN001
    cfg, client = audio_env
    with psycopg.connect(cfg.database_url) as conn:
        result = run_ingest(conn, cfg, "2026-08-06")
    assert result.files == 1
    assert result.segments >= 1

    with psycopg.connect(cfg.database_url) as conn:
        meeting = conn.execute(
            "select id, platform, audio_uri, started_at from meetings where platform = 'ear'"
        ).fetchone()
        assert meeting is not None
        assert meeting[2].endswith("archive/2026-08-06_1530_riunione-gusci.wav")
        assert meeting[3] is not None and meeting[3].isoformat().startswith("2026-08-06T15:30")

        rows = conn.execute(
            "select text, embedding is not null from transcript_segments where meeting_id = %s",
            (meeting[0],),
        ).fetchall()
        assert len(rows) == result.segments
        key = parse_data_key(TEST_DATA_KEY)
        full_text = " ".join(decrypt_text(cipher, key) for cipher, _ in rows).lower()
        # whisper-base on a synthetic voice: assert robust keywords, not exact text
        assert "progetto" in full_text and "stampati" in full_text
        assert all(cipher.startswith("v1:") for cipher, _ in rows)
        assert all(has_embedding for _, has_embedding in rows)


def test_file_archived_and_second_run_is_noop(audio_env) -> None:  # noqa: ANN001
    cfg, client = audio_env
    listing = client.list_objects_v2(Bucket=cfg.s3_bucket_audio)
    keys = [item["Key"] for item in listing.get("Contents", [])]
    assert f"archive/2026-08-06_1530_riunione-gusci.wav" in keys
    assert AUDIO_KEY not in keys

    with psycopg.connect(cfg.database_url) as conn:
        before = conn.execute("select count(*) from transcript_segments").fetchone()[0]
        result = run_ingest(conn, cfg, "2026-08-06")
        after = conn.execute("select count(*) from transcript_segments").fetchone()[0]
    assert result.files == 0
    assert before == after


def test_a_known_voice_gets_a_name_and_a_stranger_does_not(audio_env, tmp_path) -> None:  # noqa: ANN001
    """ADR-016 wired end to end: enrolment was written and never called.

    The second half is the one that matters: the same voice enrolled in
    ANOTHER house must not be attributed here (ADR-019).
    """
    from faster_whisper.audio import decode_audio

    from ugo_jobs.enrollment import enroll_voice

    from test_enrollment import FakeVoiceEncoder

    cfg, client = audio_env
    key = parse_data_key(TEST_DATA_KEY)
    # una sola voce nel corpus di prova: qualunque spezzone la incontri, la
    # riconosce. Ciò che il test misura è a CHI viene attribuita.
    coder = FakeVoiceEncoder({})
    coder.encode = lambda samples: np.asarray([1.0, 0.0, 0.0], dtype=np.float32)  # type: ignore[method-assign]

    wav = tmp_path / "voce.wav"
    subprocess.run(["espeak-ng", "-v", "it", PHRASE, "-w", str(wav)], check=True, timeout=60)
    samples = decode_audio(str(wav), sampling_rate=16_000)

    with psycopg.connect(cfg.database_url) as conn:
        nostra = make_house(conn, "casa-attribuzione")
        vicini = make_house(conn, "casa-vicini")
        gosino = str(
            conn.execute(
                "insert into gosini (household_id, name) values (%s, %s) returning id",
                (nostra, "ugo-attribuzione"),
            ).fetchone()[0]
        )
        parlante = make_being(conn, nostra, "Francesco")
        # the neighbours enrol the very same voice, in their own house
        sosia = make_being(conn, vicini, "Un vicino")
        # ADR-043: con un encoder finto ma deterministico. Il modello vero pesa
        # 2 GB e non è ciò che questo test prova: qui si prova **l'attribuzione**
        # — chi viene nominato e chi no — e soprattutto che la voce identica
        # arruolata dai vicini non venga attribuita qui (ADR-019).
        enroll_voice(
            conn, gosino_id=gosino, being_id=parlante, samples=samples,
            data_key=key, encoder=coder,
        )
        enroll_voice(
            conn, gosino_id=gosino, being_id=sosia, samples=samples,
            data_key=key, encoder=coder,
        )
        conn.commit()

    scoped = replace(cfg, household_id=nostra, gosino_id=gosino)
    new_key = "inbox/2026-08-07_0930_attribuzione.wav"
    client.upload_file(str(wav), cfg.s3_bucket_audio, new_key)

    with psycopg.connect(scoped.database_url) as conn:
        run_ingest(conn, scoped, "2026-08-07", encoder=coder)
        rows = conn.execute(
            """select s.being_id from transcript_segments s
                 join meetings m on m.id = s.meeting_id
                where m.title = %s""",
            ("2026-08-07_0930_attribuzione.wav",),
        ).fetchall()

    assert rows, "the recording should have produced segments"
    attributed = {str(being_id) for (being_id,) in rows if being_id is not None}
    # our own resident is named; the neighbours' identical voiceprint is not
    assert attributed == {parlante}, attributed
    assert sosia not in attributed
