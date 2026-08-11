# ADR-018 — Il guscio del corpo: APK Capacitor, non una scheda del browser

**Stato: ACCETTATA (2026-08-10), con adozione in due tempi** — decisione che PROGETTO §4.1 chiedeva
di prendere in Fase 2 («Fully Kiosk Browser o APK Capacitor con lock task; scegliere in Fase 2 e
registrare ADR») e che non era mai stata presa. Il corpo di casa girava fino a ieri in una scheda di
Chrome, che è un default per omissione.

## Contesto

`apps/face` è una webapp, e questo non è in discussione: il muso su canvas, la macchina a stati, la
coda offline su IndexedDB e la modalità portable sono codice web che funziona. La domanda aperta è
**dentro cosa gira** su Android.

Per il corpo di **casa** la differenza è modesta: il telefono è nel dock, alimentato, schermo acceso,
app in primo piano. Una PWA aggiunta alla schermata Home fa il suo lavoro.

Per il corpo **in giro** la differenza non è modesta: è la funzione stessa.

## Cosa una scheda del browser non può fare

Il wearable deve registrare mentre il telefono sta in un guscio sul petto, con lo schermo spento, per
una giornata di lavoro (§4.2). Android non lo concede al contenuto web:

| Serve | In una scheda | In un'app |
|---|---|---|
| Registrare a schermo spento | il tab viene sospeso, `MediaRecorder` si ferma | **foreground service** con tipo `microphone` |
| Wake word sempre in ascolto (Fase 3) | stesso limite | stesso servizio |
| Tenere sveglio il processo | nessun `WAKE_LOCK` per il web | wake lock esplicito |
| Non uscire per sbaglio dall'app | niente | **lock task** (kiosk vero) |
| Notifica persistente «UGO sta ascoltando» | impossibile | obbligatoria, ed è un bene (ADR-011) |

L'ultima riga merita attenzione: Android **obbliga** un foreground service a mostrare una notifica
persistente. Per un progetto il cui primo principio è *visibile by design*, un requisito di sistema
che dice a tutti che il microfono è attivo non è un costo, è un alleato.

## Decisione

**Un APK Capacitor**, che impacchetta la stessa webapp e vale per **entrambi** i corpi.

- Stesso codice: `apps/face` resta la sorgente, Capacitor la incapsula. Nessun fork, nessuna seconda
  implementazione da tenere allineata.
- Il passaggio dock ↔ indossabile resta quello già costruito: tag NFC nel guscio, con toggle manuale.
- In dock: **lock task** attivo, schermo tenuto acceso, avvio automatico al boot.
- In giro: foreground service col microfono, notifica persistente, wake lock.
- Distribuzione: APK firmato installato a mano. Nessuno store: un solo utente, un solo telefono.

**Fully Kiosk Browser** resta come ripiego per il solo dock, se un giorno servisse qualcosa subito e
senza toolchain Android. Non copre il corpo in giro, quindi non può essere la scelta principale.

## Adozione in due tempi

Il proprietario ha scelto di **partire dalla PWA** e impacchettare dopo: «possiamo cmq partire dalla
web app e testare le cose al volo, poi spostarci su app native». La decisione sopra non cambia — la
sua *data di consegna* sì, ed è giusto così: si verifica prima che la creatura funzioni, poi la si
chiude in un guscio.

**Tempo 1 — adesso, PWA installabile.** `apps/face` ha manifest, icone e `display: fullscreen`; si
aggiunge alla schermata Home e parte senza barra degli indirizzi. In più prende uno **Screen Wake
Lock** (`apps/face/src/wakelock.ts`) quando il microfono si accende, così il dock non si spegne a
metà frase. È abbastanza per il corpo di casa e per provare tutto il resto sul telefono vero.

