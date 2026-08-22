# ADR-112 — Un gioco è fatto di turni

**Stato: ACCETTATA** (2026-08-19). Gruppo 18, ultima voce aperta: i giochi vocali.

## Contesto

Le storie (ADR-088) sono state fatte e i giochi no, ed è stato scritto perché: **un gioco è
fatto di turni**. UGO pensa un numero e tu indovini; fra un turno e l'altro qualcosa deve
ricordare *cosa è stato pensato e cosa non è ancora stato detto*.

Quel qualcosa non può essere la cronaca della conversazione, per due ragioni e la seconda è
quella grave:

1. il segreto sarebbe leggibile insieme al resto, da chiunque abbia la chiave di casa;
2. e finirebbe **nel prompt del turno successivo** — cioè verrebbe consegnato al modello che
   dovrebbe custodirlo. Un modello a cui si dà il numero e si chiede di non dirlo è un modello
   a cui si è già chiesto troppo.

In questo sistema non esisteva **nessuno stato di turno**, e inventarlo di sfuggita dentro il
lavoro sulle favole voleva dire farlo male.

## Decisione

Una riga sua (`games`), e tre regole che sono la stessa regola guardata da tre lati.

1. **Il segreto non entra mai in un prompt.** A rispondere «più alto» o «più basso» è
   `judge()`, un confronto fra due interi. Il gioco è quindi anche **gratis**: nessun token, né
   del provider né di casa.
2. **Il segreto è cifrato a riposo** come ogni altro contenuto (regola 6): chi legge il
   database non gioca in vantaggio.
3. **Il numero lo tira `randomInt`**, la stessa funzione che il progetto usa per le chiavi, non
   `Math.random`. Un numero indovinabile conoscendo l'ora di inizio non è un numero pensato.

### Le decisioni piccole, che sono quelle che si sbagliano

- **Una partita aperta per esemplare**, tenuta da un indice unico parziale sul database e non
  da un controllo applicativo: due gosini in casa giocano due partite diverse, e un gosino non
  tiene due numeri in mente insieme.
- **`playing` cambia il senso della frase.** Fuori partita un numero non è un tentativo — se lo
  fosse, il gioco comincerebbe da solo ogni volta che qualcuno dice un'età. Dentro sì, e «ho 43
  anni» durante una partita viene letto come 43: è un rischio **accettato**, perché una partita
  è aperta solo se qualcuno l'ha chiesta e dura poche battute.
- **Scade dopo dodici ore**, e scade *leggendo*: un numero pensato a marzo trasformerebbe ogni
  cifra detta a giugno in un tentativo. Un passo del sogno apposta sarebbe lavoro inventato — la
  differenza si vede solo nel momento in cui qualcuno gioca.
- **La resa si offre dopo dodici tentativi e non si impone.** Con cento numeri ne bastano sette
  per dicotomia: chi è a dodici non sta cercando, si è perso — ma decidere di smettere è suo.
- **Solo in casa.** Una partita in riunione o con un cliente non è una distrazione simpatica: è
  una risposta sbagliata.
- **Un segreto illeggibile chiude la partita** invece di rispondere «più alto» rispetto a un
  numero che non c'è: se la chiave è ruotata, il gioco è finito, e dirlo è meglio che barare
  senza saperlo.

## Conseguenze

- l'export ha morso di nuovo (il test di ADR-089), e la tabella esce **col numero in chiaro**:
  sì, vuol dire che esportare a partita aperta è uno spoiler. Il file è della famiglia, e
  nasconderle qualcosa di suo per non rovinarle un gioco sarebbe la prima bugia di un export che
  promette tutto;
- lo stato di turno adesso **esiste**, ed è la cosa riusabile: un indovinello, o «pensa a un
  animale», sono un `kind` diverso sulla stessa riga. Il campo c'è già apposta;
- **non è stato fatto l'indovinello**, e la ragione non è tecnica: vuole un corpus di
  indovinelli italiani scritti da qualcuno, e inventarne dieci a caso qui dentro sarebbe
  contenuto travestito da codice.

## Verifica

- unità: le forme dei verbi, e soprattutto che **fuori partita un numero non è un tentativo**;
  il giudizio che dice la direzione e **non rivela il segreto** finché la partita non è finita;
  la resa offerta al dodicesimo;
- integrazione su Postgres vero: la partita nasce, il segreto è cifrato nella riga, un
  tentativo giusto la chiude, e l'indice unico impedisce la seconda partita aperta.

## Giro regola 12

- **BO** — schema `games` + migrazione `0055` con RLS, la logica pura, il servizio, la chat;
- **`/admin`** — nessuna modifica, **e non serviva**: una partita è una cosa che si gioca
  parlando, e metterne il numero nel pannello sarebbe l'unico modo per vederlo — cioè un
  bottone per barare. Il registro non ne conserva il contenuto, e va bene così;
- **FE** — nessuna modifica: le battute arrivano come testo sul contratto di sempre.
