# UGO a casa tua — il kit

Fa girare UGO su un computer di casa: Linux, Windows o macOS. Serve **Docker**
(Docker Desktop su Windows e Mac). Niente altro da installare.

## Avviare

| Sistema | Cosa fare |
|---|---|
| Windows | doppio clic su **Avvia UGO.bat** |
| macOS | doppio clic su **Avvia UGO.command** |
| Linux | `./start.sh` |

La prima volta prepara da solo la password del database e apre nel browser la
pagina **/setup**: lì scegli il file `.ugosoul`, scrivi la frase di recupero,
incolli la **tua** chiave OpenRouter e il tetto di spesa giornaliero. Dalle volte
dopo, lo stesso gesto apre UGO.

> **Niente canone a UGO non vuol dire niente costi.** Paghi a OpenRouter quello
> che usi (il tetto giornaliero lo limita). Senza chiave la creatura conserva la
> memoria ma non può rispondere. Il tetto è un limite **di UGO** sul costo già registrato (l'ultima
> risposta può superarlo): il tetto duro si imposta sulla chiave, dentro OpenRouter.

## Cosa sta dove

- **Solo questo computer**: la porta è `127.0.0.1:3000`; il database non ha nessuna
  porta sull'host. Dalla rete di casa non si raggiunge.
- **La password del database**: `.env` in questa cartella (creata dal lanciatore, mai nel repo).
- **Chiave maestra e chiave OpenRouter**: nel volume Docker `ugo-home`, file a permessi 0600.
- **Memoria della creatura**: volume `postgres-data`.

## Fermare e togliere

```sh
docker compose stop        # ferma, i dati restano
docker compose down        # toglie i contenitori, i dati restano
docker compose down -v     # CANCELLA anche i dati: la creatura sparisce da questo computer
```

## Copia di sicurezza, ripristino, aggiornamento

```sh
./ugo.sh backup              # Windows: .\ugo.ps1 backup
./ugo.sh restore backups/ugo-AAAAMMGG-HHMMSS.dump
./ugo.sh update              # salva, poi ricostruisce/scarica l'immagine, poi riavvia
./ugo.sh stop
```

- Un salvataggio sono **due file**: `.dump` (il database) e `.key` (la chiave
  maestra che apre i testi). Chi ha tutti e due legge tutto: tienili insieme e al
  sicuro, fuori da questo computer. La chiave OpenRouter **non** c'è: si
  reinserisce dal /setup.
- `restore` chiede di scrivere SI, **sostituisce** la casa attuale e prima ne fa
  un salvataggio (`prima-del-ripristino-…`).
- `update` salva sempre prima; le migrazioni del database partono da sole al
  riavvio. Se l'immagine nuova non si costruisce, UGO resta com'era.
- Il salvataggio completo è per **questo** computer. Per **spostare** la
  creatura altrove c'è l'esportazione `.ugosoul`, cifrata con la frase di recupero.

## Da sapere

- **L'immagine** si costruisce dal repo la prima volta (qualche minuto). Una
  distribuzione senza repo userà `UGO_SOUL_IMAGE` con un'immagine già pubblicata:
  dove si pubblica, e con quale licenza, è ancora una decisione del proprietario (ADR-132).
- **Nessun salvataggio automatico**: si fa con `backup` (prima di aggiornare lo fa da solo).
