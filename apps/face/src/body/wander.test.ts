import { describe, expect, it } from "vitest";
import type { FaceState } from "@ugo/shared/face";
import { FACE_YOU_CONE, Wanderer } from "./wander.js";

/**
 * «Lui parla dandomi il culo.»
 *
 * Non era vagabondaggio impazzito: `talking` sta in `ROAMS_IN` per decisione di
 * ADR-026 §6, e l'unica riga che riportava `heading` verso di te stava dentro
 * il ramo che mentre parla non viene mai eseguito. Nel frattempo `pickNext`
 * accumulava ±1.2 rad per decisione, senza un fermo: prima o poi arrivava a π,
 * e da lì non tornava indietro da solo.
 *
 * `Math.random` è iniettato perché altrimenti «si gira entro due secondi» non
 * è un test ma una moneta lanciata in aria.
 */

const FRAME = 16;

/** Fa girare l'orologio, e restituisce l'ultimo fotogramma. */
function run(
  w: Wanderer,
  state: FaceState,
  ms: number,
  start = 0,
): ReturnType<Wanderer["step"]> {
  let out = w.step(start, state, 0.6, 0.8, 1, true);
  for (let t = start + FRAME; t <= start + ms; t += FRAME) {
    out = w.step(t, state, 0.6, 0.8, 1, true);
  }
  return out;
}

/** Un dado prevedibile: la sequenza è finta, ma le decisioni sono vere. */
function dice(values: readonly number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0.5;
}

describe("Wanderer", () => {
  /** Il caso vero: vagabonda in `idle`, arriva alle spalle, *poi* parla. */
  it("turns back to you within two seconds of starting to talk", () => {
    // recinto largo: qui si prova il cono, e il rientro dal bordo ne è esente
    // apposta (prova sotto). Con un recinto stretto proveremmo quell'altro.
    const w = new Wanderer(dice([0.01, 0.99]));
    w.setPen(20, 20);
    // gira finché non ti dà davvero le spalle, invece di sperarci in un tempo
    // fisso: la deriva è cumulativa e si avvolge, quindi «dopo 12 secondi» non
    // vuol dire «girato di là»
    let at = 0;
    let away = w.step(at, "idle", 0.6, 0.8, 1, true);
    while (Math.abs(away.heading) < 2.5 && at < 120_000) {
      at += FRAME;
      away = w.step(at, "idle", 0.6, 0.8, 1, true);
    }
    expect(Math.abs(away.heading)).toBeGreaterThan(2.5);

    const talking = run(w, "talking", 2000, at);
    expect(Math.abs(talking.heading)).toBeLessThanOrEqual(FACE_YOU_CONE + 0.01);
  });

  /**
   * L'altra metà, o avremmo scambiato un difetto con l'altro: ADR-026 §6 dice
   * che camminare mentre parla è voluto. Una creatura inchiodata sul posto
   * mentre ti risponde è un difetto nuovo, non la correzione di uno vecchio.
   */
  it("keeps moving while it talks: it is not nailed to the floor", () => {
    const w = new Wanderer(dice([0.01, 0.4, 0.2, 0.9]));
    const out = run(w, "talking", 20_000);
    expect(Math.abs(out.x) + Math.abs(out.z)).toBeGreaterThan(0.05);
  });

  it("stays inside the cone for as long as it is talking", () => {
    const w = new Wanderer(dice([0.01, 0.3, 0.99, 0.05]));
    w.setPen(20, 20);
    for (let t = 0; t <= 30_000; t += FRAME) {
      const out = w.step(t, "talking", 0.9, 0.9, 1, true);
      expect(Math.abs(out.heading)).toBeLessThanOrEqual(FACE_YOU_CONE + 0.01);
    }
  });

  it("roams the whole circle when nobody is listening", () => {
    const w = new Wanderer(dice([0.01, 0.99]));
    const out = run(w, "idle", 20_000);
    expect(Math.abs(out.heading)).toBeGreaterThan(FACE_YOU_CONE);
  });

  /**
   * Il recinto batte il cono, e deve: la via di casa può essere alle sue
   * spalle, e un cono applicato anche al rientro lo lascerebbe a spingere
   * contro il bordo — che sembra rotto molto più di una gironzolata.
   */
  it("comes home from the fence even when home is behind it", () => {
    const w = new Wanderer(dice([0.01, 0.99]));
    w.setPen(0.35, 0.2);
    run(w, "talking", 40_000);
    for (let t = 40_000; t <= 90_000; t += FRAME) {
      const out = w.step(t, "talking", 0.9, 0.9, 1, true);
      expect((out.x / 0.35) ** 2 + (out.z / 0.2) ** 2).toBeLessThan(4);
    }
  });

  it("stops and squares up when it is being spoken to", () => {
    const w = new Wanderer(dice([0.01, 0.99]));
    run(w, "idle", 12_000);
    const listening = run(w, "listening", 3000, 12_000);
    expect(Math.abs(listening.heading)).toBeLessThan(0.2);
    expect(listening.activity).toBe("still");
  });
});

