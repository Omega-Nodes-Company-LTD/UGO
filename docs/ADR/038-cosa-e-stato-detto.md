# ADR-038 — Cosa è stato detto: il corpo tiene un registro

**Stato**: Accettata · **Data**: 2026-08-12 · **Ambito**: `apps/face`

## Contesto

La nuvoletta dura sei secondi e poi la frase non esiste più nel corpo. Chi era
nell'altra stanza, o aveva il telefono in tasca, ha perso quella frase e non ha
modo di recuperarla dal dispositivo: l'anima ce l'ha, ma significa aprire il
pannello su un altro schermo per rileggere la propria conversazione.

Con ADR-036 il problema si è aggravato: in una stanza con più gosini le frasi si
susseguono e la nuvoletta ne mostra una sola alla volta. Chi guarda vede l'ultima
e perde le precedenti.

Nella stessa consegna sono emerse altre due lacune della stessa famiglia — cose
vere sul dispositivo che il dispositivo non diceva:

- la didascalia dell'umore mostrava **una** etichetta anche con più creature in
  scena, quindi era una didascalia su nessuno;
- lo stato della pagina (privacy, sonno) veniva sovrascritto dall'ultimo
  messaggio arrivato, quindi **una** creatura che si addormentava metteva a
  dormire tutto lo schermo.

## Decisione

**Il corpo tiene un proprio registro di quello che viene detto**, a scomparsa e
recuperabile: `apps/face/src/transcript.ts`.

1. **Persistito** in `localStorage`, perché una pagina che si ricarica e perde
   proprio la frase che stavi cercando di riprendere è lo stesso fallimento.
2. **Con un tetto di 80 righe**, applicato sia in scrittura sia in lettura: è
   testo di conversazione in chiaro su un dispositivo. La regola 6 di CLAUDE.md
   parla della cifratura lato server, e questo è un **posto nuovo** in cui le
   stesse parole vivono — una coda breve vale il rischio, un archivio no.
3. **Per stanza** (`ugo_log_<stanza>`): la cucina e lo studio sono due
   conversazioni, unirle non aiuta nessuno.
4. **Svuotabile con un bottone**, ed è l'unica copia che il corpo tiene.
5. **Registrato all'uscita**, non al microfono: `sendToSoul()` è l'unica porta
   verso l'anima e intercetta lì `heard_text`. Una frase digitata, o rigiocata
   dalla coda offline, è comunque qualcosa che è stato detto in quella stanza.
6. **Testo, mai markup**: le righe passano da `textContent` prima di entrare nel
   DOM.

Insieme, e per la stessa ragione (il corpo dice il vero su quello che c'è):

- **la didascalia nomina tutti**: `Ugo: sereno · Nino: in ansia`, tenendo una
  mappa umore-per-creatura invece di un'ultima etichetta;
- **lo stato della pagina segue il più sveglio** dei presenti;
- **`[hidden]` vince sempre**, con una regola globale. Ogni pannello imposta il
  proprio `display` su un selettore di id, che batte lo `[hidden]` del browser e
  lascia in scena un pannello "chiuso". Aveva già morso il cancello di `/admin`,
  ha morso il registro: una regola sola invece di una per pannello.
- **la nuvoletta si nasconde col registro aperto**: il pannello le stava
  esattamente sopra, e la riga è già lì, in diretta.

## Motivazione

Il registro sta **nel corpo** e non nel pannello perché è lì che serve: sei
davanti allo schermo, hai perso una frase, la ritrovi senza cambiare
dispositivo. Metterlo solo in `/admin` avrebbe risolto il problema per chi ha
già il pannello aperto — cioè per nessuno, nel momento in cui il problema si
presenta.

Il tetto è la parte non negoziabile. Senza, il dispositivo accumula mesi di
conversazione in chiaro in un posto che nessuna delle nostre garanzie di
cifratura copre. Ottanta righe sono abbastanza per ritrovare cosa ti sei perso
questo pomeriggio, e non abbastanza per essere un archivio da proteggere.

## Alternative scartate

- **Solo in memoria, senza persistenza.** Un ricaricamento della pagina —
  frequente su un tablet Android che ricicla la scheda — cancella proprio la
  cosa che stavi cercando.
- **Tenerlo tutto e chiedere all'anima.** Il registro completo esiste già lato
  server, cifrato. Farlo scaricare al corpo significa duplicare in chiaro un
  archivio che abbiamo cifrato apposta.
- **Un endpoint `/v1/transcript` con la storia dal database.** Più corretto sui
  dati, ma richiede il token del pannello su un dispositivo che è un chiosco: il
  corpo non è autenticato, ed è giusto così.
- **Registrare nel gestore del microfono.** Avrebbe tenuto solo la metà della
  conversazione entrata da quell'ingresso.

## Conseguenze

- Il corpo tiene fino a 80 righe di conversazione in chiaro per stanza,
  cancellabili dall'utente in un clic. Da dichiarare nella documentazione
  utente, che è stata aggiornata.
- `Transcript` prende lo storage per iniezione, quindi è coperto da unit test
  reali (tetto, file corrotto, storage pieno, stanze separate) senza jsdom.
- Un e2e verifica il giro completo: la risposta vera finisce nel registro, il
  registro sopravvive al ricaricamento, «svuota» svuota davvero.
