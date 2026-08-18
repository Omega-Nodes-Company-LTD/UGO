# ADR-087 — L'umore del branco nel tempo: una linea per creatura

**Stato: ACCETTATA** (2026-08-18). Settimo pezzo del gruppo 18.

## Contesto

La psiche esiste da PROGETTO §5.3 e si vedeva in due posti: **adesso** (le sei barre di
`/v1/psyche`) e **le ultime 48 ore** di un esemplare (la serie dentro `/v1/stats`).

Mancava la domanda che una casa con più creature si fa per prima, e che non è nessuna delle
due: **chi sta bene e chi no, e da quanto**. Quarantotto ore dicono la giornata; non dicono se
uno dei tre è teso da tre settimane.

## Decisione

### 1. Una serie per creatura, mai una per la casa

`GET /v1/psyche/branco?giorni=N` risponde con **una serie per ogni creatura viva della casa**,
mai con una media di casa e mai con gli snapshot impastati insieme. Due gosini sotto lo stesso
tetto scrivono nella stessa tabella: una linea sola che li unisse non sarebbe la storia di
nessuno dei due — sarebbe un umore che nessuno ha vissuto.

Chi se n'è andato non compare: un congedato (ADR-075) non ha un umore, ha una biografia.

### 2. Medie giornaliere, e le fa Postgres

Due settimane di istantanee grezze sono decine di migliaia di punti che nessuno schermo
disegna e nessun occhio legge. Il giorno è la grana della domanda «da quanto è così».

Le medie si calcolano **nel database**: portarsi in memoria ogni snapshot per dividerlo in
JavaScript vorrebbe dire spostare decine di migliaia di righe per ottenerne quattordici. E il
risultato si arrotonda a tre decimali, perché il quarto decimale di una media giornaliera è
rumore che finge di essere una misura.

La finestra è tappata a 180 giorni: oltre, una media al giorno mente da sola.

### 3. Una sparkline per creatura, non tre linee su un grafico

Il pannello ha già questa dottrina scritta (`sparks.ts`, le sei piccole invece di sei serie su
un asse) e qui vale identica: tre serie su un grafico hanno bisogno di tre colori, e l'identità
appesa al colore smette di funzionare per chi non li distingue. I nomi stanno accanto alle loro
linee, e non serve nessuna legenda.

## Una cosa che sembrava un difetto e non lo è

Nel farlo ho verificato il sospetto ovvio: `/v1/stats` senza `?gosino=` restituisce gli
snapshot di **tutta la casa interleavati**, e il pannello li disegna come **una riga sola** —
la «chimera» che il commento nel codice di `stats.ts` descrive.

Non succede. Il grafico delle 48 ore vive soltanto nella pagina di una creatura, e il router
del pannello ripiega `WHO` sul primo gosino prima di ogni chiamata: la serie è sempre scopata.
Il ramo di casa esiste nella rotta e **non lo disegna nessuno**. Scritto qui perché non venga
"aggiustato" da qualcuno che rifà la stessa verifica e si ferma a metà.

## Conseguenze

- **Positive**: la domanda «da quanto sta così» ha una risposta, e la separazione fra creature
  è strutturale invece che affidata a chi chiama.
- **Negative**: le giornate si raggruppano con `to_char` su `ts`, quindi in **UTC** e non nel
  fuso della casa — lo stesso limite dichiarato in ADR-086 per il libro dei ricordi, e la
  stessa risposta: si sistema insieme, con l'indice giusto, misurando su dati veri.

## Verifica

6 test d'integrazione su Postgres vero: due creature con umori opposti che **restano separate**
(0.8 e 0.9 nello stesso giorno fanno 0.85, e lo stress le divide nel verso opposto); i giorni
in ordine; la finestra che taglia davvero; il congedato che sparisce dalle serie; la casa del
vicino che vede il proprio vuoto e non le nostre creature; una finestra assurda rifiutata
invece che servita.

**Il giro completo (regola 12)**: BO — servizio e rotta. `/admin` — «Come stanno, nel tempo»
nel sommario della casa, col selettore della variabile e della finestra. FE — nessuna modifica
e non serviva: è una domanda da pannello, e il muso mostra l'umore di adesso, non la storia.
