#!/bin/sh
# ADR-047 — L'avvio di `ugo-percezione`: prima i pesi, poi il servizio.
#
# Il container si procura da solo quello che gli serve e **poi** comincia a
# rispondere. Non c'è nessun passo da fare a mano: il deploy è un'Application
# in Coolify, non una shell, e un runbook che dice «adesso lancia questo
# comando» descrive un passo che un giorno qualcuno salta.
#
# Sembra il contrario di ADR-045 («i pesi si montano, non si scaricano a
# runtime») e non lo è. Quello che ADR-045 vietava è scaricare **durante una
# conversazione**: un modello preso da internet al primo turno è un servizio
# che un giorno non risponde. Qui il download avviene **prima** che uvicorn
# esista, quindi la porta non è aperta, il healthcheck è rosso, e nessuna
# frase può arrivare a un servizio che non ha i suoi pesi. La proprietà che
# contava è intatta; è sparito il passo manuale.
set -eu

MODELS_DIR="${MODELS_DIR:-/models}"
export MODELS_DIR

if [ ! -w "$MODELS_DIR" ]; then
  echo "✗ $MODELS_DIR non è scrivibile." >&2
  echo "  Serve un volume persistente montato lì, scrivibile dall'utente 10001." >&2
  echo "  Senza, i pesi si riscaricherebbero a ogni riavvio — o non si scaricherebbero." >&2
  exit 1
fi

# `set -e` fa il resto: se i pesi non arrivano o uno sha non torna, il container
# muore qui e Coolify lo mostra come fallito, invece di lasciare in piedi un
# servizio che risponde 503 a ogni frase senza dire perché
/usr/local/bin/fetch-models.sh

# exec: uvicorn diventa il PID 1 e riceve i segnali di stop direttamente,
# altrimenti un redeploy aspetta il timeout invece di fermarsi subito
exec uvicorn app:app --host 0.0.0.0 --port 8000
