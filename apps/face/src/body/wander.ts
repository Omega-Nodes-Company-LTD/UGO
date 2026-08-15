import type { FaceState } from "@ugo/shared/face";
import { PROP_NATURE, type PropKind } from "@ugo/shared/props";
import type { Locomotion } from "./pose.js";

/**
 * Wandering: UGO is not bolted to the middle of the screen.
 *
 * He walks, stops, puts his snout down and roots around. The urge comes out of
 * `noia` and `energia` — it is not a clip being replayed on a timer.
 *
 * Not pure: it owns a position, a heading and a little clock. That is exactly
 * why it is separate from `computePose`, which stays testable.
 */

export type Activity = "still" | "walking" | "rooting";

export const ACTIVITY_IT: Readonly<Record<Activity, string>> = {
  still: "fermo",
  walking: "cammina",
  rooting: "grufola",
};

export interface WanderOutput extends Locomotion {
  x: number;
  z: number;
  heading: number;
  activity: Activity;
  /**
   * L'arredo a cui è appena arrivato, **solo nel fotogramma dell'arrivo**
   * (ADR-051). Un campo «dove sta adesso» sarebbe vero per migliaia di
   * fotogrammi di fila, e chi lo legge dovrebbe inventarsi il fronte di salita:
   * quel calcolo sta qui una volta invece che in ogni chiamante.
   */
  reached?: { id: string; kind: PropKind };
  /** L'arredo presso cui si trova, per la posa e per i gesti. */
  beside?: { id: string; kind: PropKind };
}

/** Un arredo come lo vede il corpo: dove sta, e se ci si può passare sopra. */
export interface Attraction {
  id: string;
  kind: PropKind;
  /** in unità di scena, **relative alla corsia** di questa creatura */
  x: number;
  z: number;
}

/**
 * The pen. Widened together with the camera pull-back (ADR-028): the point of
 * wandering is that there is somewhere to wander to, and at the old radius he
 * crossed his whole world in four steps.
 */
const DEFAULT_RADIUS_X = 3.4;
const DEFAULT_RADIUS_Z = 1.7;
const SPEED = 0.85; // units/second at full stride
const TURN_RATE = 2.2; // rad/second

/**
 * States where wandering is allowed. Being spoken to (`listening`) or startled
 * (`alert`) means the attention is on you — he stops and turns back. Thinking
 * and talking do NOT stop him: pacing while you think is what animals do.
 */
const ROAMS_IN: readonly FaceState[] = ["idle", "thinking", "talking"];

/**
 * Stati in cui l'attenzione è su di te — e in cui **parlava dandoti le spalle**.
 *
 * L'unica riga che riportava `heading` verso di te stava dentro il ramo
 * `if (!allowed)`, che mentre parla non viene mai eseguito; nel frattempo
 * `pickNext` accumulava ±1.2 rad per decisione, fino a π. ADR-026 §6 dice che
 * vagabondare mentre parla è voluto, quindi `talking` **resta** in `ROAMS_IN`:
 * si aggiunge un asse ortogonale, che limita il **bersaglio** e non
 * l'orientamento.
 *
 * Un cono e non un blocco a 0: inchiodarlo a zero si legge come uno sguardo
 * fisso, ed è il modo in cui questa correzione diventerebbe fastidiosa.
 *
 * E non si calcola il rilevamento vero della camera rispetto al maiale: la
 * parallasse massima è ~13°, ben dentro il cono, e portare la camera fino al
 * `Wanderer` per 13° è complessità che non paga.
 */
const FACES_YOU: readonly FaceState[] = ["talking", "listening", "alert"];

/** Mezzo cono, in radianti (~52°): oltre, la spalla comincia a coprire il muso. */
export const FACE_YOU_CONE = 0.9;

/**
 * Quanto si smorza la voglia di camminare mentre ti parla.
 *
 * Il cono da solo non basterebbe: dentro un cono di ±52° attorno alla camera
 * ogni direzione ha una componente verso di te, quindi camminando finirebbe
 * sempre appoggiato al bordo vicino del recinto. Frenandolo, mentre parla si
 * gira e grufola sul posto più di quanto attraversi la stanza — che è anche
 * ciò che fa un animale che ti sta dicendo qualcosa.
 */
const RESTLESS_WHILE_FACING = 0.45;

