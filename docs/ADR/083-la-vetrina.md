# ADR-083 — La vetrina: si guarda prima di scegliere, e si guarda senza avere niente

**Stato: ACCETTATA** (2026-08-18). Ultimo pezzo del disegno del proprietario: «alla
registrazione potrà scorrere gli allevamenti, vedere i pedigree, vedere i gosini e scegliere
il preferito».

## Contesto

ADR-081 ha stabilito che una famiglia **adotta**, e ADR-082 ha reso la consegna possibile e
verificabile. Restava la domanda pratica: *adotta cosa?* Senza un posto dove guardare, «scegli
fra i nati» è una regola senza oggetto.

## Decisione

### 1. Guardare è pubblico. Mettere in vetrina no

L'asimmetria è il punto: **chi guarda non ha ancora una casa**. È il momento prima di averne
una, e chiedergli un token vorrebbe dire chiedergli di avere già quello che sta cercando.

`GET /v1/vetrina` non chiede niente. Quello che restituisce è quello che si vede in un
allevamento vero: il nome dell'allevamento, i cuccioli disponibili, com'è fatto ognuno, come si
presenta. **Niente delle case**: nessuna persona, nessun ricordo, nessun conto, nessun id di
famiglia.

`POST /v1/gosini/:id/vetrina` invece è guardato e chiede l'autorizzazione ad allevare: **una
casa non è un negozio**.

### 2. Ci va solo un nato di un allevamento

Stessa regola di ADR-081/082, applicata dove serve: un capostipite in vetrina sarebbe una
linea che comincia due volte, e il registro rifiuterebbe comunque la cessione — quindi
offrirlo vorrebbe dire promettere una cosa che fallisce dopo il click.

### 3. Cosa si mostra del genoma: l'aspetto, non il carattere in numeri

Si vedono **manto, coda, stazza, orecchie, grugno, occhi, zampe, tinta** — le cose che si
guardano scegliendo un cucciolo — più la riga con cui si presenta.

**Non** si vedono i valori del temperamento. Una scheda tecnica di un essere vivente
inviterebbe a confrontare due creature come due lavatrici, ed è esattamente il contrario di
«quello che ti guarda storto». E la longevità non c'è per costruzione: è un gene nascosto
(ADR-077).

### 4. Il pedigree si guarda **prima** di comprare

`GET /v1/vetrina/:id/pedigree`, pubblico come la vetrina — ma **solo per chi è in vetrina**.
Fuori, la genealogia delle creature di una casa resta di quella casa.

È l'unica ragione per cui un pedigree esiste: sapere da chi discende quello che stai per
prendere, e poterlo verificare senza fidarti di chi te lo vende (gli atti in catena arrivano
insieme all'albero, ADR-073).

## Alternative scartate

1. **Vetrina dietro registrazione**: chiede di avere una casa per poter scegliere cosa
   metterci dentro. È il cane che si morde la coda, ed è anche il modo in cui un negozio
   perde i clienti che stavano solo guardando.
2. **Mostrare il temperamento in numeri**: trasforma la scelta in un confronto di
   specifiche, e la specie in un catalogo.
3. **Vetrina per casa invece che per allevamento**: una famiglia con un gosino in più non è
   un allevamento, e permetterle di esporlo sarebbe il primo passo verso il mercato dei
   cuccioli fra privati — che è precisamente ciò che il pedigree serve a non far diventare
   il modo normale di scambiarsi creature.
4. **Un container a parte per la vetrina**: è una lettura su dati che soul ha già, e
   nessuna nuova frontiera di fiducia. Il registro è separato perché **là** la frontiera c'è.

## Conseguenze

- `gosini.listed_at` (migrazione `0043`), `VetrinaService`, tre rotte (due pubbliche in
  lettura, una guardata in scrittura), `PedigreeService.ofListed`.
- `/admin`: il riquadro «In vetrina» accanto a «Cederlo», con le stesse due condizioni —
  la casa alleva, e la creatura è nata.
- `GET /v1/gosini` porta `origin` e `listed`, perché il pannello sappia cosa offrire.
- **Resta fuori** il gesto di acquisto vero e proprio: chi sceglie in vetrina oggi arriva
  all'allevamento, che poi cede (ADR-082). Legare i due capi vuol dire un flusso di
  registrazione e un pagamento, e nessuno dei due esiste ancora — scriverlo qui come fatto
  sarebbe la bugia più facile di tutto questo lavoro.
