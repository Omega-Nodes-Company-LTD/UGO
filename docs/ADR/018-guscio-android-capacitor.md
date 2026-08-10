# ADR-018 — Il guscio del corpo: APK Capacitor, non una scheda del browser

**Stato: PROPOSTA** — decisione che PROGETTO §4.1 chiedeva di prendere in Fase 2 («Fully Kiosk
Browser o APK Capacitor con lock task; scegliere in Fase 2 e registrare ADR») e che non è mai stata
presa. Il corpo di casa gira oggi in una scheda di Chrome, che è un default per omissione.

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

## Decisione proposta

**Un APK Capacitor**, che impacchetta la stessa webapp e vale per **entrambi** i corpi.

- Stesso codice: `apps/face` resta la sorgente, Capacitor la incapsula. Nessun fork, nessuna seconda
  implementazione da tenere allineata.
- Il passaggio dock ↔ indossabile resta quello già costruito: tag NFC nel guscio, con toggle manuale.
- In dock: **lock task** attivo, schermo tenuto acceso, avvio automatico al boot.
- In giro: foreground service col microfono, notifica persistente, wake lock.
- Distribuzione: APK firmato installato a mano. Nessuno store: un solo utente, un solo telefono.

**Fully Kiosk Browser** resta come ripiego per il solo dock, se un giorno servisse qualcosa subito e
senza toolchain Android. Non copre il corpo in giro, quindi non può essere la scelta principale.

## Alternative scartate

1. **PWA e basta.** È ciò che c'è oggi. Regge il dock e **non regge il wearable**: registrerebbe solo
   con lo schermo acceso e l'app davanti, cioè non in un guscio sul petto. Sarebbe consegnare la
   Fase 4 a metà e chiamarla fatta.
2. **App nativa Android (Kotlin).** Darebbe tutto e in più il controllo fine su batteria e audio, al
   prezzo di **riscrivere la faccia, la macchina a stati e la coda offline** in un secondo linguaggio,
   e di mantenerne due per sempre. Sproporzionato: quello che manca alla webapp sono quattro
   capability di sistema, non l'interfaccia.
3. **Fully Kiosk Browser per tutto.** Ottimo kiosk da dock, ma resta un browser: i limiti della
   riga «schermo spento» non li supera.

## Conseguenze

- Nasce `apps/face-android/` con la configurazione Capacitor e i permessi; `apps/face` non cambia.
- Serve la toolchain Android (SDK + JDK) per produrre l'APK: **non è verificabile nella CI attuale**,
  e va detto invece che scoperto dopo.
- La wake word di Fase 3 e la registrazione a schermo spento di Fase 4 diventano possibili: oggi non
  lo sono, indipendentemente dal codice che scriviamo.
- Il runbook guadagna una sezione «installare UGO sul telefono» che oggi dice, di fatto, «apri il
  browser».
