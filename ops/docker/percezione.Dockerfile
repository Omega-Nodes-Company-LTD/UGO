# syntax=docker/dockerfile:1
# ADR-045 — `ugo-percezione`: chi sta parlando, e chi si è affacciato.
#
# Immagine separata da quella dei job notturni per una ragione precisa: torch e
# onnxruntime pesano circa 2 GB, e il job che scrive il diario non li deve
# pagare. Qui invece sono il motivo per cui il servizio esiste.
#
# Nessuna porta pubblicata, utente non-root, filesystem in sola lettura tranne
# il volume dei pesi.
#
# ADR-047: il container **si procura da solo** i pesi all'avvio, e solo dopo
# apre la porta. Non è il contrario di ADR-045: quello che ADR-045 vietava è
# scaricare *durante una conversazione*. Qui il download avviene prima che
# uvicorn esista, quindi nessuna frase può arrivare a un servizio senza pesi —
# e sparisce il passo manuale, che è il passo che un giorno qualcuno salta.
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

# libgomp per onnxruntime; curl e ca-certificates per prendersi i pesi all'avvio
RUN apt-get update \
  && apt-get install -y --no-install-recommends libgomp1 curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# torch CPU dal suo indice: la ruota con CUDA pesa 2,5 GB in più per una
# scheda che su questo ferro non esiste.
#
# `torchaudio` va installato **qui**, dallo stesso indice e nello stesso
# comando. Non è pignoleria: speechbrain se lo tira dietro come dipendenza, e
# pip lo prenderebbe da PyPI — dove è la build legata a CUDA. Le due metà si
# installano senza un errore e poi `import speechbrain` muore con «Could not
# load this library: _torchaudio.abi3.so», che non somiglia per niente alla sua
# causa. Trovato dalla CI la prima volta che ha costruito questa immagine.
COPY ops/jobs/pyproject.toml ops/jobs/pyproject.toml
COPY ops/jobs/src ops/jobs/src
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
       torch torchaudio \
  && pip install --no-cache-dir \
       "fastapi>=0.115" "uvicorn[standard]>=0.32" "speechbrain>=1.0" \
       "onnxruntime>=1.19" "psycopg[binary]>=3.2" "numpy>=1.26" "cryptography>=43.0" \
       "faster-whisper>=1.0" "piper-tts>=1.7" \
  && pip install --no-cache-dir --no-deps ./ops/jobs \
  # le due metà devono essere della stessa famiglia, e l'unico modo di saperlo
  # è caricarle: un import qui costa secondi e trasforma un guasto al deploy in
  # una build rossa
  && python -c "import torch, torchaudio, speechbrain, onnxruntime, piper; print('encoder ok')"

COPY ops/voice/app.py /app/app.py
# lo stesso script provato a mano: idempotente, con --retry, e con lo SHA-256
# di ogni file verificato (ADR-046)
COPY ops/docker/fetch-models.sh /usr/local/bin/fetch-models.sh
COPY ops/docker/percezione-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/fetch-models.sh /usr/local/bin/entrypoint.sh

RUN groupadd --gid 10001 percezione \
  && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin percezione
USER 10001:10001

EXPOSE 8000
# `start-period` generoso: al PRIMO avvio ci sono ~250 MB da scaricare e il
# servizio non esiste ancora. Un healthcheck impaziente lo ucciderebbe a metà
# download, all'infinito. Dai riavvii successivi i pesi ci sono già e parte
# in un attimo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status==200 else 1)"]
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