/**
 * Sopra questa noia, un arredo diventa più interessante di una direzione a
 * caso (ADR-051).
 *
 * Una soglia e non una probabilità: sotto, gli arredi non esistono e la stanza
 * si comporta come si è sempre comportata. Sopra, sono l'unica cosa che
 * attira. In mezzo non c'è niente da tarare, ed è il punto — una stanza che
 * diventa un metronomo, con la creatura che rimbalza fra cuscino e truogolo, è
 * il modo in cui questa cosa smette di sembrare viva.
 */
const BORED_ENOUGH = 0.6;

/** Quanto largo è il maiale, per i fini delle collisioni. */
const BODY_HALF = 0.85;

/** Quanto si aspetta prima di lasciarsi attirare di nuovo dallo stesso arredo. */
const PROP_COOLDOWN_MS = 45_000;

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class Wanderer {
  private x = 0;
  private z = 0;
  private heading = 0;
  private target = 0;
  private activity: Activity = "still";
  private until = 0;
  private walkAmount = 0;
  private rootAmount = 0;
  private phase = 0;
  /** undefined, not 0: zero is a legitimate `performance.now()` reading, and
   *  using it as the "never ran" sentinel left the first step with dt = 0 for
   *  ever after. Found by the cross-fade test, not by review. */
  private lastNow: number | undefined;
  private grounded = false;
  private radiusX = DEFAULT_RADIUS_X;
  private radiusZ = DEFAULT_RADIUS_Z;
  /** true finché sta rientrando dal bordo: il recinto batte il cono */
  private returning = false;
  private attractions: readonly Attraction[] = [];
  /** verso quale arredo sta andando, se ci sta andando */
  private heading_to: Attraction | undefined;
  /** quando ognuno tornerà interessante: senza, ci si incolla sopra */
  private readonly usedAt = new Map<string, number>();
  private reached: { id: string; kind: PropKind } | undefined;
  /** l'ultima noia vista: `somethingToDo` la legge senza che gliela si passi */
  private noiaNow = 0;
  /** quanto può allontanarsi dal guardarti, o `undefined` se è libero */
  private cone: number | undefined;

  /**
   * @param rng da dove escono le sue decisioni. Iniettabile per una ragione
   *            sola: senza, «da spalle voltate si gira entro due secondi» non
   *            è un test ma una moneta lanciata in aria (precedente:
   *            `forFrame(text, senders, roll?)` in `faceWs.ts`).
   */
  public constructor(private readonly rng: () => number = Math.random) {}

  /** The renderer sizes the pen to the frame: a bigger view is a bigger world. */
  public setPen(radiusX: number, radiusZ: number): void {
    this.radiusX = radiusX;
    this.radiusZ = radiusZ;
  }

  /**
   * Cosa c'è nella stanza (ADR-051): dei richiami, e degli ostacoli.
   *
   * L'oggetto verso cui stava andando si ritrova per id e non per riferimento:
   * il pannello sostituisce la lista intera a ogni modifica, quindi il vecchio
   * riferimento resterebbe valido puntando a un arredo che non c'è più — e lui
   * continuerebbe a camminare verso un punto vuoto.
   */
  public setAttractions(attractions: readonly Attraction[]): void {
    this.attractions = attractions;
    if (this.heading_to !== undefined) {
      this.heading_to = attractions.find((a) => a.id === this.heading_to?.id);
      if (this.heading_to === undefined && this.activity === "walking") this.activity = "still";
    }
  }

  /** True while something is actually moving — portable mode respects it. */
  public get moving(): boolean {
    return this.walkAmount > 0.02 || this.rootAmount > 0.02;
  }

  /** True when he would like to be on his feet: the posture driver asks this. */
  public get wantsToMove(): boolean {
    return this.activity !== "still";
  }

  /**
   * @param standing how much of him is actually upright, from the posture mix;
   *                 sitting or lying he cannot walk, and the gait fades out
   */
  public step(
    now: number,
    state: FaceState,
    noia: number,
    energia: number,
    standing: number,
    enabled: boolean,
  ): WanderOutput {
    const dt = this.lastNow === undefined ? 0 : Math.min((now - this.lastNow) / 1000, 0.1);
    this.lastNow = now;
    const allowed = enabled && ROAMS_IN.includes(state);

    if (!allowed) {
      // someone is talking to him: stop, and turn back to face them
      this.activity = "still";
      this.until = 0;
      this.walkAmount += (0 - this.walkAmount) * Math.min(dt * 5, 1);
      this.rootAmount += (0 - this.rootAmount) * Math.min(dt * 5, 1);
      this.heading += wrapAngle(0 - this.heading) * Math.min(dt * 2.5, 1);
      return this.output();
    }

    // dentro il recinto non sta più rientrando, e il cono torna a valere
    if (this.returning && (this.x / this.radiusX) ** 2 + (this.z / this.radiusZ) ** 2 < 0.7) {
      this.returning = false;
    }
    this.cone = FACES_YOU.includes(state) && !this.returning ? FACE_YOU_CONE : undefined;
    // qui e in `pickNext`, e servono entrambi: da solo, il secondo non recupera
    // il caso vero — vagabonda in `idle`, arriva a π, e *poi* comincia a parlare
    this.target = this.inCone(this.target);

    this.reached = undefined;
    if (now > this.until) this.pickNext(now, noia, energia);

    // mentre ci va, lo insegue: un bersaglio fissato una volta sola manderebbe
    // fuori strada chiunque venga deviato da un ostacolo lungo la via
    if (this.heading_to !== undefined) {
      this.target = Math.atan2(this.heading_to.x - this.x, this.heading_to.z - this.z);
      if (this.arrivedAt(this.heading_to)) {
        this.reached = { id: this.heading_to.id, kind: this.heading_to.kind };
        this.usedAt.set(this.heading_to.id, now);
        // grufola o si accuccia lì: che cosa faccia esattamente lo decidono i
        // gesti e la posa, che leggono `beside`
        this.activity = "rooting";
        this.until = now + 2600 + this.rng() * 3200;
        this.heading_to = undefined;
      }
    }

    const delta = wrapAngle(this.target - this.heading);
    this.heading = wrapAngle(
      this.heading + Math.min(Math.abs(delta), TURN_RATE * dt) * Math.sign(delta),
    );

    // he only steps off once he is roughly aligned, and only on his feet
    const aligned = Math.abs(delta) < 0.35 ? 1 : 0;
    const wants = this.activity === "walking" ? aligned * standing : 0;
    this.walkAmount += (wants - this.walkAmount) * Math.min(dt * 4, 1);
    this.rootAmount +=
      ((this.activity === "rooting" ? 1 : 0) - this.rootAmount) * Math.min(dt * 4, 1);

    const speed = SPEED * this.walkAmount * (0.6 + energia * 0.4);
    this.x += Math.sin(this.heading) * speed * dt;
    this.z += Math.cos(this.heading) * speed * dt;
    this.phase += speed * 7 * dt;

    // gli oggetti solidi lo respingono, e se ci va a sbattere gira di lato
    if (this.pushOutOfSolids() && this.activity === "walking" && this.heading_to === undefined) {
      this.target = this.inCone(wrapAngle(this.heading + (this.rng() < 0.5 ? -1 : 1) * 1.1));
    }

    if ((this.x / this.radiusX) ** 2 + (this.z / this.radiusZ) ** 2 > 1) {
      // il recinto vince sul cono, e va detto: la via di casa può essere alle
      // sue spalle, e un cono applicato anche qui lo lascerebbe arenato contro
      // il bordo a spingere — che sembra rotto molto più di una gironzolata
      this.target = Math.atan2(-this.x, -this.z);
      this.returning = true;
      this.activity = "walking";
      this.until = now + 1400;
    }

    return this.output();
  }

  /**
   * Le collisioni, che sono tre righe di geometria e una decisione.
   *
   * La decisione è che un arredo **solido non si attraversa**: un cespuglio in
   * mezzo alla stanza che il maiale trapassa non è un cespuglio, è un disegno.
   * Non è però un aggiramento intelligente — non c'è un pianificatore di
   * percorso e non deve esserci: viene respinto e rimbalza di lato, che è
   * quello che fa un animale che sbatte contro qualcosa senza guardare.
   *
   * Chi ci sta *andando* apposta non viene respinto via dal proprio bersaglio,
   * o non ci arriverebbe mai: il fermo lo dà comunque il raggio dell'oggetto.
   */
  private pushOutOfSolids(): boolean {
    let bumped = false;
    for (const prop of this.attractions) {
      const nature = PROP_NATURE[prop.kind];
      if (!nature.solid) continue;
      const dx = this.x - prop.x;
      const dz = this.z - prop.z;
      const distance = Math.hypot(dx, dz);
      const keep = nature.radius + BODY_HALF;
      if (distance >= keep) continue;
      // esattamente sopra: lo si sposta in una direzione qualunque ma stabile,
      // o una divisione per zero lo manderebbe a NaN e il corpo sparirebbe
      if (distance < 1e-4) {
        this.x = prop.x + keep;
        bumped = true;
        continue;
      }
      this.x = prop.x + (dx / distance) * keep;
      this.z = prop.z + (dz / distance) * keep;
      bumped = true;
    }
    return bumped;
  }

  /** Ci è arrivato: dentro il raggio dell'oggetto più mezzo corpo. */
  private arrivedAt(prop: Attraction): boolean {
    const reach = PROP_NATURE[prop.kind].radius + BODY_HALF + 0.15;
    return Math.hypot(this.x - prop.x, this.z - prop.z) <= reach;
  }

  /** Il bersaglio, riportato dentro il cono quando ce n'è uno. */
  private inCone(target: number): number {
    if (this.cone === undefined) return target;
    const wrapped = wrapAngle(target);
    return Math.max(-this.cone, Math.min(this.cone, wrapped));
  }

  /**
   * Che cosa gli va di fare, se gli va di fare qualcosa.
   *
   * `undefined` sotto la soglia di noia, o quando ha appena usato tutto ciò che
   * c'è: il raffreddamento per **oggetto** è ciò che gli impedisce di
   * incollarsi al cuscino, e la soglia è ciò che impedisce alla stanza di
   * diventare un metronomo. Sceglie il più vicino fra quelli disponibili, non a
   * caso: un maiale annoiato non attraversa la stanza per il secondo cuscino.
   */
  private somethingToDo(now: number): Attraction | undefined {
    if (this.noiaNow < BORED_ENOUGH || this.attractions.length === 0) return undefined;
    let best: Attraction | undefined;
    let bestDistance = Infinity;
    for (const prop of this.attractions) {
      const used = this.usedAt.get(prop.id);
      if (used !== undefined && now - used < PROP_COOLDOWN_MS) continue;
      const distance = Math.hypot(prop.x - this.x, prop.z - this.z);
      if (distance >= bestDistance) continue;
      best = prop;
      bestDistance = distance;
    }
    return best;
  }

  private pickNext(now: number, noia: number, energia: number): void {
    this.noiaNow = noia;
    const facing = this.cone !== undefined;
    const restless =
      Math.min(noia * 0.7 + energia * 0.5, 1) * (facing ? RESTLESS_WHILE_FACING : 1);
    const roll = this.rng();
    if (this.activity === "walking") {
      // having arrived somewhere, he almost always sniffs at it
      this.activity = roll < 0.7 ? "rooting" : "still";
      this.until = now + (this.activity === "rooting" ? 1600 + this.rng() * 2200 : 1500);
      return;
    }
    if (roll < restless * 0.75) {
      this.activity = "walking";
      // ADR-051: annoiato, un arredo batte una direzione a caso. Solo qui, e
      // solo alla decisione: rivalutarlo a ogni fotogramma lo farebbe oscillare
      // fra due oggetti equidistanti senza arrivare a nessuno dei due.
      const wanted = this.cone === undefined ? this.somethingToDo(now) : undefined;
      if (wanted !== undefined) {
        this.heading_to = wanted;
        this.target = Math.atan2(wanted.x - this.x, wanted.z - this.z);
        this.until = now + 6000;
        return;
      }
      this.heading_to = undefined;
      this.target = this.inCone(wrapAngle(this.heading + (this.rng() - 0.5) * 2.4));
      this.until = now + 1200 + this.rng() * 2600;
      return;
    }
    this.activity = roll < restless * 0.9 ? "rooting" : "still";
    this.until = now + 1800 + this.rng() * 3000 * (1 - restless);
  }

  private output(): WanderOutput {
    this.grounded = true;
    const beside = this.besideWhat();
    return {
      x: this.x,
      z: this.z,
      heading: this.heading,
      walk: this.walkAmount,
      phase: this.phase,
      root: this.rootAmount,
      activity: this.activity,
      ...(this.reached !== undefined && { reached: this.reached }),
      ...(beside !== undefined && { beside }),
    };
  }

  /** Presso quale arredo si trova, se ce n'è uno a portata di muso. */
  private besideWhat(): { id: string; kind: PropKind } | undefined {
    for (const prop of this.attractions) {
      if (this.arrivedAt(prop)) return { id: prop.id, kind: prop.kind };
    }
    return undefined;
  }

  /** True once `step` has run at least once — used by the e2e hooks. */
  public get started(): boolean {
    return this.grounded;
  }
}
