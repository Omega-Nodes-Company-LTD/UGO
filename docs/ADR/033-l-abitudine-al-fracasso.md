---
title: "ADR-033 — L'abitudine al fracasso: la stanza si muove, e il decimo botto non è il primo"
status: accettato
date: 2026-08-12
supersedes: nessuno
amends: ADR-029
---

# ADR-033 — L'abitudine al fracasso

## Contesto

Seconda segnalazione dal server vero, dopo ADR-029: **il rumore lo spaventa
ancora, e lo stress arriva al massimo in due minuti.**

ADR-029 aveva ragione sull'inquadramento — un soprassalto è una sorpresa, non
una potenza — e torto sui numeri. Misurando, i due guasti sono risultati
indipendenti, e **ognuno dei due bastava da solo** a produrre esattamente il
sintomo descritto.

### Primo: il pavimento si rituffa in ogni pausa

Il pavimento inseguiva il **fotogramma istantaneo**, e scendeva quattro volte
più in fretta di quanto salisse (`FOLLOW_DOWN = 0.02` contro
`FOLLOW_UP = 0.004`). L'asimmetria era stata scelta con in mente un camion di
passaggio: *«che non resti sordo per un minuto»*.

È esattamente al contrario. Una stanza reale non è costante: **il vuoto fra due
sillabe è profondo 20-30 dB**. Con τ di discesa ≈ 0,8 s il pavimento si tuffava
dentro ogni pausa, e la sillaba successiva lo scavalcava di 25 dB.

L'aritmetica dell'equilibrio, su un parlato che alterna 65 dB e 35 dB ogni
200 ms: il pavimento si assesta a **≈ 40 dB**, ogni sillaba è un salto di
**25 dB ≥ 14**, e il gate scatta a ogni scadenza del `COOLDOWN_MS = 2000`. Il
test scritto per riprodurlo lo conferma: **60 soprassalti in due minuti di
conversazione normale**. Non un difetto di calibrazione — un difetto di
dinamica, e quindi invisibile a ogni test esistente, perché **tutti alimentavano
un livello costante**.

In più un singolo fotogramma da 43 ms poteva farlo scattare: un clic contava
come un botto.

### Secondo: lo stress non ha un tetto

Indipendentemente dal gate, `loud_noise` vale +0,20 di `stress` e i transitori
**si sommano e basta**. Cinque botti fanno +1,00: saturazione. Con il gate
guasto ci arrivava in dieci secondi, e due minuti lasciavano una pila di
sessanta transitori che lo tenevano inchiodato a 1,0 per un quarto d'ora.

Questo secondo guasto sarebbe sopravvissuto anche a un gate perfetto: un
pomeriggio davvero rumoroso — un trapano, i fuochi d'artificio — lo avrebbe
comunque inchiodato al massimo. E una variabile inchiodata **smette di
significare qualcosa**, perché ogni lettura è la stessa lettura: la psiche non
distingue più «infastidito» da «terrorizzato», e tutto ciò che legge la psiche
(espressione, volizione, consiglio) legge una costante.

## Decisione

Due correzioni, una per fronte.

### 1. Il pavimento sale in fretta e scende piano (`apps/face/src/noiseGate.ts`)

Invertita l'asimmetria, e il livello viene **lisciato prima di essere
giudicato**:

| costante | prima | ora | perché |
| --- | --- | --- | --- |
| `LEVEL_TAU_MS` | — | 120 ms | più corto di una sillaba, più lungo di un clic |
| `FLOOR_RISE_TAU_MS` | ≈ 4,2 s | 2,0 s | il rumore prolungato viene assorbito nella stanza |
| `FLOOR_FALL_TAU_MS` | ≈ 0,8 s | 60 s | le pause non riarmano più il grilletto |
| `JUMP_DB` | 14 | 12 | il pavimento insegue mentre il botto sale e ne mangia ~1/5 |
| `COOLDOWN_MS` | 2 s | 15 s | due botti più vicini di così sono un botto |
| `WARMUP_MS` | 120 campioni | 3 s | *(vedi sotto)* |
| riarmo | — | il livello deve ritornare entro `JUMP_DB/2` dal pavimento | un rumore continuo non lo spaventa due volte |

