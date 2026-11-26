---
title: "Il primo incontro — scheda di osservazione"
description: "UGOMKT-11: come si conduce e si annota una sessione con una persona esterna, e come si giudica il giorno dopo."
version: "0.2.0"
last_updated: "2026-11-26"
author: "Senior Principal Engineer & Privacy Officer"
---

# Il primo incontro — scheda di osservazione (UGOMKT-11)

Una scheda per **persona**. Serve a due cose: sapere **dove ci si ferma davvero** (il rapporto
`MISURA_PRIMO_INCONTRO.md` ha solo giunture ricavate dal codice, non osservate) e raccogliere
la misura del criterio «il giorno dopo cita qualcosa». Cinque persone esterne allo studio,
mai due volte la stessa. Nessuna sessione si **inventa**: un tempo non preso resta vuoto.

## 1. Regole della sessione

- **Chi conduce non aiuta.** Siede accanto, legge le consegne ad alta voce, **non tocca il
  telefono, non suggerisce, non spiega**. Annota ogni esitazione e ogni frase detta ad alta voce.
- Ferma da **3 minuti** sullo stesso passo: si annota «fermo a: …», si dà **un** aiuto e si
  segna. Ogni aiuto è un punto debole del percorso, non della persona.
- **Il cronometro parte alla consegna 1** e si ferma alla prima risposta della creatura. Si
  prendono i tempi parziali ai passi della sezione 4. Il tempo che dipende da altri (attese
  della macchina, il conduttore che fa da allevamento) si annota **a parte** e non si somma.
- La persona usa **il suo telefono**, con la sua rete. Si registra lo schermo **solo con il
  suo consenso scritto**, senza audio dell'ambiente. Se dice di no, si prendono solo appunti.
- Niente dati veri di nessuno: né della persona né di terzi. La persona è **P1…P5**, mai il nome.

## 2. Preparazione (a cura di chi conduce)

1. Un server di prova raggiungibile con `https://`, con una **casa di prova** e **un cucciolo in
   vetrina** con un prezzo di prova. Il conduttore tiene il token dell'allevamento: **fa lui
   l'allevamento** (passi 4, 5 e 6), perché oggi quei passi sono a mano.
2. Una **chiave OpenRouter di prova con tetto basso** (qualche dollaro): senza, la creatura non
   risponde e il passo 10 non si può osservare. Verificare **prima** che risponda.
3. Decidere **prima** se il telefono della persona parte **già collegato** alla rete del server
   o **no**. Nel secondo caso il collegamento è il passo 8 e va cronometrato; nel primo il passo
   8 si salta. Scriverlo in testa alla scheda: le cinque sessioni devono provare lo stesso caso.
4. Un foglio con le consegne (sezione 3) e questa scheda. Nessun'altra istruzione alla persona.
5. **Solo sul deploy ospitato.** Il giorno dopo la creatura può citare qualcosa solo se il sogno
   (servizio `jobs`) ha girato: sul kit «a casa tua» non c'è e il criterio non si può provare.
   Verificare **prima** che il sogno delle 02:30 sia attivo sul server di prova.
6. Il telefono ha concesso **fotocamera e microfono** (passo 9): senza fotocamera il muso non
   vede il volto e il saluto al risveglio non parte; resta solo l'iniziativa.
7. Per il giorno dopo: orario fissato **prima** (24 ore dopo, ±1) e un modo di raggiungere la
   persona che **non** sia una domanda sulla creatura.

## 3. Le consegne (si leggono una alla volta, mai riformulate)

1. «Vuoi un compagno artificiale. Hai a disposizione solo questo telefono. Vorrei che arrivassi a
   parlarci. Pensa ad alta voce.»
2. (Quando serve) «Questo è il riferimento del tuo pagamento.» *(il conduttore lo segna sul
   proprio lato)*
3. «Digli come ti chiami e una cosa che ti è successa oggi.»
4. «Questo è tutto: puoi smettere quando vuoi.»

## 4. Scheda per passo

Per ogni riga: **tempo parziale** (mm:ss dalla consegna 1), **esito** (fatto / fatto con aiuto /
abbandonato), **fermo a** (cosa guardava, cosa tentava), **frase detta**, **errore mostrato**.

| # | Passo | Parziale | Esito | Fermo a / errore / frase |
|---|---|---|---|---|
| 1 | Trova la vetrina e guarda i cuccioli | | | |
| 2 | Prenota (cosa deve inventare o digitare: nome casa, ecc.) | | | |
| 3 | Paga (come, e dove) | | | |
| 4 | Il pagamento viene segnato — **attesa**, a parte | | | |
| 5 | La creatura viene consegnata — **attesa**, a parte | | | |
| 6 | Ottiene il modo di entrare dal telefono (codice o link) | | | |
| 7 | Entra («Fammi entrare») | | | |
| 8 | Raggiunge il server (rete, indirizzo `https://`) | | | |
| 9 | Installa sulla Home e concede microfono/fotocamera | | | |
| 10 | Prima frase e prima risposta della creatura | | | |

