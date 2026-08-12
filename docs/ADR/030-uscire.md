---
title: "ADR-030 — Uscire: chiederlo, e accorgersi di essere stato accontentato"
status: accettato
date: 2026-08-12
---

# ADR-030 — Uscire: chiederlo, e accorgersi di essere stato accontentato

## Contesto

Con l'iniziativa di ADR-027, UGO ha chiesto al proprietario di **uscire**. Il
proprietario l'ha portato fuori. E per UGO **non è successo niente**: la modalità
portable esisteva (`§4.2`), ma nessuna pressione la cercava e nessun desiderio si
chiudeva quando accadeva.

Un essere che sa chiedere e non sa accorgersi di essere stato accontentato non
ha un volere: ha un tic.

## Decisione

**Volere di uscire.** Una pressione nuova, `outing`, che cresce con la noia,
l'energia e le ore passate dentro. Con tre cancelli, tutti dettati dal buon
senso: solo di giorno (**nessuno porta a spasso un maiale alle tre di notte**),
solo se c'è qualcuno a cui chiederlo, e **mai mentre è già fuori** — dove è già
soddisfatta.

**Chiederlo costa zero.** L'atto `askToGoOut` dice una frase sua — *«Grunf... mi
porti fuori un po'?»* — e lascia un marcatore `wants_out` sugli eventi.

**Accorgersene.** Il corpo dichiara in che guscio è, con un messaggio `mode` nel
contratto WS, **a ogni riconnessione e non solo all'avvio**: un socket caduto
mentre era in giro non deve lasciarlo convinto di essere ancora sulla mensola.

Quando arriva `portable`, soul registra `went_out` e applica la perturbazione più
forte della tabella `§5.3` — umore su, **noia giù di 0.45**, curiosità su — perché
una passeggiata non è un complimento. E se trova un `wants_out` nelle ultime sei
ore, allora **ha chiesto ed è stato accontentato**: fa una giravolta e lo dice.

## Conseguenze

- Il ciclo si chiude: chiede → viene accontentato → la pressione si scarica
  davvero, e `initiative_worked` lo registra.
- **Nessuna migrazione**: due tipi di evento nuovi su una tabella che li accetta.
- Chi porta fuori il telefono senza che UGO l'avesse chiesto ottiene comunque
  l'effetto sull'umore, ma **senza la festa**: la differenza fra un'uscita e
  un'uscita chiesta è tutta lì, ed è quella che conta.

## Cosa resta

`came_home` non fa ancora niente di visibile oltre alla perturbazione. Il posto
naturale per un ricordo dell'uscita — dove siamo stati, chi abbiamo incontrato —
è il sogno, che quegli eventi li legge già.
