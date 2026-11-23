## feat: UGOMKT-10 «A casa tua» — l'anima di una creatura su un computer dell'utente

### Cosa fa
Una creatura può lasciare la casa ospitata in un file cifrato `.ugosoul` e rivivere su un computer dell'utente, senza un canone a UGO. L'utente paga a OpenRouter, con la **propria** chiave, quello che usa.

Il lavoro copre **MKT-10.0 e da 10.2 a 10.10**. Il 10.1 (spike su un pacchetto nativo senza container) è stato rinviato.

Decisioni: [ADR-132](ADR/132-a-casa-tua.md). Formato del file: [FORMATO_UGOSOUL.md](FORMATO_UGOSOUL.md).

### Come leggerla
I commit sono in ordine di dipendenza e si rivedono uno alla volta:

| Commit | Contenuto |
|---|---|
| docs ×2 | allineamento README/PROGETTO; ADR-132 e specifica del formato |
| `shared,db` | contenitore `.ugosoul`: AES-256-GCM a blocchi (STREAM), scrypt, voci in whitelist, integrità in fondo |
| `soul` esportazione | perimetro per tabella in `policyTables.ts`, chiude se una tabella non è classificata; lettura in una transazione di sola lettura |
| `admin`, `face` | il bottone per l'esportazione, nel pannello e nel muso |
| `soul` importatore | un'unica transazione, `commit` solo a integrità verificata |
| `soul` `/setup` | `src/home/`: procedura guidata e ingresso della casa locale |
| `ops` | `ops/home/`: kit Compose, lanciatori, `ugo.sh`/`ugo.ps1` per salvataggio, ripristino e aggiornamento |
| docs | guida utente, correzioni sulla privacy, STATE/BACKLOG, protocollo UAT |
| chore | fine riga LF e bit di esecuzione per gli script shell |

### Scelte che meritano un occhio critico
- **Niente chiavi nell'archivio.** I testi escono in chiaro logico e vengono ricifrati all'import con la chiave maestra del nuovo computer. Perciò `UGO_DATA_KEY` della sorgente non serve e non viaggia. La chiave privata di firma del gosino **resta fuori**: sul nuovo computer la creatura non può firmare né incontrare altre creature.
- **Nulla si omette in silenzio.** Il manifesto ha `omissions[]` con categoria, motivo e numero esatto.
- **Import atomico.** Se l'archivio è manomesso o tagliato, il rollback riporta il database al solo seme. «Vuoto» significa il solo seme delle migrazioni (`casa-prime`, `ugo-prime`, una stanza, un luogo), che viene sostituito.
- **Stesso id, stessa creatura.** Un import non fonde mai: se l'installazione contiene altro, si rifiuta. L'import non concede i diritti di fondare né di allevare (regola 14).
- **I vettori si ricalcolano** all'import con la chiave dell'utente. L'anteprima mostra una **stima** del costo, non un preventivo.
- **Il `/setup` è la superficie più esposta** (una macchina senza proprietario): gettone per avvio stampato solo sulla console, host ammessi solo `localhost`/`127.0.0.1`, stessa origine, blocco dopo 10 errori, CSP chiusa. La chiave OpenRouter si scrive su disco **dopo** il commit dell'import, mai prima.
- **Nessuna modalità nel runtime ospitato.** La casa locale ha un ingresso suo (`home/main.js`) che riempie le variabili dai file dei segreti e poi importa `index.ts`.
- **Esportazione spenta di default** (`UGO_SOUL_EXPORT=off`), come la ruminazione.

### Correzione sulla privacy da guardare con attenzione
`il-confidente-inviolabile.md` diceva che a rispondere era «la voce di casa» e che «non esce niente». Dopo ADR-125/131 non è più vero: oggi escono verso OpenRouter il testo della conversazione, i ricordi pertinenti, i testi da vettorizzare, le foto e la voce. Ho corretto la pagina e le stesse affermazioni in `parlare-con-ugo.md`, `quando-comincia-lui.md` e `problemi-comuni.md` (`UGO_CHAT_HOME_VOICE` non esiste più nel codice).

### Altro difetto trovato e corretto
`ops/docker/soul.Dockerfile` non aveva alcun `.dockerignore`: `COPY packages/*` portava nell'immagine i `node_modules` della macchina di chi costruisce. Su Windows questo rompeva la build. Ho aggiunto `soul.Dockerfile.dockerignore`. Su una checkout pulita (CI) non cambia nulla.