**Tempo 2 — cominciato (2026-08-10).** `apps/face-android/` esiste: Capacitor attorno alla stessa
`apps/face`, i permessi dichiarati uno per uno con il motivo accanto, e l'APK di debug che si
costruisce davvero — 4,2 MB, verificato aprendo il pacchetto e leggendone i permessi. La CI lo
costruisce a ogni push e lo pubblica come **release** `apk-latest` — non come artefatto: un artefatto
scade in novanta giorni e vive dietro la scheda Actions, mentre qui si installa da un telefono e
serve un indirizzo che continui a funzionare. Quindi la riga «non verificabile nella CI attuale» qui
sotto non è più vera: era il rischio principale di questa decisione ed è chiuso.

Restano da scrivere le parti native vere e proprie — foreground service col microfono, lock task,
avvio al boot, e la radio BLE per ADR-020: i permessi ci sono, il codice che li usa no.

Una precisazione su cosa impacchetta cosa, perché i nomi si confondono:

| Piattaforma | Guscio |
|---|---|
| Android (dock e wearable) | **Capacitor** (APK), oppure una Trusted Web Activity |
| Mac mini, PC Windows/Linux | **Electron** o Tauri — desktop soltanto, non producono APK |
| Qualunque browser, subito | la PWA del Tempo 1 |

Electron **non** è un'alternativa a Capacitor: non tocca Android. Se un giorno UGO deve stare su un
Mac mini in salotto, è un secondo guscio attorno alla stessa `apps/face`, non un sostituto.

## Alternative scartate

1. **PWA e basta, per sempre.** È il Tempo 1 promosso a soluzione finale. Regge il dock e **non
   regge il wearable**: registrerebbe solo con lo schermo acceso e l'app davanti, cioè non in un
   guscio sul petto. Sarebbe consegnare la Fase 4 a metà e chiamarla fatta.
2. **App nativa Android (Kotlin).** Darebbe tutto e in più il controllo fine su batteria e audio, al
   prezzo di **riscrivere la faccia, la macchina a stati e la coda offline** in un secondo linguaggio,
   e di mantenerne due per sempre. Sproporzionato: quello che manca alla webapp sono quattro
   capability di sistema, non l'interfaccia.
3. **Fully Kiosk Browser per tutto.** Ottimo kiosk da dock, ma resta un browser: i limiti della
   riga «schermo spento» non li supera.

## Conseguenze

- Nel Tempo 1 `apps/face` guadagna `public/manifest.webmanifest`, le icone e `ScreenAwake`: niente
  toolchain, niente CI nuova, e la webapp resta l'unica sorgente.
- Nel Tempo 2 nasce `apps/face-android/` con la configurazione Capacitor e i permessi; `apps/face`
  non cambia.
- ~~Servirà la toolchain Android (SDK + JDK) per produrre l'APK: non è verificabile nella CI
  attuale~~ — **risolto**: il job `android shell (debug apk)` costruisce il pacchetto e ne verifica i
  permessi a ogni push.
- L'APK pubblicato dalla CI è **di debug e non firmato per la distribuzione**. Una chiave di firma
  non entra nel repository: quando servirà un release vero, la chiave sarà un segreto di CI e la
  release smetterà di essere `prerelease`.
- La release è **rotante**: una sola, `apk-latest`, sostituita a ogni push su `main`. Per un
  pacchetto di debug l'unica versione interessante è quella corrente; le release versionate
  arriveranno quando ci sarà una versione da rilasciare.
- Lo Screen Wake Lock è un palliativo dichiarato, non un sostituto: tiene acceso lo schermo, non
  tiene vivo il processo. A schermo spento la scheda viene sospesa comunque.
- La wake word di Fase 3 e la registrazione a schermo spento di Fase 4 diventano possibili: oggi non
  lo sono, indipendentemente dal codice che scriviamo.
- Il runbook guadagna una sezione «installare UGO sul telefono» ([OPS_COOLIFY §10](../OPS_COOLIFY.md)),
  che nel Tempo 1 descrive l'aggiunta alla schermata Home e nel Tempo 2 diventerà l'installazione
  dell'APK.
