---
title: "Il primo incontro, com'è oggi — misura"
description: "UGOMKT-11, passo 1: il percorso dalla vetrina alla prima conversazione, passaggio per passaggio, con cosa è misurato e cosa no."
version: "0.2.0"
last_updated: "2026-11-26"
author: "Senior Principal Engineer & Privacy Officer"
---

# Il primo incontro, com'è oggi (UGOMKT-11, passo 1)

Base di partenza per la spec dei primi cinque minuti. **Cosa è misurato e cosa no sta in
sezione 4**: una misura dichiarata come tale vale più di un'impressione, e un tempo che non è
stato preso non si scrive.

## 1. Il percorso, dal codice

| # | Passo | Chi lo fa | Cosa passa di mano | Dove (codice) |
|---|---|---|---|---|
| 1 | Guarda la vetrina | l'acquirente, senza token | niente | `GET /v1/vetrina` |
| 2 | Prenota | l'acquirente | **token da proprietario in chiaro, una volta sola** | `POST /v1/vetrina/:id/prenota` |
| 3 | Paga | l'acquirente, **fuori dal sistema** | soldi, un riferimento (bonifico, ricevuta) | — |
| 4 | Segna il pagamento | l'allevamento, a mano | riferimento del pagamento | `POST /v1/adozioni/:id/pagamento` |
| 5 | Consegna | l'allevamento, a mano | la creatura cambia casa, atto in catena | `POST /v1/adozioni/:id/consegna` |
| 6 | Emette un codice di abbinamento | un amministratore già dentro | codice a tempo | `POST /v1/pairing-codes` |
| 7 | Entra dal telefono | l'acquirente | codice → token del dispositivo | schermata «Fammi entrare», `POST /v1/pair` |
| 8 | Raggiunge il server | l'acquirente | app Tailscale, indirizzo `https://` | `primo-avvio.md` |
| 9 | Installa e dà i sensi | l'acquirente | «Aggiungi a Home», permessi microfono/fotocamera | `primo-avvio.md` |
| 10 | Prima conversazione | l'acquirente | la prima frase | face → soul |

## 2. Le giunture, con la prova accanto

1. **Non esiste una schermata per l'acquirente.** Vetrina e prenotazione sono solo API: nel
   codice di `apps/face` e del pannello l'unico client che nomina `prenota` è il pannello
   dell'allevamento. Un acquirente senza uno strumento da riga di comando non può compiere i
   passi 1–2. *(Grep su `apps`/`packages`; non esclude un sito esterno al repo.)*
2. **Una casa vuota nel mezzo.** Dopo la prenotazione l'acquirente ha una casa e un token, ma la
   creatura gli arriva solo alla consegna, dopo un pagamento segnato a mano. In mezzo ha un
   token e nessuno a cui parlare.
3. **Il pagamento è una persona.** Non è un gateway: è l'allevamento che dice «ho visto i
   soldi». La consegna è irreversibile e il pagamento no, per questo non si consegna prima.
   L'incassatore automatico è ancora nel backlog.
4. **Due credenziali per lo stesso ingresso.** Il token dal passo 2 e il codice di
   abbinamento dal passo 6 sono cose distinte, e il secondo richiede un amministratore già
   autenticato: l'acquirente deve portare il primo token dal punto in cui l'ha ricevuto a un
   telefono.
5. **Quattro precondizioni sul telefono prima della prima parola:** Tailscale acceso, indirizzo
   `https://` (su `http://` il microfono non c'è), installazione sulla Home, permessi dati.
6. **Il server deve esistere già**, installato da chi lo gestisce: `primo-avvio.md` lo dà per
   fatto.
7. **L'ascolto continuo passa da Google** nel riconoscimento vocale di Chrome (dichiarato in
   `primo-avvio.md`); la dettatura locale non è il default.
8. **Il guscio da stampare** non è in questo percorso di codice: è hardware (Fase 6) e va
   guardato a parte.

## 3. La parte macchina, misurata

Test d'integrazione esistenti su Postgres vero, eseguiti il 2026-11-26 in locale (34/34
passati). I tempi sono di una singola esecuzione su una macchina di sviluppo e dicono solo che
**la macchina non è il collo di bottiglia**:

