/**
 * Perché il microfono non si è aperto, detto a chi ha il telefono in mano.
 *
 * Il difetto che ha reso questo modulo necessario è di **diagnosi**, non di
 * funzionalità. Il muso apriva il microfono con un `.catch(() => undefined)`:
 * se il telefono diceva di no — permesso negato, pagina non sicura, nessun
 * `mediaDevices` — non succedeva niente e non lo diceva nessuno. L'unico
 * sintomo visibile era il riconoscitore che si spegneva e riaccendeva, quindi
 * un muro di `not-allowed`/`network` nel registro: il messaggio giusto era «il
 * telefono nega il microfono», e il proprietario leggeva invece la cronaca del
 * secondo effetto.
 *
 * E la causa più frequente non è nemmeno un permesso: una pagina servita su
 * `http://` **non è un contesto sicuro**, e nessun browser mobile le concede
 * il microfono — per nessuna insistenza e per nessun tocco sul bottone. È
 * scritto in `documentation/04-troubleshooting`, che però si legge da un altro
 * dispositivo: qui lo dice il corpo, sullo schermo che hai davanti.
 *
 * Puro di proposito (nessun `navigator`, nessun `window` letti da dentro): la
 * mappa dai guasti alle frasi si prova coi numeri, senza un browser.
 */

/** Il contesto non è sicuro: la causa che nessun tocco sul bottone risolve. */
const INSECURE =
  "questa pagina non è su una connessione sicura (https://): il telefono nega il microfono a " +
  "qualunque pagina, non solo a UGO — riapri UGO dall'indirizzo https e reinstalla l'icona da lì";
/** Contesto sicuro, ma il browser non espone i dispositivi. */
const NO_MEDIA = "questo browser non offre il microfono alle pagine web";
const DENIED =
  "il microfono è negato a questa pagina: concedilo dalle impostazioni del sito e ricarica";
const ABSENT = "nessun microfono su questo dispositivo";
const BUSY = "il microfono è già in mano a un'altra applicazione";
const UNKNOWN = "il microfono non si è aperto";

/**
 * Quel poco d'ambiente che serve per sapere se ha senso chiedere.
 *
 * Volutamente tutto facoltativo: un browser che non conosce `isSecureContext`
 * è vecchio abbastanza da non concederci comunque niente, e la funzione deve
 * poter ricevere un oggetto finto in un test.
 */
export interface MicScope {
  isSecureContext?: boolean;
  navigator?: { mediaDevices?: unknown };
}

/**
 * L'impedimento noto PRIMA di chiedere, o `undefined` se si può provare.
 *
 * Chiedere lo stesso costerebbe un'eccezione da tradurre e — sui telefoni che
 * lo consentono — un prompt di sistema per un permesso che non servirà a
 * niente.
 */
export function micBlocked(scope: MicScope): string | undefined {
  if (scope.isSecureContext === false) return INSECURE;
  if (scope.navigator?.mediaDevices !== undefined) return undefined;
  // niente `mediaDevices` in un contesto dichiarato sicuro è davvero il
  // browser; ovunque altro la causa quasi certa resta l'origine in chiaro
  return scope.isSecureContext === true ? NO_MEDIA : INSECURE;
}

/**
 * Il motivo di un `getUserMedia` fallito.
 *
 * I nomi sono quelli di `DOMException`, più i due alias storici che Android
 * ha spedito per anni; l'oggetto arriva come `unknown` perché in un `catch`
 * è quello che è, e leggerne il nome a mano evita di dipendere da
 * `instanceof DOMException` (che in un test non esiste).
 */
export function micFailure(error: unknown): string {
  const name =
    typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return DENIED;
    case "NotFoundError":
    case "DevicesNotFoundError":
      return ABSENT;
    case "NotReadableError":
    case "TrackStartError":
      return BUSY;
    default:
      // il nome grezzo in coda: non dice niente al proprietario, ma è l'unica
      // cosa che rende raccontabile al telefono un guasto che non conosciamo
      return name === "" ? UNKNOWN : `${UNKNOWN} (${name})`;
  }
}
