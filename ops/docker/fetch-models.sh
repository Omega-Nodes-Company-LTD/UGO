#!/bin/sh
# ADR-046 — I pesi del riconoscimento, scaricati al deploy.
#
# Prima erano due comandi `curl` nel runbook, cioè una cosa che un giorno
# qualcuno dimentica — e allora `ugo-percezione` parte, risponde 503 e nessuno
# capisce perché UGO ha smesso di riconoscere le persone. Adesso è un servizio
# one-shot come `migrate`, e `percezione` non parte finché non è finito bene.
#
# Tre proprietà, e la terza è quella che conta:
#
#  1. **Idempotente**: quello che c'è già non si riscarica. Un redeploy non
#     deve tirare giù 250 MB per niente.
#  2. **Rumoroso**: qualunque cosa vada storta ferma lo script (`set -e`), e
#     `percezione` non parte con `service_completed_successfully`.
#  3. **Verificato**: ogni file ha il suo SHA-256, e sono gli SHA dei file su
#     cui i banchi hanno **misurato** gli EER. Un download troncato o un
#     modello cambiato a monte non deve diventare un riconoscimento che
#     sbaglia in silenzio: i numeri che promettiamo valgono per QUESTI pesi.
set -eu

MODELS_DIR="${MODELS_DIR:-/models}"

# file · sha256 · url
SPEC="
spkrec-ecapa-voxceleb/hyperparams.yaml 6f78854fa04ba59e761437b76a2575d3aba5e5016de3e9b69f0c9a5077fb1a41 https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb/resolve/main/hyperparams.yaml
spkrec-ecapa-voxceleb/embedding_model.ckpt 0575cb64845e6b9a10db9bcb74d5ac32b326b8dc90352671d345e2ee3d0126a2 https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb/resolve/main/embedding_model.ckpt
spkrec-ecapa-voxceleb/mean_var_norm_emb.ckpt cd70225b05b37be64fc5a95e24395d804231d43f74b2e1e5a513db7b69b34c33 https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb/resolve/main/mean_var_norm_emb.ckpt
spkrec-ecapa-voxceleb/classifier.ckpt fd9e3634fe68bd0a427c95e354c0c677374f62b3f434e45b78599950d860d535 https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb/resolve/main/classifier.ckpt
spkrec-ecapa-voxceleb/label_encoder.ckpt e13c3a167bb4112685670ee896d20e2b565af16b3a4ceeaa8689fa4d22adb8b9 https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb/resolve/main/label_encoder.txt
arcface/model.onnx 4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43 https://huggingface.co/immich-app/buffalo_l/resolve/main/recognition/model.onnx
"

verified() {
  # $1 percorso, $2 sha atteso — vero solo se il file c'è ED è quello giusto
  [ -f "$1" ] || return 1
  echo "$2  $1" | sha256sum -c - >/dev/null 2>&1
}

echo "pesi del riconoscimento in $MODELS_DIR"
# heredoc e non pipe: un `while` in pipeline gira in una subshell, e l'`exit 1`
# qui sotto uscirebbe da quella invece che dallo script — cioè il fallimento
# che deve fermare il deploy non lo fermerebbe
while read -r name sha url; do
  [ -n "$name" ] || continue
  target="$MODELS_DIR/$name"

  if verified "$target" "$sha"; then
    echo "  = $name (già a posto)"
    continue
  fi

  mkdir -p "$(dirname "$target")"
  echo "  ↓ $name"
  # --retry: un 503 di passaggio non deve far fallire un deploy. Su file
  # temporaneo, così un download interrotto non lascia mezzo modello che alla
  # prossima esecuzione sembra presente.
  curl -fsSL --retry 5 --retry-delay 3 --retry-all-errors -o "$target.part" "$url"
  if ! verified "$target.part" "$sha"; then
    rm -f "$target.part"
    echo "  ✗ $name: lo sha non corrisponde." >&2
    echo "    Il modello è cambiato a monte, oppure il download è sporco." >&2
    echo "    NON si usa: gli EER dichiarati negli ADR valgono per questi pesi." >&2
    exit 1
  fi
  mv "$target.part" "$target"
done <<SPEC_EOF
$SPEC
SPEC_EOF

echo "fatto: percezione può partire"
