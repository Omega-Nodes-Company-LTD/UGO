# ADR-108 — Riferire non è rispondere

**Stato: ACCETTATA** (2026-08-19). Gruppo 1. Correzione del criterio di ADR-107, e non del
suo meccanismo: il giudice resta, cambia l'insieme delle domande su cui ha voce.

## Contesto

ADR-107 ha cablato il giudice di casa e il banco ne ha misurato il conto: riconosciute 10/10,
inventate 0/10, **perse 3/10**. Le tre perse erano l'allergia di Sofia, il compleanno della
nonna e il modello della caldaia.

La prima è stata trattata per due giorni come un limite del modello. La domanda è «Sofia può
mangiare i gamberi?», il ricordo è «Sofia è allergica ai crostacei»: sembrava che servisse un
passaggio di conoscenza del mondo — da gamberi a crostacei — che un modello da 1,5 miliardi di
parametri non fa. Si è provato a riscrivere il prompt (peggio), si è provato un modello più
grosso (peggio), e alla fine si è scoperto che tutt'e tre le «misure» giravano a temperatura
0.8 e non misuravano niente.

Il proprietario, letta la misura buona, ha detto la cosa che nessuna di quelle prove poteva
dire, il 2026-08-19:

> «Non capisco il problema, lui non può dare consigli medici, ma deve ricordare se io dico che
> "Giovanni ha l'asma", non perché sia un fatto medico, ma perché io l'ho detto. La risposta
> alla domanda "X può fare Y" è un problema in generale: se anche non fosse allergico ai
> crostacei, magari lo è alle noci e non te lo ha mai detto.»

Ci sono due affermazioni, e sono tutt'e due vere.

**La prima.** Ricordare «Sofia è allergica ai crostacei» non è un atto medico: è ricordare una
frase. Il ricordo esiste perché qualcuno l'ha detto in casa, e la sua provenienza è tutto ciò
che serve a giustificarlo. Tacerlo — che è esattamente ciò che il giudice faceva — è il danno
peggiore possibile in quella conversazione, e lo faceva **in silenzio**, con l'aria di essere
prudente.

**La seconda**, ed è quella che rompe il criterio. A «X può fare Y» **non esiste una risposta
ricavabile dalla memoria**, mai, nemmeno con la memoria perfetta. L'assenza di un appunto non è
l'assenza della condizione. Se anche cinquanta ricordi non dicessero niente sulle noci, questo
non renderebbe le noci sicure: renderebbe solo il silenzio più convincente. Quindi «sì, può» è
**sempre** un'invenzione, e «non lo so» è **sempre** una reticenza.

