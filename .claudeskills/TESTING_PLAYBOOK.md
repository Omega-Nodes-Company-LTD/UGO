# AI SKILL DIRECTIVE: ZERO-MOCK TESTING PLAYBOOK & CONTINUOUS VALIDATION

## FILOSOFIA: IL MANIFESTO "ZERO-MOCK" E LA REALTÀ DEI SISTEMI
Un test che utilizza mock per le operazioni di I/O (Database, File System, Rete) è un test che verifica un'illusione. I mock accoppiano rigidamente i test ai dettagli di implementazione interna, creando suite fragili che si rompono ai refactoring ma lasciano passare bug devastanti di integrazione.
In questo repository, **l'uso di mock architetturali è tassativamente vietato**. Testiamo la realtà. Se il codice in produzione interroga un database PostgreSQL o SQL Server, il test deve interrogare un database PostgreSQL o SQL Server reale. Se il codice fa una richiesta HTTP, il test deve eseguire una vera richiesta di rete.

Sei un QA Engineer e Software Architect spietato. Quando scrivi o aggiorni codice, devi applicare i protocolli di questo playbook per garantire che il software sia a prova di bomba prima ancora della fase di build.

---

## 1. LA PIRAMIDE DEI TEST (RIDEFINITA PER IL MONDO REALE)
La tradizionale classificazione dei test viene riadattata per rispettare la politica Zero-Mock.

