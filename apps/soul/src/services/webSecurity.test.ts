import { describe, expect, it } from "vitest";
import {
  AttemptLimiter,
  allowedOrigins,
  appleAppSiteAssociation,
  contentSecurityPolicy,
  cookieValue,
  needsToken,
  redactToken,
  securityHeaders,
  sessionCookie,
} from "./webSecurity.js";
import { formatPairingCode, generatePairingCode, normalizePairingCode } from "./deviceAccess.js";

describe("the token wall (ADR-127)", () => {
  it.each([
    "/v1/chat",
    "/v1/tts",
    "/v1/face",
    "/v1/face?gosino=ugo",
    "/v1/memories/search",
    "/v1/privacy/export",
    "/v1/pairing-codes",
    "/v1/mcp",
  ])("closes %s", (path) => {
    expect(needsToken(path)).toBe(true);
  });

  it.each([
    "/health",
    "/admin",
    "/admin/panel.js",
    "/login/abc",
    "/.well-known/apple-app-site-association",
    "/v1/pair",
    "/v1/login/email",
    "/v1/login/redeem",
    "/v1/version",
    "/v1/vetrina",
    "/v1/vetrina/123/pedigree",
    "/v1/reception/chat",
    "/v1/phone/turn",
    "/assets/index.js",
  ])("leaves %s to its own defence", (path) => {
    expect(needsToken(path)).toBe(false);
  });

  it("is not fooled by a prefix that only looks open", () => {
    expect(needsToken("/v1/pairing")).toBe(true);
    expect(needsToken("/v1/vetrinaX")).toBe(true);
    expect(needsToken("/v1/login/email/../../chat")).toBe(true);
  });
});

describe("who may read soul's answers", () => {
  it("is the public origin and the app shell, nothing else", () => {
    expect(allowedOrigins("https://ugo.omeganodes.ai/qualcosa", [])).toEqual([
      "https://ugo.omeganodes.ai",
      "capacitor://localhost",
      "https://localhost",
    ]);
  });

  it("adds declared extras", () => {
    expect(allowedOrigins(undefined, ["https://dock.casa"])).toContain("https://dock.casa");
  });
});

describe("the security headers", () => {
  it("sends HSTS only on a public https house", () => {
    expect(securityHeaders("https://ugo.omeganodes.ai")["strict-transport-security"]).toContain("max-age");
    expect(securityHeaders(undefined)["strict-transport-security"]).toBeUndefined();
    expect(securityHeaders("http://192.168.1.5:3000")["strict-transport-security"]).toBeUndefined();
  });

  it("forbids framing and lets the face open its own socket", () => {
    const csp = contentSecurityPolicy("https://ugo.omeganodes.ai");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' wss://ugo.omeganodes.ai");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(securityHeaders(undefined)["x-frame-options"]).toBe("DENY");
  });
});

describe("tokens never reach the log", () => {
  it("redacts the socket token and keeps the rest of the url", () => {
    expect(redactToken("/v1/face?gosino=ugo&token=abc.def")).toBe("/v1/face?gosino=ugo&token=[redacted]");
    expect(redactToken("/v1/face?token=abc&stanza=cucina")).toBe("/v1/face?token=[redacted]&stanza=cucina");
    expect(redactToken("/v1/chat")).toBe("/v1/chat");
  });
});

describe("the web session cookie", () => {
  it("is HttpOnly, Secure and SameSite=Strict", () => {
    const cookie = sessionCookie("tok", 60);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
  });

  it("is read back from a cookie header", () => {
    expect(cookieValue("a=1; ugo_session=xyz; b=2", "ugo_session")).toBe("xyz");
    expect(cookieValue(undefined, "ugo_session")).toBeUndefined();
    expect(cookieValue("a=1", "ugo_session")).toBeUndefined();
  });
});

describe("the attempt limiter", () => {
  it("allows five a minute per address, then refuses until the window passes", () => {
    const limiter = new AttemptLimiter(5, 60_000);
    for (let i = 0; i < 5; i += 1) expect(limiter.allow("1.2.3.4", 1_000)).toBe(true);
    expect(limiter.allow("1.2.3.4", 2_000)).toBe(false);
    expect(limiter.allow("5.6.7.8", 2_000)).toBe(true);
    expect(limiter.allow("1.2.3.4", 62_000)).toBe(true);
  });
});

describe("the pairing code", () => {
  it("has eight unambiguous characters, shown as two groups", () => {
    const code = generatePairingCode();
    expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{8}$/u);
    expect(formatPairingCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });

  it("forgives case, spaces and dashes, and refuses what cannot be a code", () => {
    expect(normalizePairingCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizePairingCode(" ab cd ef gh ")).toBe("ABCDEFGH");
    expect(normalizePairingCode("ABCD-EFG")).toBeUndefined();
    expect(normalizePairingCode("ABCD-EFG0")).toBeUndefined();
    expect(normalizePairingCode("ABCD-EFGI")).toBeUndefined();
  });
});

describe("apple-app-site-association", () => {
  it("opens /pair and /login links in the app", () => {
    expect(appleAppSiteAssociation(["8UH44UM49Z.ai.omeganodes.ugo"])).toEqual({
      applinks: {
        details: [
          {
            appIDs: ["8UH44UM49Z.ai.omeganodes.ugo"],
            components: [{ "/": "/pair/*" }, { "/": "/login/*" }],
          },
        ],
      },
    });
  });
});
