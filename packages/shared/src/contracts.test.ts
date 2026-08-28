import { describe, expect, it } from "vitest";
import { BODY_EVENT_SOURCES, eventRequestSchema } from "./contracts.js";

/**
 * `/v1/events` è la porta del CORPO, che può non portare alcun token
 * (ADR-019 fase 2). Le fonti che il corpo può dichiarare sono quelle
 * sensoriali: `peer` e `reception` sono scritture INTERNE e certificate
 * (incontro fra creature verificato via catena, digest della reception),
 * e lasciarle dichiare da un frame non-token le aprirebbe alla
 * contraffazione (ADR-045 insegna a diffidare dei contratti silenziosi).
 */
describe("eventRequestSchema: le fonti che il corpo può dichiarare", () => {
  it("accetta le cinque fonti sensoriali del corpo", () => {
    for (const source of ["face", "nano", "ear", "meet", "system"]) {
      expect(eventRequestSchema.safeParse({ source, type: "noise" }).success).toBe(true);
    }
  });

  it("rifiuta le fonti interne peer e reception", () => {
    for (const source of ["peer", "reception"]) {
      expect(eventRequestSchema.safeParse({ source, type: "x" }).success).toBe(false);
    }
  });

  it("BODY_EVENT_SOURCES è esattamente EVENT_SOURCES senza peer e reception", () => {
    expect(BODY_EVENT_SOURCES).toEqual(["face", "nano", "ear", "meet", "system"]);
  });
});