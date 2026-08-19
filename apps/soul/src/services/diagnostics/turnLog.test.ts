import { describe, expect, it } from "vitest";
import { TurnLog } from "./turnLog.js";

/** Un orologio che avanza solo quando glielo si dice: le misure sono esatte. */
function fakeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("il cronometro del turno", () => {
  it("spezza il turno in fasi, e le fasi sommano al totale", () => {
    const clock = fakeClock();
    const log = new TurnLog(clock.now);
    const turn = log.start("gos-1", "home");
    clock.advance(120);
    turn.lap("ripescaggio");
    clock.advance(46_000);
    turn.lap("modello");
    clock.advance(30);
    turn.lap("scrittura");
    turn.done();

    const [sample] = log.snapshot().turns;
    expect(sample?.totalMs).toBe(46_150);
    expect(sample?.stages).toEqual([
      { name: "ripescaggio", ms: 120 },
      { name: "modello", ms: 46_000 },
      { name: "scrittura", ms: 30 },
    ]);
    // ed è questo che si guarda: il minuto ha un colpevole con un nome
    expect(sample?.stages.reduce((sum, s) => sum + s.ms, 0)).toBe(sample?.totalMs);
  });

  it("tiene gli ultimi venti e butta i vecchi, dal più recente", () => {
    const clock = fakeClock();
    const log = new TurnLog(clock.now);
    for (let i = 0; i < 25; i += 1) {
      const turn = log.start("gos-1", "home");
      clock.advance(i + 1);
      turn.done();
    }
    const { turns } = log.snapshot();
    expect(turns).toHaveLength(20);
    expect(turns[0]?.totalMs).toBe(25);
  });

  it("dice mediana e peggiore, che è come si distingue «sempre lento» da «ogni tanto»", () => {
    const clock = fakeClock();
    const log = new TurnLog(clock.now);
    for (const ms of [100, 200, 60_000]) {
      const turn = log.start("gos-1", "home");
      clock.advance(ms);
      turn.done();
    }
    const snap = log.snapshot();
    expect(snap.medianMs).toBe(200);
    expect(snap.slowestMs).toBe(60_000);
  });

  it("senza turni non inventa numeri", () => {
    const snap = new TurnLog(fakeClock().now).snapshot();
    expect(snap.medianMs).toBeNull();
    expect(snap.slowestMs).toBeNull();
    expect(snap.turns).toEqual([]);
  });

  it("conta le frasi entrate e quelle uscite: è lì che si vede il silenzio", () => {
    const log = new TurnLog(fakeClock().now);
    for (let i = 0; i < 20; i += 1) log.heard();
    log.answered();
    log.refused();
    log.failed();
    const { counters } = log.snapshot();
    expect(counters).toEqual({ heard: 20, refused: 1, answered: 1, failed: 1 });
  });

  it("la fotografia è una copia: chi la legge non può muovere i contatori", () => {
    const log = new TurnLog(fakeClock().now);
    log.heard();
    const snap = log.snapshot();
    snap.counters.heard = 999;
    expect(log.snapshot().counters.heard).toBe(1);
  });
});
