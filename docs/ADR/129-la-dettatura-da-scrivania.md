# ADR-129 — La dettatura da scrivania

**Stato: ACCETTATA** (direttiva del proprietario, 2026-11-09: «una soluzione tipo Wispr Flow, che a
pagamento non ci basta: serve una nostra, integrata coi nostri sistemi, che possa anche
rispondere»). Si appoggia su ADR-117 (le orecchie di casa: faster-whisper come default), ADR-125
(OpenRouter unico varco) e sull'abbinamento dei dispositivi del contratto di UGO pubblico.

## Contesto

Wispr Flow fa una cosa sola e la fa bene: tieni premuto un tasto, parli, il testo compare dove sta
il cursore, in qualunque app. Costa un abbonamento per persona e manda l'audio ai suoi server. UGO
ha già il pezzo difficile — una trascrizione vera sul nostro ferro (`/v1/stt` → servizio di
percezione → faster-whisper) — ma solo dentro il muso.

## Decisione

1. **Un'app nuova, satellite, in `apps/dictation-mac`**: vive nella barra dei menu, senza finestra
   principale e senza icona nel Dock. Non è una funzione del muso: il muso è il corpo di un gosino,
   questa è uno strumento di scrivania.
2. **Tauri v2 (Rust + una piccola pagina web)**, non Swift né Electron.
   - Electron porta un Chromium intero (~150 MB) per una finestra di impostazioni.
   - Swift/SwiftUI sarebbe il più nativo, ma è un linguaggio che nessuno dei nostri repository
     usa, e non si compila né si prova fuori da un Mac: niente CI su Linux, niente test qui.
   - Tauri dà il binario piccolo, le scorciatoie globali, la barra dei menu e il Portachiavi; il
     codice è Rust, testabile ovunque, e la CI macOS (`dictation-mac.yml`) lo costruisce davvero.
3. **La trascrizione resta nostra.** L'audio va solo a `POST /v1/stt` di UGO, che lo gira a
   faster-whisper sul nostro server: nessun testo e nessun audio passa da terzi. È la stessa strada
   del muso, quindi lo stesso contratto: PCM16 mono a 16 kHz in base64, al massimo ~12 s per
   richiesta. Le dettature più lunghe si **tagliano nei silenzi** in clip da al massimo 11 s, mai
   in mezzo a una parola, e si ricuciono.
4. **Il testo entra incollando**: appunti → ⌘V simulato → appunti com'erano (testo o immagine).
   Incollare un paragrafo è istantaneo, la digitazione simulata scriverebbe lettera per lettera e
   s'inceppa con gli accenti. Serve il permesso **Accessibilità**, che l'app chiede e spiega;
   senza, il testo va solo negli appunti e lo dice.
5. **Fuori dall'App Store.** Premere ⌘V in un'altra app non è compatibile con la sandbox: l'app si
   distribuisce firmata Developer ID (team `8UH44UM49Z`) e notarizzata, con Hardened Runtime e
   l'entitlement del microfono.
6. **Scorciatoie ⌃⌥D (detta) e ⌃⌥R (chiedi a UGO), cambiabili; non Fn.** Fn da solo non si
   registra come scorciatoia globale (servirebbe un event tap col permesso «Monitoraggio input», un
   secondo permesso sensibile), e su macOS è già la dettatura di Apple. ⌥⌘D nasconde il Dock, ⌃⌘D
   è «Cerca nel dizionario», le combinazioni con ⌘ sono dei browser. ⌃⌥ confligge solo con
   VoiceOver acceso, e le scorciatoie si cambiano dalle Impostazioni.
7. **Premi-e-parla di default**, con la modalità a interruttore per chi detta a lungo.
8. **Risponde.** La seconda scorciatoia trascrive la domanda, la manda a `/v1/chat` sul canale
   `api` (quello di chi parla a UGO da un programma, non quello di casa né della reception), mostra
   la risposta e la legge con la voce del gosino (`/v1/tts`, ElevenLabs via OpenRouter, ADR-126).
9. **Il token sta nel Portachiavi**, mai in un file. Nasce dall'abbinamento con codice (8
   caratteri, 10 minuti) e si revoca dal pannello; un 401 lo cancella e riapre l'abbinamento.

## Alternative scartate

- **Wispr Flow (o simili) in abbonamento**: costa per persona, l'audio va ai loro server, e non
  parla coi nostri sistemi.
- **Trascrizione nel Mac (whisper.cpp locale)**: niente rete, ma un modello da scaricare per ogni
  Mac, la batteria, e la qualità di un modello piccolo. La strada di casa c'è già e migliora per
  tutti insieme.
- **Un modello cloud per la trascrizione** (anche Scribe via OpenRouter): veloce, ma l'audio della
  scrivania uscirebbe di casa, che è esattamente quello che questa app esiste per evitare.

## Conseguenze

- **Dipende da UGO raggiungibile** dal Mac (`ugo.omeganodes.ai`) e dalla percezione accesa sul
  server: senza, l'app lo dice (501 «non accesa», 503 «riprova») invece di tacere.
- **Il build macOS si verifica solo su un Mac o sul runner macOS della CI.** Le parti pure hanno i
  loro test ovunque; microfono, Portachiavi, appunti e Accessibilità si provano a mano.
- **Gli appunti si ripristinano per testo e immagine**; un contenuto ricco (RTF, file) copiato
  prima di dettare si perde. Accettato: è raro, e la digitazione simulata costerebbe di più.
- **Nessuna versione iOS** per ora: le tastiere personalizzate di iOS non possono usare il
  microfono, e la strada è un'altra (rimbalzo sull'app principale).
