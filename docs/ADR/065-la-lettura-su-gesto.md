# ADR-065 — La lettura su gesto: «leggi», e UGO guarda cosa c'è scritto

**Stato**: Accettata · **Data**: 2026-08-16 · **Ambito**: `apps/soul`, `apps/face`, `ops/voice`, `packages/shared`

## Contesto

La riga di backlog diceva la cosa giusta: «valore alto, superficie privacy
enorme: serve una decisione, non un'implementazione». La decisione è arrivata,
cliccata dal proprietario (2026-08-16): **sì, ma solo su gesto esplicito** —
mai in automatico, mai per iniziativa del modello.

## Decisione

1. **Il gesto è una forma chiusa**: «leggi», «leggi lo schermo», «leggimi
   questo» — la famiglia di ADR-028/055/063, risposta PRIMA del provider.
   Una frase che *contiene* «leggi» non è il gesto: «ho letto un libro» non
   accende la camera.
2. **I pixel si chiedono, come sempre**: il giro è quello dell'occhiata
   (gruppo 12) — `glimpse_ask` in variante `fine` (640px: l'OCR su 320px vede
   macchie, non lettere), il corpo risponde SOLO a camera accesa, i pixel
   vivono in memoria nel gateway e si consumano alla lettura. Qui però c'è
   una persona che aspetta: si attende lo sguardo dentro la stessa richiesta,
   con un tetto di cinque secondi — poi la verità («la camera è spenta o il
   corpo non mi risponde») batte l'attesa.
3. **La lettura è in casa**: tesseract (ita+eng, gli schermi mischiano le
   lingue) sul servizio di percezione, `/v1/ocr` col token interno. Niente
   esce, niente si scrive: resta il testo letto, cifrato in biografia come
   ogni scambio. Zero token del provider per costruzione.
4. **Gli esiti sono quattro e si dicono**: niente corpo ≠ camera spenta ≠
   illeggibile ≠ letto. Un «non ho capito» unico sarebbe una bugia comoda.
5. **Mai in reception**, per la ragione di sempre (ADR-055): gli occhi sono
   della casa.

## Conseguenze

- va ricostruita l'immagine della percezione (tesseract + pytesseract +
  pillow) e il bundle del muso (la cattura `fine`);
- la variante col modello vision locale (leggere *e capire* lo schermo)
  resta legata alla GPU della commercializzazione: tesseract legge le
  lettere, non il senso — ed è esattamente il perimetro deciso.
