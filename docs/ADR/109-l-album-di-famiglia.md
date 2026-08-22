# ADR-109 — L'album di famiglia: i pixel si conservano, ma solo per il tempo che scegli tu

**Stato: ACCETTATA** (decisione del proprietario, 2026-08-19). **Riapre il vincolo 1 di ADR-016**
(«nessun media raw persistito») in forma stretta. Si appoggia ad ADR-019 (KEK/DEK), ADR-093 (prima
il bucket, poi le righe), ADR-049 (audit), e ADR-099 per la cartolina.

## Contesto

La domanda che ha aperto il cantiere era la seconda delle tre:

> «scattaci una foto e mandala al gosino di nonno Sandro»
> «fammi vedere un paio di scatti del parco che abbiamo visitato stamattina»

Fino a ieri UGO **non poteva farlo, per costruzione**. ADR-016 vincolo 1 dice che nessun media raw
si conserva: gli sguardi vivono in **un solo slot RAM** per esemplare (`faceGateway`), si consumano
alla lettura, e non toccano mai il disco. È il motivo per cui una casa con UGO dentro non è una
telecamera: non c'è un archivio da rubare, perché non c'è un archivio.

Chiedere «fammi vedere gli scatti di stamattina» significa chiedere che un archivio ci sia. Non si
può avere la cosa e la sua negazione, e il proprietario ha scelto — con una condizione, che è il
cuore di questa decisione:

> «per il persistito possiamo dare un limite da scegliere all'utente su quanto li teniamo: **o non
> si tengono, o si tengono da 6 ore a 72, scelta dell'utente**»

Non «si conservano le foto». **«Si conservano per il tempo che decidi tu, e di default zero.»** La
differenza fra le due frasi è tutta questa ADR.

## Decisione

### 1. Si scatta solo su gesto. Mai da soli.

Una foto nasce da due sole strade: **una persona la chiede a voce** («scatta una foto», «facci una
foto» — gesto puro in `volition/album.ts`, risolto prima del provider, zero token) oppure **il
titolare la chiede dal pannello**. Nessun'altra strada esiste, e non è una promessa scritta in
un documento: `albumGate.test.ts` legge i sorgenti e fallisce se `Photographer` viene nominato
fuori dai file autorizzati — la famiglia di guardie di ADR-091/099, dove **nominare il servizio
fuori posto è già l'infrazione**, perché il momento in cui l'iniziativa impara a scattare non
si nota leggendo una diff.

Fuori restano esplicitamente: il sogno, l'iniziativa (ADR-047), la ruminazione, i job. Una casa in
cui il cane fotografa da solo quando gli pare è una telecamera con la faccia simpatica.

### 2. La durata la sceglie il titolare, e di default è zero

`accounts.photo_retention_hours`: **0 = non si tengono** (default), oppure **6, 12, 24, 48, 72**.
Cinque scalini e non un numero libero, per due ragioni pratiche: si scelgono da una tendina senza
pensarci, e si dicono a voce («tienile un giorno»). Il `check` sta nel database, non solo nello
schema Zod, perché è il posto in cui il vincolo diventa vero anche per chi entra da psql.

Il default è `0` per la stessa ragione di `accounts.metabolism`: **una casa non deve cominciare a
conservare immagini per via di un aggiornamento**. L'album si accende, non si spegne.

`expires_at` si calcola **allo scatto** e non si ricalcola mai. Allungare la durata non resuscita
una foto che stava per sparire; accorciarla vale dal prossimo scatto. La scadenza di una foto è una
promessa fatta nel momento in cui è stata scattata, e le promesse non si riscrivono a posteriori.

### 3. `no_vision` vale a monte, e vale per tutta la casa

**Se anche una sola persona del branco ha `no_vision`, per quella casa l'album tace** — decisione
esplicita del proprietario. Non «si scatta e poi si sfoca»: non si scatta.

Il controllo sta **prima di chiedere il frame al corpo**, ed è la regola 9 di CLAUDE.md applicata
alla lettera («a monte della pipeline, non a valle»). Una foto rifiutata dopo essere stata scattata
è una foto che è comunque esistita: è passata su un canale, è stata in una variabile, ha potuto
finire in un log. Il test che vale è quello che conta le richieste al corpo e pretende **zero**;
è stato verificato rosso spostando la guardia di tre righe più in basso.

Questo chiude anche un buco reale che il cantiere ha trovato: **fino a oggi `no_vision` non toccava
la pipeline della visione**. L'unico punto che lo leggeva davvero era `_guard()` in
`ops/jobs/.../enrollment.py`, che protegge la costruzione dell'impronta biometrica. Coerente finché
nessun pixel si conservava; falso il giorno in cui l'album esiste.

