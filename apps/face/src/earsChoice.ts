/**
 * La scelta delle orecchie (STATE §6-tricies, il seguito).
 *
 * Su certi Android il riconoscitore del browser non riesce a tenere il
 * microfono — lo tiene il misuratore di rumore — e ogni suo `start()` suona
 * il bip di sistema. Il freno di `speech.ts` gli fa dichiarare la resa invece
 * di suonare per sempre; questa classe decide cosa succede DOPO la resa:
 *
 * - si passa alla dettatura in casa (`/v1/stt`), che ascolta il microfono già
 *   aperto e quindi non suona nessun bip;
 * - il dispositivo se lo ricorda, così alla prossima ricarica si parte
 *   direttamente dalla strada che funziona invece di rifare un minuto di bip;
 * - se anche la strada in casa muore, le orecchie si spengono e basta:
 *   due strade morte non devono rimbalzarsi l'utente all'infinito.
 *
 * Pura di proposito: la memoria è iniettata (in produzione `localStorage`),
 * così la logica si prova coi numeri e senza un browser.
 */

/**
 * ADR-123: `cloud` = le orecchie della casa (`/v1/stt`, il provider che il
 * titolare ha scelto). Si chiamava `locale` quando dietro c'era whisper sul
 * server di casa: il nome vecchio si accetta ancora, nell'URL e nel ricordo,
 * perché un dispositivo aggiornato non deve rifare la trafila.
 */
export type EarKind = "browser" | "cloud";
export type NextEars = EarKind | "off";

/** Il minimo di `Storage` che serve, per poter iniettare una memoria finta. */
export interface EarsMemory {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export const EARS_MEMORY_KEY = "ugo-ears";

export class EarsChoice {
  /** morti in QUESTA sessione: il ricordo fra le ricariche sta nella memoria */
  private browserDead = false;
  private cloudDead = false;
  /** la strada ricordata da un avvio precedente, se ce n'è una */
  private readonly remembered: EarKind | undefined;

  public constructor(
    /** il parametro `?stt=` dell'URL: `cloud` (o `locale`) e `browser` forzano */
    forced: string | null,
    private readonly memory: EarsMemory | undefined,
  ) {
    // `?stt=browser` è la via d'uscita diagnostica: forza il browser E
    // dimentica il ricordo — se il ricordo era stantio (un aggiornamento di
    // sistema ha aggiustato il riconoscitore), è così che lo si scopre
    // `?stt=` è la via d'uscita diagnostica, in ENTRAMBI i versi: forza una
    // strada E dimentica il ricordo — se il ricordo era stantio (un
    // aggiornamento di sistema ha aggiustato il riconoscitore, o whisper è
    // stato finalmente caricato sul server), è così che lo si scopre
    this.forced = forced === "locale" ? "cloud" : forced;
    if (this.forced === "browser" || this.forced === "cloud") this.forget();
    this.remembered = this.recall();
  }

  private readonly forced: string | null;

  /**
   * Da dove si parte quando le orecchie si accendono.
   *
   * **Le orecchie della casa sono la base** (ADR-109, ADR-123), e il
   * riconoscitore del browser è il ripiego: le prime sono quelle che il
   * titolare ha scelto e paga, le seconde mandano la voce a chi fa il
   * browser senza che nessuno l'abbia deciso. Se la casa non ha scelto le
   * orecchie, `/v1/stt` risponde 501 al primo enunciato e il ricordo passa
   * al browser.
   *
   * Il ricordo vince sul default: un dispositivo che ha già scoperto quale
   * delle due strade funziona non la riscopre a ogni ricarica.
   */
  public first(): EarKind {
    if (this.forced === "cloud") return "cloud";
    if (this.forced === "browser") return "browser";
    return this.remembered ?? "cloud";
  }

  /**
   * Il freno di `speech.ts` ha mollato. `micIsOn` è il microfono del
   * misuratore: senza quello la dettatura in casa non ha nastro da ascoltare,
   * e prometterla sarebbe un orecchio finto.
   */
  public browserGaveUp(micIsOn: boolean): NextEars {
    this.browserDead = true;
    this.remember("cloud");
    // chi ha scritto `?stt=browser` nell'URL sta diagnosticando: la resa del
    // browser è la risposta che cercava, non un motivo per cambiargli strada
    if (this.forced === "browser") return "off";
    if (this.cloudDead || !micIsOn) return "off";
    return "cloud";
  }

  /**
   * Le orecchie della casa non rispondono: 501 (non scelte) o 503 (giù).
   *
   * NB: **non** un clip rifiutato. Da ADR-109 il ponte distingue i due «no» —
   * 422 «questo clip non si trascrive» contro 503 «il servizio non c'è» — e
   * solo il secondo arriva fin qui. Prima erano lo stesso codice, e tre «sì»
   * di fila bastavano a far dichiarare morta la strada di casa.
   */
  public cloudFailed(): NextEars {
    this.cloudDead = true;
    // un browser arreso in questa sessione o rotto per memoria non si riprova
    // a suon di bip: due strade morte = orecchie spente, dette
    if (this.browserDead || this.remembered === "cloud") return "off";
    // e si ricorda: una casa senza orecchie scelte non deve ripagare il primo
    // enunciato a ogni ricarica per riscoprire ciò che sa già
    this.remember("browser");
    return "browser";
  }

  // localStorage può lanciare (incognito, chiosco blindato): una memoria che
  // non scrive degrada a «nessun ricordo», mai a un'eccezione sulle orecchie
  private recall(): EarKind | undefined {
    try {
      const kept = this.memory?.getItem(EARS_MEMORY_KEY);
      if (kept === "locale" || kept === "cloud") return "cloud";
      return kept === "browser" ? "browser" : undefined;
    } catch {
      return undefined;
    }
  }

  private remember(road: EarKind): void {
    try {
      this.memory?.setItem(EARS_MEMORY_KEY, road);
    } catch {
      // niente ricordo: alla prossima ricarica si rifà la trafila, pazienza
    }
  }

  private forget(): void {
    try {
      this.memory?.removeItem(EARS_MEMORY_KEY);
    } catch {
      // idem: meglio un ricordo stantio di un'eccezione all'avvio
    }
  }
}
