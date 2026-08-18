# ADR-096 — Il chiosco nascondibile

**Stato: ACCETTATA** (2026-08-18). Redesign dell'HUD del muso, scelto dal proprietario su tre
proposte confrontate a mockup (canvas «Il muso di UGO — tre strade»): la strada C («Chiosco»)
in variante nascondibile — nascosto, diventa la strada A («Aria»).

## Contesto

L'HUD del muso era cresciuto per accumulo: una barra in basso con dieci controlli in fila,
etichette con emoji, pannelli con una veste ciascuno. Su un telefono la barra si piegava su tre
righe; su un chiosco in cucina — uno schermo che leggono tutti, occhiali o no, da tre metri —
niente diceva cosa fosse un comando e cosa uno stato. E il muso è **prima di tutto una
creatura**: il cromo che serve a chi lo governa è rumore per chi ci convive.

Le due esigenze tirano in direzioni opposte. Un chiosco leggibile vuole etichette esplicite e
tasti grandi; una creatura vuole sparire tutto il resto. Sceglierne una sola era rinunciare
all'altra metà delle giornate del dispositivo.

## Decisione

**Due stati per lo stesso markup**, commutati da `data-chrome` su `#app`; la veste è tutta in
`apps/face/src/hud.css`, il markup non si muove e gli id/testid restano quelli di sempre.

1. **ESTESO** (default) — il chiosco: barra in alto (`UGO · umore` a sinistra; `connesso ·
   versione · Nascondi` a destra) e comandi in colonna a sinistra su desktop, a foglio
   inferiore su telefono, raggruppati sotto le voci **Sensi** e **Casa**. Etichette sempre
   esplicite, niente emoji nei controlli (icone SVG inline), tasti ≥44px. Il parlato è un
   sottotitolo su fondo scuro. Font **Atkinson Hyperlegible**, nato per l'accessibilità.
2. **NASCOSTO** — la creatura: resta un dock di vetro coi gesti primari (sensi, foto, detto,
   dati, privacy, REC quando c'è) e il sussurro dell'umore in alto col pallino di connessione.
   I controlli secondari (orecchie, stanza, QR) **non hanno scorciatoie**: il tasto ⌃ riapre
   il chiosco, che è il loro posto — una sola porta, niente menù a tre puntini.
3. Si nasconde con **Nascondi** in barra (desktop) o con la **presa** del foglio (telefono);
   la scelta è **per dispositivo** (`localStorage`, chiave `ugo.hud.chrome`) e uno storage
   rotto degrada a «solo per questa visita», mai a comandi spariti: qualunque valore non sia
   un nascondimento esplicito è il chiosco esteso.
4. **Pannelli gemelli** (conferma di ADR-090): «Cosa è stato detto» e «I tuoi dati» condividono
   la stessa scatola nella veste del chiosco. «Dimentica» è l'unico **bottone** rosso del muso;
   il punto di «Registra» è una spia, non un gesto. Il risveglio dalla privacy è l'unico gesto
   in bianco pieno.
5. Il font è **impacchettato nel bundle** (`@fontsource/atkinson-hyperlegible`), non caricato
   da un CDN: stessa ragione di ADR-044 — la casa non ha una strada verso fuori, e non deve
   averne bisogno per vestirsi.

## Conseguenze

- Il canvas (creatura, stanza, oggetti) e i contratti `faceContracts.ts` non sono toccati.
- La logica dei due stati vive in `hudChrome.ts` (parte pura testata in Node, filo provato
  in E2E), il resto è CSS: nessun controllo ha cambiato id, testid o listener.
- Gli E2E che cliccavano il canvas a (30,30) ora cliccano a (300,100): l'angolo in alto a
  sinistra è barra e colonna comandi, che intercetterebbero il click.
- Il bundle del muso va ricostruito perché il cambiamento arrivi sui dispositivi (regola 12).
