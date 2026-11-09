# ADR-126 — La voce viene dal corpo

**Stato: ACCETTATA** (direttiva del proprietario, 2026-11-09: «la voce è un'identità di un
gosino»). Estende ADR-116 (il timbro del grugnito) dalla voce che grugnisce alla voce che parla.
Si appoggia su ADR-125 (la voce passa da ElevenLabs via OpenRouter).

## Contesto

Fino a oggi la voce di UGO era **un'impostazione del processo**: `UGO_TTS_VOICE=alloy`, la stessa
per ogni gosino di ogni casa. Il carattere stava nelle `instructions` di OpenAI («un maialino
domestico italiano: caldo, giocoso…»). Due conseguenze, entrambe contro le regole del progetto:

- tutti i gosini parlavano con la stessa voce, mentre ogni gosino è un individuo (ADR-014);
- una variabile d'ambiente che cambia la voce è una manopola sul carattere, ed è vietata dalla
  regola 13 («si adotta, non si configura»).

Il proprietario ha deciso che la voce è **identità del gosino**. Restava da decidere da dove
viene.

## Decisione

1. **La voce non è un gene nuovo: viene dal corpo**, come il timbro del grugnito (ADR-116).
   `chonk` (la stazza) pesa per tre quarti, `snout` (il grugno) per il resto: **un maiale grosso
   parla più basso, un grugno lungo più scuro**. È la stessa logica fisica del verso, e costa
   zero migrazioni, zero backfill e zero manopole: i gosini già nati hanno già un corpo, quindi
   hanno già una voce.
2. **Si eredita da sola.** `chonk` e `snout` sono geni `blend`: i figli di un genitore grosso e
   di uno minuto parlano a metà strada. Nessuna rotta, nessun pannello, nessuna variabile
   d'ambiente cambia la voce di un gosino; `UGO_TTS_VOICE` ferma il boot (ADR-125 §10).
3. **Le voci sono ordinate per altezza MISURATA, non descritta.** La stessa frase italiana è stata
   sintetizzata con ogni voce ElevenLabs che OpenRouter accetta per nome, e ordinata per
   frequenza fondamentale mediana (autocorrelazione): da `river` (215 Hz) a `will` (119 Hz), 18
   voci. `aria` e `charlotte` OpenRouter le rifiuta. L'elenco vive in
   `packages/psyche/src/voice.ts` (`SPEAKING_VOICES`), funzione pura con i suoi unit test.
4. **Deterministica.** Stesso corpo, stessa voce, a ogni frase e a ogni riavvio. Se cambiasse
   non sarebbe un tratto, sarebbe un effetto (la stessa regola delle chiazze e delle setole).
5. **L'umore colora, non sostituisce.** L'etichetta della psiche (`pickLabel`) diventa un tag
   audio in testa al testo (`[excited]`, `[sad]`, `[tired]`…, `packages/memory/src/voiceTags.ts`);
   «sereno» non porta tag. Il tag non viene pronunciato (verificato ritrascrivendo l'audio).

## Alternative scartate

- **Un gene `voice` nuovo, ereditato con le sue regole.** Più flessibile, ma chiedeva di
  scrivere una versione nuova del genoma per ogni gosino già nato (o un lettore che inventa un
  valore), e avrebbe separato la voce dal corpo che la produce. ADR-116 aveva già scelto il
  corpo per il verso; due regole diverse per due suoni dello stesso animale non hanno ragione.
- **Una voce scelta alla nascita a caso.** Non si eredita, quindi non è un tratto.
- **Voci clonate o disegnate per ogni nascita** (ElevenLabs Voice Design). Più «vive», ma legano
  l'identità di un gosino all'account di un fornitore: se l'account sparisce, sparisce la voce.

## Conseguenze

- **La voce di un gosino è prevedibile dal suo corpo**, e chi alleva può vederla arrivare. Va
  detto nella vetrina quando ci sarà un'anteprima audio.
- **18 voci per tutta la specie.** Due gosini con corpi simili possono parlare con la stessa voce:
  è la stessa cosa che succede col timbro del grugnito, ed è accettata.
- **L'elenco dipende da OpenRouter.** Se una voce sparisce dal fornitore, la sintesi fallisce e
  il muso scende alla voce di casa (Piper) o di sistema: degradazione dichiarata, non silenzio.
  La prova di misura va ripetuta quando l'elenco cambia.
- **Nessun cambio di schema, nessuna rotta nuova.** La regola 13 resta intatta:
  `traitsImmutable.test.ts` non vede niente di nuovo da proteggere.
