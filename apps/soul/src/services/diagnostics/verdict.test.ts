import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  stateOf,
  verdictOf,
  type WeighedState,
} from "./verdict.js";

const reached = (ms: number) => ({ ms, reached: true, configured: true });

describe("come si legge una sonda", () => {
  it("distingue il lento dal morto — che è tutto il punto", () => {
    expect(stateOf(reached(40), DEFAULT_THRESHOLDS)).toBe("ok");
    expect(stateOf(reached(3_500), DEFAULT_THRESHOLDS)).toBe("slow");
    expect(stateOf({ ms: null, reached: false, configured: true }, DEFAULT_THRESHOLDS)).toBe("down");
  });

  it("chiama spento quello che non è configurato, anche se ci ha messo un'era", () => {
    // un container che non esiste rifiuta la connessione dopo secondi: senza
    // questo ordine il pannello direbbe «lento» di una cosa che non c'è
    expect(stateOf({ ms: 3_900, reached: false, configured: false }, DEFAULT_THRESHOLDS)).toBe("off");
  });

  it("sulla soglia esatta non è ancora lento", () => {
    expect(stateOf(reached(DEFAULT_THRESHOLDS.slowMs), DEFAULT_THRESHOLDS)).toBe("ok");
    expect(stateOf(reached(DEFAULT_THRESHOLDS.slowMs + 1), DEFAULT_THRESHOLDS)).toBe("slow");
  });

  it("le soglie sono coerenti: si smette di aspettare dopo aver potuto dire lento", () => {
    expect(DEFAULT_THRESHOLDS.timeoutMs).toBeGreaterThan(DEFAULT_THRESHOLDS.slowMs);
  });
});

describe("il verdetto della casa", () => {
  const verdict = (states: WeighedState[]) => verdictOf(states);

  it("è ok solo quando nessuno arranca", () => {
    expect(verdict([
      { state: "ok", weight: "vital" },
      { state: "off", weight: "optional" },
    ])).toBe("ok");
  });

  it("chiama degradato anche il solo lento — è lì che vive la lamentela vera", () => {
    expect(verdict([
      { state: "ok", weight: "vital" },
      { state: "slow", weight: "supporting" },
    ])).toBe("degraded");
  });

  it("un vitale giù non ammette sfumature", () => {
    expect(verdict([
      { state: "down", weight: "vital" },
      { state: "ok", weight: "supporting" },
    ])).toBe("unavailable");
  });

  it("un vitale lento resta degradato: risponde, e va detto com'è", () => {
    expect(verdict([{ state: "slow", weight: "vital" }])).toBe("degraded");
  });

  /**
   * «A metà servizio» è arrivato dal campo: `percezione` risponde e la
   * dettatura dentro è morta. Deve degradare come tutto il resto — e NON
   * deve dichiarare la casa irraggiungibile quando capita a un vitale, che
   * comunque sta rispondendo.
   */
  it("il mezzo servizio degrada, come il lento", () => {
    expect(verdict([
      { state: "ok", weight: "vital" },
      { state: "partial", weight: "supporting" },
    ])).toBe("degraded");
  });

  it("un vitale a metà servizio risponde ancora: degradato, non irraggiungibile", () => {
    expect(verdict([{ state: "partial", weight: "vital" }])).toBe("degraded");
  });

  it("una funzione spenta non tinge di rosso niente", () => {
    expect(verdict([
      { state: "ok", weight: "vital" },
      { state: "off", weight: "optional" },
      { state: "off", weight: "supporting" },
    ])).toBe("ok");
  });

  it("ma una funzione accesa e rotta sì, anche se facoltativa", () => {
    expect(verdict([
      { state: "ok", weight: "vital" },
      { state: "down", weight: "optional" },
    ])).toBe("degraded");
  });
});
