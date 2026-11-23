#!/bin/sh
# UGO a casa tua — lanciatore per Linux e macOS (ADR-132, MKT-10.7).
# Controlla che Docker ci sia, prepara la password del database la prima volta,
# avvia i contenitori e apre il browser sulla pagina giusta.
set -eu
cd "$(dirname "$0")"

say() { printf '%s\n' "$*"; }
die() { say ""; say "UGO non è partito: $*"; exit 1; }

command -v docker >/dev/null 2>&1 || die "manca Docker. Installalo da https://docs.docker.com/get-docker/ e rilancia questo file."
docker info >/dev/null 2>&1 || die "Docker è installato ma non è acceso. Aprilo (Docker Desktop su Mac) e rilancia questo file."
docker compose version >/dev/null 2>&1 || die "manca il comando 'docker compose' (Docker Compose v2)."

if [ ! -f .env ]; then
  say "Prima volta: preparo la password del database (resta su questo computer)."
  umask 077
  if command -v openssl >/dev/null 2>&1; then pw=$(openssl rand -hex 24); else pw=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n'); fi
  printf 'POSTGRES_PASSWORD=%s\n' "$pw" > .env
fi

say "Avvio UGO (la prima volta può volerci qualche minuto)…"
if [ -f ../docker/soul.Dockerfile ] && ! docker image inspect "${UGO_SOUL_IMAGE:-ugo-soul:local}" >/dev/null 2>&1; then
  docker build -f ../docker/soul.Dockerfile -t "${UGO_SOUL_IMAGE:-ugo-soul:local}" ../.. || die "la costruzione non è riuscita."
fi
docker compose up -d || die "l'avvio non è riuscito."

url=""
i=0
while [ "$i" -lt 90 ]; do
  # in installazione soul scrive il link col gettone; a casa installata risponde /health
  url=$(docker compose logs soul 2>/dev/null | sed -n 's/.*\(http:\/\/localhost:[0-9]*\/setup#t=[A-Za-z0-9_-]*\).*/\1/p' | tail -n 1)
  [ -n "$url" ] && break
  if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then url="http://localhost:3000/"; break; fi
  i=$((i + 1)); sleep 2
done
[ -n "$url" ] || die "soul non ha risposto in tre minuti. Guarda: docker compose logs soul"

say "Apro $url"
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$url" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then open "$url" || true
else say "Apri questo indirizzo nel browser: $url"; fi
