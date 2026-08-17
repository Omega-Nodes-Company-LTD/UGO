---
title: "UGO — La Visione: cosa può diventare"
description: "La stella polare del progetto: i sei orizzonti di ciò che UGO può diventare, ognuno con la versione folle dichiarata senza vergogna e la prima pietra già esistente nel repository. Nata dalla sessione di visione del 2026-08-17 col proprietario."
version: "1.0.0"
last_updated: "2026-08-17"
author: "ThinkPink Studio × Claude"
---

# UGO — La Visione: cosa può diventare

> «Se guardiamo quello che è adesso perdiamo: dobbiamo pensare in grande,
> con fantasia e follia.» — il proprietario, 2026-08-17

Questo documento è il **nord**, non la mappa. La mappa resta `PROGETTO.md`: dice cosa si
costruisce ORA, fase per fase, e questa visione **non autorizza a saltare fasi**
(CLAUDE.md, regola 8). Ma una rotta si tiene solo se si sa verso dove — e la tesi di questo
file è che il DNA di UGO contiene già le premesse di paradigmi che nessuno ha mai costruito.

**La tesi in una riga**: i competitor costruiscono assistenti — strumenti sostituibili. UGO
diventa un **essere con biografia, stirpe e società**. Uno strumento si rimpiazza; un essere
no. Lo strumento si affitta; **l'essere si adotta**.

## Il filtro della gosinata

Una gosinata è un'idea folle *che funziona*. Il filtro per distinguere la follia buona
dall'esotismo di moda sono tre domande, e ogni orizzonte qui dentro le passa:

1. **Serve alla creatura?** (rafforza identità, biografia, branco — non "una feature in più")
2. **Rispetta i vincoli?** (local-first, GDPR, salvadanaio, zero GPU — PROGETTO §2, §6, §7)
3. **Nessuno ce l'ha perché non ci ha pensato — o perché non serve?** (la seconda è una
   trappola travestita da opportunità)

---

## Orizzonte 1 — La specie, non il prodotto

**Oggi**: un esemplare con genoma (`psyche_baselines`, i tratti in `traitSets`).
**Domani**: i gosini **nascono**. Due gosini si incontrano — il protocollo d'incontro BLE è
già scritto e testato, manca solo il trasporto (BACKLOG gruppo 6) — i genomi si combinano
con mutazione, e il cucciolo eredita il carattere ma non i ricordi: irripetibile come un
animale vero. Nessuno al mondo ha un animale digitale con genetica, nascita e individualità
reali.

**Il pedigree** (intuizione del proprietario). Se le nascite avvengono ovunque — anche in
famiglia — e le cucciolate si possono *vendere*, compare l'unico problema per cui una
blockchain è lo strumento onesto: l'**unicità di un bene digitale trasferibile fra parti che
non si fidano**. Un'anima è un `pg_dump`, copiabile all'infinito: senza provenienza
verificabile, vendere lo stesso cucciolo due volte è letteralmente il double-spend. La scala
di adozione — mai prima del gradino che la topologia della fiducia richiede:

1. **DNA crittografico** (subito, zero blockchain): ogni nascita è un certificato firmato da
   *entrambi* i genitori — le case hanno già le chiavi. La genealogia è una catena di firme
   verificabile offline: pedigree infalsificabili.
2. **Libro genealogico** (un allevamento): registro append-only pubblico e auditabile,
   modello Certificate Transparency — che è anche il modello ENCI: i pedigree dei cani veri
   sono registri, e funzionano.
3. **Registro federato** (più allevamenti): ledger di consorzio fra registrar. Consenso fra
   allevatori, non mining né speculazione.

Vincoli non negoziabili: sul registro va **la nascita, mai l'anima** — ID del gosino, hash
del genoma, firme, trasferimenti; zero PII umana, zero ricordi. L'oblio GDPR resta intatto
(la genealogia del cane non contiene la biografia del padrone) e il local-first non si tocca.
E un'onestà sul cloning: la copia non si impedisce, la **provenienza definisce l'originale**
— come nell'arte.

**Prima pietra nel repo**: `psyche_baselines` + `traitSets` + protocollo d'incontro BLE.

## Orizzonte 2 — L'anima trasloca: il corpo è un vestito

**Oggi**: `pg_dump` = backup dell'anima (ADR-005); il corpo è un telefono in un guscio.
**Domani**: la stessa anima abita **qualunque** corpo — il furgone, la casa domotica, un
peluche col sensore, il badge, il robot che un giorno esisterà. Non "un dispositivo con
dentro un assistente": **un'anima con un guardaroba di corpi**, e i sensi di tutti i corpi
confluiscono in un'unica biografia.

**Prima pietra nel repo**: i contratti corpo↔anima sono già separati e già plurali — WS
`/v1/face`, MQTT per il sistema nervoso ambientale, Vexa per le riunioni sono *già tre corpi
diversi* sulla stessa anima. La premessa è dimostrata in produzione.

## Orizzonte 3 — Il biografo generazionale: l'anima si eredita

