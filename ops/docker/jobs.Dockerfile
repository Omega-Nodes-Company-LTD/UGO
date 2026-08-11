# syntax=docker/dockerfile:1
# UGO night jobs (the dream). Python 3.12 per spec; pg_dump from PGDG, always
# new enough for the server. Runs as a dedicated non-root user; no secrets baked.
# Build context: repository root.

# Pinned to bookworm on purpose: `python:3.12-slim` follows Debian stable, and
# when it rolled to trixie the hardcoded bookworm-pgdg repo below stopped
# resolving mid-build. Pinning keeps the base still; deriving the codename
# below keeps it correct anyway the day we move it deliberately.
FROM python:3.12-slim-bookworm AS runtime

# The newest client from PGDG, not a pinned major. pg_dump only works forwards:
# a client can dump its own server version and older ones, never a newer one.
# Pinning 16 meant that the day the database moved to 17 the nightly backup
# started failing — and a backup that stops silently is not a backup.
# --retry: postgresql.org answered 503 once and turned a green pipeline red for
# a reason that had nothing to do with the change under test
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL --retry 5 --retry-delay 3 --retry-all-errors \
     https://www.postgresql.org/media/keys/ACCC4CF8.asc \
     -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && . /etc/os-release \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
     http://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
     > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client \
  && apt-get purge -y curl gnupg && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home ugo
WORKDIR /app
COPY ops/jobs/pyproject.toml ./
COPY ops/jobs/src ./src
RUN pip install --no-cache-dir .

USER ugo
# Fase 4 will add faster-whisper/whisperX layers; the cron schedule lives in
# Coolify (02:30 Europe/Rome), not in the image.
ENTRYPOINT ["python", "-m", "ugo_jobs.dream"]
