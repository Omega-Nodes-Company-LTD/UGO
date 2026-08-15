# ADR-056 — Il mondo ha un pavimento, e delle cose

**Stato**: accettata · **Data**: 2026-08-15 · **Contesto**: segnalazione del proprietario
guardando il chiosco — «sembra che viva in uno spazio 2D», «possiamo aggiungere degli arredamenti
tipo un cuscino, erba, un cespuglio, in modo che possa fare qualcosa quando si annoia?»
**Vincolata da**: ADR-026 (geometria procedurale, zero asset, autonomia locale a zero token),
ADR-036 (il dispositivo mostra una **stanza**), ADR-048 (il confine è del database)

## Il problema, in due metà

### Lo spazio era già 3D, e non si poteva vedere

`wander.ts` muove **x e z** dentro un recinto ellittico da quando esiste, e la camera guarda
dall'alto. Ma in tutto `apps/face/src` non c'era un `PlaneGeometry`, un `Fog`, uno
`scene.background`, e come unica ombra un cerchio finto attaccato sotto il maiale.

Su fondo nero, chi avanza lungo Z **sembra soltanto ingrandirsi**. La profondità c'era ed era
inosservabile, che è il modo in cui una dimensione intera non esiste — e il proprietario, che
guarda il chiosco tutti i giorni, l'ha letta esattamente così.

### Una stanza vuota è un posto in cui non c'è niente da fare

La noia sale, il corpo la esprime — sospira, guarda il vuoto, conta le travi — e poi finisce lì.
Non c'era niente verso cui andare, quindi la noia non poteva avere una *conseguenza*: solo un
aspetto.

## Le decisioni

### 1. Tre indizi di profondità, in ordine di resa

**Nebbia**, **fondale**, **trama del pavimento** — e l'ordine non è casuale. La nebbia è l'unica
che parla anche stando fermi; il fondale dà un orizzonte contro cui misurare l'altezza; la trama è
l'unica che dice qualcosa sul **movimento**, e nessuna nebbia sostituisce la parallasse di chi
cammina su un terreno che ha dei dettagli.

Zero asset binari (ADR-026 §1): le tre trame si generano a runtime con `CanvasTexture` e un dado
ripetibile. Il divieto è sui file, non sulla generazione da codice — e un pavimento procedurale
accanto a un maiale procedurale è la stessa scelta, non un'eccezione.

Il pavimento è **erba**, non terriccio, e non è una scelta di gusto: gli arredi sono un cuscino, un
ciuffo d'erba, un cespuglio e un truogolo, cioè roba da aia. Su terriccio scuro sembravano posati
sul pavimento di una cantina. Il costo l'ha pagato subito il ciuffo d'erba, che sul terriccio si
vedeva e sul prato era diventato invisibile: adesso è di un verde più chiaro e più alto — è erba
lasciata crescere, e che sia di un altro verde è anche vero.

La nebbia segue la distanza della camera, che `resize()` cambia con lo schermo e con quante
creature ci sono. `near` sta appena **prima** della creatura: è quello che fa cadere i suoi passi
avanti e indietro dentro la rampa, cioè che rende leggibile la Z. A distanze fisse sarebbe un velo
addosso a lui sul telefono e niente del tutto sul desktop.

### 2. Il catalogo degli arredi è **codice**, non una tabella

Cinque tipi in `packages/shared/props.ts`, insieme chiuso come `FACE_STATES`. Una riga di database
che nomina un arredo che il corpo non sa disegnare è un modo di rompere le cose che non serve a
niente: il muso lo ignorerebbe in silenzio e il pannello mostrerebbe un oggetto che non esiste.

Nel database va ciò che **varia da casa a casa**: dov'è un oggetto (`placed_props`) e quanti ne
restano (`prop_stock`). `text` più `check` e non un enum di Postgres — STATE §7 registra la
trappola pagata due volte, drizzle-kit non genera `CREATE TYPE`.

⚠️ **Due migrazioni, non una.** `0016` generata, `0017` scritta a mano per le politiche RLS.
drizzle-kit non modella le politiche, e le liste della `0013` sono **per nome**: senza il secondo
file una tabella nuova nasce fuori dal muro fra le case, e si comporta esattamente come una tabella
protetta finché non arriva la seconda famiglia.

### 3. Il comportamento sta nel corpo, mai nell'anima

Avvicinarsi a un cuscino è una decisione **locale** e costa zero token (ADR-026 §6). Il `Wanderer`
guadagna delle attrazioni; `pickNext` punta a un arredo quando la noia supera 0.6; la posa e il
peso dei gesti li tirano le due leve che esistono già (`posture.ts`, `autonomy.ts`) invece di un
motore nuovo.

