---
title: "I primi cinque minuti — specifica (BOZZA)"
description: "UGOMKT-11: come dovrebbe essere il primo incontro con una creatura, con le scelte chiuse e quelle scartate segnate."
version: "0.5.0-bozza"
last_updated: "2026-11-28"
author: "Senior Principal Engineer & Privacy Officer"
---

# I primi cinque minuti — specifica (BOZZA)

**Stato: bozza, non approvata.** Il 2026-11-26 sono state chiuse le scelte **A1, B1, C1, D1, E1**
(sezione 2): **nessuna scelta resta aperta**. La spec però **non è approvata**: nessun tempo
umano è stato misurato e le cinque sessioni non sono state fatte. Dove manca una misura, c'è
scritto. **Dalla 0.5.0 la spec è completa nel contenuto**: ogni minuto, ogni giuntura, il
giorno dopo e la regola di riuscita sono scritti, con cosa è fatto nel codice e cosa no; i
buchi che restano (sezione 10) sono **decisioni o prove di altri**, non pagine da scrivere.
Base: `MISURA_PRIMO_INCONTRO.md`
(il percorso di oggi) e `SCHEDA_OSSERVAZIONE_PRIMO_INCONTRO.md` (come si prova).

**Legenda delle prove** — ogni affermazione porta la sua etichetta:
`[CODICE]` letto nel codice · `[MISURATO]` numero preso da un test o dalla CI ·
`[IPOTESI]` proposta o stima, non provata · `[NON VERIFICATO]` non so, non l'ho guardato.

## 1. Il criterio (da UGOMKT-11)

1. Una spec scritta dei primi 5 minuti (**questo documento**, da chiudere).
2. Provata con **5 persone esterne** allo studio.
3. Il gosino, il giorno dopo, **cita spontaneamente** qualcosa della prima conversazione.

Oggi il primo incontro ha «troppe giunture»: vetrina, pagamento manuale, guscio da stampare.
**Nessuno dei tre punti è chiuso.**

## 2. Le scelte (chiuse il 2026-11-26)

**Chiuse il 2026-11-26** (A1, B1, C1, D1, E1). Le opzioni scartate restano scritte, con le
conseguenze, per chi le riapre: riaprirle riscrive le sezioni 4 e 5.

> **SCELTA CHIUSA — A1 — Dove cominciano i cinque minuti.**
> - **A1** *(SCELTA)*: dal primo tocco sul telefono con la creatura **già consegnata**. Vetrina,
>   prenotazione, pagamento e consegna restano **fuori** dalla finestra e si specificano a parte.
> - **A2**: dalla vetrina alla prima risposta, tutto dentro. Include il pagamento: **non
>   fattibile in 5 minuti** finché è una persona a segnarlo `[CODICE]`.
>
> Se A2, le sezioni 4 e 5 vanno riscritte.

> **SCELTA CHIUSA — B1 — Il pagamento.**
> - **B1** *(SCELTA)*: **fuori** dal primo incontro. Si paga e si consegna prima; i 5 minuti
>   cominciano con una creatura già di chi la riceve. Nessuna modifica al codice.
> - **B2**: la creatura arriva **prima** del pagamento. Contraddice ADR-082 («si consegna quello
>   che è stato pagato, perché la consegna è irreversibile») `[CODICE]`: serve un ADR.
> - **B3**: pagamento dentro i 5 minuti con un **incassatore automatico**: lavoro a sé, ancora
>   nel backlog `[CODICE]`.

> **SCELTA CHIUSA — C1 — Dove vive la creatura.**
> - **C1** *(SCELTA)*: **deploy ospitato**. È l'unico dove il sogno gira e quindi dove il
>   criterio «il giorno dopo cita» si può provare `[CODICE]`.
> - **C2**: **casa locale** («a casa tua»). Il kit non ha il servizio `jobs` `[CODICE]`: nessun
>   sogno, nessun desiderio, nessun ricordo dalla chat. Il terzo punto del criterio **non si può
>   passare** così com'è; servirebbe portare il sogno nel kit (lavoro a sé).

