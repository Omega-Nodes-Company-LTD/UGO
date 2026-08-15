import type * as THREE from "three";
import type { FaceState } from "@ugo/shared/face";
import { PROP_NATURE, type PropKind } from "@ugo/shared/props";
import { attentionOf } from "./attention.js";
import { Autonomy } from "./autonomy.js";
import { POSTURE_IT, type Posture } from "./channels.js";
import { GesturePlayer } from "./gestures.js";
import { DEFAULT_TRAITS, Pig, type Traits } from "./pig.js";
import { NEUTRAL_VARS, type PsycheVars, computePose } from "./pose.js";
import { PostureMixer, choosePosture } from "./posture.js";
import { ACTIVITY_IT, Wanderer } from "./wander.js";

/**
 * One creature in the room (ADR-036).
 *
 * Everything that used to sit on the renderer as "the" pig's state — mood,
 * gaze, blink timer, gesture player, wandering, posture — belongs here, once
 * per inhabitant. The renderer keeps only what the ROOM has: the scene, the
 * lights, the camera and the clock.
 *
 * Without this split a second gosino in the kitchen would have shared the
 * first one's blink and posture: two bodies moving as one, which is precisely
 * the failure ADR-032 spent a day removing from the soul.
 */

/** Un arredo dove sta, in coordinate di **stanza**. */
export interface RoomProp {
  id: string;
  kind: PropKind;
  x: number;
  z: number;
}

const GLANCE_EVERY_MS = 4200;
const GLANCE_SPREAD_MS = 3500;
const GLANCE_LASTS_MS = 700;
/**
 * L'occhiata spontanea, che adesso **si somma** allo sguardo vero invece di
 * sostituirlo.
 *
 * Sostituendolo era ±0.7 per 700 ms ogni 4-8 s: da tre a sette volte il
 * segnale, cioè quel che si vedeva muoversi non eri tu. Ma un occhio saldato al
 * bersaglio legge come uno sguardo fisso, quindi il rumore serve — serve
 * piccolo, e sopra e non al posto.
 */
const GLANCE_X = 0.34;
const GLANCE_Y = 0.2;
/** Quanto resta dell'occhiata quando ti sta guardando davvero. */
const GLANCE_WHILE_HELD = 0.4;
/** Stati in cui l'attenzione è su di te: lì l'occhiata si fa piccola. */
const ATTENDS_IN: readonly FaceState[] = ["listening", "alert", "talking"];

export class Inhabitant {
  public readonly pig: Pig;
  private readonly player = new GesturePlayer();
  private readonly autonomy: Autonomy;
  private readonly wanderer = new Wanderer();
  private readonly postures = new PostureMixer();

  private state: FaceState = "idle";
  private vars: PsycheVars = { ...NEUTRAL_VARS };
  private label = "";
  /** `null` = non c'è nessuno da guardare, ed è un'informazione, non un vuoto */
  private gaze: { x: number; y: number } | null = null;
  private eased = { x: 0, y: 0 };
  /** l'occhiata spontanea, smorzata a parte da ciò che sta davvero guardando */
  private wander = { x: 0, y: 0 };
  /** quanto qualcosa gli tiene lo sguardo adesso, smorzato nel tempo */
  private held = 0;
  private glance = { x: 0, y: 0 };
  private glanceUntil = 0;
  private nextGlanceAt = 0;
  private blinkUntil = 0;
  private nextBlinkAt = 0;
  private wandering: boolean;
  private forced: Posture | undefined;

  private activity = "fermo";
  private posture = "in piedi";
  /** where in the room he walks: his own slice of it, so nobody overlaps */
  private lane = 0;
  private here = { x: 0, z: 0 };
  /** gli arredi della stanza, in coordinate di stanza */
  private props: readonly RoomProp[] = [];
  /**
   * Chi sapere che è andato sul cuscino.
   *
   * Va all'anima perché la psiche è là, e la decisione è **qui**: il corpo
   * sceglie da solo di avvicinarsi (ADR-026 §6, zero token), quindi è l'unico
   * che possa dire che è successo.
   */
  private onUsedProp: ((kind: PropKind) => void) | undefined;