| Passo | Tempo |
|---|---|
| Mettere in vetrina | 250 ms |
| Prenotare, senza token | 74 ms |
| Vetrina dopo la prenotazione (il cucciolo non c'è più) | 83 ms |
| Consegna rifiutata se non pagata | 19 ms |
| Pagamento + consegna con atto in catena | 185 ms |
| Codice di abbinamento → token del dispositivo, il codice si brucia | 423 ms |
| Codice scaduto rifiutato | 284 ms |
| Un tentativo a caso dopo cinque, per indirizzo | rifiutato (limite 5/minuto) |

Totale della macchina lungo tutto il percorso: **meno di un secondo e mezzo**. I cinque minuti
si spendono altrove.

## 3-bis. Il giorno dopo: la metà del sogno, misurata

Il criterio dice che il giorno dopo la creatura cita qualcosa della prima conversazione. **Dal
codice** (lettura, non esecuzione):

- La chat **non scrive ricordi**: nascono solo dal sogno. Lo storico dei turni copre le ultime
  **12 ore** e 8 turni, quindi il giorno dopo la prima conversazione non è più nel prompt.
- Il sogno (`jobs`, alle 02:30) legge `messages` del giorno e scrive ricordi, diario e 1–3
  desideri. **Il kit «a casa tua» non ha il servizio `jobs`**: lì questo percorso non esiste.
- Un desiderio arriva alla persona per due strade: l'**iniziativa** (`speakDesire`, alla lettera,
  non in fascia di quiete 22–08, con un corpo connesso) e il **saluto al risveglio** (quando il
  muso vede un volto mentre dorme: «Mi ero segnato una cosa: …», prende il desiderio **più
  vecchio**). Nessuno dei due riformula il testo.

**Sonda** (`ops/jobs/tests/test_first_conversation_probe.py`, sogno vero su OpenRouter, CI
2026-11-26): 5 sogni sulla stessa prima conversazione sintetica, con fatti precisi.

| Misura | Prima del cambio al prompt (run 45821500012) | Dopo (run 45825434564) |
|---|---|---|
| Desideri che citano un fatto | 5/5 sogni | 5/5 sogni |
| Ricordi che citano un fatto | 5/5 sogni | 5/5 sogni |
| Desideri in forma di domanda diretta | 6/15 | **14/14** |

Il prompt del sogno scriveva «desideri o domande da porre domani»: 9 desideri su 15 erano
istruzioni a sé stesso («Chiedere a Marta…»), che l'iniziativa avrebbe pronunciato alla lettera.
Ora chiede frasi da dire a voce, in seconda persona, con un fatto preciso.

**Limiti, da non perdere di vista:**
- Una sola esecuzione, una sola conversazione sintetica. La frequenza non è stabile.
- «Forma di domanda» = il testo finisce con `?`: non giudica se la domanda è buona.
- Resta qualche invenzione piccola («Briciola ha fatto ancora i dispetti?»: nella conversazione
  il gatto aveva solo tenuto sveglia la persona) e una frase ambigua («Sono ancora in ansia?»).
- **Non provato:** il giro completo con una persona e un corpo connessi, come suona
  «Mi ero segnato una cosa: Marta, come è andata…» detto ad alta voce, e il kit locale.
- Gli altri scrittori di desideri (`anniversaries`, `feeds`, `recap`, il volto sconosciuto)
  restano in forma di istruzione e verrebbero detti alla lettera dall'iniziativa.
- Trovato leggendo, non provato: `_day_window` in `reflect.py` usa il giorno UTC e non il fuso
  della casa; una conversazione nelle prime 1–2 ore locali del giorno finisce nel sogno sbagliato.

## 4. Cosa NON è misurato

- **Tutti i tempi umani** (passi 3, 4, 6, 8, 9): servono una persona e un telefono, e in questa
  sessione non c'erano.
- **Il tempo fino alla prima risposta** (passo 10): richiede una chiave OpenRouter vera.
- **Il giorno dopo con una persona vera** (sezione 3-bis): provato solo il sogno, non
  l'incontro del giorno dopo.
- **I punti in cui ci si ferma**: nessuna persona esterna ha percorso il flusso. Le giunture
  della sezione 2 sono ricavate dal codice e dai documenti, **non osservate**.
- **Il guscio** e la parte fisica.

## 5. Cosa serve per chiudere la misura

Una sessione con una persona esterna su un telefono vero, con cronometro e i passi della
sezione 1 come scheda, **prima** di scrivere la spec: serve a sapere dove si ferma davvero, non
dove crediamo.