### Come è stato provato
- **Integrazione su Postgres vero.** Esportazione: 18 test sul servizio e 14 sulla rotta. Importazione: 25 test, più 3 sui vettori che **non sono stati eseguiti** (vedi sotto). `/setup`: 12 test. I test provano gettone, host, origine, blocco, manomissione, tetto di dimensione, chiave mai restituita né nei log, atomicità.
- **Mutazioni.** Ho introdotto difetti apposta (filtro della casa, fuga della chiave privata, nome non controllato, testi non ricifrati, commit parziale in caso di errore, gettone non controllato, chiave scritta prima dell'import) e ogni volta almeno un test è diventato rosso.
- **Kit vero su Windows 10 con Docker Desktop, senza persona.** Dal lanciatore da zero a `/setup` attraverso la porta pubblicata, fino al runtime con `/health` ok. Il processo gira come utente non root e i segreti sono 0600. Il riavvio non richiede un nuovo setup. `backup`, `restore` con soul acceso e `update` funzionano.
- `eslint` e `tsc` su soul puliti.

### Cosa NON è verificato
- **`soulImportEmbeddings.integration.test.ts`** richiede `OPENROUTER_API_KEY` e non è mai stato eseguito. È scritto per fallire senza chiave, secondo la regola del repo.
- **CI completa.** Le prove sopra le ho girate in locale: `pnpm turbo build lint test` e `test:integration` non sono stati eseguiti dopo la divisione in commit.
- **Playwright / browser vero.** La pagina `/setup` e i pannelli sono provati solo come testo servito e con test strutturali.
- **macOS e Linux**, Docker assente, requisiti hardware reali (restano ipotesi in ADR-132 §3).
- **La prova con una persona non tecnica** (MKT-10.10). Il protocollo è in [`docs/UAT_A_CASA_TUA.md`](UAT_A_CASA_TUA.md); senza di lei UGOMKT-10 non è chiuso.
- 3 test unitari di soul (`albumGate` ×2, `parcelGate`) e `dockerWorkspace.test.ts` falliscono su Windows per i separatori di percorso: succedeva anche prima e non c'entra con questo lavoro.

### Noto e deliberato (da rivedere)
- **Salvataggio locale in chiaro.** `ugo.sh backup` salva due file, `.dump` e `.key`. Chi li ha entrambi legge tutto, e il contenuto non è cifrato: lo protegge solo il permesso del file. La chiave OpenRouter non entra mai.
- **Il congedo nella casa ospitante** (10.5b) non c'è: oggi il trasloco è un gesto manuale.
- **Rinviato:** immagine pubblicata, firma dei lanciatori, salvataggio pianificato, `ugo import` da riga di comando, validazione della chiave OpenRouter prima dell'installazione.
- **Decisioni del proprietario ancora aperte** (default in ADR-132): perimetro di default dell'archivio, chiavi d'identità, licenza (**oggi manca un file `LICENSE`**), controllo aggiornamenti, modelli locali fuori ambito.
- **Pagine legali** (informativa, termini) non riviste per il caso «a casa tua»: serve chi ha titolo legale prima di distribuire.
- **`primo-avvio.md`** parla ancora di «voce di casa» per la sintesi vocale: il codice ha ancora `ttsLocal`, quindi non l'ho toccata senza verificare.

### Giro regola 12 (BO + /admin + FE)
- **BO:** esportazione, importatore, `/setup`, kit. Nessuna migrazione e nessun cambio di schema (la «copia» è registrata come evento).
- **/admin:** nuovo riquadro **I dati → Porta la tua anima a casa**. Ogni chiamata passa da `call()` e `script.test.ts` la esegue.
- **FE:** nuovo pannello nel muso (`apps/face`). **Il bundle va ricostruito** perché il pannello arrivi sul dispositivo (soul serve il muso già costruito). Da dichiarare nelle note di rilascio.

### Per chi rivede
1. `policyTables.ts`: ogni tabella è classificata come omessa, scartata, cifrata, in chiaro o con byte pubblici? È l'unico punto dove una tabella nuova può uscire per errore.
2. `importSoul.ts` e `importTable.ts`: l'integrità sta in fondo al file, quindi la transazione deve restare aperta fino alla fine.
3. `src/home/guard.ts` e `setupService.ts`: ordine delle scritture e superficie esposta del `/setup`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
