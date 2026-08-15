# ADR-054 — Il gosino sa il lavoro del cliente

**Stato**: accettata · **Data**: 2026-08-15 · **Contesto**: assistente ticket clienti
**Dipende da**: [ADR-052](./052-il-cliente-non-e-famiglia.md) (chi è il cliente),
[ADR-022](./022-ricerca-ibrida-lessicale-e-vettoriale.md) (il precedente che qui si rinuncia a metà)

## Il problema

«Rispondere repo alla mano» richiede che il gosino conosca il lavoro del cliente: il codice, i
documenti, lo storico delle email. Ma ogni fonte è un rischio diverso — un PAT GitHub è un
segreto, una casella email è PII allo stato puro, e tutto quel testo deve stare cifrato a riposo
(regola 6) senza rompere il retrieval. E il gosino deve **sapere**, non **fare**: nessuna di
queste integrazioni gli dà le mani.

## La decisione

Tre fonti, tutte in **sola lettura**, tutte in un unico indice per cliente.

### Il codice: clone e indice locale, API solo per lo stato vivo

- un job (`customer_repos.py`) clona i repo assegnati — `--depth 1`, fetch incrementale, skip
  se `last_commit_sha` non è cambiato — li spezza in blocchi (~60 righe, niente binari né
  lockfile), li embedda con Ollama locale e li cifra in `customer_chunks`. Il PAT GitHub vive
  cifrato con la DEK di casa, si decifra solo in-process e non tocca mai un log;
- lo **stato vivo** — PR aperte, ultimi commit — non si indicizza: si chiede all'API GitHub al
  momento, solo `GET`, con un memo di 60 secondi, dal servizio `githubLiveService` (pattern
  Vexa: attivo solo se configurato). Niente tool calling: quello resta nel backlog (regola 8),
  e il gosino non ha verbi, solo occhi.

### Le email: si leggono, non si scrivono

`customer_mail.py` legge via IMAP (stdlib, zero dipendenze nuove) la casella indicata, solo
`UID` nuovi, toglie le citazioni, spezza, embedda, cifra. **SMTP non esiste nel sistema**: la
comunicazione col cliente avviene nella reception, e lo storico email serve solo a capire lo
stato delle cose. Credenziali IMAP cifrate con la DEK di casa, come il PAT.

### I documenti: il bucket privato

Upload dal pannello col presign già in uso per l'audio (bucket dedicato `S3_BUCKET_DOCS`), poi
`customer_docs.py` estrae il testo e lo mette nell'indice come le altre fonti.

### L'indice: vettoriale e basta, e il perché

`customer_chunks` tiene il testo **cifrato** e l'embedding accanto. La ricerca ibrida di
ADR-022 qui perde il braccio lessicale: un `tsvector` generato non si calcola su un
ciphertext, e tenerlo in chiaro violerebbe la regola 6 su contenuti di clienti — il testo più
delicato del sistema, come dice ADR-007 da sempre. È lo stesso compromesso già accettato per i
trascritti (`searchTranscripts`): solo coseno, decifratura dei top-k al momento.

Mitigazione, perché le domande sui simboli esatti soffrono: il **path del file entra nel testo
embeddato** (`ref` resta in chiaro: è un identificatore, non un contenuto). Se la qualità non
basterà, la si rimisura — con una decisione esplicita, non con una colonna in chiaro di nascosto.

`searchCustomerChunks` pretende `customer_id` e `household_id`: non esiste una firma che
permetta di dimenticare lo scope, ed è un test cross-cliente a dirlo.

### La sincronizzazione

Tutti i job girano nel container jobs, agganciati allo scheduler esistente con un intervallo
proprio (`UGO_CUSTOMER_SYNC_EVERY_H`, default 6 ore) e un trigger manuale dal pannello via il
meccanismo `UGO_JOBS_TRIGGER_URL` già in uso per il sogno. Ogni reindicizzazione incrementa
`knowledge_epoch` del cliente — il contatore che invalida la cache delle risposte (ADR-055).

## Conseguenze

- il container jobs impara `git` e un volume per i cloni; un tetto di chunk per repo (via env)
  protegge Ollama e il disco dai monorepo — che per ora sono un «non ancora» dichiarato;
- IMAP con OAuth2 obbligatorio (Gmail senza app password) è fuori da questa versione, e va
  detto al proprietario in documentazione;
- l'export di un cliente include le sue fonti e i suoi chunk decifrati; l'oblio li porta via
  col cascade (ADR-052).
