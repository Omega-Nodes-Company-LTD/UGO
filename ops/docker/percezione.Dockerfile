# syntax=docker/dockerfile:1
# ADR-045 — `ugo-percezione`: chi sta parlando, e chi si è affacciato.
#
# Immagine separata da quella dei job notturni per una ragione precisa: torch e
# onnxruntime pesano circa 2 GB, e il job che scrive il diario non li deve
# pagare. Qui invece sono il motivo per cui il servizio esiste.
#
# Nessuna porta pubblicata, utente non-root, filesystem in sola lettura, e i
# pesi montati da fuori: un servizio che va a scaricarsi un modello da internet
# al primo turno di conversazione è un servizio che un giorno non risponde
# (CLAUDE.md regola 4).
# Build context: repository root.
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # HuggingFace e speechbrain vogliono una cache scrivibile: il filesystem è
    # in sola lettura, quindi si dichiara dove sta (una tmpfs) invece di
    # scoprirlo con un errore alla prima richiesta
    HF_HOME=/tmp/hf \
    XDG_CACHE_HOME=/tmp/cache \
    # CPU: una casa non ha una GPU, e un thread per core evita che due
    # richieste contemporanee si rubino la macchina a vicenda
    OMP_NUM_THREADS=2

WORKDIR /app

# libgomp serve a onnxruntime; niente altro, e niente toolchain di build
RUN apt-get update \
  && apt-get install -y --no-install-recommends libgomp1 \
  && rm -rf /var/lib/apt/lists/*

# torch CPU dal suo indice: la ruota con CUDA pesa 2,5 GB in più per una
# scheda che su questo ferro non esiste
COPY ops/jobs/pyproject.toml ops/jobs/pyproject.toml
COPY ops/jobs/src ops/jobs/src
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch \
  && pip install --no-cache-dir \
       "fastapi>=0.115" "uvicorn[standard]>=0.32" "speechbrain>=1.0" \
       "onnxruntime>=1.19" "psycopg[binary]>=3.2" "numpy>=1.26" "cryptography>=43.0" \
  && pip install --no-cache-dir --no-deps ./ops/jobs

COPY ops/voice/app.py /app/app.py

RUN groupadd --gid 10001 percezione \
  && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin percezione
USER 10001:10001

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
