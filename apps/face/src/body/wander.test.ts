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
