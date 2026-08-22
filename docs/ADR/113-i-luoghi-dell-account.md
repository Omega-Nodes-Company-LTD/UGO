# ADR-113 — I luoghi dell'account

**Stato: ACCETTATA** (2026-08-19). Gruppo 21, secondo tempo. Direttiva del proprietario del
2026-08-18, tenuta in attesa fino a **dopo** la conversione RLS — che è finita il 2026-08-19,
quindi si converte una volta sola.

## Contesto

ADR-092 ha separato il **titolare** dal luogo: «account» è chi possiede, non dove si abita. La
separazione era giusta e si è fermata a metà, perché sulla riga dell'account restavano tre
colonne — `place`, `lat`, `lon` — cioè **una geografia sola**.

Con una geografia sola, chi ha la casa in città e quella al mare ha un cielo solo, e per forza
sbagliato in una delle due. La stessa cosa vale per la bottega. Il tempo che fa non è del
titolare: è del **posto in cui si sta**.

## Decisione

Un account ha **più luoghi**, e le stanze stanno dentro un luogo.

### 1. `places`, e cosa NON ci sta dentro

Un luogo ha un nome scritto da una persona («Torino», «la bottega») e delle coordinate. Il
nome serve: due decimali non dicono a nessuno se ha scelto il posto giusto.

**Il fuso non ci sta**, ed è una scelta: resta dell'account. Un orario di silenzio o un giro
notturno appartengono a *chi vive*, non alle stanze, e una famiglia che passa agosto al mare
non vuole due notti diverse.

### 2. Le colonne vecchie si tolgono, non si affiancano

`accounts.place/lat/lon` **spariscono**. Tenerle «per compatibilità» creerebbe due verità sulla
stessa cosa, che è esattamente il difetto che ADR-092 è servita a togliere.

La migrazione **traghetta**: ogni account esistente riceve il suo primo luogo con il nome che
aveva (o «Casa», se non l'aveva mai detto) e le sue coordinate, e **tutte le sue stanze ci
finiscono dentro**. Nessuno si sveglia senza cielo.

### 3. Il dizionario e l'elenco non sono la stessa risorsa

`GET /v1/places?q=…` era la ricerca geografica *nel mondo* (per trovare le coordinate di
«Torino»). Adesso `/v1/places` è l'elenco dei luoghi **di questa casa**, e la ricerca diventa
`/v1/places/search`. Erano già due cose diverse sullo stesso indirizzo: il conflitto l'ha solo
reso visibile.

### 4. Un luogo con dentro delle stanze non si butta

Si rifiuta con un 409 che dice **quante** stanze ci sono. Le due alternative erano peggiori: la
cascata butterebbe la piantina di casa per un click, e staccare le stanze lasciandole senza
luogo le renderebbe senza cielo — un guasto silenzioso che si scopre guardando fuori dalla
finestra sbagliata.

### 5. Il meteo segue la stanza

`GET /v1/weather?stanza=cucina` prende il luogo di quella stanza. Senza stanza prende il primo
luogo dell'account, che per una famiglia con un posto solo è esattamente il comportamento di
prima.

## Conseguenze

- **i dispositivi non sono stati toccati, e va detto perché**: in questo sistema un dispositivo
  non è una riga — è un socket aperto verso un muso, e quello che si sa di lui è la stanza che
  sta mostrando. Un dispositivo appartiene quindi già a un luogo, *attraverso* la sua stanza, e
  aggiungere una tabella per dirlo un'altra volta sarebbe una terza verità;
- **l'export ha morso di nuovo** (il test di ADR-089) e `places` esce, mentre `rooms` porta ora
  anche il suo `place_id`: senza, la piantina esportata direbbe quali stanze ci sono e non dove
  stanno;
- niente traghetto dei dati **oltre** questa migrazione: le installazioni esistenti si ritrovano
  esattamente ciò che avevano, e chi vuole due luoghi ne aggiunge uno dal pannello.

## Verifica

- integrazione su Postgres vero: che il **traghetto** abbia dato a ogni account il suo primo
  luogo con dentro le stanze; che un nome ripetuto sia un 409 e non un secondo luogo omonimo;
  che un luogo abitato **non si butti** e dica quante stanze ha; e che il meteo di una stanza
  spostata al mare diventi quello del mare;
- il resto della suite, che è la prova che togliere tre colonne non ha rotto nulla di quello
  che le leggeva.

## Giro regola 12

- **BO** — `places` + `rooms.place_id` + migrazione `0056` con RLS e traghetto, le rotte, il
  meteo per stanza, la ricerca geografica spostata su `/v1/places/search`;
- **`/admin`** — la sezione «dove sta» diventa una **lista**: i luoghi con le loro coordinate e
  quante stanze hanno, l'aggiunta dalla ricerca, il bottone per buttarli. Un pannello che
  mostrasse ancora un posto solo direbbe una cosa falsa;
- **FE** — nessuna modifica: il muso chiede `/v1/weather` come sempre e riceve la stessa forma.
  Quando il chiosco saprà dire in che stanza sta, gli basterà aggiungere `?stanza=`.
