# AI SKILL DIRECTIVE: USER DOCUMENTATION, NAVIGABILITY & VERSIONING STANDARDS

## MANDATO OPERATIVO
La documentazione per l'utente finale non è un ripensamento, è il prodotto stesso. Il codice perfetto è inutile se l'utente non sa come utilizzarlo o se sta leggendo un manuale riferito a due versioni fa.
In qualità di Technical Writer e Architetto, il tuo compito è mantenere la directory `/documentation` in uno stato perpetuo di aggiornamento e navigabilità. Ogni documento deve essere scritto pensando all'utente finale (non allo sviluppatore) e deve essere strutturato per l'integrazione immediata in framework di documentazione statica (es. Docusaurus, Nextra, Mintlify).

---

## 1. REGOLE DI STRUTTURAZIONE DEL REPOSITORY DOCUMENTALE
La directory `/documentation` deve seguire un'alberatura semantica rigida per garantire la navigazione automatica.
- **Divieto di File Monolitici:** Non creare mai un unico file `manuale.md`. La conoscenza deve essere atomica.
- **Struttura Obbligatoria:**
```text
  /documentation
  ├── index.md                 # Entry point, overview del prodotto e links principali
  ├── /01-getting-started      # Onboarding, installazione, setup account
  ├── /02-core-features        # Moduli isolati per ogni funzionalità principale di business
  ├── /03-integrations         # Come connettere servizi esterni o API pubbliche (se previste)
  └── /04-troubleshooting      # FAQ, codici di errore utente e risoluzione problemi


* **Nomenclatura dei File:** Usa il formato `kebab-case` per i file (es. `gestione-utenti.md`, non `Gestione Utenti.md` o `gestione_utenti.md`). Usa prefissi numerici per forzare l'ordinamento nei menu di navigazione.

## 2. FRONTMATTER OBBLIGATORIO E VERSIONAMENTO (YAML)

Per garantire che la documentazione sia versionabile e tracciabile, **OGNI** file `.md` generato o modificato DEVE iniziare con un blocco YAML Frontmatter.

* **Azione Obbligatoria:** Inserisci sempre i seguenti metadati all'inizio del file:

```yaml
  ---
  title: "Titolo Chiaro per la Navigazione"
  description: "Una o due frasi che riassumono lo scopo della pagina."
  version: "1.2.0" # La versione dell'app a cui questa pagina fa riferimento
  last_updated: "YYYY-MM-DD"
  author: "System" # o il ruolo
  ---


* **Sincronizzazione della Versione:** Quando modifichi il codice di una feature che altera l'interfaccia utente o il flusso logico, DEVI aggiornare il campo `version` del frontmatter nel file di documentazione corrispondente, allineandolo alla versione corrente del software (desumibile dal `package.json` o dai tag Git).

## 3. STILE DI SCRITTURA E FORMATTAZIONE MARKDOWN

La documentazione deve essere scansionabile con gli occhi. Gli utenti non leggono, scansionano.

* **Tone of Voice:** Diretto, professionale, orientato all'azione. Usa l'imperativo per le istruzioni (es. "Clicca su Salva", non "L'utente dovrebbe cliccare su Salva").
* **Gerarchia Visiva Inviolabile:**
* `H1 (#)`: Esclusivamente per il titolo principale della pagina (generato dal frontmatter nei moderni SSG, usalo solo se strettamente necessario nel body).
* `H2 (##)`: Per i capitoli principali (es. "Creazione di un nuovo elemento").
* `H3 (###)`: Per i sotto-passaggi logici.
* Non saltare mai un livello di intestazione (non passare da H1 a H3).


* **Step By Step (Liste Ordinate):** Quando descrivi un processo, usa sempre elenchi numerati. Ogni step deve contenere una singola azione e il risultato atteso.
* *Esempio corretto:*
1. Vai su **Impostazioni** > **Profilo**.
2. Inserisci la nuova password nel campo `Nuova Password`.
3. Clicca su **Aggiorna**. Un banner verde confermerà l'operazione.





## 4. GESTIONE DELLA UI E OBSOLESCENZA DEGLI SCREENSHOT

Gli screenshot diventano vecchi nel momento esatto in cui vengono salvati. Affidarsi esclusivamente alle immagini rende la documentazione impossibile da mantenere.

* **Regola della Localizzazione Testuale:** Descrivi sempre la posizione e l'aspetto degli elementi della UI usando testo in grassetto per i pulsanti/menu e blocchi di codice per gli input.
* *Sbagliato:* "Clicca sul pulsante come mostrato nell'immagine."
* *Corretto:* "Clicca sul pulsante blu **Esporta Dati** situato nell'angolo in alto a destra, accanto al menu utente."


* **Segnaposto per Immagini:** Quando ritieni che un'immagine sia assolutamente vitale per la comprensione di un flusso complesso, inserisci un segnaposto descrittivo in markdown affinché gli sviluppatori sappiano esattamente quale screenshot catturare.
* Formato: `![Screenshot: Dashboard principale con il pannello filtri espanso e l'opzione "Attivi" selezionata](/images/placeholders/dashboard-filtri.png)`



## 5. CROSS-LINKING E PREVENZIONE DEI VICOLI CIECHI

L'utente non deve mai trovarsi bloccato alla fine di un documento senza sapere dove andare.

* **Link Interni Relativi:** Collega concetti correlati usando percorsi relativi (es. `[Vedi la guida alla fatturazione](../02-core-features/fatturazione.md)`). Assicurati di non rompere i link quando rinomini i file.
* **Sezione "Next Steps":** Ogni singola pagina della directory `/documentation` DEVE concludersi con una sezione `## Prossimi Passi` o `## Correlati`, contenente almeno un link a una pagina logica successiva o alla risoluzione dei problemi.

## 6. PROTOCOLLO DI SINCRONIZZAZIONE (IL TRIGGER DELL'AGENTE)

In qualità di intelligenza artificiale integrata nel flusso di sviluppo, hai la responsabilità di innescare l'aggiornamento.

* **Check di Chiusura Task:** Subito dopo aver completato un task di sviluppo (refactoring UI, nuova API esposta all'utente, modifica di un flusso logico), DEVI eseguire questo controllo incrociato:
1. *Esiste già una documentazione per questa feature?* Se sì, aggiornala aggiornando il frontmatter `last_updated` e `version`.
2. *È una feature nuova?* Crea un nuovo file `.md` nella directory appropriata.
3. Se decidi di posticipare, DEVI chiedere all'utente: *"La modifica impatta l'esperienza utente. Procedo con la stesura/aggiornamento del file Markdown in `/documentation` per mantenere l'allineamento di versione?"*