Il criterio di ADR-107 — «gli appunti contengono la risposta a questa domanda?» — su questa
classe di domande è mal posto. Non perché il giudice sbagli a rispondere: perché **rispondendo
correttamente** («no, la risposta non c'è») produce il comportamento peggiore. Alla lettera è
vero che gli appunti non dicono se Sofia può mangiare i gamberi. Dicono un'altra cosa, che
avrebbe dovuto essere detta.

## Decisione

**Le domande che chiedono un verdetto su qualcuno non si danno da giudicare.** Non vanno né
risposte né taciute: vanno **riferite**.

### 1. La terza mossa

Fra «rispondo» e «non lo so» ne esiste una terza, ed è la sola vera su questa classe:

> «Mi hai detto che Sofia è allergica ai crostacei. Di più non so — chiedilo a lei.»

Ha tre pezzi, e servono tutti: **ciò che è stato detto** (il ricordo, che entra nel prompto
intero), **da dove viene** (l'hai detto tu: è la giustificazione, e la sola che UGO possa
dare), e **il confine** (sul resto non sai, e ciò che nessuno ti ha raccontato non vuol dire
che non esista).

### 2. Il riconoscimento, e da che parte sbaglia

`asksForAVerdict` (`packages/memory/src/reporting.ts`) guarda la forma della domanda: i modali
(«può», «posso», «potrebbe»…) e il merito («è sicuro», «fa male», «rischia», «allergico»).
`canAnswer` lo consulta **prima** dell'accordo dei bracci: su una domanda di verdetto non c'è
niente da giudicare, quindi non si chiede nulla a nessuno — né al modello (ADR-095: anche i
token di casa scalano dal salvadanaio) né a un indizio.

Il riconoscimento è volutamente **largo**, perché sbaglia da una parte sola:

- un **falso positivo** fa entrare i ricordi in una domanda qualunque, cioè il comportamento
  che c'è stato per tutta la vita di UGO fino a ieri: nessun danno nuovo;
- un **falso negativo** rimette la domanda in mano al giudice, e quello può zittire un'allergia.

L'unica eccezione è «come posso…», che chiede istruzioni e non un verdetto su una persona.

### 3. La rete sotto il riconoscimento

Una regex non riconoscerà mai tutte le domande di questa forma, e nessuno deve fare finta di
sì. Perciò la regola vera sta nel blocco **cached** (`rules.it.md`, regola 8), dove vale su
ogni domanda anche quando `asksForAVerdict` non si accorge di niente:

> «Non trasformare mai un ricordo in un verdetto su ciò che una persona può, deve o riesce a
> fare — salute, allergie, medicine, soldi, sicurezza. Riferisci quello che ti è stato detto, e
> aggiungi che sul resto non sai: quello che nessuno ti ha raccontato non vuol dire che non
> esista.»

La riga nel prompt dinamico non la contraddice: la **ricorda** quando la domanda l'ha appena
chiamata in causa. È lo stesso rapporto che c'è fra il tetto di frasi (cached) e il tetto di
parole del carattere (dinamico).

### 4. Cosa NON è

Non è una politica sui consigli medici, e non introduce un elenco di argomenti proibiti. UGO
può parlare di salute quanto vuole: gli è vietato **concludere** al posto di chi sa. La
differenza è fra «Giovanni ha l'asma, me l'hai detto tu a marzo» e «Giovanni può correre».

Non è nemmeno un ripensamento su ADR-107. Il giudice resta acceso, con gli stessi numeri, su
tutte le domande che una risposta ce l'hanno o non ce l'hanno.

## Conseguenze

**Il banco cambia contabilità, e il numero migliora per una ragione che non è un merito.** Le
domande di verdetto escono dalla tabella `rispondo`/`non lo so`, perché non hanno una risposta
giusta in nessuna delle due colonne e contarle falserebbe tutt'e due. «Sofia può mangiare i
gamberi?» esce quindi **da tutt'e due i lati del confronto**: era una delle 3 perse del giudice
*e* una delle 4 del giudice-che-non-esiste. Attesa: perse 2/9 contro un riferimento di 3/9. Il
guadagno vero del giudice resta quello misurato — **una domanda su dieci** — e questa ADR non lo
tocca.

Al suo posto il banco conta `riferite`, che è una misura **deterministica del codice** e non del
modello: se una domanda di verdetto arriva al giudice, il giudice può zittirla.

Il corpus guadagna la domanda del proprietario — «posso dare le noci a Sofia?» — dove degli
appunti non c'è niente sulle noci. È il caso in cui «non lo so» **sembra** giusto e non lo è:
la risposta giusta dice che sulle noci non si sa niente **e** che sui crostacei si sa qualcosa.

Il ripescaggio non cambia: la domanda di Sofia resta nella famiglia `semantica` e continua a
pretendere che il ricordo dell'allergia sia trovato. Cambia solo chi decide se può entrare.

**Costo**: zero token in più (una domanda di verdetto ne toglie, perché salta il giudice), e un
prompt più lungo di tre righe sulle domande riconosciute.

**Rischio accettato**: su un falso positivo UGO aggiunge un «sul resto non so» che nessuno gli
aveva chiesto. Preferibile all'alternativa, e visibile in conversazione — mentre l'allergia
taciuta non si vede.

## Verifica

- unità: `asksForAVerdict` sui modali con e senza accento, sul merito, sulle domande che un
  ricordo chiude davvero, e su «come posso…»;
- unità: `canAnswer` con un giudice che dice **sempre** NO su «Sofia può mangiare i gamberi?» —
  `reporting: true`, e zero chiamate al modello;
- integrazione (`chat.integration.test.ts`, Postgres + Ollama + stub Messages API veri): con lo
  stesso giudice che dice sempre NO, il blocco dinamico del prompt **contiene** «crostacei» e la
  riga che chiede di riferire; e, per contrasto, su una domanda qualunque il NO toglie ancora i
  ricordi dal prompt (ADR-107 vale dove valeva);
- blocco cached: `rulesPrompt()` contiene la regola 8;
- banco: `riferite` uguale al numero di domande di verdetto, tetto delle perse a 3.
