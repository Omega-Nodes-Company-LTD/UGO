# ADR-052 — Il cliente non è famiglia

**Stato**: accettata · **Data**: 2026-08-15 · **Contesto**: assistente ticket clienti
**Dipende da**: [ADR-051](./051-la-reception.md) (la porta da cui il cliente entra),
[ADR-019](./019-il-vicinato-multi-tenancy.md) (i tre ruoli che restano tre)

## Il problema

Un cliente dello studio deve poter parlare con un gosino: token personale, chat, ticket. La via
breve sarebbe un quarto valore nell'enum di `access_tokens` — `customer` accanto a `owner`,
`member`, `operator`. Ma ADR-019 dice «tre, e non di più», e il backlog ha già scartato l'RBAC
generico con la motivazione giusta: un quarto ruolo sarebbe un permesso travestito da ruolo.

C'è anche una regola più vecchia: niente tabelle `users`, niente `people` (regola 9, ADR-014).
L'entità di prima classe per le persone è `beings` — ma un cliente B2B non è un essere del
branco: è un'organizzazione con cui la casa lavora. Metterlo in `beings` direbbe una cosa falsa;
metterlo in `users` romperebbe il patto.

## La decisione

Il cliente è **un'entità adiacente al tenant**, non un ruolo di famiglia e non un essere:

- **`customers`** — anagrafica minima della casa: nome (etichetta di pannello), slug, note
  cifrate, i suoi limiti di spesa (ADR-055). Porta `household_id` come ogni tabella tenant:
  un cliente appartiene a **una** casa, e la federazione fra case resta inesistente (ADR-019);
- **`customer_gosini`** — a quali esemplari il cliente può rivolgersi. La FK composita
  `(household_id, gosino_id)` rende strutturalmente impossibile assegnargli il gosino di
  un'altra casa — lo stesso pattern di `trait_sets`. **Il cliente sceglie** a chi parlare fra
  gli assegnati: la personalità resta quella, e col tempo si vede quale gosino gli sta simpatico;
- **`customer_access_tokens`** — i token personali dei clienti, in una tabella **loro**:
  SHA-256 e mai il valore in chiaro, mostrato una volta sola all'emissione, scadenza e revoca.
  Lo specchio di `access_tokens`, ma separato: un resolver dedicato li accetta **solo** sulle
  rotte `/v1/reception/*`, insieme al token di servizio della reception (ADR-051). Un token
  cliente non apre nessun'altra porta di soul, e un token di famiglia non apre la reception.

`access_tokens` non cambia di una riga: tre ruoli, come promesso.

### Cosa può fare un cliente

Parlare coi suoi gosini, aprire e leggere i **suoi** ticket, vedere lo stato dei **suoi**
lavori. Ogni rotta reception risolve il cliente dal token e filtra per `customer_id` +
`household_id`; un identificatore altrui risponde **404**, non 403 — il pattern anti-BOLA di
`scope.ts`. Il gosino, dal canto suo, non esegue lavori: raccoglie richieste e risponde a
domande (il perimetro comportamentale sta nel blocco regole della reception, ADR-054).

## Conseguenze

- due tabelle di token nel sistema, ed è il prezzo giusto: i due mondi hanno cicli di vita,
  superfici e poteri diversi, e tenerli in una tabella sola avrebbe voluto dire un `role` in
  più e un catena di `if` in ogni guardia;
- l'oblio di un cliente è il cascade dalla sua riga `customers`: ticket, messaggi, token,
  fonti e indice se ne vanno insieme, e l'export lo enumera come le altre tabelle
  (`exportService`/`forgetService` li conoscono per nome);
- i verbi nuovi dell'audit (`customer_created`, `customer_token_issued`, `ticket_created`, …)
  entrano nel vocabolario chiuso di `auditLog.ts` — solo id, mai nomi, come sempre.
