Guscio Android (ADR-018 Tempo 2), costruito dall'ultimo commit su `main`.

### Come si installa

1. Scarica il file `.apk` qui sotto **dal telefono**.
2. Aprilo. Android chiederà di autorizzare l'installazione da questa sorgente:
   è un'app tua, non di uno store, ed è voluto — un utente solo, un telefono solo.
3. Alla prima apertura concedi **microfono** (obbligatorio) e, se vuoi presenza e
   sguardo, **fotocamera** (facoltativo: senza, UGO degrada al puntatore).

### Cosa aspettarti

Fa quello che fa la webapp, in una finestra propria e senza barra degli indirizzi.
Serve comunque che il telefono raggiunga il server: Tailscale connesso e l'indirizzo
`https://…ts.net` configurato (runbook §10).

### Cosa non fa ancora

È un pacchetto **di debug, non firmato per la distribuzione**. Registrare a schermo
spento, il kiosk vero (lock task), l'avvio al boot e l'incontro fra gosini via
Bluetooth **hanno i permessi dichiarati ma non ancora il codice nativo che li usa**.
