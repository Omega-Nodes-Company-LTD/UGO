# ADR-093 — L'oblio di un cliente: la rotta che ADR-052 prometteva

**Stato: ACCETTATA** (2026-08-18). Fase A2 del piano: chiude l'ultima riga «alta» del debito
privacy dopo ADR-089/090/091.

## Contesto

ADR-052 diceva *«l'oblio è il cascade da `customers`»*, e il cascade c'era davvero: dieci
tabelle con `onDelete("cascade")` — repos, documenti, caselle, chunks, cache delle risposte,
token, ticket, messaggi, ricompense, assegnazioni. Ma la frase aveva **due buchi**, scoperti
scrivendo il runbook (STATE §6-novemtricies):

1. **non esisteva la rotta.** Nessuna `DELETE /v1/customers/:id`, il pannello si fermava
   all'archiviazione: una richiesta GDPR art. 17 si evadeva **a mano su psql**;
2. **il cascade non tocca il bucket.** I PDF del cliente restavano nell'object storage —
   orfani e integri, senza più nessuna riga che ne ricordasse la chiave. Per una cancellazione
   è il fallimento peggiore: non lo vede nessuno.

## Decisione

### 1. `DELETE /v1/customers/:id`, col nome scritto

Stesso patto del congedo (ADR-075) e del «dimentica qualcuno» sul muso (ADR-090): la conferma
è **il nome del cliente scritto per intero** — tollerante su spazi e maiuscole, intollerante su
tutto il resto. Un click solo non è un consenso a una cosa irreversibile, e questa cancella
anche fuori dal database.

### 2. Prima il bucket, poi il database — e l'ordine è il punto

Le chiavi dei documenti si leggono **prima** di cancellare (dopo, nessuno le ricorda più); gli
oggetti si tolgono dal bucket; poi il `DELETE` con le sue FK porta via tutto il resto.

Se il bucket fallisce ci si ferma con le righe intatte, e si riprova. Se il database fallisse
dopo il bucket, le righe restano e il forget si riesegue — cancellare un oggetto già sparito è
un no-op. **L'intera operazione è riprovabile da qualunque punto muoia.** L'ordine inverso
avrebbe potuto lasciare oggetti orfani senza memoria della chiave.

### 3. Un oblio a metà si rifiuta

Documenti nel database e bucket non configurato: **409 con la ragione scritta**, non una
cancellazione parziale. Un oblio che si dichiara riuscito lasciando i PDF nello storage è
peggio di un rifiuto: il rifiuto almeno lo vedi.

### 4. La riga di audit è metà del senso

Verbo `customer_forgotten`, con l'id e mai il nome (regola 6). Senza, «abbiamo cancellato X il
giorno Y» — che è ciò che un titolare deve saper dire — non si può più affermare.

### Niente redazione, ed è una differenza vera con `forgetBeing`

Un cliente non è un `being`: i suoi testi vivono nelle **sue** tabelle, non sparsi nella
biografia di UGO, quindi la cancellazione è il DELETE col cascade più il bucket. La redazione
dei nomi dentro la biografia resta il mestiere dell'oblio delle persone del branco.

## Conseguenze

- **Positive**: la richiesta GDPR si evade dal pannello in dieci secondi, con audit; la
  promessa di ADR-052 è vera anche fuori dal database.
- **Da sapere**: «archivia» e «dimentica» convivono nel pannello e il testo spiega la
  differenza — archiviare conserva, dimenticare cancella e non torna indietro.
- **Limite dichiarato**: la cancellazione degli oggetti è sequenziale, un `DeleteObject` per
  documento. Con centinaia di documenti sarà lenta; si paginerà quando esisterà un cliente
  così, non prima.

## Verifica

4 test d'integrazione su **Postgres e MinIO veri**: il nome sbagliato non cancella niente (e
quello giusto con spazi e maiuscole diverse sì); dopo, **niente righe e niente oggetto nel
bucket** — verificato che morde: tolta la `DeleteObject`, il test è rosso; la riga di audit
c'è con l'id e mai il nome; il vicino riceve 404 e non scopre che il cliente esiste.

**Il giro (regola 12)**: BO — servizio (`forgetCustomer`), rotta, verbo d'audit, bucket passato
alla rotta. `/admin` — il campo di conferma e il bottone «Dimentica il cliente» accanto ad
«Archivia», col testo che spiega la differenza. FE — nessuna modifica e non serviva: i clienti
si amministrano dal pannello, il muso non li vede.
