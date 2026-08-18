"""Il fix della voce dimenticata (2026-08-16): l'arruolamento vocale del
sogno passa dalla PERCEZIONE, dove vive ECAPA — non dall'encoder di ripiego
che produceva profili invisibili al riconoscitore vivo. Postgres e MinIO
veri; la percezione è uno stub HTTP di rete, come il modello batch.
"""

from __future__ import annotations

import base64
import io
import json
import threading
import wave
from http.server import BaseHTTPRequestHandler, HTTPServer

import boto3
import psycopg
import pytest
from ugo_jobs.enroll_step import run_enroll

from conftest import db_only_config, make_being, make_gosino, make_house


class _PercezioneStub(BaseHTTPRequestHandler):
    asked: list[dict] = []

    def do_POST(self) -> None:  # noqa: N802 — http.server API
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length))
        type(self).asked.append({"path": self.path, "body": body})
        data = json.dumps({"sample_count": 1}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args: object) -> None:
        pass


@pytest.fixture(scope="module")
def percezione_stub():
    server = HTTPServer(("127.0.0.1", 0), _PercezioneStub)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    _PercezioneStub.base_url = f"http://127.0.0.1:{server.server_port}"  # type: ignore[attr-defined]
    yield _PercezioneStub
    server.shutdown()


def _wav_bytes(seconds: float = 2.0) -> bytes:
    """Due secondi di tono a 16 kHz: abbastanza per un campione vero."""
    rate = 16_000
    count = int(rate * seconds)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        frames = bytearray()
        for index in range(count):
            value = int(12_000 * ((index % 160) / 160 - 0.5))
            frames += value.to_bytes(2, "little", signed=True)
        handle.writeframes(bytes(frames))
    return buffer.getvalue()


def _queue_request(conn: psycopg.Connection, minio, cfg, gosino_id: str, being_id: str) -> str:
    client = boto3.client(
        "s3",
        endpoint_url=minio["endpoint"],
        aws_access_key_id=minio["access_key"],
        aws_secret_access_key=minio["secret_key"],
    )
    try:
        client.head_bucket(Bucket=cfg.s3_bucket_audio)
    except Exception:  # noqa: BLE001
        client.create_bucket(Bucket=cfg.s3_bucket_audio)
    key = f"inbox/enroll_{being_id[:8]}_test.wav"
    client.put_object(Bucket=cfg.s3_bucket_audio, Key=key, Body=_wav_bytes())
    conn.execute(
        """insert into perception_events (gosino_id, modality, being_id, observed)
           values (%s, 'audio_speech', %s, %s::jsonb)""",
        (gosino_id, being_id, json.dumps({"kind": "enrollment_requested", "object_key": key})),
    )
    conn.commit()
    return key


def test_enroll_goes_through_percezione(pg_url, minio, percezione_stub) -> None:
    with psycopg.connect(pg_url) as conn:
        house = make_house(conn, "casa-voce-ecapa")
        pig = make_gosino(conn, house, "ugo-voce")
        person = make_being(conn, house, "Francesco Voce")
        cfg = db_only_config(
            pg_url,
            s3_endpoint=minio["endpoint"],
            s3_access_key=minio["access_key"],
            s3_secret_key=minio["secret_key"],
            # un bucket NOSTRO: il test del rinvio lascia il clip in coda di
            # proposito, e nel bucket condiviso quel residuo diventava un file
            # in piu' per test_ingest (visto in CI: files == 2)
            s3_bucket_audio="ugo-audio-enroll-remoto",
            account_id=house,
            recognition_url=percezione_stub.base_url,
            internal_token="token-interno",
        )
        key = _queue_request(conn, minio, cfg, pig, person)
        percezione_stub.asked.clear()

        result = run_enroll(conn, cfg)
        assert result.enrolled == 1
        assert result.deferred == 0

        # il campione è arrivato alla percezione, PCM in base64, per la casa giusta
        [ask] = percezione_stub.asked
        assert ask["path"] == "/v1/enroll/voice"
        assert ask["body"]["being_id"] == person
        assert ask["body"]["account_id"] == house
        assert len(base64.b64decode(ask["body"]["audio"])) > 16_000  # >0,5 s di int16

        # il clip non sopravvive alla notte, e l'esito è scritto
        client = boto3.client(
            "s3",
            endpoint_url=minio["endpoint"],
            aws_access_key_id=minio["access_key"],
            aws_secret_access_key=minio["secret_key"],
        )
        leftovers = client.list_objects_v2(Bucket=cfg.s3_bucket_audio, Prefix=key)
        assert leftovers.get("KeyCount", 0) == 0
        outcome = conn.execute(
            """select observed->>'outcome' from perception_events
               where observed->>'kind' = 'enrollment' and being_id = %s""",
            (person,),
        ).fetchone()
        assert outcome == ("enrolled",)


def test_percezione_down_defers_instead_of_burning_the_request(pg_url, minio) -> None:
    with psycopg.connect(pg_url) as conn:
        house = make_house(conn, "casa-voce-differita")
        pig = make_gosino(conn, house, "ugo-differito")
        person = make_being(conn, house, "Voce In Attesa")
        cfg = db_only_config(
            pg_url,
            s3_endpoint=minio["endpoint"],
            s3_access_key=minio["access_key"],
            s3_secret_key=minio["secret_key"],
            s3_bucket_audio="ugo-audio-enroll-remoto",
            account_id=house,
            recognition_url="http://127.0.0.1:1",
            internal_token="token-interno",
        )
        key = _queue_request(conn, minio, cfg, pig, person)

        result = run_enroll(conn, cfg)
        assert result.deferred == 1
        assert result.enrolled == 0

        # nessun esito scritto e clip ancora lì: domani notte si riprova
        outcome = conn.execute(
            """select 1 from perception_events
               where observed->>'kind' = 'enrollment' and being_id = %s""",
            (person,),
        ).fetchone()
        assert outcome is None
        client = boto3.client(
            "s3",
            endpoint_url=minio["endpoint"],
            aws_access_key_id=minio["access_key"],
            aws_secret_access_key=minio["secret_key"],
        )
        assert client.list_objects_v2(Bucket=cfg.s3_bucket_audio, Prefix=key)["KeyCount"] == 1
