#!/usr/bin/env sh
# Generate the Mosquitto password file from .env values.
# Output goes to ops/docker/mosquitto/.generated/passwd (gitignored).
# Usage: ./ops/docker/mosquitto/generate-passwd.sh  (run from the repo root)
set -eu

ENV_FILE="${1:-.env}"
OUT_DIR="ops/docker/mosquitto/.generated"

if [ ! -f "$ENV_FILE" ]; then
  echo "error: $ENV_FILE not found — copy .env.example to .env first" >&2
  exit 1
fi

# shellcheck disable=SC1090
. "./$ENV_FILE"

for var in MQTT_USER MQTT_PASS MQTT_NANO_USER MQTT_NANO_PASS; do
  eval "value=\${$var:-}"
  if [ -z "$value" ]; then
    echo "error: $var is missing or empty in $ENV_FILE" >&2
    exit 1
  fi
done

# mosquitto_passwd -c refuses to overwrite: start from a clean slate
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/passwd"

# mosquitto_passwd runs inside the official image: no host dependency.
docker run --rm \
  -v "$(pwd)/$OUT_DIR:/work" \
  eclipse-mosquitto:2 \
  sh -c "mosquitto_passwd -c -b /work/passwd '$MQTT_USER' '$MQTT_PASS' \
      && mosquitto_passwd -b /work/passwd '$MQTT_NANO_USER' '$MQTT_NANO_PASS' \
      && chown 1883:1883 /work/passwd && chmod 640 /work/passwd"

echo "password file written to $OUT_DIR/passwd (never commit it)"