Una **soglia** e non una probabilità: sotto, gli arredi non esistono e la stanza si comporta come
si è sempre comportata. Sopra, sono l'unica cosa che attira. In mezzo non c'è niente da tarare, ed
è il punto — una stanza che diventa un metronomo, con la creatura che rimbalza fra cuscino e
truogolo, è il modo in cui questa cosa smette di sembrare viva.

### 4. `used_prop` abbassa davvero la noia, con un tetto

Questo era il punto su cui la prima stesura del piano aveva detto di no, e la decisione è stata
ribaltata dal proprietario. Il rischio era reale e va scritto: il corpo **sceglie da solo** di
andare sul cuscino, quindi è lui a generare l'evento che lo ricompensa. Senza tetto, un corpo
acceso e solo farebbe avanti e indietro fra due cuscini tenendosi la noia a zero per sempre — un
anello chiuso che si auto-alimenta, cioè un modo per cui la noia smetterebbe di significare
qualcosa.

Il `ceiling` di ADR-033 chiude l'anello senza codice nuovo: un cuscino toglie il primo strato di
noia e poi smette di bastare, che è esattamente ciò che fa un giocattolo vero. Più un
raffreddamento per **oggetto**, o ci si incolla sopra.

### 5. Il cespuglio è un riparo, e le misure sono di un pancia a tazza

Aggiunto dopo aver guardato il reso. Il corpo di UGO è largo ~2.3 unità e alto ~1.8 alla testa,
cioè un animale da una quarantina di centimetri al garrese: una unità di scena vale circa 40 cm, e
gli arredi vanno letti così. Il cespuglio a 0.9 unità era un ciuffo che gli arrivava al ginocchio.

Cresciuto l'oggetto serviva la spinta che ce lo manda, o sarebbe rimasto un soprammobile grosso:
lo **stress** è la seconda ragione per cui il corpo attraversa la stanza, e l'unica che vince sulla
noia. Un maiale spaventato non va a grufolare, va dietro il cespuglio — e ci va **dietro**, dal
lato opposto alla camera, perché nascondersi davanti a un cespuglio non è nascondersi.

### 6. Le collisioni ci sono, e sono oneste

Un arredo solido non si attraversa. Ma non c'è un pianificatore di percorso e non deve esserci:
viene respinto e rimbalza di lato, che è quel che fa un animale che sbatte contro qualcosa senza
guardare. Erba e cuscino restano calpestabili — la differenza sta in un campo, non in un numero.

### 7. La scena si spinge, non si aspetta

Il `roster` si manda solo all'apertura del socket. Per gli arredi quella cadenza non basta: senza
una spinta a scena aperta il proprietario dovrebbe ricaricare il chiosco dopo ogni cuscino, e un
pannello che sembra non fare niente finché non ricarichi **si legge come rotto**, non come
asincrono.

Nuovo `SceneHub`, per stanza e per casa. La casa nella chiave non è una precauzione teorica:
«cucina» è il nome di stanza più probabile che esista, e due famiglie senza di essa si
spedirebbero l'arredamento a vicenda.

### 8. Le scorte esistono, e **assente ≠ zero**

Il proprietario ha chiesto scorte infinite in casa e poche a settimana per i clienti. La forma
regge entrambi i casi senza decidere per il ramo che i clienti li sta costruendo: una casa **senza
riga** non ha limiti. Il contrario avrebbe reso ogni casa esistente incapace di posare un cuscino
il giorno del deploy.

Scorta e piazzamento sono **un atto solo**, in transazione, con `remaining > 0` nel `where`: fatti
in due punti, un errore fra i due lascia una casa con un cuscino in più e una scorta intatta — e
nessuno dei due è un errore che qualcuno segnala, perché nessuno dei due si vede.

## Conseguenze

- il chiosco disegna una superficie in più a ogni fotogramma. Portable mode (§4.2) la spegne per
  prima, ed è la cosa più grande da spegnere;
- `stop()` adesso smonta la stanza e gli arredi. Non è teorico: `bench.ts` fa `stop()` più
  ricostruzione **a ogni trascinamento** di uno slider del genoma;
- un frame nuovo sul filo (`scene`) e uno in salita (`used_prop`). Il secondo è **l'unico che sale
  portando un `who`**: i sensi sono della stanza e una frase la dice chi risponde, ma sul cuscino
  ci va uno;
- importare la radice di `@ugo/shared` nel muso rompe il bundle (`Buffer is not defined`): serviva
  un sottopercorso `@ugo/shared/props`, come `@ugo/shared/face` esiste già per la stessa ragione.
  L'ha detto il banco; nessun test lo avrebbe fatto;
- **nessun e2e sui pixel.** ADR-026 dice che gli e2e hanno smesso di guardarli e che il giudizio di
  leggibilità è umano. Fingere copertura qui sarebbe peggio che non averne.