  public constructor(
    public readonly id: string,
    public readonly name: string,
    traits: Partial<Traits> | undefined,
    wander: boolean,
  ) {
    // merged, never replaced: a genome missing one dial would otherwise size
    // a limb from `undefined` and render a creature with no body — a shadow
    // on the floor and nothing standing on it, which is the worst way for a
    // body to fail because it looks like the socket died
    this.pig = new Pig({ ...DEFAULT_TRAITS, ...traits });
    this.autonomy = new Autonomy(this.player);
    this.wandering = wander;
    const now = performance.now();
    // staggered, or a room full of them would blink in unison like a chorus
    this.nextGlanceAt = now + GLANCE_EVERY_MS * Math.random();
    this.nextBlinkAt = now + 1500 + Math.random() * 3000;
  }

  public get object(): THREE.Object3D {
    return this.pig.object;
  }

  /** Where he is standing, for a camera that has to hold everybody. */
  public get position(): { x: number; z: number } {
    return this.here;
  }

  public get busy(): boolean {
    return (
      this.state === "talking" ||
      this.state === "listening" ||
      this.player.busy ||
      this.wanderer.moving ||
      this.postures.settling
    );
  }

  /** His slice of the floor: centre, and how far he may roam from it. */
  public setLane(centre: number, radiusX: number, radiusZ: number): void {
    this.lane = centre;
    this.wanderer.setPen(radiusX, radiusZ);
    this.retarget();
  }

  /**
   * Gli arredi della stanza (ADR-051), in coordinate di stanza.
   *
   * La conversione sta qui e non nel `Wanderer` perché è qui che si sa qual è
   * la corsia: il vagabondo lavora attorno al proprio centro, e un cuscino
   * passato in coordinate di stanza a una creatura sulla destra le sembrerebbe
   * spostato di tutta la larghezza della sua corsia.
   */
  public setProps(props: readonly RoomProp[]): void {
    this.props = props;
    this.retarget();
  }

  private retarget(): void {
    this.wanderer.setAttractions(
      this.props.map((prop) => ({
        id: prop.id,
        kind: prop.kind,
        x: prop.x - this.lane,
        z: prop.z,
      })),
    );
  }

  public setState(state: FaceState): void {
    if (state === this.state) return;
    // waking up is worth a gesture: he does not just pop his eyes open
    if (this.state === "sleeping" && state !== "sleeping") {
      this.autonomy.reflex("wake", performance.now());
    }
    this.state = state;
  }

  public setMood(label: string, vars: Partial<PsycheVars>): void {
    this.label = label;
    this.vars = { ...this.vars, ...vars };
  }

  /**
   * Dove guardare, o `null` quando non c'è più nessuno.
   *
   * `null` arrivava già da `startCameraGaze` e veniva buttato via da `main.ts`
   * (`if (target !== null)`): uscivi dal campo e le pupille restavano
   * congelate dove eri l'ultima volta, che è il modo in cui uno sguardo vivo
   * diventa un manichino con gli occhi storti.
   */
  public setGaze(target: { x: number; y: number } | null): void {
    this.gaze = target;
  }

  public setWandering(on: boolean): void {
    this.wandering = on;
  }

  public forcePosture(posture: Posture | undefined): void {
    this.forced = posture;
  }

  /** ADR-051: chiamare quando è andato da solo a usare qualcosa. */
  public reportUsedProp(listener: (kind: PropKind) => void): void {
    this.onUsedProp = listener;
  }

  public reflex(kind: string): void {
    this.autonomy.reflex(kind, performance.now());
  }

  public dispose(): void {
    this.pig.dispose();
  }

  public debug(): Record<string, string> {
    return {
      state: this.state,
      posture: this.posture,
      activity: this.activity,
      mood: this.label,
      gesture: this.player.currentId ?? "",
      lastGesture: this.player.lastPlayed ?? "",
    };
  }

