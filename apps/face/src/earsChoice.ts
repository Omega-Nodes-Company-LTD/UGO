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

export type EarKind = "browser" | "locale";
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
  private localeDead = false;
  /** la strada ricordata da un avvio precedente, se ce n'è una */
  private readonly remembered: EarKind | undefined;

  public constructor(
    /** il parametro `?stt=` dell'URL: `locale` e `browser` forzano, il resto no */
    private readonly forced: string | null,
    private readonly memory: EarsMemory | undefined,
  ) {
    // `?stt=browser` è la via d'uscita diagnostica: forza il browser E
    // dimentica il ricordo — se il ricordo era stantio (un aggiornamento di
    // sistema ha aggiustato il riconoscitore), è così che lo si scopre
    // `?stt=` è la via d'uscita diagnostica, in ENTRAMBI i versi: forza una
    // strada E dimentica il ricordo — se il ricordo era stantio (un
    // aggiornamento di sistema ha aggiustato il riconoscitore, o whisper è
    // stato finalmente caricato sul server), è così che lo si scopre
    if (forced === "browser" || forced === "locale") this.forget();
    this.remembered = this.recall();
  }

  /**
   * Da dove si parte quando le orecchie si accendono.
   *
   * **La dettatura di casa è la base** (ADR-109), e il riconoscitore del
   * browser è il ripiego. Era il contrario, e il contrario voleva dire che
   * per default ciò che dici in casa tua veniva mandato a Google — scritto in
   * un commento di `main.ts` da mesi, e vero a ogni avvio di ogni
   * dispositivo. Un compagno locale-first non può avere le orecchie di
   * qualcun altro come impostazione di fabbrica.
   *
   * Il ricordo vince sul default: un dispositivo che ha già scoperto quale
   * delle due strade funziona non la riscopre a ogni ricarica.
   */
  public first(): EarKind {
    if (this.forced === "locale") return "locale";
    if (this.forced === "browser") return "browser";
    return this.remembered ?? "locale";
  }

  /**
   * Il freno di `speech.ts` ha mollato. `micIsOn` è il microfono del
   * misuratore: senza quello la dettatura in casa non ha nastro da ascoltare,
   * e prometterla sarebbe un orecchio finto.
   */
  public browserGaveUp(micIsOn: boolean): NextEars {
    this.browserDead = true;
    this.remember("locale");
    // chi ha scritto `?stt=browser` nell'URL sta diagnosticando: la resa del
    // browser è la risposta che cercava, non un motivo per cambiargli strada
    if (this.forced === "browser") return "off";
    if (this.localeDead || !micIsOn) return "off";
    return "locale";
  }

  /**
   * La dettatura in casa non risponde: 501 dal ponte, o whisper muto.
   *
   * NB: **non** un clip rifiutato. Da ADR-109 il ponte distingue i due «no» —
   * 422 «questo clip non si trascrive» contro 503 «il servizio non c'è» — e
   * solo il secondo arriva fin qui. Prima erano lo stesso codice, e tre «sì»
   * di fila bastavano a far dichiarare morta la strada di casa.
   */
  public localeFailed(): NextEars {
    this.localeDead = true;
    // un browser arreso in questa sessione o rotto per memoria non si riprova
    // a suon di bip: due strade morte = orecchie spente, dette
    if (this.browserDead || this.remembered === "locale") return "off";
    // e si ricorda: una casa senza whisper non deve ripagare il primo
    // enunciato a ogni ricarica per riscoprire ciò che sa già
    this.remember("browser");
    return "browser";
  }

  // localStorage può lanciare (incognito, chiosco blindato): una memoria che
  // non scrive degrada a «nessun ricordo», mai a un'eccezione sulle orecchie
  private recall(): EarKind | undefined {
    try {
      const kept = this.memory?.getItem(EARS_MEMORY_KEY);
      return kept === "locale" || kept === "browser" ? kept : undefined;
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
