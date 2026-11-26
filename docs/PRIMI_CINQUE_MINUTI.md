---
title: "I primi cinque minuti — specifica (BOZZA)"
description: "UGOMKT-11: come dovrebbe essere il primo incontro con una creatura, con le scelte ancora aperte segnate."
version: "0.2.0-bozza"
last_updated: "2026-11-26"
author: "Senior Principal Engineer & Privacy Officer"
---

# I primi cinque minuti — specifica (BOZZA)

**Stato: bozza, non approvata.** Il 2026-11-26 sono state chiuse le scelte **A1, B1, C1, E1**
(sezione 2). **Resta aperta la D** («telefono come casa d…»): finché non è chiusa, la parte che
tocca il guscio e l'hardware non si specifica. Dove manca una misura, c'è scritto. Base: `MISURA_PRIMO_INCONTRO.md`
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

## 2. Le scelte aperte (da chiudere prima di implementare)

**Chiuse il 2026-11-26** (A1, B1, C1, E1). Le opzioni scartate restano scritte, con le
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

> **SCELTA APERTA D — Il significato di «telefono come casa d…».** Il nome del branch è troncato.
> Letture possibili, da non confondere: (1) il **telefono è il corpo** della creatura; (2) il
> telefono è la **porta d'ingresso** alla casa, che vive altrove; (3) altro, che non so. Cambia
> cosa significa «guscio» e se l'hardware sta o no nei 5 minuti. **Mi serve la risposta.**

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
- **D** (scelta aperta): se il telefono è il corpo o la porta d'ingresso cambia il guscio; le
  scelte chiuse non dipendono da D, ma il perimetro hardware sì.

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
| 1:00 | **Un** gesto per dare i sensi, con una frase che dice **perché** microfono e fotocamera | Pulsante «Attiva sensi» e due permessi del sistema `[CODICE]` | La spiegazione prima del permesso: non so se c'è `[NON VERIFICATO]` |
| 1:30 | La creatura **saluta per prima**, con una riga sola | Il saluto esiste solo al risveglio, con «Mi ero segnato una cosa…» `[CODICE]` | Cosa dice una creatura **appena consegnata**, la prima volta: non verificato `[NON VERIFICATO]` |
| 2:00 | (E1, scelta) fa **una** domanda aperta e concreta | Non c'è un copione di primo incontro `[NON VERIFICATO]` | **Il copione** |
| 2:30–4:30 | La persona risponde; la creatura risponde **sul serio**, **nominando** quello che ha sentito | Chat e risposta `[CODICE]`; il tempo fino alla prima risposta richiede una chiave vera e non è misurato | Il tempo; **la chiave OpenRouter del server di prova** |
| 4:30 | La creatura si congeda **senza promettere** che ricorderà | — | Il testo del congedo |

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
| Guscio da stampare | **Fuori dalla finestra**; dipende da D | non guardato | Risposta a D |
| Server già installato da altri | **Fuori**: lo specifica chi gestisce il server | `[CODICE]` | Niente |

## 6. Il giorno dopo (terzo punto del criterio)

La definizione di «cita spontaneamente» è già **fissata prima** in
`SCHEDA_OSSERVAZIONE_PRIMO_INCONTRO.md` §6. Cosa sappiamo e cosa no:

- `[CODICE]` La chat non scrive ricordi; lo storico copre solo 12 ore: il giorno dopo la
  prima conversazione c'è **solo se il sogno** (alle 02:30) l'ha trasformata.
- `[MISURATO]` Il sogno vero, davanti a una prima conversazione sintetica con fatti precisi,
  scrive desideri che li citano **5 sogni su 5** e ricordi **5 su 5**; **14 desideri su 14 in
  forma di domanda diretta** dopo il cambio al prompt (prima 6 su 15).
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

## 8. Lavoro che ne uscirebbe (candidato, NON iniziato)

Ordine indicativo, con le scelte A1 + B1 + C1 + E1 chiuse. Resta aperta la D:

1. Emissione del link di ingresso alla consegna (un solo gesto per chi riceve).
2. Verifica reale del percorso web del telefono e aggiornamento di `primo-avvio.md`.
3. Copione di primo incontro (saluto + una domanda) e congedo senza promesse.
4. Spiegazione dei permessi prima del permesso.
5. Spec separata della vetrina per l'acquirente (fuori dalla finestra).
6. Le cinque sessioni, con la scheda.

Ogni punto è una fase a sé (regola 8). **Il lavoro non è iniziato**: la scelta D non blocca i
punti 1–6, ma blocca qualunque cosa tocchi il guscio. Se si riaprono B2/B3 o C2 serve un ADR.

## 9. Domande che restano a chi decide

1. **D**: cosa vuol dire «telefono come casa d…»? (le altre quattro sono chiuse)
2. Chi ha titolo per rivedere informativa e termini prima delle sessioni?
3. Chi conduce le sessioni, e dove si trovano cinque persone esterne allo studio?