  /** One tick of this creature: the three layers, stacked. */
  public step(now: number): void {
    // the gaze arrives late, and now and then wanders off on its own: a pupil
    // welded to the target reads as a stare, not as attention
    if (now > this.glanceUntil && now > this.nextGlanceAt) {
      this.glanceUntil = now + GLANCE_LASTS_MS;
      this.nextGlanceAt = now + GLANCE_EVERY_MS + Math.random() * GLANCE_SPREAD_MS;
      const damp = ATTENDS_IN.includes(this.state) ? GLANCE_WHILE_HELD : 1;
      this.glance = {
        x: (Math.random() - 0.5) * 2 * GLANCE_X * damp,
        y: (Math.random() - 0.5) * 2 * GLANCE_Y * damp,
      };
    }
    // i due si smorzano **separati**, o l'occhiata finirebbe dentro la
    // coordinata che poi va convertita nel sistema del corpo: sommarla prima
    // vorrebbe dire ruotare anche il rumore
    const at = this.gaze ?? { x: 0, y: 0 };
    this.eased.x += (at.x - this.eased.x) * 0.12;
    this.eased.y += (at.y - this.eased.y) * 0.12;
    const wanted = now < this.glanceUntil ? this.glance : { x: 0, y: 0 };
    this.wander.x += (wanted.x - this.wander.x) * 0.12;
    this.wander.y += (wanted.y - this.wander.y) * 0.12;
    // sale in fretta e scende piano: perdere di vista qualcuno per un
    // fotogramma non deve far ripartire la deriva da noia
    this.held += ((this.gaze === null ? 0 : 1) - this.held) * (this.gaze === null ? 0.02 : 0.15);

    if (now > this.nextBlinkAt) {
      this.blinkUntil = now + 130;
      this.nextBlinkAt = now + 2500 + Math.random() * 3200;
    }

    const weights = this.postures.step(now);
    const loco = this.wanderer.step(
      now,
      this.state,
      this.vars.noia,
      this.vars.energia,
      weights.standing,
      this.wandering,
      // ADR-051: lo stress è la seconda spinta che lo muove verso un arredo, e
      // l'unica che vince sulla noia — un maiale spaventato non va a grufolare,
      // va dietro il cespuglio
      this.vars.stress,
    );
    // ADR-051: l'arredo presso cui si trova tira su due leve che esistono già —
    // la posa e il peso dei gesti — invece di aggiungere un motore suo. Un
    // cuscino gli fa venire voglia di coricarsi, l'erba di grufolare, e sono le
    // stesse due leve che noia ed energia muovono da sempre.
    const nature = loco.beside === undefined ? undefined : PROP_NATURE[loco.beside.kind];
    const pose =
      this.forced ??
      choosePosture(this.state, this.vars, this.wanderer.wantsToMove, this.postures.current, {
        ...(nature?.posture !== undefined && { beside: nature.posture }),
      });
    this.postures.set(pose, now);
    this.autonomy.tick(now, this.state, this.vars, this.postures.current, nature?.tag);

    if (loco.reached !== undefined) this.onUsedProp?.(loco.reached.kind);

    this.activity = ACTIVITY_IT[loco.activity];
    this.posture = POSTURE_IT[this.postures.current];
    this.here = { x: this.lane + loco.x, z: loco.z };
    this.pig.object.position.set(this.here.x, 0, this.here.z);
    this.pig.object.rotation.y = loco.heading;

    // la conversione che mancava: il collo è figlio del corpo, quindi «a destra
    // dello schermo» va tolto di quanto il corpo è già girato, o guarda a
    // destra del muso — cioè da tutt'altra parte (`attention.ts`)
    const attention = attentionOf(this.gaze === null ? null : this.eased.x, loco.heading);
    this.pig.apply(
      computePose({
        state: this.state,
        vars: this.vars,
        posture: weights,
        gaze: {
          x: (attention.sees ? attention.pupil : 0) + this.wander.x,
          y: this.eased.y + this.wander.y,
          yaw: attention.yaw,
          hold: attention.sees ? this.held : 0,
        },
        tMs: now,
        blink: now < this.blinkUntil ? 1 : 0,
        locomotion: loco,
        gesture: this.player.sample(now),
      }),
    );
  }
}
