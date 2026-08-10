# ADR-017 — Il "local" di local-first è un server dedicato in UE, non la casa

**Stato: ACCETTATA** (proprietario, 2026-08-10). Non sostituisce ADR-007: ne corregge un presupposto
implicito che si è rivelato falso al momento del deploy.

## Contesto

ADR-007 dice *local-first*: niente esposizione pubblica, datastore su reti private, accesso solo dai
corpi. Tutta la documentazione che ne discende — inclusa la frase «le trascrizioni non lasciano mai il
perimetro» — è stata scritta immaginando **un server in casa**, sulla stessa rete del telefono.

Il server reale è un **dedicato fisico a noleggio presso Hetzner**. Il codice non cambia di una riga,
ma tre affermazioni che davamo per vere smettono di esserlo, e nessuna può restare non detta.

## Cosa cambia davvero

### 1. Il telefono e il server non sono più sulla stessa rete

Il corpo di casa tiene un WebSocket aperto verso soul tutto il giorno. Su una LAN domestica questo è
gratis; da casa verso Hetzner no. Restano due strade:

- **esporre soul su Internet** con dominio, TLS e password;
- **una rete privata fra i propri dispositivi** (Tailscale/WireGuard), in cui soul non ha nessuna
  porta pubblica e semplicemente *non esiste* per chi non è nella rete.

Scegliamo la seconda. La prima non è "meno sicura di un po'": trasforma una superficie inesistente in
una superficie mondiale, dove l'unica cosa fra un estraneo e le trascrizioni dei clienti è una
password. Costo accettato, e reale: il telefono deve avere il client attivo anche su rete mobile.

### 2. La cifratura a riposo protegge meno di quanto la frase suggerisca

`UGO_DATA_KEY` doveva stare «separata dal database». Su un'unica macchina, con la chiave nelle
variabili d'ambiente dello stesso host che ospita Postgres, **chi ottiene root su quella macchina ha
entrambe**. Va detto in chiaro, perché la frase «cifrato a riposo» altrimenti promette troppo.

Quello che la cifratura continua a comprare, e non è poco:

| Minaccia | Protetto? |
|---|---|
| Backup su S3 esfiltrati (bucket mal configurato, credenziali perse) | **Sì** — il dump è cifrato con una chiave che su S3 non c'è |
| Snapshot o disco dismesso dal provider | **Sì** |
| Copia del solo database (dump rubato, replica) | **Sì** |
| Root sulla macchina viva | **No** — chiave e dati sono lì insieme |

Conseguenza operativa: la copia offline di `UGO_DATA_KEY` **non è un vezzo da runbook**, è l'unica
ragione per cui i backup restano opachi a chi non è noi.

### 3. Il perimetro domestico di ADR-016 va riletto

ADR-016 lega l'enrollment biometrico al corpo di casa, e ne deduce che «il dato non lascia l'ambito
domestico». La deduzione resta valida sul piano del **trattamento** — i profili nascono solo da
materiale del dock, e wearable e meeting bot continuano a non costruirne — ma i centroidi **risiedono**
su una macchina in un datacenter tedesco. Precisazione, non contraddizione:

- l'esenzione domestica (GDPR art. 2(2)(c)) dipende dalla **finalità** del trattamento, non da dove
  gira il ferro: usare un hoster per una finalità personale non la fa decadere di per sé;
- Hetzner (DE/FI) è **nell'UE**: nessun trasferimento verso paesi terzi da giustificare;
- il vincolo di ADR-016 che vale davvero resta in piedi: **niente frame né campioni audio verso API
  cloud**. L'elaborazione è sul nostro ferro, non su un servizio altrui.

## Decisione

1. Il perimetro di fiducia di UGO è **il server dedicato**, non l'abitazione. Ogni documento che dice
   «in casa» va letto come «sul nostro ferro».
2. Accesso ai corpi e al pannello **solo via rete privata** (Tailscale). Nessun dominio pubblico su
   soul, in nessuna circostanza.
3. `UGO_DATA_KEY` **deve** esistere in copia offline, fuori dal server. Senza, i backup sono
   irrecuperabili; con la chiave sul solo server, non proteggono da chi il server lo possiede.
4. Preferire un provider UE resta un vincolo, non una comodità: cambiarlo richiede un ADR nuovo.

## Alternative scartate

1. **Server in casa.** Sarebbe stato il local-first letterale, ma non è il ferro che c'è. Riaprire la
   scelta è possibile: questo ADR verrebbe sostituito, non emendato.
2. **Dominio pubblico + password (o Cloudflare Access).** Due clic in Coolify, e per questo tentante.
   Scartata: mitiga una classe di attacco invece di eliminarla, su un servizio che custodisce
   conversazioni di clienti e impronte vocali di conviventi.
3. **Chiave in un KMS gestito.** Toglierebbe il problema del punto 2, ma introduce una dipendenza da
   un servizio di terzi nel percorso di avvio: senza KMS raggiungibile, UGO non parte. Sproporzionato
   per un sistema a utente singolo. Riconsiderabile se il ferro diventa più di uno.

## Conseguenze

- Il runbook guadagna una sezione Tailscale scritta per chi non l'ha mai visto, e la frase sulla
  chiave offline diventa un passo obbligatorio, non un consiglio.
- `ARCHITECTURE.md` §2.1/§2.2 vanno letti con «casa» = «nostro server dedicato».
- Il giorno in cui si volesse davvero il ferro in casa, questo ADR va sostituito da uno nuovo: la
  differenza è troppo grossa per una nota a piè di pagina.
