# ADR-059 — La ruminazione: pensa coi modelli locali

**Stato**: accettato · **Gruppo 10** del backlog

## Contesto

«Quando è fermo e non parla e non fa nulla, lui pensa, o ha uno stato vuoto e sospeso?» — la
domanda del proprietario. La risposta onesta era: non è vuoto (volizione, monitor di solitudine,
sogno notturno, autonomia del corpo) ma **non rumina** — fra un tick e l'altro la sua testa è una
funzione matematica del tempo. E intanto l'Ollama di casa sta quasi sempre fermo: il pensiero
costoso (Claude) si usa solo parlando con te, per regola di budget, e il locale resta inutilizzato.

## Decisione

Un servizio di ruminazione che, quando UGO è idle e il modello locale è vivo, ogni tanto fa UNA
di tre cose:

1. **un accostamento**: pesca due ricordi (uno fresco, uno che pesa) e chiede al locale se c'è un
   nesso. L'esito va in `events` (tipo `rumination`, source `system`) — che `reflect` legge già
   riga per riga — e diventa memoria **solo se il sogno lo distilla**;
2. **una domanda per te**: nasce da un ricordo e si mette in fila come desiderio `pending`. La
   dirà `sayDesire` quando le pressioni lo decidono — la ruminazione non parla mai direttamente;
3. **due battute con l'altro gosino**, fuori scena: nessuno le pronuncia (per definizione qui non
   c'è nessuno a sentire), ma lo scambio resta nella giornata di **entrambi** (`peer_chat` per
   tutti e due) e rivedersi scalda come un saluto (`peer_greeted`, coi suoi tetti).

## Le regole dure

- **Mai il provider.** Solo `LocalTextClient`: il `budget_ledger` non deve nemmeno vederlo
  passare. Ruminare è gratis o non è.
- **Il vaglio del sogno.** Un modello piccolo che rumina male non deve potersi scrivere le
  fantasie in biografia: la ruminazione non tocca mai `memories` — scrive nel diario della
  giornata (`events`) e il sogno decide cosa ne resta.
- **La notte è del sogno** (8–22 di veglia), **il tempo pieno è della vita** (un messaggio negli
  ultimi 20 minuti = non rumina), e **il distanziatore conta i tentativi** (45 minuti fra un
  pensiero e l'altro, anche a vuoto — o un modello svogliato verrebbe martellato a ogni tick).
- **Nessun ciclo nuovo.** Cavalca il battito delle iniziative, con lo stesso sfalsamento: un solo
  posto da guardare quando ci si chiede «cosa gira in sottofondo».

## Conseguenze

- `UGO_RUMINATION=on|off` e `UGO_RUMINATION_GAP_MIN` in env; nessuna migrazione (usa `events`,
  `desires`, `memories` in sola lettura);
- i pensieri in `events.payload` sono testo in chiaro della stessa classe di `memories.text`
  (derivano da lì): l'eccezione dichiarata di ADR-022 copre anche questo, e i `messages` restano
  cifrati come sempre;
- il dado è iniettabile e il modello nei test è **registrato**, come per il consiglio: quel che
  si asserisce è cosa la ruminazione scrive e quando tace, mai cosa il modello si inventa.
