#!/bin/sh
# UGO a casa tua — copia di sicurezza, ripristino, aggiornamento, stop (ADR-132, MKT-10.8).
#   ./ugo.sh backup            salva database + chiave maestra in ./backups
#   ./ugo.sh restore <file>    rimette un salvataggio (chiede conferma: sovrascrive tutto)
#   ./ugo.sh update            salvataggio, poi immagine nuova, poi riavvio (le migrazioni partono da sole)
#   ./ugo.sh stop              ferma UGO, i dati restano
set -eu
cd "$(dirname "$0")"
SECRETS_VOLUME=ugo-home-secrets
HELPER=pgvector/pgvector:pg16   # già scaricata per il database: nessuna immagine in più

die() { printf '\n%s\n' "$*" >&2; exit 1; }
docker info >/dev/null 2>&1 || die "Docker non è acceso."
[ -f .env ] || die "UGO non è mai stato avviato da questa cartella (manca .env)."

do_backup() {
  ts=$(date +%Y%m%d-%H%M%S)
  base="backups/${1:-ugo}-$ts"
  mkdir -p backups
  umask 077
  docker compose exec -T postgres pg_dump -U ugo -d ugo -Fc > "$base.dump" || { rm -f "$base.dump"; die "il salvataggio del database non è riuscito."; }
  docker run --rm -v "$SECRETS_VOLUME":/data:ro "$HELPER" cat /data/data.key > "$base.key" || { rm -f "$base.dump" "$base.key"; die "non riesco a leggere la chiave maestra."; }
  [ -s "$base.dump" ] && [ -s "$base.key" ] || { rm -f "$base.dump" "$base.key"; die "il salvataggio è vuoto: scartato."; }
  printf 'Salvato: %s.dump + %s.key\n' "$base" "$base"
  printf 'Tienili INSIEME e al sicuro: chi ha entrambi legge tutto. La chiave OpenRouter non è inclusa: si reinserisce dal /setup.\n'
  BACKUP_BASE="$base"
}

case "${1:-}" in
  backup) do_backup ;;
  restore)
    file="${2:-}"; [ -f "$file" ] || die "uso: ./ugo.sh restore backups/ugo-AAAAMMGG-HHMMSS.dump"
    key="${file%.dump}.key"; [ -s "$key" ] || die "manca la chiave accanto al salvataggio: $key"
    printf 'Questo SOSTITUISCE la casa attuale con quella del salvataggio. Scrivi SI per continuare: '
    read -r answer; [ "$answer" = "SI" ] || die "annullato, non ho toccato niente."
    do_backup "prima-del-ripristino"
    docker compose stop soul
    docker compose exec -T postgres psql -U ugo -d postgres -v ON_ERROR_STOP=1 -c "drop database ugo with (force)" -c "create database ugo" >/dev/null
    docker compose exec -T postgres pg_restore -U ugo -d ugo --exit-on-error < "$file" || die "il ripristino del database non è riuscito. Il salvataggio di prima è in $BACKUP_BASE.dump"
    docker run --rm -i -v "$SECRETS_VOLUME":/data "$HELPER" sh -c 'cat > /data/data.key && chown 1000:1000 /data/data.key && chmod 600 /data/data.key' < "$key"
    docker compose up -d soul
    printf 'Ripristinato.\n' ;;
  update)
    do_backup "prima-dell-aggiornamento"
    if [ -f ../docker/soul.Dockerfile ] && [ -z "${UGO_SOUL_IMAGE:-}" ]; then
      docker build -f ../docker/soul.Dockerfile -t ugo-soul:local ../.. || die "la costruzione non è riuscita: UGO resta com'era."
    else
      docker compose pull soul || die "non riesco a scaricare l'immagine: UGO resta com'era."
    fi
    docker compose up -d
    printf 'Aggiornato. Se qualcosa non va: ./ugo.sh restore %s.dump\n' "$BACKUP_BASE" ;;
  stop) docker compose stop ;;
  *) die "uso: ./ugo.sh backup | restore <file> | update | stop" ;;
esac
