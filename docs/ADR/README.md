# Architecture Decision Records

Le decisioni **ADR-001 … ADR-011** vivono in [`docs/PROGETTO.md §2`](../PROGETTO.md) e non vanno
duplicate qui: duplicare significa creare due verità divergenti.

Questa directory accoglie le **nuove** decisioni, a partire da **ADR-012**.

## Convenzioni

- Nome file: `NNN-titolo-kebab-case.md` (es. `012-scelta-kiosk-runtime.md`).
- Una decisione per file; struttura minima: **Contesto → Decisione → Motivazione → Alternative scartate → Conseguenze**.
- Un ADR non si modifica retroattivamente: si sostituisce con uno nuovo che lo dichiara *superseded*.
- Ogni cambio strutturale di schema DB richiede un ADR (CLAUDE.md, regola 5).

## Indice

| # | Titolo | Stato |
|---|---|---|
| 001–011 | Vedi [`PROGETTO.md §2`](../PROGETTO.md) | Accettate |
| [012](./012-persistenza-baseline-psiche.md) | Persistenza delle baseline adattive della psiche | Accettata |
| [013](./013-vexa-polling-e-voce-in-call.md) | Integrazione Vexa: polling e voce in stanza (interim) | Accettata |
| [014](./014-il-branco-non-l-utente.md) | Il branco, non l'utente | Accettata |
| [015](./015-genoma-versionato.md) | Genoma versionato (ossatura dati) | Accettata |
| [016](./016-percezione-multimodale-e-biometria.md) | Percezione multimodale, biometria e enrollment vocale | Accettata |
| [017](./017-hosting-su-server-dedicato-hetzner.md) | Il "local" di local-first è un server dedicato in UE | Accettata |
| [018](./018-guscio-android-capacitor.md) | Il guscio del corpo: APK Capacitor, in due tempi (PWA ora, APK alla Fase 4) | Accettata |
| [019](./019-il-vicinato-multi-tenancy.md) | Il vicinato: più gosini, una famiglia ciascuno (multi-tenancy) | Accettata |
| [020](./020-incontro-fra-gosini.md) | L'incontro al parco: due gosini che non si sono mai visti | **Proposta** |
| [021](./021-recency-per-tipo-di-ricordo.md) | Recency per tipo di ricordo | Accettata |
| [022](./022-ricerca-ibrida-lessicale-e-vettoriale.md) | Ricerca ibrida lessicale e vettoriale | Accettata |
| [023](./023-il-sogno-che-ritira-un-ricordo.md) | Il sogno che ritira un ricordo | Accettata |
| [024](./024-il-sogno-collega-i-ricordi-agli-esseri.md) | Il sogno collega i ricordi agli esseri | Accettata |
| [025](./025-consolidamento-su-inattivita.md) | Consolidamento su inattività | Accettata |
| [026](./026-corpo-tridimensionale-e-strati-espressivi.md) | Il corpo di casa in tre dimensioni, e i tre strati espressivi | Accettata |
| [027](./027-iniziativa.md) | L'iniziativa: UGO può cominciare lui | Accettata |
| [028](./028-lo-spazio-l-orologio-e-i-promemoria.md) | Lo spazio, l'orologio e i promemoria | Accettata |
| [029](./029-il-rumore-si-giudica-sulla-stanza.md) | Il rumore si giudica sulla stanza, non su una soglia | Accettata |
| [030](./030-uscire.md) | Uscire: chiederlo, e accorgersi di essere stato accontentato | Accettata |
| [031](./031-il-consiglio.md) | Il consiglio: più esemplari, e il genoma che pilota | Accettata |
| [032](./032-un-runtime-per-esemplare.md) | Un runtime per esemplare: due gosini erano una creatura con due nomi | Accettata |
| [033](./033-l-abitudine-al-fracasso.md) | L'abitudine al fracasso: la stanza si muove, e il decimo botto non è il primo | Accettata |
| [034](./034-il-pannello-sa-di-chi-parla.md) | Il pannello sa di chi parla, e da cosa arriva l'umore | Accettata |
| [035](./035-il-pannello-ha-due-livelli.md) | Il pannello ha due livelli, e una sessione che dura | Accettata |
| [036](./036-la-stanza-e-l-unita.md) | La stanza è l'unità, non la creatura | Accettata |
| [037](./037-chi-parla-e-che-stanza-e.md) | Chi parla, e che stanza è questa | Accettata |
| [038](./038-cosa-e-stato-detto.md) | Cosa è stato detto: il corpo tiene un registro | Accettata |
| [039](./039-la-stanza-e-una-cosa.md) | La stanza è una cosa, non una grafia | Accettata |
| [040](./040-l-abitudine-vale-anche-per-le-parole.md) | L'abitudine vale anche per le parole, e a rispondere non è sempre il più vecchio | Accettata |
| [041](./041-una-voce-non-e-un-botto.md) | Una voce non è un botto, e quanto è rumorosa la stanza lo sai tu | Accettata |
| [042](./042-il-riconoscimento-si-misura.md) | Il riconoscimento si misura, o non è riconoscimento | Accettata |
| [043](./043-la-soglia-viene-dalla-curva.md) | La soglia viene dalla curva, e sotto c'è una domanda | Accettata |
| [044](./044-la-camera-si-accende.md) | La camera si accende | Accettata |
| [045](./045-riconoscere-davvero.md) | Riconoscere davvero: dal vivo, col volto, e il perimetro che ne segue | Accettata |
| [046](./046-i-pesi-si-scaricano-al-deploy.md) | I pesi si scaricano al deploy, e si verificano | Accettata |
| 047 | *(prossimo numero disponibile)* | — |