### 4. I pixel sono ciphertext, la didascalia no

I pixel vivono cifrati **AES-256-GCM con la DEK della casa** (ADR-019) in un bucket privato
(`S3_BUCKET_PHOTOS`), riusando `AudioStorageConfig` e la meccanica di `putAudioObject`. Due
conseguenze volute: **distruggere la DEK cancella l'album insieme al resto della casa**, e la
riservatezza non dipende da come qualcuno ha configurato l'object storage. Il `Content-Type` è
opaco di proposito — chi elenca il bucket non deve nemmeno sapere che lì dentro ci sono foto.

La **didascalia sta in chiaro**, e non è una svista. È la frase con cui la foto si ritrova («gli
scatti del parco»), e vale esattamente l'argomento di ADR-091: il dato sensibile è il pixel, la
didascalia è una frase. Una didascalia cifrata renderebbe impossibile la sola domanda per cui
l'album esiste.

La riga `photos` non contiene mai un pixel: contiene la chiave dell'oggetto, chi ha scattato, la
frase e le due date.

### 5. La scadenza porta via il file, poi la riga

Doppio applicatore, il pattern esatto delle impronte ignote: **rotta** `POST /v1/album/expire` **e**
passo del sogno. I due non si disturbano, perché cancellare ciò che è già cancellato non fa niente.

L'ordine è **prima il bucket, poi il database**, ed è l'ordine di ADR-093 per una ragione imparata a
caro prezzo sui documenti dei clienti: le chiavi degli oggetti **si leggono solo dalle righe**.
Cancellare prima le righe lascia oggetti orfani e integri che nessuno sa più di avere — una casa che
crede di aver dimenticato e invece no. `DeleteObject` è idempotente, quindi morire a metà lascia un
lavoro riprovabile invece di un buco.

Audit `photos_expired` **col conteggio, mai una chiave**, e `album_retention_set` col numero di ore.
Il giornale dice che la casa ha cambiato idea sulla durata; non dice cosa c'era nelle foto.

### 6. Si guardano nel pannello e sul muso

Decisione del proprietario: tutte e due. Il pannello ha la pagina «L'album» con la griglia, la
tendina della durata e quanto manca a ciascuna. Il muso ha un contratto WS nuovo — `photo_ask` /
`photo` / `show_photos` — **distinto da `glimpse`**: uno sguardo si consuma, una foto si conserva,
e due destini diversi vogliono due nomi diversi e due caselle diverse in `FaceGateway`. Confonderli
sarebbe stato il modo più rapido per far finire nell'album un frame che nessuno aveva chiesto.

Il muso è un bundle che soul serve già costruito: **va ricostruito**, e sta nelle note di rilascio.

## Conseguenze

**Cosa cambia in peggio, detto chiaro.** Una casa che accende l'album ha, per la prima volta,
immagini della propria vita domestica su un disco. Cifrate, in scadenza, e nate solo su richiesta —
ma ci sono. Chi non le vuole non fa niente: il default è zero, e restare al default non richiede
nessuna azione. È la forma più onesta che questa funzione poteva avere.

**Cosa non cambia.** Gli sguardi restano quello che erano: RAM, uno slot, consumati alla lettura.
ADR-016 vincolo 1 resta vero per tutto ciò che non è una foto chiesta esplicitamente.

**Il precedente che si crea.** È la **prima retention per-account** del progetto: fino a ieri le
durate erano costanti di processo (`UNKNOWN_PRINT_RETENTION_DAYS`, `AUDIT_RETENTION_DAYS`). Il
precedente argomentativo è `lat/lon/place` su `accounts`, che ha già fatto lo stesso viaggio da env
di processo a colonna di casa. Chi aggiungerà la seconda retention scegliibile guardi qui.

## Alternative scartate

- **Foto in chiaro nel bucket, con il bucket privato.** Sposta la riservatezza su una
  configurazione, e le configurazioni si sbagliano. Con la DEK di casa, un bucket aperto per errore
  espone rumore.
- **Durata libera in ore.** Una casella di testo invita a scrivere 8760. Cinque scalini e uno zero
  sono una scelta, non un parametro.
- **Retention di chi manda, sulla cartolina.** Scartata: una cartolina ricevuta è di chi la riceve, e
  la sua casa decide quanto tiene le cose (ADR-099 §retention).
- **Riusare `glimpse` per lo scatto.** Un nome solo per due destini è il modo in cui, fra sei mesi,
  qualcosa che doveva essere guardato una volta finisce archiviato per tre giorni.