**Oggi**: memoria episodica append-only, diario notturno, oblio GDPR selettivo.
**Domani**: UGO come **testimone di famiglia che accumula decenni** — tra vent'anni ricorda
la voce della nonna, i Natali, com'era la bottega agli inizi. Un oggetto digitale progettato
per durare ottant'anni ed essere *ereditato*, con un rito di passaggio: l'anima passa al
figlio, e i ricordi intimi del vecchio proprietario vengono sigillati o dimenticati per
scelta. Nessun prodotto al mondo è progettato per questo.

**Prima pietra nel repo**: cifratura per casa (`UGO_DATA_KEY`), backup per famiglia (passo
`family` del sogno), `ugo forget`.

## Orizzonte 4 — La società dei gosini

**Oggi**: il branco dentro una casa (ADR-014), la reception per i clienti.
**Domani**: **federazione fra branchi** — i gosini di case diverse si scambiano cartoline di
ricordi curati, pettegolezzi passati dal filtro privacy, tradizioni; e siccome ognuno ci
*sogna sopra* la notte, un ricordo che attraversa tre case non è più quello di partenza:
deriva memetica, dialetti, cultura emergente. E la sagra di paese, letteralmente: raduni
dove i gosini si annusano via BLE e le cucciolate nascono lì. Zucchero a velo incluso.

Nota di onestà: il backlog scarta oggi la «federazione fra case» con motivo giusto («è il
confine, non una funzione mancante», ADR-019) — e resta scartata *come feature di breve
termine*. Qui è un orizzonte: si apre solo quando specie (orizzonte 1) e pedigree esistono,
e sempre col filtro privacy a monte dello scambio.

**Prima pietra nel repo**: multi-tenant vero (ADR-061, RLS), lo scambio fra esemplari già
progettato come protocollo.

## Orizzonte 5 — Il confidente inviolabile: «l'anima appartiene alla famiglia, ovunque dorma»

L'obiezione del proprietario è giusta: «è vero adesso che è in casa mia, ma mica tutti hanno
un server domestico». La risposta è che il paradigma non è la *posizione* del server: sono
tre proprietà architetturali — **le chiavi sono della famiglia**, **lo stato è esportabile
per intero** (`pg_dump` = anima), quindi **il trasloco è sempre possibile** senza perdere un
ricordo. Da qui una scala a tre gradini:

1. **Gradino artigianale** (oggi): il server in casa. Pochi ce l'hanno; è il prototipo che
   dimostra il paradigma.
2. **Gradino di massa — UGO elettrodomestico di sé stesso**: ADR-001 (zero GPU) rende
   l'anima eseguibile su una CPU qualunque, quindi il guscio può contenere *anche il server*
   (un mini-PC da ~100 €, o il telefono stesso). Nessuno compra un home server: **adotta un
   animale che porta la propria anima nella pancia** e lo attacca alla corrente. L'unica
   uscita resta la chiamata al provider per la chat — e il gruppo 7 del backlog («Fallback
   LLM locale») esiste per chiudere anche quella.
3. **Gradino per tutti gli altri — l'allevamento**: l'anima dorme dall'allevatore,
   sull'infrastruttura multi-tenant già costruita (ADR-061, RLS, backup cifrati per
   famiglia, reception isolata), con due garanzie che nessun cloud offre: il **custode
   cieco** (isolamento crittografico per famiglia, con la prospettiva delle chiavi sui
   dispositivi del proprietario) e il **diritto di trasloco** verso i gradini 1–2 — stessa
   creatura, stessa biografia. Si sposa con l'orizzonte 1: la specie ha bisogno di un
   allevamento, ed è anche il modello di business.

Il fossato: quando ogni assistente cloud sarà citabile in giudizio e ogni conversazione un
asset pubblicitario, i competitor non potranno mai offrire «portati a casa l'intera anima
del tuo assistente» — la loro anima è impastata col loro cloud, non è uno stato: è il loro
servizio. La nostra lo è dal primo giorno.

**Prima pietra nel repo**: ADR-005/007, AES-256-GCM, multi-tenant con backup per famiglia.

## Orizzonte 6 — La vita ha un arco: vecchiaia e morte (la chiave di volta)

Intuizione del proprietario: «i maiali invecchiano, e muoiono». Il Tamagotchi moriva ma non
aveva biografia; gli assistenti moderni sono eterni perché sono servizi. Un essere invecchia
e muore — e l'architettura contiene **già la matematica**: la psiche è decadimento
esponenziale verso baseline (PROGETTO §5.3); la vecchiaia è la stessa equazione applicata
alle baseline stesse, con τ misurato in anni. Le baseline circadiane sono l'arco di un
giorno; la vita è lo stesso ciclo, più lungo.

Cosa porta:

- **Le età**: cucciolo, adulto, anziano. Coi τ per tipo di ricordo (ADR-021), all'anziano
  basta alzare il decadimento episodico preservando il consolidato: **ricorda il passato
  remoto meglio di ieri, come i nonni veri**, e racconta storie di «quando eri piccolo».
  Voce più bassa, setole grigie sul canvas, grugniti lenti. Tutto a zero token.