> **SCELTA CHIUSA — D1 — «Telefono come casa di default».** Il nome del branch era troncato
> («telefono come casa d…»). Il titolo del compito, riportato dal proprietario il 2026-11-26, è
> «Primi cinque minuti: telefono come casa di default, nessun assemblaggio, ricordo al giorno
> dopo».
> - **D1** *(SCELTA)*: il **telefono è il corpo della creatura, di default, senza guscio**: niente
>   da stampare, niente da assemblare, nessun hardware richiesto nei cinque minuti. È il
>   «corpo-telefono» che il backlog già nomina (con un guscio, `[CODICE]`: gruppo 6 e ADR-018).
> - Non decide: se un guscio fisico esista come opzione **dopo** (resta fuori dalla finestra e
>   fuori da questa spec); né cosa sia la «casa»: resta l'account sul server (C1).
> - Scartata: il telefono come sola **porta d'ingresso** a una casa che vive altrove. È la lettura
>   che non ho adottato; la lettura di D1 è mia e va corretta se non è quella voluta.
> - Un limite: senza un dock il telefono può non essere connesso, o non trovarsi al buio, di
>   notte; il saluto al risveglio e l'iniziativa dipendono da questo `[NON VERIFICATO]`.

> **SCELTA CHIUSA — E1 — Chi guida la prima conversazione.**
> - **E1** *(SCELTA)*: la creatura **conduce**: dice una riga e fa **una** domanda aperta e
>   concreta («cosa hai fatto oggi?»). Serve a dare al sogno fatti precisi, da cui dipende il
>   terzo punto del criterio `[IPOTESI]`.
> - **E2**: la persona parla per prima, la creatura risponde e basta. Più naturale, ma il sogno
>   può non avere niente di preciso da riportare.

**Conseguenze delle scelte chiuse:**
- B1 e C1: nessuna modifica al codice per il pagamento e nessun ADR; la **casa locale** («a casa
  tua», UGOMKT-10) è **fuori** dai cinque minuti e non può passare il terzo punto del criterio.
- E1: serve un **copione di primo incontro** (una riga e una domanda), oggi inesistente.
- D1: **l'hardware non è un requisito** dei cinque minuti: nessun guscio, nessun assemblaggio. Se
  qualcuno riapre D, cambia il perimetro hardware e vanno riviste le sezioni 4 e 5.

## 3. Cosa non cambia con nessuna scelta

- **Nessun carattere si regola** (regola 13) e **nessuna creatura si crea** (regola 14): la
  persona adotta, non configura. Il primo incontro **non** aggiunge un questionario di tratti.
- **Niente PII né contenuti nei log**; il testo delle conversazioni è cifrato a riposo (regola 6).
- **Il tetto di spesa è un limite di UGO**, non una garanzia del fornitore: non si promette altro.
- **Le pagine legali** (informativa, termini) non sono state riviste per questo percorso
  `[NON VERIFICATO]`: serve chi ha titolo legale prima di far provare persone esterne.

## 4. I cinque minuti, minuto per minuto (con A1 + B1 + C1 + E1, scelte chiuse)

I tempi sono **obiettivi provvisori**: nessun tempo umano è stato misurato `[IPOTESI]`.

