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
| [046](./046-i-pesi-si-scaricano-al-deploy.md) | I pesi si scaricano al deploy, e si verificano | **Superseded** da [047](./047-il-container-si-prepara-da-solo.md) (il meccanismo di consegna; la verifica SHA resta valida) |
| [047](./047-il-container-si-prepara-da-solo.md) | Il container si prepara da solo | Accettata |
| [048](./048-il-confine-e-del-database.md) | Il confine è del database, non della nostra attenzione | Accettata |
| [049](./049-chi-ha-fatto-cosa.md) | Chi ha fatto cosa | Accettata |
| [050](./050-la-lingua-e-della-casa.md) | La lingua e l'ora sono della casa | Accettata |
| [051](./051-la-reception.md) | La reception: una porta sulla strada, la casa resta chiusa | Accettata |
| [052](./052-il-cliente-non-e-famiglia.md) | Il cliente non è famiglia | Accettata |
| [053](./053-la-voce-del-cliente-resta-nel-suo-browser.md) | La voce del cliente resta nel suo browser | Accettata |
| [054](./054-il-gosino-sa-il-lavoro-del-cliente.md) | Il gosino sa il lavoro del cliente | Accettata |
| [055](./055-il-cliente-ha-un-contatore.md) | Il cliente ha un contatore | Accettata |
| [056](./056-il-mondo-ha-un-pavimento-e-delle-cose.md) | Il mondo ha un pavimento, e delle cose | Accettata |
| [057](./057-chi-sei-l-arruolamento-che-chiede-lui.md) | Chi sei? L'arruolamento che chiede lui | Accettata |
| [058](./058-il-premio-il-legame-e-cio-che-impara.md) | Il premio, il legame, e ciò che impara | Accettata |
| [059](./059-la-ruminazione.md) | La ruminazione: pensa coi modelli locali | Accettata |
| [060](./060-i-feed-e-il-consiglio-del-mattino.md) | I feed, e il consiglio del mattino | Accettata |
| [061](./061-il-tenant-e-unorganizzazione.md) | Il tenant è un'organizzazione: casa O azienda | Accettata |
| [062](./062-rls-si-accende.md) | RLS si accende: la transazione che dichiara la casa | Accettata |
| [063](./063-la-finestra-sul-mondo.md) | La finestra sul mondo: la ricerca web, su gesto esplicito | Accettata |
| [064](./064-le-richieste-passano-dal-carattere.md) | Le richieste passano dal carattere: il «tool calling» che non lo è | Accettata |
| [065](./065-la-lettura-su-gesto.md) | La lettura su gesto: «leggi», e UGO guarda cosa c'è scritto | Accettata |
| [066](./066-la-memoria-interrogabile.md) | La memoria interrogabile: il server MCP di sola lettura | Accettata |
| [067](./067-il-filo-della-stanza.md) | Il filo della stanza: la chat di gruppo | Accettata |
| [068](./068-la-cucciolata.md) | La cucciolata: il motore genetico | Accettata |
| [069](./069-la-nascita.md) | La nascita: dalla cucciolata all'esemplare | Accettata |
| [070](./070-il-pedigree.md) | Il pedigree: l'atto di nascita firmato dai genitori | Accettata |
| [071](./071-l-arco-della-vita.md) | L'arco della vita: l'età, e la plasticità che si consuma | Accettata |
| [072](./072-il-salvadanaio-del-gosino.md) | Il salvadanaio del gosino: il metabolismo | Accettata |
| [073](./073-il-libro-genealogico.md) | Il libro genealogico: la catena federata degli atti | Accettata |
| [074](./074-la-dote.md) | La dote: il sapere che viaggia con la creatura | Accettata |
| [075](./075-la-morte-crittografica.md) | La morte crittografica: il lascito resta, l'intimo no | Accettata |
| [076](./076-le-liste.md) | Le liste: la spesa e le cose da fare, a voce e a costo zero | Accettata |
| [077](./077-la-mortalita.md) | La mortalità: garanzia di tre anni, e la data non si sa | Accettata |
| [078](./078-il-timer-e-la-sveglia.md) | Il timer e la sveglia: la puntualità è una feature | Accettata |
| [079](./079-il-libro-della-vita.md) | Il libro della vita: il diario esiste da sempre, e non l'ha mai letto nessuno | Accettata |
| [080](./080-la-rassegna.md) | La rassegna: i feed avevano due contatori e nessun titolo | Accettata |
| [081](./081-non-si-crea-si-nasce.md) | Un gosino non si crea: si nasce, e si sceglie fra i nati | Accettata |
| [082](./082-la-cessione.md) | La cessione: un nato cambia mano, e la catena lo sa | Accettata |
| [083](./083-la-vetrina.md) | La vetrina: si guarda prima di scegliere, e si guarda senza avere niente | Accettata |
| [084](./084-l-adozione.md) | L'adozione: il gesto che lega la vetrina alla casa | Accettata |
| [085](./085-il-check-in.md) | Il check-in: quello che si fa vivo lui, e ogni volta | Accettata |
| [086](./086-il-libro-dei-ricordi.md) | Il libro dei ricordi: scorrere, non solo cercare | Accettata |
| [087](./087-l-umore-del-branco.md) | L'umore del branco nel tempo: una linea per creatura | Accettata |
| [088](./088-la-storia-della-buonanotte.md) | La storia della buonanotte: l'unico gesto che deve inventare | Accettata |
| [089](./089-l-export-che-manteneva-meta-promessa.md) | L'export che manteneva metà promessa | Accettata |
| [090](./090-i-diritti-dal-chiosco.md) | I diritti dove vive chi li ha | Accettata |
| [091](./091-i-ricordi-si-scrivono-in-chiaro.md) | I ricordi si scrivono in chiaro, e cinque difetti erano uno solo | Accettata |
| [092](./092-da-casa-ad-account.md) | «Casa» diventa «account»: una parola per lavoro | Accettata |
| [093](./093-l-oblio-del-cliente.md) | L'oblio di un cliente: la rotta che ADR-052 prometteva | Accettata |
| [094](./094-la-voce-di-casa-parla-per-prima.md) | La voce di casa parla per prima: il provider è il soccorso | Accettata |
| [095](./095-la-catena-a-piu-anelli.md) | La catena a più anelli: chi risponde paga, anche casa | Accettata |
| [096](./096-il-chiosco-nascondibile.md) | Il chiosco nascondibile: redesign dell'HUD del muso | Accettata |
| [097](./097-il-mercato-sotto-rls.md) | Il mercato sotto RLS: un ruolo per l'atto, non un buco nel muro | Accettata |
| [098](./098-la-connessione-della-casa.md) | La connessione della casa: la superficie 2 entra nel muro | Accettata |
| [099](./099-le-parentele-fra-le-case.md) | Le parentele fra le case: il confine si apre a mano, mai da solo | Accettata |
| [100](./100-le-chiavi-e-le-correzioni.md) | Le chiavi di casa, le correzioni, e la mela che sa cosa premia | Accettata |
| [101](./101-le-cose-che-nessuno-guardava.md) | Le sei cause, la percezione, i rapporti, e le rotte senza consumatore | Accettata |
| [102](./102-il-giornale-e-la-cronaca.md) | Il giornale e la cronaca: ciò che il pannello non poteva vedere | Accettata |
| [103](./103-la-cucciolata.md) | La cucciolata: quanti li decide il dado, nascono tutti, e dalla terza generazione si paga | Accettata |
| [104](./104-la-scrivania.md) | La scrivania: le cose che si facevano solo in psql | Accettata |
| [105](./105-il-genoma-si-rilegge.md) | Il genoma si rilegge (e non si tocca) | Accettata |
| [106](./106-l-astensione-il-criterio-relativo-non-regge.md) | L'astensione: il criterio relativo non regge, e il banco non poteva accorgersene | Accettata |
| [107](./107-non-lo-so-il-giudice-di-casa.md) | «Non lo so»: a guardare il significato è il modello di casa | Accettata |
| [108](./108-riferire-non-e-rispondere.md) | Riferire non è rispondere: «X può fare Y» non si giudica | Accettata |
| [109](./109-un-gene-nuovo-non-azzera-i-pedigree.md) | Un gene nuovo non deve azzerare i pedigree (e le setole) | Accettata |
| [110](./110-la-ricerca-conta-meno-dell-anagrafica.md) | La ricerca contava meno dell'anagrafica del ricordo | Accettata |
| 111 | *(prossimo numero disponibile)* | — |
