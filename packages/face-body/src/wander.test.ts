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
 * Gli arredi (ADR-056): un richiamo, e un ostacolo.
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
  /**
   * «Continua a parlare col culo e non con la faccia» — la seconda volta.
   *
   * Il cono di FACES_YOU c'era già e reggeva… finché non c'era un arredo per
   * strada. Due righe lo scavalcavano: la caccia all'arredo riscriveva
   * `this.target` **dopo** `inCone`, col rilevamento nudo dell'oggetto. Non
   * capitava scegliendo un arredo mentre parla — quello è già vietato — ma nel
   * caso vero, che è l'altro: si incammina verso il cespuglio mentre è `idle`,
   * tu gli parli, lui risponde **continuando ad andarci**, e il cespuglio gli
   * sta dietro. Nella stanza vera gli arredi ci sono sempre, quindi il caso
   * senza arredi — l'unico che il test copriva — è quello che non capita mai.
   *
   * Mentre ti parla non ci arriva, e va bene così: un animale che ti sta
   * dicendo qualcosa non se ne va dietro un cespuglio a metà frase. Ci arriva
   * quando ha finito, che è esattamente quando il cono si spegne.
   */
  it("non continua ad andare all'arredo dandoti le spalle, se intanto ti parla", () => {
    const BEHIND_HIM = { id: "b2", kind: "bush" as const, x: 0, z: -1.8 };
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([BEHIND_HIM]);

    // prima si incammina: è in `idle`, l'arredo lo attira, e gli sta dietro
    let at = 0;
    let out = w.step(at, "idle", 0.9, 0.8, 1, true);
    while (Math.abs(out.heading) < 2 && at < 20_000) {
      at += FRAME;
      out = w.step(at, "idle", 0.9, 0.8, 1, true);
    }
    expect(Math.abs(out.heading)).toBeGreaterThan(2);

    // poi gli parli, e lui risponde: da qui in avanti il muso torna verso di te
    const talking = run(w, "talking", 3000, at);
    expect(Math.abs(talking.heading)).toBeLessThanOrEqual(FACE_YOU_CONE + 0.01);
  });

  /**
   * E il contrario, che è la metà che tiene onesta la correzione: **zitto, ci
   * va**. Il cono è una regola sul parlare, non una gabbia — senza questo
   * test, «non ci va mai» passerebbe per una correzione riuscita.
   */
  it("ci va eccome quando non ti sta parlando", () => {
    const BEHIND_HIM = { id: "b2", kind: "bush" as const, x: 0, z: -1.8 };
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([BEHIND_HIM]);
    let closest = Infinity;
    for (let t = 0; t <= 40_000; t += FRAME) {
      const out = w.step(t, "idle", 0.9, 0.8, 1, true);
      closest = Math.min(closest, Math.hypot(out.x - BEHIND_HIM.x, out.z - BEHIND_HIM.z));
    }
    // 1.9 è il contatto: oltre non va, perché il cespuglio è solido
    expect(closest).toBeLessThan(2);
  });

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
      // raggio del cespuglio (1.05) più mezzo corpo (0.85), con un filo di
      // tolleranza per il passo del fotogramma
      expect(Math.hypot(out.x - BUSH.x, out.z - BUSH.z)).toBeGreaterThan(1.85);
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

/**
 * Il cespuglio è un **riparo**, e ci si va dietro.
 *
 * Segnalato guardando il reso: era alto 0.9 unità, cioè un ciuffo al ginocchio
 * di un pancia a tazza, e dietro un ciuffo non ci si nasconde. Cresciuto
 * l'oggetto, serviva anche la spinta che ce lo manda — lo **stress**, che è la
 * seconda ragione per cui un animale attraversa una stanza, e l'unica che vince
 * sulla noia.
 */
