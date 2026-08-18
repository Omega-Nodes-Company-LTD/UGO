# ADR-090 — I diritti dove vive chi li ha

**Stato: ACCETTATA** (2026-08-18). Secondo tempo dell'ultima voce del gruppo 18, dopo ADR-089
che ha reso intero il diritto prima di portarlo in giro.

## Contesto

Export e oblio esistevano in due posti: una rotta HTTP e il pannello `/admin`. Tutti e due
sono posti dove chi vive in questa casa **non va**. Chi ci vive vede il muso — il chiosco in
cucina, il telefono nel guscio — e un diritto che si esercita altrove, per chi sta davanti a
quello schermo, è un diritto che non esiste.

È la stessa distanza per cui il Garante ha multato Replika nel 2025: non basta che una cosa
sia possibile da qualche parte.

## Decisione

### 1. Prima di tutto: «cosa sai di me»

`GET /v1/privacy/summary` risponde con **numeri**: quante persone conosce, quante hanno una
tutela accesa, quante cose sono state dette, quanti ricordi, quante pagine di diario, quante
impronte di voce o volto, quante volte ha visto o sentito qualcuno, quanti sconosciuti.

**Numeri e mai contenuti**, e non è prudenza generica: quello schermo è in cucina e lo legge
chiunque passi di lì. Un pannello che stampasse i ricordi sarebbe la cosa più indiscreta della
casa — la vita di uno letta da chi entra a prendere un bicchiere d'acqua. Un conto dice
*quanto*, mai *cosa*.

Le righe ci sono **anche quando valgono zero**: «nessuna impronta registrata» è una risposta, e
nasconderla lascerebbe credere che la domanda non sia stata fatta.

### 2. Registrata da sola, e non insieme ai due atti

I due atti hanno bisogno dei loro servizi (`ForgetService`, `ExportService`); i conti hanno
bisogno solo del database. Tenerli nello stesso blocco voleva dire che un'installazione senza
quei servizi non poteva nemmeno **dire cosa tiene** — e sapere cosa un sistema sa di te è il
gradino prima di ogni diritto, quindi è la cosa che deve mancare per ultima. Trovato da un
test, non ragionandoci: il 404 è arrivato dal giro vero.

### 3. Il token si chiede al momento, e non si tiene

I due atti — portare via tutto, dimenticare qualcuno — chiedono il **token di casa lì per lì**,
anche se il chiosco ne ha già uno suo. Alla chiusura del pannello il campo si svuota.

È attrito, ed è attrito giusto. Su uno schermo che vedono tutti, un atto irreversibile o che fa
uscire l'intera casa in chiaro non può dipendere da chi ci passa davanti: è la differenza fra
una porta e un buco nel muro. Il token del chiosco basta per **contare**, che è una cosa che
tutti in casa hanno diritto di fare.

### 4. E il nome si scrive

Cancellare qualcuno chiede di **scrivere il suo nome**, come il congedo di ADR-075: un click
solo non è un consenso a una cosa irreversibile. Tollerante su spazi e maiuscole — una tastiera
a schermo le sbaglia — e intollerante su tutto il resto.

## Conseguenze

- **Positive**: i due diritti stanno dove sta la gente; il gradino informativo («cosa sai di
  me») esiste per la prima volta, e non richiede il token di casa.
- **Negative**: chi ha il token di casa può cancellare **chiunque** dal chiosco, non solo sé
  stesso. È un limite dell'oggi e va detto: i token non sono legati a una persona (portano una
  casa, un ruolo e un'etichetta come «dock cucina»), quindi il sistema non sa *chi* sta
  digitando. Il vero self-service — ognuno esercita i propri diritti senza passare dal
  proprietario — richiede legare un token a un `being`, che è una decisione di modello e vuole
  il suo ADR. **Non l'ho finto**: in casa, oggi, l'atto resta di chi ha le chiavi di casa.
- **Da sapere**: il muso è servito da soul già costruito. Questa modifica **non arriva sul
  dispositivo finché il bundle non viene ricostruito** (regola 12).

## Verifica

7 unit sulla parte pura del muso (cosa si mostra, e il cancello prima dell'irreversibile) +
4 d'integrazione su Postgres vero che chiamano **le stesse rotte che chiama il chiosco**, per
la ragione di ADR-045: i conti tornano e non contengono nessun testo, contano la casa di chi
chiede e non il server, senza token non contano niente, e `/v1/pack` porta davvero
`displayName` — che è il campo che il muso legge, e un `name` sbagliato avrebbe riempito la
tendina di «undefined».

Più un e2e col browser vero: il pannello si apre, mostra nove righe di conti, «dimentica»
senza dire chi non parte, e il token digitato **non sopravvive alla chiusura**. **Onestà sul
metodo**: l'e2e non l'ho potuto eseguire qui — chiede il modello di embedding che questa
sandbox non può scaricare — ed è la CI a provarlo.

**Il giro completo (regola 12)**: BO — servizio dei conti, rotta registrata da sola. `/admin` —
nessuna modifica: i due atti lì c'erano già, ed è precisamente il motivo per cui questo lavoro
riguardava il muso. FE — il pannello, il bottone nell'HUD, lo stile che somiglia al registro, e
**il bundle da ricostruire** al rilascio.
