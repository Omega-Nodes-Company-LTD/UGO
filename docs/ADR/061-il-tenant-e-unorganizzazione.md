# ADR-061 — Il tenant è un'organizzazione: casa O azienda, un possessore solo

**Stato**: Accettata · **Data**: 2026-08-16 · **Ambito**: `packages/db`, `apps/soul`, pannello, provisioning

## Contesto

Vincolo nuovo dal proprietario (2026-08-16): il tenant non è più «una
famiglia». Un possessore di maiali può averne uno **a casa come PET** — ricordi,
affetto, il branco — e altri **in azienda a seguire clienti** — reception,
ticket, fonti di conoscenza. Due nature diverse, un possessore solo.

La domanda che questo ADR risolve, nelle parole del proprietario: `households`
diventa `organizations` con un `kind`? Cosa condividono i due tenant dello
stesso possessore, e cosa MAI?

## Decisione

### 1. Il nome nel database resta `households`; la natura diventa una colonna

La tabella, la colonna `household_id` su venticinque tabelle, le politiche RLS
e ventiquattro migrazioni portano quel nome. Rinominarli è un diff enorme che
non cambia un solo comportamento: il rischio massimo per il guadagno minimo.
Il nome tecnico diventa un **termine di dominio interno** («tenant», storicamente
`household`), e la lingua cambia dove la vedono le persone: pannello e
documentazione dicono **organizzazione — casa o azienda**.

`households.kind` — `text` + `check` (`'home' | 'business'`), default `'home'`.
Text e non enum Postgres: la trappola di drizzle-kit che non genera
`CREATE TYPE` è già stata pagata due volte (STATE §7).

### 2. `kind` oggi descrive, non vieta

Una casa può convocare la reception (già oggi: basta il segreto), un'azienda
può avere un branco. Il `kind` compare nel pannello e nel provisioning, e i
comportamenti futuri che davvero divergono (es. una casa `home` senza clienti
non mostra la sezione «I clienti») si agganceranno lì. Inventare divieti che
nessuno ha chiesto è scope creep: la colonna è il posto dove il futuro gating
vive, non un regolamento retroattivo.

### 3. Due tenant dello stesso possessore non condividono NIENTE nel database

Né ricordi, né clienti, né budget, né biometria, né DEK (ogni tenant ha già la
sua `wrapped_data_key`), né esseri. Il possessore esiste due volte: un `being`
nel tenant di casa e un `being` in quello aziendale. L'UGO di casa e quello
d'azienda lo conoscono separatamente.

Il motivo è ADR-014: **non esiste una tabella `users`, per scelta**. Introdurre
un'identità-persona trasversale ai tenant per «condividere il possessore»
aprirebbe un buco esattamente dove RLS costruisce il muro — un join legittimo
fra tenant è il precedente che rende pensabili tutti gli altri.

Il prezzo, dichiarato: il possessore arruola voce e volto due volte, e si
presenta due volte. È il prezzo giusto: sono due mondi che LUI vuole separati
(i ricordi di casa non devono affiorare davanti a un cliente).

### 4. L'unica identità trasversale resta l'`operator`

Un token è del tenant (com'è oggi). Chi amministra l'installazione — ruolo
`operator`, `household_id null` — vede tutte le organizzazioni nel selettore:
è un concetto da amministratore di macchina, non da persona. Nessun cambio.

## Conseguenze

- migrazione additiva (`kind` + check), pannello e provisioning mostrano e
  chiedono la natura;
- l'ADR di RLS tempo 2 (ADR-062) può procedere senza aspettare questa
  semantica: il muro fra tenant è identico qualunque sia il `kind`;
- il giorno in cui servisse davvero un'anagrafica trasversale (n possessori,
  n organizzazioni), si scrive un ADR nuovo con un motore di consenso — non
  si scava un tunnel sotto questo muro.
