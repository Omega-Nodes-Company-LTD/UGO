import { events, gosini, type DbClient } from "@ugo/db";
import { and, eq } from "drizzle-orm";
import type { GosinoRegistry, GosinoRuntime } from "./pack/runtimes.js";
import { RoomCatalogue } from "./roomCatalogue.js";

/**
 * Le spinte (ADR-064): i primi due verbi — «vai in cucina», «chiama Silvio».
 *
 * Una richiesta NON è un comando: è una pressione che passa dal carattere e
 * dallo stato, e può essere rifiutata CON una risposta — un grugnito
 * contrariato è una risposta, il silenzio no. Le soglie stanno qui, scritte e
 * testabili, non nel modello: il provider non c'entra niente (zero token, per
 * costruzione), e il riconoscimento è la famiglia deterministica di
 * «ricordami»/«cerca:»/«leggi».
 *
 * Solo atti reversibili e visibili a occhio (ADR-064 §5): cambiare stanza
 * passa dallo STESSO giro del pannello (catalogo → locationLabel → reload del
 * registro), chiamare l'altro gosino passa dal suo corpo. Ogni spinta —
 * assecondata o rifiutata — è un evento nel registro, id e verbi. Mai in
 * reception: le spinte entrano solo dalla chat di casa.
 */

export type Nudge =
  | { verb: "go"; room: string }
  | { verb: "call"; name: string }
  | { verb: "sleep" }
  | { verb: "come" };

