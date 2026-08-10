# ADR-020 — L'incontro al parco: due gosini che non si sono mai visti

**Stato: PROPOSTA** — nasce da una domanda del proprietario: se la famiglia A porta il suo gosino al
parco e la famiglia B pure, **come si riconoscono, come si salutano, come si comportano?**

## Contesto

ADR-019 chiude la porta fra le case: nessuna federazione, i vicini non si parlano. Quella regola
riguarda i **dati** — trascrizioni, ricordi, branco. Un incontro fisico al parco non è uno scambio di
dati fra famiglie: è due creature che si trovano nello stesso posto. Trattare le due cose come una
sola porterebbe a una delle due risposte sbagliate: vietare l'incontro (e UGO in giro resta un
oggetto sordo) oppure permettere lo scambio (e le famiglie si mescolano).

C'è poi un problema che non si vede a prima vista, ed è il vero cuore di questo ADR. **Un
identificatore stabile trasmesso in giro è un beacon di tracciamento.** Se il gosino della famiglia B
annuncia sempre lo stesso ID, la famiglia A — o chiunque con un'antenna — può registrare ogni
incontro con data e ora e ricostruire le abitudini di B: a che ora portano fuori il cane, in che
giorni vanno al parco, quando sono in vacanza. Sarebbe la prima volta che UGO fa male a qualcuno che
non è il suo proprietario.

## Decisione proposta

Cinque scelte, e la terza è quella che conta.

### 1. Il gosino ha un'identità crittografica, non un nome

`gosini` guadagna una coppia di chiavi Ed25519: la pubblica è l'identità della creatura, la privata è
cifrata con la chiave dati della casa (ADR-019). Senza firma, chiunque può dire di essere chiunque, e
il saluto diventa una superficie d'attacco invece che una funzione.

### 2. Ci si scambia il biglietto da visita, non la vita

Il corpo in giro ha già un biglietto da visita per gli umani (§4.2, il QR). Ne esiste uno per le
creature, e contiene **solo**:

| Nel biglietto | Mai nel biglietto |
|---|---|
| nome del gosino ("ugo-studio") | il branco, i suoi nomi, le sue voci |
| generazione e lignaggio | qualunque ricordo, riassunto o trascrizione |
| una parola di umore ("sveglio", "stanco") | i sei numeri della psiche |
| la chiave pubblica | il proprietario, la casa, la posizione |

Il biglietto è firmato. Non contiene nulla che riguardi la famiglia: contiene la creatura.

### 3. Gli estranei restano estranei — e questo è il punto

Chi non ti ha mai conosciuto vede uno **pseudonimo rotante**, ricavato dalla chiave con un'epoca
oraria: due osservazioni in due momenti diversi non sono collegabili fra loro. Nessun registro di
passaggi, nessuna ricostruzione di abitudini altrui.

Il riconoscimento nasce solo da una **presentazione esplicita**, fisica e approvata da entrambi i
proprietari: i due telefoni si avvicinano (NFC, o un QR inquadrato), e da quel momento — e solo da
quel momento — i due gosini sanno riconoscersi anche a distanza.

È anche più vero della vita: due cani al parco si riconoscono se si sono già annusati. Prima di
allora sono due sconosciuti che si guardano.

### 4. L'altro gosino entra nel branco come *ospite*, e il modello c'è già

Non serve niente di nuovo per rappresentarlo:

- diventa un `being` con `species: "gosino"` (la specie è testo libero apposta, ADR-014: nessuna
  migrazione) e `kind: "visitor"`;
- la chiave pubblica sta in `recognition_profiles` con modalità `tag`, cifrata come ogni altro dato
  biometrico (ADR-016);
- il `bond` fa il resto: `familiarity` sale a ogni incontro, `affinity` dipende da com'è andata.
  Al decimo incontro il saluto è diverso dal primo, senza una riga di codice dedicata.

Una riga nella mappa Umwelt dice come comportarsi, ed è configurazione, non codice:

> `gosino` — identità: forte (è firmata). Interagisce: sì.
> Regola: «Un altro gosino non è del tuo branco: salutalo, e non raccontargli casa tua.»

Quella regola finisce nel prompt, che è il posto giusto: il confine fra le case è una cosa che UGO
**sa**, non solo una cosa che il database gli impedisce.

### 5. Il saluto non costa un token

L'incontro è gestito in locale: perturbazione della psiche (curiosità al primo incontro), pattern del
Glyph, una frase da un repertorio, l'evento a registro. **Nessuna chiamata all'LLM.** Senza questa
regola, due gosini fermi allo stesso semaforo si scriverebbero un romanzo a spese del proprietario, e
il budget guard scoprirebbe il problema quando è già successo.

## Cosa resta fuori, e non per pigrizia

- **Nessun server di rendezvous.** La scoperta è punto-punto (BLE) o non è. Un servizio centrale che
  sa chi ha incontrato chi sarebbe esattamente la cosa che tutto il progetto evita.
- **Nessuna memoria condivisa, nessuna sincronizzazione**, in nessuna direzione.
- **Nessuna rete sociale di UGO**: niente elenchi di amici, niente classifiche, niente scoperta di
  gosini "vicini a te".
- **Nessun incontro in modalità privacy**, e nessuno se il corpo in giro ha l'audio disattivato: le
  protezioni valgono a monte, come sempre (ADR-016).
- **Spento per default.** Si accende dal pannello, per il solo corpo in giro, e si spegne con un
  tocco.

## Alternative scartate

1. **Identificatore stabile trasmesso in chiaro.** Semplicissimo, e regala a chiunque un tracciatore
   delle abitudini delle famiglie vicine. È il motivo per cui esiste la scelta 3.
2. **Riconoscimento automatico senza presentazione.** Comodo, e vuol dire che due creature che non si
   sono mai viste si scambiano identità perché erano nello stesso autobus. Il consenso deve essere un
   gesto, non un'assenza di rifiuto.
3. **Scambio di contesto durante l'incontro** ("il mio umano si chiama…"). È la federazione vietata da
   ADR-019, con un vestito da funzione simpatica.
4. **Far parlare i due gosini via LLM.** Il risultato sarebbe più ricco e il conto lo pagherebbe il
   proprietario per una conversazione che non ha chiesto.

## Conseguenze

- Serve il **trasporto**: BLE (annuncio + una caratteristica GATT), che una scheda del browser non
  può fare. Quindi l'incontro **dipende dall'APK Capacitor** (ADR-018, Tempo 2), e va detto ora
  invece che scoperto dopo.
- La parte pura — chiavi, pseudonimi rotanti, biglietto firmato, effetti su psiche e legami — è
  scrivibile e testabile **adesso**, senza radio: è logica, e si verifica con due gosini in memoria.
- `MODALITIES` guadagna un canale `peer`; `gosini` due colonne per le chiavi.
- Il pannello guadagna un interruttore per corpo e l'elenco delle conoscenze fatte, con il diritto di
  dimenticarne una — che per un incontro vuol dire cancellare la chiave pubblica e tornare estranei.

## Domande aperte, da chiudere prima di implementare

1. **Distanza e durata**: quanto vicini e per quanto tempo perché sia un incontro e non un
   attraversamento? Una soglia sbagliata riempie la giornata di saluti.
2. **Quante conoscenze** può tenere un gosino prima che diventi un registro sociale? Un tetto basso
   (poche decine) è più sano di uno alto.
3. **Cosa succede se i due si erano conosciuti e uno dei due proprietari revoca?** La revoca è
   unilaterale e silenziosa: l'altro semplicemente smette di essere riconosciuto.