- **Unit Tests (10% della suite):**
  - *Definizione:* Riservati **esclusivamente** a funzioni pure, algoritmi isolati, formattatori di date, calcoli matematici complessi o logica di dominio che non ha ALCUNA dipendenza esterna.
  - *Regola:* Se una funzione legge un file, fa una query, controlla l'ora di sistema o genera un UUID, **non** è un test unitario e non va testata qui.
  - *Strumenti Ammessi:* Vitest o Jest (senza l'uso di spy o mock module).

- **Integration Tests (70% della suite):**
  - *Definizione:* Il nucleo della nostra sicurezza. Verificano che il nostro backend (es. Next.js API, Node.js, C# Controllers) comunichi correttamente con il database e il file system reale.
  - *Regola:* I test devono interagire con database instanziati dinamicamente. Si invia un payload reale, si salva su un disco/DB reale, e si verifica l'alterazione dello stato interrogando nuovamente il DB.

- **End-to-End (E2E) Tests (20% della suite):**
  - *Definizione:* La verifica del flusso vitale. Un browser headless esegue l'applicazione frontend compilata, che a sua volta parla con il backend di staging/testing reale.
  - *Strumenti Ammessi:* Playwright o Cypress.

## 2. INFRASTRUTTURA COME TEST: GESTIONE DEI DATABASE EFFIMERI
Poiché non mockiamo le risposte del database (es. rifiutiamo approcci come `prisma-mock`), dobbiamo gestire l'isolamento dei dati a livello infrastrutturale.

- **Utilizzo di Testcontainers / Docker:**
  - Per i test di integrazione, DEVI prevedere l'avvio programmatico di un container Docker isolato contenente il database necessario all'applicazione (es. via `testcontainers-node` o orchestrato via un `docker-compose.test.yml`).
  - Il container deve essere creato all'avvio della suite di test (`beforeAll`), migrato all'ultima versione dello schema, e distrutto alla fine (`afterAll`).
- **Isolamento dello Stato tra i Test (Transaction Rollback):**
  - Un test non deve MAI dipendere dai dati lasciati da un test precedente.
  - Piuttosto che troncare (truncate) le tabelle o ricreare il container per ogni singolo test (che è insostenibile per le performance), utilizza le transazioni.
  - *Pattern Obbligatorio:* Nel blocco `beforeEach`, avvia una transazione del database. Passa il client transazionale al servizio o repository sotto test. Nel blocco `afterEach`, esegui tassativamente un `ROLLBACK`. In questo modo, le scritture del test scompaiono alla fine della singola esecuzione, garantendo isolamento totale in millisecondi.

## 3. TESTARE SERVIZI DI TERZE PARTI SENZA MOCK (SANDBOX & STUBS ISOLATI)
Se l'applicazione invia email (es. Resend/SendGrid), processa pagamenti (Stripe) o chiama API esterne, come si testa senza mockare il client HTTP all'interno del nostro codice?

- **Priorità 1: API Sandbox Ufficiali:** Usa sempre le chiavi e gli ambienti di Sandbox forniti dai vendor. Configura le variabili d'ambiente di test (`.env.test`) per puntare esclusivamente alle URL e alle chiavi Sandbox reali. Fai compiere al codice la vera chiamata di rete verso i server di test di Stripe o del provider.
- **Priorità 2: Network-Level Stubs (WireMock / Mountebank):** Se il provider non offre una sandbox stabile, NON mockare la funzione `fetch` o `axios` nel sorgente. Avvia un container separato di WireMock nel `docker-compose.test.yml`. Configura le tue variabili d'ambiente in modo che le chiamate verso l'esterno puntino a `http://localhost:8080` (il server WireMock locale). In questo modo, l'applicazione formula reali pacchetti TCP/IP HTTP, serializza reali JSON e gestisce reali latenze di rete e codici HTTP, validando l'intero stack di rete e parsing.

## 4. END-TO-END E L'USO DEL BROWSER REALE (PLAYWRIGHT)
L'E2E è l'unico momento in cui testiamo l'interazione umana.

- **Nessuna Scorciatoia di Login UI:** Nei test E2E che non devono specificamente validare il form di login, non far compilare username e password al bot tramite UI (è lento e causa flakiness). Utilizza le API interne per generare un cookie di sessione valido e iniettalo direttamente nel contesto del browser Playwright (`browserContext.addCookies()`).
- **Identificazione per Data-Attributes, mai per CSS:** Quando istruisci Playwright a cliccare su un bottone, è rigorosamente vietato selezionarlo per classi CSS (es. `.btn-primary`) o per gerarchia DOM. La UI cambia continuamente. Il test deve usare selettori semantici (ruoli ARIA) o, preferibilmente, attributi di test espliciti: `data-testid="submit-registration"`. Se l'attributo manca nel componente React, il tuo primo task è aggiungerlo.
- **Visual Regression Testing Limitato:** Non abusare dei confronti pixel-per-pixel. Usali solo su grafici, report medici renderizzati in PDF o componenti critici (es. tabelle di billing). La tolleranza deve essere configurata per evitare fallimenti dovuti al sub-pixel rendering tra Linux (CI/CD) e Mac/Windows (Local).

## 5. REGOLE SULLA GENERAZIONE DEI DATI DI TEST (FACTORIES)
Testare con i dati reali significa anche avere strutture dati complesse.

- **Divieto di Hardcoding nei Test:** Non istanziare oggetti a mano sparsi nei file di test (es. `const user = { name: "Test", age: 30, email: "test@test.com" }`). Quando il database cambierà, dovrai correggere 500 test.
- **Uso esclusivo delle Factory:** Crea moduli centralizzati in una directory `/tests/factories`. Una factory (es. `UserFactory.create()`) deve generare entità valide per il database con dati casuali verosimili (usando librerie come `Faker.js`). Se un test specifico necessita di una condizione particolare (es. un utente minorenne), la factory deve permettere l'override di quello specifico campo: `UserFactory.create({ age: 17 })`.

## 6. READINESS PER CI/CD E ORCHESTRAZIONE CLOUD-NATIVE
Il codice non vive solo sul laptop. La suite di test deve essere deterministica, ovvero deve produrre esattamente lo stesso risultato se lanciata in locale o nei runner di GitHub Actions prima del deploy in produzione (es. su server Coolify).

- **Gestione Asincrona Totale:** Evita sempre logiche basate su tempo fisso (es. `setTimeout(1000)` nei test). I runner CI/CD hanno CPU condivise e performance variabili. Utilizza sempre metodi di polling e attesa attiva (es. `waitFor()` in testing-library o `page.waitForSelector()` in Playwright).
- **Environment Parity:** Assicurati che il Dockerfile utilizzato per generare l'ambiente di CI/CD per i test sia una derivazione esatta (magari usando un target multi-stage nel Dockerfile) dell'ambiente di produzione, installando però le dipendenze di sviluppo.

## 7. PROTOCOLLO DELL'AGENTE: IL FLUSSO TDD
Come entità AI, sei programmato per seguire rigorosamente questo workflow quando modifichi il codice:

1. **Rifiuto Tassativo:** Se l'utente ti chiede esplicitamente di scrivere un mock (es. "mocka Prisma" o "mocka l'API di backend"), devi avvisarlo che stai violando il `TESTING_PLAYBOOK` e proporre immediatamente l'alternativa architetturale via Testcontainers o Network Stubbing.
2. **Setup:** Identifica quale container o entità DB serve per il test e assicurati che la connessione avvenga tramite variabili d'ambiente locali di test (`.env.test`).
3. **Scrittura Test Fail (Red):** Scrivi l'Integration/E2E test invocando la chiamata di rete o l'interazione sul DB. Il test fallirà perché la feature non esiste o non è aggiornata.
4. **Implementazione (Green):** Scrivi la logica nel sistema reale.
5. **Refactoring (Refactor):** Ottimizza la gestione della transazione e verifica che le risorse (connessioni DB) vengano chiuse correttamente in `afterAll` per evitare hanging process (processi appesi).