/**
 * Gli arredi (ADR-051): un richiamo, e un ostacolo.
 *
 * Le due cose vanno provate separate perché sono separate: un cuscino attira e
 * si può calpestare, un cespuglio non attira meno ma non si attraversa. Il
 * difetto che nascerebbe confondendole è un maiale che si incolla dentro un
 * oggetto solido, che è il modo in cui una collisione fatta male è peggio di
 * nessuna collisione.
 */
describe("Wanderer e gli arredi", () => {
  const CUSHION = { id: "c1", kind: "cushion" as const, x: 1.4, z: 0.6 };
  const BUSH = { id: "b1", kind: "bush" as const, x: 0.9, z: 0 };

  /** Sempre «cammina», così la decisione la prende ogni volta che può. */
  const eager = (): Wanderer => new Wanderer(dice([0.01, 0.5]));

  it("walks to the cushion when it is bored enough", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([CUSHION]);
    let closest = Infinity;
    let arrived = false;
    for (let t = 0; t <= 20_000; t += 16) {
      const out = w.step(t, "idle", 0.9, 0.8, 1, true);
      closest = Math.min(closest, Math.hypot(out.x - CUSHION.x, out.z - CUSHION.z));
      arrived ||= out.reached?.id === CUSHION.id;
    }
    expect(arrived).toBe(true);
    expect(closest).toBeLessThan(1.7);
    // e poi se ne riva per i fatti suoi: il richiamo è un richiamo, non una
    // calamita — un maiale che resta sul cuscino per sempre è un soprammobile
  });

  /**
   * La soglia è la cosa che impedisce alla stanza di diventare un metronomo:
   * sotto, gli arredi non esistono e lui si comporta come si è sempre
   * comportato.
   */
  it("ignores it entirely when it is not bored", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([CUSHION]);
    let reached = false;
    for (let t = 0; t <= 20_000; t += 16) {
      if (w.step(t, "idle", 0.2, 0.8, 1, true).reached !== undefined) reached = true;
    }
    expect(reached).toBe(false);
  });

  it("says it arrived exactly once, not on every frame after", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([CUSHION]);
    let arrivals = 0;
    for (let t = 0; t <= 40_000; t += 16) {
      if (w.step(t, "idle", 0.9, 0.8, 1, true).reached !== undefined) arrivals += 1;
    }
    // il raffreddamento è di 45 s, quindi in 40 s ci va una volta sola: senza,
    // un evento per fotogramma si porterebbe la noia a zero e ce la terrebbe
    expect(arrivals).toBe(1);
  });

  it("never walks through a solid one", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([BUSH]);
    for (let t = 0; t <= 30_000; t += 16) {
      const out = w.step(t, "idle", 0.9, 0.9, 1, true);
      // raggio del cespuglio (0.5) più mezzo corpo (0.85), con un filo di
      // tolleranza per il passo del fotogramma
      expect(Math.hypot(out.x - BUSH.x, out.z - BUSH.z)).toBeGreaterThan(1.3);
    }
  });

  /**
   * Il pannello sostituisce la lista intera a ogni modifica: se lui stesse
   * andando verso un cuscino appena tolto, senza questo continuerebbe a
   * camminare verso un punto vuoto per sempre.
   */
  it("gives up on a prop the owner has just taken away", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([CUSHION]);
    for (let t = 0; t <= 2000; t += 16) w.step(t, "idle", 0.9, 0.8, 1, true);
    w.setAttractions([]);
    let arrivals = 0;
    for (let t = 2000; t <= 20_000; t += 16) {
      if (w.step(t, "idle", 0.9, 0.8, 1, true).reached !== undefined) arrivals += 1;
    }
    expect(arrivals).toBe(0);
  });

  it("tells the body which prop it is standing beside, for the posture", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([CUSHION]);
    let beside: string | undefined;
    for (let t = 0; t <= 20_000; t += 16) {
      beside = w.step(t, "idle", 0.9, 0.8, 1, true).beside?.kind ?? beside;
    }
    expect(beside).toBe("cushion");
  });
});
