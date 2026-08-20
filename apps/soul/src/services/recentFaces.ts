/**
 * Chi ho visto poco fa — PURO, e con una regola sola che conta (ADR-110).
 *
 * Il proprietario, il 2026-08-20: *«deve riconoscere chi parla,
 * assolutamente. Solo se ha marchiato non riconoscere non deve farlo.»*
 *
 * Fino a ieri l'identità di un turno veniva **solo dalla voce**: il volto
 * serviva a decidere se conservare un'impronta ignota e chiedere chi fosse,
 * e il suo esito veniva buttato. Quindi si poteva insegnargli una faccia,
 * vederla in «Facce che conosce», e sentirsi chiedere «chi sei tu?» due
 * minuti dopo — che è esattamente cosa è successo.
 *
 * La regola che questo file esiste per applicare: **il volto riempie un
 * buco, non tira a indovinare.** Se nella finestra si sono visti DUE volti
 * diversi, la risposta è «non lo so» — in una stanza con due persone
 * attribuire ogni frase all'ultima faccia inquadrata non è riconoscere:
 * è affermare a caso, e sbagliare il nome di chi ti sta parlando è peggio
 * che non dirlo. Vale anche il caso in cui la faccia vista non sia quella
 * di chi parla: due presenti, nessun nome.
 *
 * Non c'è un modo di svuotare la finestra a comando, e non serve: **si svuota
 * da sola** in {@link FACE_MEMORY_MS}. Anche dopo un oblio (`ForgetService`)
 * il peggio che può restare in memoria è un id per novanta secondi, e un
 * metodo `forget()` che nessuno chiama sarebbe una promessa scritta invece
 * che una garanzia — la garanzia è la finestra.
 *
 * Le protezioni non si applicano qui, e non è una dimenticanza: chi ha
 * `no_vision` **non ha un'impronta del volto** (l'arruolamento la rifiuta,
 * `ops/voice/app.py`), quindi non può mai arrivare fin qui. È la regola 9 —
 * a monte della pipeline, non a valle — e questo file si appoggia a quella
 * invece di ricontrollarla a valle, dove sarebbe una seconda verità da
 * tenere allineata.
 */

/**
 * Quanto vale un volto come risposta a «chi sta parlando».
 *
 * Novanta secondi: il tempo di dire una frase dopo che la camera ti ha
 * inquadrato. Più lungo diventa memoria — «era in casa poco fa» non è
 * «sta parlando adesso» — e la camera del chiosco manda un frame ogni
 * trenta secondi, quindi la finestra ne copre tre: chi è lì davanti resta
 * riconosciuto, chi è passato e uscito no.
 */
export const FACE_MEMORY_MS = 90_000;

interface Sighting {
  beingId: string;
  at: number;
}

export class RecentFaces {
  private seen: Sighting[] = [];

  /** Un volto riconosciuto, adesso. */
  public saw(beingId: string, at: Date): void {
    this.prune(at);
    this.seen = this.seen.filter((s) => s.beingId !== beingId);
    this.seen.push({ beingId, at: at.getTime() });
  }

  /**
   * L'unico visto nella finestra, o `undefined`.
   *
   * `undefined` sia quando non c'è nessuno sia quando ce n'è più d'uno, e i
   * due casi si somigliano apposta: da fuori sono la stessa cosa — non
   * sappiamo chi sta parlando — e chi legge questa risposta deve comportarsi
   * allo stesso modo in entrambi.
   */
  public only(at: Date): string | undefined {
    this.prune(at);
    const names = new Set(this.seen.map((s) => s.beingId));
    return names.size === 1 ? this.seen[0]?.beingId : undefined;
  }

  /**
   * Chi esce dalla finestra smette di essere una risposta.
   *
   * Il bordo è incluso: «entro novanta secondi» vuol dire novanta, non
   * ottantanove. Un limite scritto in un commento e un altro nel confronto
   * sono il modo in cui una soglia diventa impossibile da provare.
   */
  private prune(at: Date): void {
    const floor = at.getTime() - FACE_MEMORY_MS;
    this.seen = this.seen.filter((s) => s.at >= floor);
  }
}