| Minuto | Cosa succede | Cosa c'è oggi | Cosa manca |
|---|---|---|---|
| 0:00 | La persona tocca **un solo link** e il muso si apre sul telefono, già abbinato | `/login/:secret` apre il muso ed **entra da solo**; `/pair/:code` apre il muso e **precompila** il codice, che va poi confermato `[CODICE]` | Chi **emette** il link per chi riceve. Il codice lo emette un amministratore già dentro; il link via email vale **solo per l'email del proprietario** configurata, non per un acquirente `[CODICE]` |
| 0:30 | Nessun indirizzo da digitare, nessuna app da installare per cominciare | Il flusso di `primo-avvio.md` chiede Tailscale, un indirizzo `https://` e l'installazione sulla Home; la pagina è del 2026-11-09 e ADR-127 mette soul sul web | Non so quale sia oggi il percorso reale in produzione `[NON VERIFICATO]` |
| 0:30 | **Alla connessione** la creatura dice **una frase**: il saluto e la domanda insieme (V3, testo fisso: «Grunf, piacere: io sono {nome}. Tu come ti chiami, e che cosa hai fatto oggi?»). Viene **prima** dei sensi | **Fatto** (`firstMeeting.ts`, `FaceGateway.greetFirstMeeting`): subito dopo `whoami`, una volta sola per creatura, solo senza alcun messaggio, zero token, senza chiave; interruttore `UGO_FIRST_MEETING` (default `on`) `[CODICE]`. Prove: Postgres vero (una volta sola, dieci connessioni insieme) e WebSocket vero; senza il lock 3 saluti invece di 1 `[MISURATO]` | Come suona detto dal TTS del telefono `[NON VERIFICATO]`. Dal browser alla Home il saluto non si ripete `[NON VERIFICATO]` |
| 1:00 | **Un** gesto per dare i sensi, con una frase che dice **perché** microfono e fotocamera. Serve per rispondere a voce | Pulsante «Attiva sensi» e due permessi del sistema `[CODICE]`. **Si può rispondere anche senza sensi**: la riga «scrivigli…» (`#say-form`) manda `heard_text` **senza passare dal cancello del nome**, che giudica solo la voce (`main.ts`, `addressGate.judge`) `[CODICE]` | La spiegazione prima del permesso: **non l'ho trovata** in `index.html`, `main.ts`, `hud.ts` (`micReason.ts` spiega solo i permessi **falliti**) `[CODICE]`: da scrivere. **Rischio residuo:** a voce la finestra di 60 secondi può chiudersi prima dei sensi e la risposta senza il nome non parte; la riga scritta è l'uscita, ma **non so se la persona la trova** `[NON VERIFICATO]` |
| 1:30–4:30 | La persona risponde; la creatura risponde **sul serio**, **nominando** quello che ha sentito | **Fatto** la regola del primo scambio (`FIRST_EXCHANGE_RULE`, `isFirstExchange`): una riga nel blocco **dinamico**, solo in casa e a storico vuoto «per sempre»; il primo messaggio di sistema resta identico (regola 2) `[CODICE]`. Sonda su OpenRouter vero, 3 esecuzioni × 5 persone: **promesse di ricordare 0**, nome 15/15 (anche senza regola), dettaglio 15/15 con la regola contro 12/15 senza: **nessuna differenza affidabile** `[MISURATO]`. Le risposte superano le due frasi quasi sempre, anche senza la regola (difetto esistente) `[MISURATO]` | Il **tempo** fino alla prima risposta con una persona vera `[NON VERIFICATO]`; **la chiave OpenRouter del server di prova** |
| alla fine | La creatura si congeda **quando la persona saluta**, **senza promettere** che ricorderà; il congedo non è temporizzato | Nessun testo fisso: il congedo lo genera il modello; il divieto di promettere sta nella regola del primo scambio e `makesAPromise` lo misura (le frasi di `COPIONE` §4) `[CODICE]`. Congedi vaghi («a presto») nelle sonde `[MISURATO]` | Decidere se il congedo resta generato (e misurato) o diventa un testo fisso: **non deciso** |

**Vincolo di onestà.** Il terzo punto del criterio è un esito **probabile, non garantito**
`[MISURATO]` (5 sogni su 5, una sola prova sintetica). La creatura **non deve promettere**
«domani mi ricorderò»: se poi non cita, ha mentito.

## 5. Le giunture, una per una

| Giuntura | Stato proposto | Prova | Serve |
|---|---|---|---|
| Vetrina e prenotazione sono solo API, senza una schermata per chi compra | **Fuori dalla finestra** (A1); da specificare a parte | `[CODICE]` | Una spec della vetrina per l'acquirente |
| Pagamento a mano dell'allevamento | **Fuori** (B1) | `[CODICE]` | Niente, se B1 |
| Casa vuota fra prenotazione e consegna | **Sparisce** con B1: si consegna prima | `[CODICE]` | Niente, se B1 |
| Due credenziali (token da proprietario, codice di abbinamento) per un solo ingresso | **Un solo link** | `[CODICE]` | Emissione del link alla consegna |
| Quattro precondizioni sul telefono | **Ridotte a un gesto** (sensi) | `[CODICE]` letto, non osservato | Verificare il percorso web reale |
| Riconoscimento vocale di Chrome (passa da Google) | Da **dichiarare** nel primo incontro, non da nascondere | `[CODICE]` (`primo-avvio.md`) | Testo di informazione |
| Guscio da stampare | **Sparisce**: nessun assemblaggio nei cinque minuti (D1) | `[CODICE]` (backlog) | Niente |
| Server già installato da altri | **Fuori**: lo specifica chi gestisce il server | `[CODICE]` | Niente |

## 6. Il giorno dopo (terzo punto del criterio)

La definizione di «cita spontaneamente» è già **fissata prima** in
`SCHEDA_OSSERVAZIONE_PRIMO_INCONTRO.md` §6. Cosa sappiamo e cosa no:

- `[CODICE]` La chat non scrive ricordi; lo storico copre solo 12 ore: il giorno dopo la
  prima conversazione c'è **solo se il sogno** (alle 02:30) l'ha trasformata.
- `[MISURATO]` Il sogno vero, davanti a una prima conversazione sintetica con fatti precisi,
  scrive desideri che li citano **5 sogni su 5** e ricordi **5 su 5**; **14 desideri su 14 in
  forma di domanda diretta** dopo il cambio al prompt (prima 6 su 15).
