# ADR-130 — Il guscio iOS carica il muso dal soul

**Stato: ACCETTATA** (2026-11-09, direttiva del proprietario: «prima su iOS e macOS, così riesco a
testarlo»). Affianca il guscio Android di ADR-018 senza cambiarlo. Presuppone UGO raggiungibile su
`https://ugo.omeganodes.ai` (contratto C1 della stessa giornata).

## Contesto

Il proprietario prova UGO su iPhone e su Mac. Il guscio Android impacchetta il muso già costruito
(`webDir: ../face/dist`) e lo raggiunge per indirizzo dentro la tailnet. Per iOS restavano tre
scelte aperte: dove vive il muso, come si gestiscono le dipendenze native, come si arriva sul Mac.

## Decisione

1. **Il muso si carica dal soul** (`server.url = https://ugo.omeganodes.ai`). L'origine della
   pagina è il soul stesso, come nel browser: `resolveSoulUrl` funziona com'è, il socket, i cookie
   del login e i permessi non cambiano, e non servono CORS né una chiave di build per dire al muso
   dove sta il server. Il muso si aggiorna col deploy del soul, senza ricompilare l'app.
2. **Swift Package Manager, non CocoaPods.** Capacitor 7 lo supporta col template ufficiale
   (`cap add ios --packagemanager SPM`), e `cap sync ios` gira anche su Linux: la CI verifica il
   progetto senza un Mac e senza Ruby.
3. **Sul Mac come app iPad** («Designed for iPad», `SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD`), non
   Mac Catalyst né Electron. Sui Mac Apple Silicon è la stessa build, firmata e distribuita con
   lo stesso TestFlight, e il muso è già pensato per uno schermo da tablet.
4. **Permessi dichiarati solo dove c'è codice che li usa**: microfono, fotocamera, riconoscimento
   vocale. Nessuna modalità in background, ATS senza eccezioni.

## Alternative scartate

- **Muso impacchettato nell'app** (come Android): funziona offline per mostrare il muso, ma UGO
  senza rete non parla comunque; in cambio ogni modifica del muso chiede una build e una
  revisione TestFlight, e serve una configurazione del server dentro il bundle.
- **CocoaPods**: richiede Ruby e `pod install` su un Mac, e non si verifica in CI su Linux.
- **Mac Catalyst**: una seconda variante da firmare e mantenere, per un'app che sul Mac non ha
  bisogno di niente in più di un'app iPad.
- **Electron/Tauri per il Mac**: un terzo guscio, quando quello iOS gira già sul Mac.

## Conseguenze

- **Senza rete l'app non parte.** È lo stesso comportamento del muso nel browser.
- **Apple può rifiutare un guscio web sull'App Store pubblico** (linea guida 4.2). Per TestFlight
  e uso interno non è un problema; per lo store pubblico servirà codice nativo (notifiche push,
  scorciatoie) che oggi non c'è.
- **La compilazione si verifica solo sul Mac.** La CI controlla progetto, identità, firma,
  permessi, dominio e supporto Mac (`apps/face-ios/check_shell.py`), non il binario.