describe("il riparo", () => {
  const BUSH = { id: "sh", kind: "bush" as const, x: 1.2, z: 0.4 };
  const eager = (): Wanderer => new Wanderer(dice([0.01, 0.5]));

  /** Dietro = dal lato opposto alla camera, che sta a z positivo. */
  it("gets BEHIND it, not next to it", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([BUSH]);
    let closest = Infinity;
    let where = { x: 0, z: 0 };
    for (let t = 0; t <= 25_000; t += FRAME) {
      const out = w.step(t, "idle", 0.2, 0.8, 1, true, 0.9);
      const gap = Math.hypot(out.x - BUSH.x, out.z - BUSH.z);
      if (gap < closest) {
        closest = gap;
        where = { x: out.x, z: out.z };
      }
    }
    // più lontano dalla camera del cespuglio: se ci fosse arrivato davanti,
    // questo numero sarebbe maggiore invece che minore
    expect(where.z).toBeLessThan(BUSH.z);
  });

  /**
   * La noia non c'entra: qui è lo stress a muoverlo, e a stress alto ci va
   * anche da tranquillissimo. Il contrario del test sopra sugli arredi.
   */
  it("goes there when it is spooked even with nothing to be bored about", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([BUSH]);
    let arrived = false;
    for (let t = 0; t <= 25_000; t += FRAME) {
      arrived ||= w.step(t, "idle", 0.1, 0.8, 1, true, 0.9).reached?.id === BUSH.id;
    }
    expect(arrived).toBe(true);
  });

  it("ignores it when it is calm and not bored", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([BUSH]);
    let arrived = false;
    for (let t = 0; t <= 25_000; t += FRAME) {
      arrived ||= w.step(t, "idle", 0.1, 0.8, 1, true, 0.1).reached !== undefined;
    }
    expect(arrived).toBe(false);
  });

  /**
   * Cresciuto l'oggetto, il fermo delle collisioni cresce con lui: un cespuglio
   * dietro cui ci si nasconde e che il maiale attraversa sarebbe un disegno.
   */
  it("still cannot be walked through, at its new size", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([BUSH]);
    for (let t = 0; t <= 25_000; t += FRAME) {
      const out = w.step(t, "idle", 0.9, 0.9, 1, true, 0.9);
      // raggio 1.05 più mezzo corpo 0.85, con tolleranza per il passo
      expect(Math.hypot(out.x - BUSH.x, out.z - BUSH.z)).toBeGreaterThan(1.85);
    }
  });
});

/**
 * Gruppo 10: il riparo che FUNZIONA. `sheltered` è ciò che il frame `noise`
 * spedisce a soul: per chi è dietro, il botto arriva attutito
 * (`loud_noise_muffled`), ed è la differenza fra nascondersi e fare teatro.
 */
describe("sheltered: al riparo adesso", () => {
  const BUSH = { id: "sh", kind: "bush" as const, x: 1.2, z: 0.4 };
  const CUSHION = { id: "c1", kind: "cushion" as const, x: 1.2, z: 0.4 };
  const eager = (): Wanderer => new Wanderer(dice([0.01, 0.5]));

  it("becomes true once the flight to the bush lands, and not at the start", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([BUSH]);
    expect(w.sheltered).toBe(false);
    let whenArrived: number | undefined;
    for (let t = 0; t <= 25_000; t += FRAME) {
      if (w.step(t, "idle", 0.1, 0.8, 1, true, 0.9).reached?.id === BUSH.id) {
        whenArrived = t;
        break;
      }
    }
    expect(whenArrived).toBeDefined();
    expect(w.sheltered).toBe(true);
  });

  it("a cushion is not a shelter, however close he stands", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([CUSHION]);
    for (let t = 0; t <= 25_000; t += FRAME) w.step(t, "idle", 0.9, 0.8, 1, true, 0);
    expect(w.sheltered).toBe(false);
  });
});

/**
 * Gruppo 10: i gusti. La distanza è divisa dal peso, quindi l'arredo amato
 * «sembra più vicino» — e la paura non fa shopping: sul riparo i gusti non
 * contano, conta solo dove sta.
 */
describe("i gusti sugli arredi", () => {
  const CUSHION = { id: "c1", kind: "cushion" as const, x: 1.2, z: 0.4 };
  const BALL = { id: "p1", kind: "ball" as const, x: 2.2, z: 0.6 };
  const eager = (): Wanderer => new Wanderer(dice([0.01, 0.5]));

  const firstReached = (w: Wanderer): string | undefined => {
    for (let t = 0; t <= 30_000; t += FRAME) {
      const hit = w.step(t, "idle", 0.9, 0.8, 1, true).reached;
      if (hit !== undefined) return hit.id;
    }
    return undefined;
  };

  it("senza gusti va al più vicino, come ha sempre fatto", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([CUSHION, BALL]);
    expect(firstReached(w)).toBe(CUSHION.id);
  });

  it("l'ardito attraversa la stanza per la palla, anche col cuscino a un passo", () => {
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([CUSHION, BALL]);
    w.setTastes({ ball: 1.5, cushion: 0.6 });
    expect(firstReached(w)).toBe(BALL.id);
  });

  it("spaventato, il riparo resta il più vicino: i gusti non fanno shopping", () => {
    const BUSH_NEAR = { id: "b1", kind: "bush" as const, x: 1.4, z: 0 };
    const BUSH_FAR = { id: "b2", kind: "bush" as const, x: 4.5, z: 0 };
    const w = eager();
    w.setPen(20, 20);
    w.setAttractions([BUSH_NEAR, BUSH_FAR]);
    // un gusto assurdo sul lontano non deve cambiare la fuga
    w.setTastes({ bush: 1.5 });
    let reached: string | undefined;
    for (let t = 0; t <= 30_000 && reached === undefined; t += FRAME) {
      reached = w.step(t, "idle", 0.1, 0.8, 1, true, 0.9).reached?.id;
    }
    expect(reached).toBe(BUSH_NEAR.id);
  });
});
