# Niente riga `# syntax=`: faceva scaricare il frontend `docker/dockerfile:1`
# da Docker Hub A OGNI build, e il deploy del 2026-08-21 è morto su un 502 di
# registry-1.docker.io prima ancora di cominciare. Il frontend integrato di
# BuildKit (Docker ≥23) copre tutto quel che usiamo, `--mount=type=cache` incluso.
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
  && apt-get install -y --no-install-recommends postgresql-client git \
  && apt-get purge -y curl gnupg && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/*
# git: customer_repos.py clones the customers' repositories (ADR-054); the
# clones live on the volume mounted at UGO_REPOS_DIR, not in the image

RUN useradd --system --create-home ugo
WORKDIR /app

# Dependencies first, from the manifest alone, in a layer the source cannot
# touch. They used to install *after* `COPY src`, so every commit invalidated
# them: each deploy re-downloaded ~200 MB of wheels and rebuilt — and then had
# to re-export — a layer of ~490 MB (ctranslate2 135, av 103, onnxruntime 58,
# numpy 71, botocore 30). That export is where the deploy of 2026-08-11 died,
# not the install. Split like this, a change to the dream's own code rebuilds
# and exports kilobytes, and the half gigabyte below stays cached.
#
# The list is read out of pyproject at build time rather than copied into a
# requirements.txt: one manifest stays the single source of truth, and the two
# cannot drift apart.
COPY ops/jobs/pyproject.toml ./
RUN python <<'PY'
import pathlib, tomllib
manifest = tomllib.loads(pathlib.Path("pyproject.toml").read_text())
pathlib.Path("/tmp/requirements.txt").write_text(
    "\n".join(manifest["project"]["dependencies"]) + "\n"
)
PY
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

# Only the package itself here: --no-deps because the layer above already
# resolved them, and because a dependency appearing at this step would mean the
# split above had silently stopped working.
COPY ops/jobs/src ./src
RUN pip install --no-cache-dir --no-deps .

USER ugo
# The container stays up and dreams on its own hour (UGO_DREAM_AT, default
# 02:30 in TZ). It used to run the dream once and exit, which made every
# platform that treats this as a service restart it in a loop — and Coolify's
# scheduled tasks need a running container to exec into anyway.
# A single run is still one command away: `python -m ugo_jobs.dream --date …`.
ENTRYPOINT ["python", "-m", "ugo_jobs.scheduler"]
