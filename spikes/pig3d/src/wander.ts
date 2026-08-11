/**
 * Il vagabondaggio: quando è in `idle` e la noia sale, il porcetto non resta
 * inchiodato al centro. Gira, si ferma, mette il grugno a terra e grufola.
 *
 * Questo NON è puro: ha una posizione, una direzione e un piccolo orologio.
 * È il driver del movimento, esattamente come `GesturePlayer` è il driver dei
 * gesti — la funzione pura (`computePose`) riceve solo il risultato.
 */

export type Activity = "fermo" | "cammina" | "grufola";

export interface Locomotion {
  /** 0 fermo .. 1 passo pieno */
  walk: number;
  /** fase del passo, in radianti */
  phase: number;
  /** 0..1 quanto ha il grugno a terra */
  root: number;
}

export interface WanderOutput extends Locomotion {
  x: number;
  z: number;
  /** direzione in cui è girato, rad */
  heading: number;
  activity: Activity;
}

/** Il recinto: oltre questo non va, o esce dall'inquadratura. */
const RADIUS_X = 1.5;
const RADIUS_Z = 0.9;
const SPEED = 0.85; // unità/secondo a passo pieno
const TURN_RATE = 2.2; // rad/secondo

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class Wanderer {
  private x = 0;
  private z = 0;
  private heading = 0;
  private target = 0; // direzione desiderata
  private activity: Activity = "fermo";
  private until = 0;
  private walkAmount = 0;
  private rootAmount = 0;
  private phase = 0;
  private lastNow = 0;

  /**
   * @param now        millisecondi monotoni
   * @param idle       vero solo quando il corpo non ha di meglio da fare
   * @param noia       [0,1]: più è annoiato, meno sta fermo
   * @param energia    [0,1]: se è a terra, si muove poco anche se annoiato
   */
  public step(now: number, idle: boolean, noia: number, energia: number): WanderOutput {
    const dt = this.lastNow === 0 ? 0 : Math.min((now - this.lastNow) / 1000, 0.1);
    this.lastNow = now;

    if (!idle) {
      // qualcuno gli parla: si ferma e si rigira verso di noi
      this.activity = "fermo";
      this.until = 0;
      this.walkAmount += (0 - this.walkAmount) * Math.min(dt * 5, 1);
      this.rootAmount += (0 - this.rootAmount) * Math.min(dt * 5, 1);
      this.heading += wrapAngle(0 - this.heading) * Math.min(dt * 2.5, 1);
      return this.output();
    }

    if (now > this.until) this.pickNext(now, noia, energia);

    // sterzata verso la direzione desiderata
    const delta = wrapAngle(this.target - this.heading);
    const turn = Math.min(Math.abs(delta), TURN_RATE * dt) * Math.sign(delta);
    this.heading = wrapAngle(this.heading + turn);

    // il passo parte solo quando è quasi allineato: non cammina di sbieco
    const aligned = Math.abs(delta) < 0.35 ? 1 : 0;
    const wants = this.activity === "cammina" ? aligned : 0;
    this.walkAmount += (wants - this.walkAmount) * Math.min(dt * 4, 1);
    this.rootAmount +=
      ((this.activity === "grufola" ? 1 : 0) - this.rootAmount) * Math.min(dt * 4, 1);

    const speed = SPEED * this.walkAmount * (0.6 + energia * 0.4);
    this.x += Math.sin(this.heading) * speed * dt;
    this.z += Math.cos(this.heading) * speed * dt;
    this.phase += speed * 7 * dt;

    // fuori dal recinto: si rimette dentro invece di sparire di lato
    if ((this.x / RADIUS_X) ** 2 + (this.z / RADIUS_Z) ** 2 > 1) {
      this.target = Math.atan2(-this.x, -this.z);
      this.activity = "cammina";
      this.until = now + 1400;
    }

    return this.output();
  }

  private pickNext(now: number, noia: number, energia: number): void {
    const restless = Math.min(noia * 0.7 + energia * 0.5, 1);
    const roll = Math.random();
    if (this.activity === "cammina") {
      // dopo aver camminato, quasi sempre annusa dove è arrivato
      this.activity = roll < 0.7 ? "grufola" : "fermo";
      this.until = now + (this.activity === "grufola" ? 1600 + Math.random() * 2200 : 1500);
      return;
    }
    if (roll < restless * 0.75) {
      this.activity = "cammina";
      this.target = wrapAngle(this.heading + (Math.random() - 0.5) * 2.4);
      this.until = now + 1200 + Math.random() * 2600;
      return;
    }
    this.activity = roll < restless * 0.9 ? "grufola" : "fermo";
    this.until = now + 1800 + Math.random() * 3000 * (1 - restless);
  }

  /** vero quando c'è del movimento in corso: la modalità portable lo rispetta */
  public get moving(): boolean {
    return this.walkAmount > 0.02 || this.rootAmount > 0.02;
  }

  private output(): WanderOutput {
    return {
      x: this.x,
      z: this.z,
      heading: this.heading,
      walk: this.walkAmount,
      phase: this.phase,
      root: this.rootAmount,
      activity: this.activity,
    };
  }
}
