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
  | { verb: "call"; name: string };

/** le forme: chiuse, in italiano, coi rafforzativi tollerati */
const GO_FORM =
  /^(?:ugo[,!]?\s+)?(?:vai|va'|spostati)\s+(?:in|nel|nella|nello|al|alla|allo|a)\s+(.{2,40}?)\s*[.!]*$/i;
const CALL_FORM = /^(?:ugo[,!]?\s+)?chiama\s+([\p{L}][\p{L} '’-]{1,39}?)\s*[.!]*$/iu;

export function nudgeOf(text: string): Nudge | undefined {
  const go = GO_FORM.exec(text.trim());
  if (go?.[1] !== undefined) return { verb: "go", room: go[1].trim() };
  const call = CALL_FORM.exec(text.trim());
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
  db: DbClient;
  /** il registro nasce DOPO questo servizio: si legge al momento del gesto */
  registry: () => GosinoRegistry | undefined;
}

export class NudgeService {
  private readonly rooms: RoomCatalogue;

  public constructor(private readonly deps: NudgeDeps) {
    this.rooms = new RoomCatalogue(deps.db);
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
    const room = await this.rooms.named(me.accountId, asked);
    if (room === undefined) {
      return this.noted(me, { verb: "go", room: asked }, "unknown_room",
        `Non conosco una stanza che si chiama «${asked}». Grunf.`);
    }
    if (me.where?.toLowerCase() === room.toLowerCase()) {
      return this.noted(me, { verb: "go", room }, "already_there",
        `Ma sono già qui, in ${room}! Grunf.`);
    }

    await this.deps.db
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

  /** ogni spinta lascia una riga nel registro: verbi ed esiti, mai contenuti */
  private async noted(me: GosinoRuntime, nudge: Nudge, outcome: string, reply: string): Promise<string> {
    await this.deps.db.insert(events).values({
      source: "system",
      type: "nudge",
      payload: { verb: nudge.verb, outcome },
      gosinoId: me.id,
    });
    return reply;
  }
}