/** le forme: chiuse, in italiano, coi rafforzativi tollerati */
const GO_FORM =
  /^(?:ugo[,!]?\s+)?(?:vai|va'|spostati)\s+(?:in|nel|nella|nello|al|alla|allo|a)\s+(.{2,40}?)\s*[.!]*$/i;
const CALL_FORM = /^(?:ugo[,!]?\s+)?chiama\s+([\p{L}][\p{L} '’-]{1,39}?)\s*[.!]*$/iu;
/**
 * «Vai a dormire». Solo verso il sonno, mai verso la sveglia: svegliarlo a
 * comando sarebbe un interruttore, e a svegliarlo basta farsi vedere.
 */
const SLEEP_FORM = /^(?:ugo[,!]?\s+)?(?:vai a dormire|va['’] a dormire|dormi|a nanna|fai la nanna)\s*[.!]*$/i;
/** «Vieni qui»: la stanza non è nominata, la deve sapere chi lo dice. */
const COME_FORM = /^(?:ugo[,!]?\s+)?(?:vieni (?:qui|qua|da me)|torna (?:qui|qua))\s*[.!]*$/i;

/**
 * **L'ordine conta, e costa un giro di CI impararlo.**
 *
 * `«vai a dormire»` combacia anche con la forma dello spostamento — «vai» +
 * «a» + «dormire» — e messa dopo veniva letta come *«vai nella stanza
 * dormire»*, con la risposta «non conosco una stanza che si chiama dormire».
 * Le forme specifiche vanno provate per prime: una regola generale messa
 * davanti a una specifica se la mangia sempre.
 */
export function nudgeOf(text: string): Nudge | undefined {
  const trimmed = text.trim();
  if (SLEEP_FORM.test(trimmed)) return { verb: "sleep" };
  if (COME_FORM.test(trimmed)) return { verb: "come" };
  const go = GO_FORM.exec(trimmed);
  if (go?.[1] !== undefined) return { verb: "go", room: go[1].trim() };
  const call = CALL_FORM.exec(trimmed);
  if (call?.[1] !== undefined) return { verb: "call", name: call[1].trim() };
  return undefined;
}

/**
 * Le soglie del COME (ADR-064 §3): un pet che obbedisce sempre è un
 * telecomando, uno che non obbedisce mai è rotto. La differenza sta qui.
 */
export const TOO_SCARED_STRESS = 0.7;
export const RELUCTANT_ENERGY = 0.35;

export interface NudgeDeps {
  /** ADR-098: la connessione della casa del runtime spinto */
  dbFor: (accountId: string) => DbClient;
  /** il registro nasce DOPO questo servizio: si legge al momento del gesto */
  registry: () => GosinoRegistry | undefined;
}

export class NudgeService {

  public constructor(private readonly deps: NudgeDeps) {
  }

  /**
   * La risposta alla spinta, o `undefined` se la frase non ne era una — e
   * allora va al modello come una qualunque.
   */
  public async answer(gosinoId: string, text: string, at: Date = new Date()): Promise<string | undefined> {
    const nudge = nudgeOf(text);
    if (nudge === undefined) return undefined;
    const registry = this.deps.registry();
    const me = registry?.everywhere().find((runtime) => runtime.id === gosinoId);
    if (registry === undefined || me === undefined) return undefined;

    // lo stato decide il COME, prima ancora del cosa (ADR-064 §3)
    if (me.gateway.currentState() === "sleeping") {
      return this.noted(me, nudge, "asleep", "Grunf... stavo dormendo. Chiedimelo fra un po'.");
    }
    const { vars } = me.psyche.current(at);
    if (vars.stress > TOO_SCARED_STRESS) {
      return this.noted(
        me,
        nudge,
        "scared",
        "Adesso no — ho ancora il cuore a mille. Dammi un attimo per calmarmi, grunf.",
      );
    }

    if (nudge.verb === "go") return this.go(registry, me, nudge.room, vars);
    if (nudge.verb === "sleep") return this.sleep(me);
    if (nudge.verb === "come") return this.come(me);
    return this.call(registry, me, nudge.name);
  }

  private async go(
    registry: GosinoRegistry,
    me: GosinoRuntime,
    asked: string,
    vars: { energia: number },
  ): Promise<string> {
    // la stanza si risolve dal CATALOGO, come nel pannello (ADR-039): una
    // spinta vocale non deve poter creare stanze per refuso
    const room = await new RoomCatalogue(this.deps.dbFor(me.accountId)).named(me.accountId, asked);
    if (room === undefined) {
      return this.noted(me, { verb: "go", room: asked }, "unknown_room",
        `Non conosco una stanza che si chiama «${asked}». Grunf.`);
    }
    if (me.where?.toLowerCase() === room.toLowerCase()) {
      return this.noted(me, { verb: "go", room }, "already_there",
        `Ma sono già qui, in ${room}! Grunf.`);
    }

    await this.deps.dbFor(me.accountId)
      .update(gosini)
      .set({ locationLabel: room })
      .where(and(eq(gosini.id, me.id), eq(gosini.accountId, me.accountId)));
    await registry.reload();
    // il corpo che lascio saluta: l'atto dev'essere visibile a occhio
    me.gateway.broadcastGesture("wiggle");
    const reluctant = vars.energia < RELUCTANT_ENERGY;
    return this.noted(
      me,
      { verb: "go", room },
      "done",
      reluctant
        ? `Uff... e va bene, vado in ${room}. Ma piano, che sono stanco. Grunf.`
        : `Vado in ${room}! Ci vediamo di là. Grunf!`,
    );
  }

  private async call(registry: GosinoRegistry, me: GosinoRuntime, name: string): Promise<string> {
    const wanted = name.trim().toLowerCase();
    const other = registry
      .all(me.accountId)
      .find((runtime) => runtime.id !== me.id && runtime.name.toLowerCase() === wanted);
    if (other === undefined) {
      return this.noted(me, { verb: "call", name }, "unknown_peer",
        `Qui non vive nessun ${name}, che io sappia. Grunf.`);
    }
    if (!other.gateway.hasBody()) {
      return this.noted(me, { verb: "call", name: other.name }, "peer_offline",
        `${other.name} non ha un corpo acceso in questo momento: non mi può sentire.`);
    }
    // la chiamata è VISIBILE dove sta lui: il suo corpo risponde
    other.gateway.broadcastSpeak(`Grunf! Mi hanno chiamato — eccomi, sono in ${other.where ?? "giro"}!`);
    other.gateway.broadcastGesture("perkUp");
    return this.noted(me, { verb: "call", name: other.name }, "done",
      `L'ho chiamato: ${other.name} ha drizzato le orecchie ${other.where !== undefined ? `in ${other.where}` : "dov'è"}.`);
  }

  /**
   * «Vai a dormire» (terzo verbo).
   *
   * Solo verso il sonno: svegliarlo a comando sarebbe un interruttore, e a
   * svegliarlo basta farsi vedere — `face_seen` lo fa già, con tanto di
   * saluto. Reversibile e visibile, come chiede ADR-064 §5.
   *
   * Senza un corpo acceso non c'è niente da mandare a dormire, e lo dice: un
   * «va bene, dormo» a schermi spenti sarebbe una bugia gentile.
   */
  private async sleep(me: GosinoRuntime): Promise<string> {
    if (!me.gateway.hasBody()) {
      return this.noted(me, { verb: "sleep" }, "no_body",
        "Non ho un corpo acceso in questo momento: sono già al buio, grunf.");
    }
    if (!me.gateway.nudgeToSleep()) {
      return this.noted(me, { verb: "sleep" }, "already", "Sto già dormendo... grunf.");
    }
    return this.noted(me, { verb: "sleep" }, "done", "Va bene. Buonanotte, grunf...");
  }

  /**
   * «Vieni qui» (quarto verbo), e **non indovina**.
   *
   * Un messaggio di chat non porta con sé la stanza da cui è stato scritto:
   * «qui» è la sola parola della lingua che questo sistema non può risolvere.
   * Le strade erano due — tirare a indovinare con la stanza più probabile, o
   * chiedere — e vale la stessa regola del pannello: un'azione che riguarda un
   * posto chiede **quale** posto, invece di prendere un default e sperare.
   *
   * Elenca le stanze che conosce, così la risposta insegna la forma che
   * funziona («vai in cucina») invece di lasciare l'utente a indovinarla.
   */
  private async come(me: GosinoRuntime): Promise<string> {
    const rooms = await new RoomCatalogue(this.deps.dbFor(me.accountId)).list(me.accountId);
    const known = rooms
      .map((entry) => entry.room)
      .filter((room) => room.toLowerCase() !== (me.where ?? "").toLowerCase());
    const list = known.length === 0 ? "" : ` Le stanze che conosco sono: ${known.join(", ")}.`;
    return this.noted(me, { verb: "come" }, "which_room",
      `Vengo volentieri, ma da qui non so in che stanza sei: dimmi «vai in ...».${list}`);
  }

  /** ogni spinta lascia una riga nel registro: verbi ed esiti, mai contenuti */
  private async noted(me: GosinoRuntime, nudge: Nudge, outcome: string, reply: string): Promise<string> {
    await this.deps.dbFor(me.accountId).insert(events).values({
      source: "system",
      type: "nudge",
      payload: { verb: nudge.verb, outcome },
      gosinoId: me.id,
    });
    return reply;
  }
}