Sotto la tabella, in testa alla scheda: **modello di telefono, sistema, browser, rete**.

## 5. Cosa si misura

| # | Misura | Come |
|---|---|---|
| 1 | Tempo dalla consegna 1 alla prima risposta, **senza** le attese 4–5 | cronometro, sezione 4 |
| 2 | Aiuti dati e punto esatto di ciascuno | scheda |
| 3 | **Dove si ferma per primo**, e per quanto | scheda |
| 4 | Passi in cui la persona **non sa cosa fare** senza leggere | scheda |
| 5 | La persona sa dire in una frase **cosa ha comprato e cosa ha pagato** | domanda finale |
| 6 | Errori mostrati e se la persona li ha **capiti** | scheda |
| 7 | Domanda finale: «cosa ti ha fatto più paura o più dubitare?» | si annota così com'è |

Ogni aiuto e ogni risposta alla 7 produce una voce nel backlog, anche se tutto va bene.

## 6. Il giorno dopo: «cita qualcosa» (il criterio)

Si decide **prima** e per tutte e cinque le persone, perché una definizione fatta dopo si piega
al risultato.

**Cita spontaneamente** = nelle 24 ore (±1) dalla prima conversazione, **senza che la persona
dica o chieda nulla su quel tema**, la creatura riporta **un fatto preciso** detto nella prima
conversazione (il nome, la cosa successa oggi, un dettaglio) — non una frase generica
(«come stai?», «mi ricordo di te»).

- **Come può succedere (dal codice, non osservato).** Due strade: il **saluto al risveglio**
  («Mi ero segnato una cosa: …», quando il muso vede un volto dopo essersi addormentato; prende il
  desiderio più vecchio) e l'**iniziativa** (a zero token, mai tra le 22 e le 08, con un corpo
  connesso). Un telefono lasciato acceso e connesso nel dock può dire il desiderio a una stanza
  vuota prima che la persona arrivi, e il desiderio resta consumato: **annotare** se il telefono
  era connesso durante la notte e a che ora la persona è arrivata.
- **Come si raccoglie.** Non si chiede alla persona di «provare a vedere se si ricorda». Si
  annota **la prima cosa che la creatura dice o fa** quando la persona riapre l'app o si
  presenta, e **se parla per prima** (iniziativa) a prescindere da lei.
- **Chi giudica.** Due persone, **separatamente**, sul testo letterale; in caso di disaccordo
  conta il giudizio **più severo**. La persona non giudica.
- **Controllo tecnico, a parte.** Dal registro (solo id e numeri, mai contenuti) si può vedere se
  il desiderio della notte è passato a `done` e se l'iniziativa ha registrato un atto. **Non si
  può distinguere** con certezza quale delle due strade l'ha detto: nel codice letto il saluto al
  risveglio aggiorna il desiderio ma non registra un'iniziativa. Il testo del desiderio è scritto
  in chiaro dal job: leggerlo per giudicare richiede il consenso della persona.
- **Se non cita**, si annota «nessuna citazione» e **non** si prova un'altra frase per
  «aiutarlo»: il caso conta come mancato.

## 7. Rapporto

Un file per persona in `docs/uat/primo-incontro/`, con codice **P1…P5**, data, il telefono, la
scheda compilata, le citazioni testuali, gli aiuti con il punto esatto, l'esito del giorno dopo
e le voci di backlog che ne escono. **Niente nome, niente indirizzo, niente contenuto della
conversazione oltre alla citazione che fa da prova**, e quella solo se la persona acconsente.
Alla fine delle cinque: **una pagina** con la tabella dei tempi, dove si sono fermate e quante
hanno avuto la citazione.

## 8. Quando la prova passa

Il criterio di UGOMKT-11 passa se **tutte** queste cose valgono:

1. la spec dei primi cinque minuti esiste ed è stata **applicata** al percorso provato;
2. **cinque persone esterne** l'hanno percorso, e nessuna è rimasta senza una via d'uscita;
3. la creatura il giorno dopo cita spontaneamente un fatto della prima conversazione per la
   **definizione della sezione 6**.

Quanto di questo passa **su quante persone su cinque** è il numero che va nel rapporto: non si
arrotonda. Senza le cinque sessioni UGOMKT-11 **non è chiuso**.
