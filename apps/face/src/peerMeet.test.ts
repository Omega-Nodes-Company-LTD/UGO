import { describe, expect, it } from "vitest";
import { parsePeerCard, qrReader } from "./peerMeet.js";

describe("il biglietto inquadrato", () => {
  it("riconosce la forma di un biglietto di gosino", () => {
    const raw = JSON.stringify({ card: { name: "Bice", generation: 1 }, signature: "c2ln" });
    expect(parsePeerCard(raw)?.card.name).toBe("Bice");
  });

  it("scarta un QR qualunque: un link, un testo, un JSON d'altro", () => {
    expect(parsePeerCard("https://example.org")).toBeUndefined();
    expect(parsePeerCard("ciao")).toBeUndefined();
    expect(parsePeerCard(JSON.stringify({ card: { generation: 1 }, signature: "x" }))).toBeUndefined();
    expect(parsePeerCard(JSON.stringify({ card: { name: "Bice" } }))).toBeUndefined();
  });

  it("dice se il browser sa leggere i QR, senza fingere", () => {
    expect(qrReader({})).toBeUndefined();
    const Fake = (): void => undefined;
    expect(qrReader({ BarcodeDetector: Fake })).toBe(Fake);
  });
});
