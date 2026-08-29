# ADR-120 — Le cose che nessuno ha ancora proposto (idee del branco, e il banco aperto)

**Stato: PROPOSTA** (2026-08-29). Biglietteria delle evolutive del binario C del piano
«fix operativi ed evolutive». Nessuna di queste è **decisa**: ciascuna richiede il suo
passaggio (proprietario → ADR → implementazione con test), e sono raccolte qui per non
perdersi. L'unica parte **esecutiva e già fatta** è C6, che sta sotto.

## Contesto

Il progetto ha set meccanismi che nessun altro companion ha (il banco di prova della memoria,
il giudice di casa, il trasferimento culturale orizzontale). Vale la pena di scrivere dove
potrebbero portare, con la loro pesatura — senza sbrodolare sul brasco.

## Decisione (elenco delle idee, con stato)

| Id | Idea | Stato | Cosa serve per farla |
|----|------|-------|----------------------|
| C1 | **Notare l'assenza**: se qualcuno non si vede da un po', UGO se lo segna e domanda | Proposta | Un canale di presenza *con chi* (oggi `face_seen` non porta un `being_id`): serve che il riconoscimento scriva la presenza legata al volto in `perception_events`, poi un passo del sogno con soglia e tetto |
| C2 | **La lettera al futuro**: ogni tanto UGO scrive il riassunto del periodo (cosa temeva, cosa lo ha reso felice) col modello di casa | Proposta | Passo del sogno (annuale o di compleanno) con la stessa strada di `reflect`: modello locale, mai provider, esito in `diary_entries` |
| C3 | **Il sogno che disegna**: al risveglio, una breve animazione del muso che racconta la notte | Proposta | Riutilizzare stati/gesture del muso esistenti; nessuna tabella nuova, solo un evento `scene` |
| C4 | **Il diplomatico di famiglia**: consigli gentili asincroni quando la psiche/prosodia leggono tensione | Proposta | Richiede la calibratura (B2) di prosodia e psiche; basso costo dopo, alto rischio di tono stonato |
| C5 | **Memoria federata fra case**: due UGO che si incontrano condividono solo temi/intensità, mai contenuti | Proposta | Richiede il trasporto di ADR-020 (BLE) — fase futura; la privacy va scritta PRIMA |
| C6 | **Il banco di prova aperto** | **Fatta (questa riunione)** | README del banco con istruzioni d'uso e contribuzione — sotto |

## Motivazione

Queste sono le idee che *nessuno ha* perché quasi nessun companion locale-first ha la materia
prima (memoria misurabile, psiche persistente, incontro fra creature). Farle bene costa poco
(quasi tutte riusano pezzi già esistiti); farle male costa reputazione — per questo lo stato è
*proposta*, non *decisa*.

## Alternative scartate

- **Configurare il carattere** (regola 13): nessuna di queste tocca `trait_sets` né aggiunge
  manopole.
- **Feature di fase 6** (hardware, gusci): fuori dal portone.
- **Integrazioni in uscita** (Todoist/Notion): già scartate dal proprietario.

## Conseguenze

- Ogni voce qui, quando sarà presa in carico, diventa un ADR a sé e una feature con test.
- C6 è già consegnato: serve solo il passaggio di priorità se ne vorrete l'uso esterno.

---

## C6 — Il banco di prova della memoria, aperto

Il repository ha già ciò che serve (`packages/memory/tests/integration/bench/`). L'apertura
consiste in un `README.md` che lo renda usabile da chiunque: comando, modelli, come si
contribuisce una famiglia di domande, la promessa di non-rumore. Fatto e incluso nel ramo
`feat/fase-9-ops-evolutive`.