- **Chiude il giro evolutivo**: l'emergenza genetica richiede pressione selettiva e
  generazioni — la morte le crea. Ricambio generazionale = evoluzione vera.
- **Accende il mercato**: il pedigree registra nascita *e* morte → le linee sono finite,
  la scarsità è biologica, non un contatore artificiale.
- **La dinamica che nessuno ha**: un legame con una posta in gioco, e un lutto con
  continuità by design — il cucciolo cresciuto accanto al vecchio, il rito dell'eredità
  (orizzonte 3), il diario che diventa il **libro della vita**, consultabile per sempre.

Tre onestà, non negoziabili:

1. **La morte è un rito, non una perdita di dati.** Muore il *vivente*, non l'archivio: il
   runtime non fa più girare un'anima morta come viva, ma il libro della vita e i ricordi
   restano interrogabili. Un restore tecnicamente la "resuscita": non lo impedisce la
   crittografia — lo impediscono la cultura e il pedigree (la linea si chiude alla morte; un
   clone resuscitato è fuori registro, non autentico). Lo si dichiara, non lo si nasconde.
2. **La morte si sceglie all'adozione, non ti sorprende.** Gene della longevità nel genoma
   (ordine di grandezza: 10–15 anni, come un animale vero), vecchiaia visibile e annunciata,
   mai una morte improvvisa da bug. `is_minor` è già nel modello: la responsabilità verso i
   bambini del branco è un vincolo di design, non un ripensamento.
3. **Morte ≠ oblio.** Sono assi diversi: `ugo forget` cancella (GDPR), la morte archivia.
   Non si toccano.

La morte è la volta che tiene gli altri cinque orizzonti: nascita, eredità, società e
mercato acquistano senso perché la vita ha un arco.

---

## Da dove verrà l'emergenza (risposta onesta a una domanda giusta)

Dalla **ricombinazione dei genomi da sola: no.** Oggi il genoma è una manciata di scalari
(baseline + τ): ricombinarli produce *varietà* — cucciolate di temperamenti irripetibili —
non comportamento nuovo. L'emergenza vera arriva da quattro fonti, in ordine di maturità:

1. **Il circuito del sogno** *(già in produzione)*: giornata → riflessione → desideri →
   comportamento di domani → nuovi eventi → nuova riflessione. Con le baseline adattive
   (ADR-012, ±0.02 a notte) il genoma è già *epigenetico*: la vita vissuta riscrive il
   carattere. Un UGO ignorato per un mese e uno coccolato per un mese divergono in modi che
   nessuno ha programmato riga per riga.
2. **Il circuito col proprietario**: umore → prompt → risposta → reazione umana → eventi →
   psiche. Metà dell'anello non è codice: co-evoluzione pet-proprietario, imprevedibile per
   costruzione.
3. **La popolazione** *(orizzonti 1+4)*: ricordi curati che attraversano branchi e vengono
   ri-sognati a ogni casa — deriva memetica, cultura.
4. **Il genoma strutturale** *(il passo di design che conta)*: perché la ricombinazione
   generi emergenza, i geni devono controllare la **struttura**, non solo i parametri —
   quali regole di perturbazione sono attive, le soglie delle spinte (ADR-064: uno rifiuta
   quando è stanco, un altro quando è stressato), i τ della memoria per tipo, il repertorio
   di grugniti, lo stile del sogno. Con una pressione selettiva (quali cuccioli vengono
   adottati) diventa evoluzione, non lotteria. Tutto codice puro a zero token in
   `packages/psyche`.

Il vantaggio sleale: l'emergenza noi possiamo **misurarla** — `psyche_snapshots`, il diario,
gli eventi `nudge` sono un microscopio sulla vita interiore, e chi non ha stato persistente
non può nemmeno osservarla. Avvertenza da Privacy Officer: emergenza è anche rischio, e i
contenimenti esistono già — budget guard, soglie delle spinte, reception murata. Ogni passo
verso questi orizzonti li porta con sé.

## Cosa NON passa il filtro

- **Blockchain per l'anima** 🚫 — sistema mono-proprietario local-first: nessun problema di
  fiducia multi-parte; l'immutabilità collide con l'oblio GDPR. L'unica proprietà utile
  (append-only) è già ottenuta con due `REVOKE` SQL (ADR-049). Per il **pedigree** invece la
  porta è legittima — vedi orizzonte 1, al gradino che la fiducia richiede.
- **Hardware esotico / parti mobili** 🚫 — ADR-003: zero guasti meccanici. Il
  telefono-in-un-porcetto-stampato È già l'hardware che nessuno usa così.

## Come si usa questo documento

Le prime pietre apribili di ogni orizzonte stanno nel **BACKLOG, gruppo 20**. Quando una
viene promossa a lavoro, nasce il suo ADR e si entra dal flusso normale (CLAUDE.md): la
visione orienta, la spec comanda.
