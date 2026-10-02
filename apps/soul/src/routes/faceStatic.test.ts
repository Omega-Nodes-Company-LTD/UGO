import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { faceRedirect, isKioskQuery, registerFaceStatic, servedBuildId } from "./faceStatic.js";

describe("servedBuildId — il nome del bundle che soul sta servendo", () => {
  it("estrae l'hash dal file index-<hash>.js di vite", () => {
    const dir = mkdtempSync(join(tmpdir(), "ugo-face-static-"));
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "assets", "index-a1b2c3.js"), "/* */");
    expect(servedBuildId(dir)).toBe("a1b2c3");
  });

  it("torna 'dev' quando non c'è una build (sviluppo, vite serve il muso)", () => {
    const dir = mkdtempSync(join(tmpdir(), "ugo-face-empty-"));
    expect(servedBuildId(dir)).toBe("dev");
  });
});
describe("il trasloco sotto /muso/ (ADR-121)", () => {
  const bundle = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "ugo-face-bundle-"));
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>muso</title>");
    writeFileSync(join(dir, "assets", "index-abc123.js"), "/* */");
    return dir;
  };

  it("un dispositivo di prima porta i suoi parametri al muso", () => {
    expect(faceRedirect("/?gosino=ugo&token=x")).toBe("/muso/?gosino=ugo&token=x");
    expect(faceRedirect("/")).toBe("/muso/");
    expect(isKioskQuery("stanza=cucina")).toBe(true);
    expect(isKioskQuery("utm_source=mail")).toBe(false);
  });

  it("soul in casa: la radice manda al muso, il muso sta sotto /muso/", async () => {
    const app = Fastify({ logger: false });
    registerFaceStatic(app, bundle(), { rootIsFace: true });
    const root = await app.inject({ method: "GET", url: "/?stanza=cucina" });
    expect(root.statusCode).toBe(302);
    expect(root.headers.location).toBe("/muso/?stanza=cucina");
    const page = await app.inject({ method: "GET", url: "/muso/" });
    expect(page.statusCode).toBe(200);
    expect(page.headers["cache-control"]).toContain("no-store");
    const asset = await app.inject({ method: "GET", url: "/muso/assets/index-abc123.js" });
    expect(asset.headers["cache-control"]).toContain("immutable");
    expect((await app.inject({ method: "GET", url: "/v1/version" })).json()).toEqual({ version: "abc123" });
    await app.close();
  });

  it("soul pubblico: la radice non è del muso", async () => {
    const app = Fastify({ logger: false });
    registerFaceStatic(app, bundle(), { rootIsFace: false });
    expect((await app.inject({ method: "GET", url: "/" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/muso/" })).statusCode).toBe(200);
    await app.close();
  });
});