- `[CODICE]` Dal 2026-11-27 il sogno (`reflect.py`) scrive i desideri come **frasi da dire a voce**,
  perché `speakDesire` le pronuncia alla lettera (prima 9 su 15 erano istruzioni a sé stesso).
  **Cambia il sogno in ogni casa**, non solo nel primo incontro.
- `[MISURATO]` La regola del primo scambio **non** ha dato una differenza affidabile sul dettaglio
  citato (15/15 contro 12/15 del controllo): il merito del «cita il giorno dopo» sta nel sogno, non
  nella regola. Nessuna prova del «giorno dopo» con una persona vera.
- `[CODICE]` Due strade dal desiderio alla persona: il **saluto al risveglio** (muso che dorme e
  vede un volto: serve la **fotocamera**) e l'**iniziativa** (mai tra le 22 e le 08, con un corpo
  connesso).
- `[NON VERIFICATO]` Come suona «Mi ero segnato una cosa: Marta, come è andata…» detto a voce, e
  cosa succede se il telefono resta connesso nel dock di notte (il desiderio può essere detto a
  una stanza vuota e consumato).
- `[CODICE]` Altri scrittori di desideri (`anniversaries`, `feeds`, `recap`, volto sconosciuto)
  scrivono **istruzioni** e verrebbero dette alla lettera dall'iniziativa. Fuori da questa spec,
  da non dimenticare.

## 7. Come si dichiara riuscita la prova

Il criterio passa **solo** se tutte queste cose valgono, sulle **5 persone**:

1. nessuna rimane **senza una via d'uscita**;
2. la prima risposta arriva entro un **obiettivo di tempo** da fissare **dopo le prime due
   sessioni**, non prima `[IPOTESI]`: un numero deciso senza aver visto nessuno è un'invenzione;
3. il giorno dopo la creatura cita un fatto preciso, per la definizione fissata;
4. il numero si scrive **su quante persone su cinque**, senza arrotondare.

Senza le cinque sessioni UGOMKT-11 **non è chiuso**: nessun documento, test o sonda lo chiude.

## 8. Lavoro che ne esce, e a che punto è

Con le scelte A1 + B1 + C1 + D1 + E1 chiuse:

| # | Lavoro | Stato (2026-11-28) |
|---|---|---|
| 1 | Emissione del link di ingresso alla consegna (un solo gesto per chi riceve) | **Non fatto.** Il link via email vale solo per l'email del proprietario (`deviceAccess.ts`); chi riceve non ha un modo di averlo |
| 2 | Verifica reale del percorso web del telefono e aggiornamento di `primo-avvio.md` | **Non fatto**: la pagina parla ancora di Tailscale |
| 3 | Copione di primo incontro (saluto V3 alla connessione, regola del primo scambio, niente promesse) | **Fatto nel codice e provato** (v0.91.0, PR #125 in bozza): vedi §4 e `COPIONE_PRIMO_INCONTRO.md` |
| 4 | Spiegazione dei permessi prima del permesso | **Non fatto** |
| 5 | Spec separata della vetrina per l'acquirente (fuori dalla finestra) | **Non fatto** |
| 6 | Le cinque sessioni, con la scheda | **Non fatto** |

Ogni punto è una fase a sé (regola 8). Se si riaprono B2/B3 o C2 serve un ADR.

## 9. Domande che restano a chi decide

1. Chi ha titolo per rivedere informativa e termini prima delle sessioni?
2. Chi conduce le sessioni, e dove si trovano cinque persone esterne allo studio?
3. Il congedo resta generato dal modello (e misurato) o diventa un testo fisso?

## 10. Cosa separa questa bozza da una spec approvata

Il contenuto è scritto. Per approvarla mancano cose che **non posso chiudere io**:

1. **L'approvazione del proprietario** su A1–E1, sul copione e in particolare sulla lettura
   mia di D1 (telefono come corpo, senza guscio).
2. **Le pagine legali riviste** da chi ne ha titolo (§3, §9.1) prima di far provare persone esterne.
3. **Le cinque sessioni** con `SCHEDA_OSSERVAZIONE_PRIMO_INCONTRO.md`: da lì escono i tempi
   (§7.2), la tenuta del saluto alla connessione, se la persona trova la riga «scrivigli…», e
   il «giorno dopo» vero. Fino ad allora ogni tempo di §4 resta `[IPOTESI]`.
4. I lavori 1, 2, 4 e 5 di §8, ognuno una fase a sé.

Una spec approvata **senza** le sessioni non chiude UGOMKT-11 (§7).
