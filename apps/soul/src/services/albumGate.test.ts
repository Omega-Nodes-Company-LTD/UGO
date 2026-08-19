import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ADR-109 §1: «si scatta solo su gesto».
 *
 * Una foto conservata è la cosa più delicata che questo sistema tocchi, e la
 * promessa che nessuno la scatti da solo vive in un documento — che non ferma
 * nessuno. Da qui in poi la ferma questo test.
 *
 * È strutturale come `parcelGate.test.ts` e per la stessa lezione: cercare
 * `askPhoto(` sarebbe una guardia che un rinomino disarma. Per scattare devi
 * avere in mano il fotografo o il gateway, e **nominarli fuori dai file
 * autorizzati è già l'infrazione**.
 */

const ROOT = join(import.meta.dirname, "..");

/** Chi ha il diritto di scattare: il gesto, la rotta, e chi li cabla. */
const MAY_SHOOT = new Set([
  "services/photographer.ts",
  "services/chatService.ts",
  "routes/album.ts",
]);
const MAY_WIRE = new Set([...MAY_SHOOT, "index.ts", "services/pack/runtimes.ts", "server.ts"]);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sources(path));
      continue;
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

const relative = (path: string): string => path.slice(ROOT.length + 1);

describe("una foto si scatta solo su gesto", () => {
  it("fuori da gesto, rotta e cablaggio nessuno nomina il fotografo", () => {
    const offenders = sources(ROOT).filter((path) => {
      if (MAY_WIRE.has(relative(path))) return false;
      return /Photographer|photographer\.js/u.test(readFileSync(path, "utf8"));
    });
    expect(offenders.map(relative)).toEqual([]);
  });

  it("e nessuno chiede uno scatto al corpo per conto suo", () => {
    const offenders = sources(ROOT).filter((path) => {
      // il gateway lo dichiara, il fotografo lo usa: tutti gli altri no
      if (relative(path) === "services/faceGateway.ts") return false;
      if (MAY_SHOOT.has(relative(path))) return false;
      return /\.askPhoto\s*\(/u.test(readFileSync(path, "utf8"));
    });
    expect(offenders.map(relative)).toEqual([]);
  });

  it("i due cancelli stanno PRIMA dei pixel, non dopo", () => {
    // regola 9: `no_vision` si applica a monte. Se un giorno qualcuno
    // spostasse il controllo dopo `askPhoto`, la foto esisterebbe comunque
    const shooter = readFileSync(join(ROOT, "services", "photographer.ts"), "utf8");
    const gateAt = shooter.indexOf("album.gate(");
    const askAt = shooter.indexOf("askPhoto()");
    expect(gateAt).toBeGreaterThan(-1);
    expect(askAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(askAt);
  });
});