Dopo un episodio rumoroso resta difficile da spaventare per circa un minuto.
**Non è un difetto, è abitudine** — lo stesso motivo per cui una persona smette
di sentire la tangenziale.

Tutte le costanti sono in millisecondi e applicate al **tempo trascorso vero**,
non per campione. Il chiamante è un ciclo `requestAnimationFrame`: 60 Hz su un
telefono, 120 Hz su un altro, e rallentato in una scheda in secondo piano. Con
coefficienti per campione **il temperamento della creatura era funzione della
frequenza di aggiornamento dello schermo**.

### 2. L'abitudine, nella psiche (`packages/psyche`)

Una perturbazione può dichiarare un `ceiling`: il massimo che **quel tipo di
evento** può tenere su quella variabile in un dato momento. Ogni ripetizione
entra in proporzione allo spazio rimasto sotto il tetto — rendimenti
decrescenti, non un muro:

```
loud_noise: { variable: "stress", amount: 0.2, tauHours: 0.25, ceiling: 0.45 }
shake:      { variable: "stress", amount: 0.1,                 ceiling: 0.3  }
```

Misurato, con botti ogni 15 s:

| botto | 1 | 2 | 3 | 4 | 5 | 8 | 20 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `stress` | 0,50 | 0,61 | 0,67 | 0,70 | 0,72 | 0,74 | **0,74** |

Il primo botto arriva a piena forza. Il ventesimo non aggiunge niente. Un quarto
d'ora dopo l'ultimo è a 0,46 e sta tornando alla linea di base. **Spaventato sì,
distrutto no** — e la variabile continua a significare qualcosa.

Il tetto vale per tipo di evento: perché l'abitudine riconosca i propri simili,
il transitorio porta ora la sua `cause`. Il decimo botto è banale accanto ai
nove che l'hanno preceduto, non accanto a un pomeriggio afoso.

`ceiling` assente significa nessuna abitudine, ed è il default giusto: **essere
chiamato cento volte deve sommarsi.** Il meccanismo resta disponibile a qualsiasi
perturbazione che ne mostri il bisogno.

## Conseguenze

- Una conversazione, la televisione, le posate, una tastiera non lo spaventano
  più: da 60 soprassalti in due minuti a **≤ 1** (il primo, legittimo).
- Un botto vero sopra quella conversazione lo fa ancora sussultare — è la
  seconda asserzione, e senza di essa avrei solo reso sordo un animale.
- Un soprassalto richiede ora ~100 ms di suono invece di un fotogramma: i clic
  non contano più.
- Per un minuto dopo un camion è meno sensibile. Accettato, e voluto.
- `stress` da rumore è limitato a baseline + 0,45. Sommato ad altre cause
  (`heat_stress`, `shake`) può ancora arrivare a 1,0 — giustamente: il tetto è
  per causa, non sulla variabile.
- **Approssimazione nota:** attraverso un riavvio i transitori collassano in uno
  solo per variabile (`stateFromSnapshot`), che non porta `cause`. L'abitudine
  al fracasso quindi si azzera a ogni riavvio. Coerente con l'approssimazione
  già documentata nel modello, e irrilevante alla scala dei 15 minuti di τ.
- La lista dei transitori resta limitata: sotto 0,005 di ampiezza efficace non
  se ne scrive più uno, e la potatura a 6τ fa il resto.

## Alternative scartate

- **Solo alzare `JUMP_DB`.** Non tocca la causa: con il pavimento che si tuffa
  nelle pause, il salto misurato era di 25 dB — sarebbe scattato lo stesso, e
  intanto lui sarebbe diventato sordo ai botti veri.
- **Solo allungare il `COOLDOWN_MS`.** Rende il sintomo più lento, non lo
  toglie: con 60 s di attesa ci mette venti minuti invece di due ad arrivare al
  massimo. E lo stress sarebbe comunque saturato.
- **Congelare il pavimento mentre un botto si sviluppa.** Risolve il morso del
  pavimento sul salto, ma un rumore prolungato non entrerebbe mai nella stanza e
  lo spaventerebbe per sempre. Preferito abbassare `JUMP_DB` di 2 dB.
- **Un tetto su `stress` in sé.** Impedirebbe alla creatura di essere davvero
  in crisi quando *molte cose diverse* vanno storte insieme. Il tetto per causa
  limita la ripetizione, non l'intensità della vita.
