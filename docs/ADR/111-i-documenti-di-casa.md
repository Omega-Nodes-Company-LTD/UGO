# ADR-111 — I documenti di casa

**Stato: ACCETTATA** (2026-08-19). Gruppo 7, «RAG su documenti»: *UGO conosce solo ciò che ha
sentito*.

## Contesto

Il libretto della caldaia, il contratto della luce, il referto del veterinario esistono. UGO
no: finché non glieli si legge ad alta voce, per lui non ci sono. Alla domanda «che modello è
la caldaia?» risponde solo se qualcuno gliel'ha detto a voce in una conversazione, e allora la
risposta viene da un ricordo — cioè da una frase, con tutto il rischio di una frase.

La macchina per rimediare **è già scritta e provata**: bucket privato, chiave opaca, nome del
file cifrato, estrazione (txt/md/csv nativi, pdf via `pypdf`), finestre, embedding con Ollama,
ciphertext a riposo, ricerca vettoriale. Solo che vive tutta dentro la reception, per i
**clienti** (ADR-054).

## Decisione

La stessa macchina serve la **casa**, in tabelle sue e dietro un muro suo.

### 1. Perché non si allarga `customer_chunks`

Era la strada più corta e non si prende. Là dentro lo scope è `customer_id`, e la reception ci
legge sopra: un referto del veterinario in quella tabella starebbe **a un `where` di distanza**
dall'occhio di un cliente, e quel `where` sarebbe l'unica cosa fra un dato sanitario di
famiglia e uno sconosciuto. Due tabelle (`house_documents`, `house_chunks`), due politiche RLS,
nessun percorso condiviso.

### 2. Due tabelle e non una

Il documento è la cosa che si carica e si butta; il frammento è la cosa che si cerca. Tenerli
insieme vorrebbe dire ricalcolare gli embedding per rinominare un file.

### 3. Il file non passa da soul

Il pannello chiede un URL firmato che scade in dieci minuti e carica **dritto nel bucket**;
solo dopo registra la riga. Far transitare un PDF di duecento pagine dentro l'anima vorrebbe
dire tenerlo in RAM per il gusto di rimetterlo dove sarebbe andato comunque. È il giro dei
documenti dei clienti, per la stessa ragione.

### 4. Si legge di notte

L'indicizzazione è un passo del sogno (`documenti`, per casa), non una risposta HTTP: un PDF
lungo sono centinaia di embedding, e nessuno deve restare col dito sul bottone ad aspettarli.
Il pannello dice lo stato con parole («in attesa della prossima notte», «letto», «non sono
riuscito a leggerlo») invece di un `status` inglese.

### 5. Soglia più alta dei ricordi, e la citazione

I frammenti entrano nel prompt sopra **0,5** di somiglianza, contro lo 0,35 dei ricordi: un
ricordo che entra a sproposito è una stranezza, un pezzo di contratto che entra a sproposito è
UGO che cita un documento che non c'entra — e **citare un documento suona autorevole anche
quando è sbagliato**.

Per la stessa ragione entrano **col nome del file**, e a UGO si chiede di dire da quale. Un
ricordo è una cosa che ha sentito e può ridire con parole sue; un documento è una cosa che
qualcuno ha scritto, e poterla attribuire è la differenza fra «me l'hai detto tu» e «c'è
scritto nel libretto della caldaia». È anche l'unico modo perché chi ascolta possa andare a
controllare.

Al massimo tre frammenti: un documento lungo riempirebbe il prompt da solo, e la conversazione
di casa non deve diventare una lettura del manuale.

## Conseguenze

- **L'export si è rotto, ed è la cosa giusta che è successa.** Il test di copertura di ADR-089
  è diventato rosso appena le due tabelle sono esistite: «una tabella che nessuno ha deciso è
  una tabella dimenticata». Ora escono tutt'e due — i frammenti sono la sola copia del
  contenuto che il database tiene, e lasciarli fuori avrebbe fatto dire all'export di essere
  completo un'altra volta. L'embedding no: è derivato, come ogni altro vettore.
- **Buttare un documento butta anche ciò che ne ha imparato**: prima l'oggetto nel bucket, poi
  le righe (l'ordine di ADR-093), così un'operazione morta a metà lascia una riga senza file e
  non un file che nessuno sa più di avere.
- **Senza bucket configurato il caricamento risponde 503 e lo dice**, invece di accettare un
  file che non ha dove andare.
- Il costo in token del provider è **zero**: gli embedding sono di casa (Ollama), e i frammenti
  entrano nel prompt che sarebbe partito comunque.

## Verifica

- unità: le rotte tipizzate, il 404 distinto dalla casa altrui (l'involucro `{ row }`, senza il
  quale i due casi diventerebbero lo stesso 404);
- il test di copertura dell'export, che ha morso da solo;
- integrazione (CI, Postgres + MinIO veri): un documento caricato, indicizzato e ripescato; e
  la casa vicina che non lo vede.

## Giro regola 12

- **BO** — schema + migrazione `0054` con RLS scritta a mano, `searchHouseChunks` in
  `packages/memory`, le rotte, l'iniezione nel prompt, `ops/jobs/house_docs.py` e il passo
  `documenti` del sogno;
- **`/admin`** — sezione «I documenti»: caricamento, stato in italiano, e il bottone per
  buttarli. Senza, i documenti sarebbero caricabili solo con `curl`;
- **FE** — nessuna modifica, e non serviva: i frammenti entrano nel prompt lato server, la
  risposta arriva come testo sul contratto di sempre. Nessun bundle da ricostruire.
