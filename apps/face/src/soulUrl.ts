/**
 * Where soul lives, seen from the browser.
 *
 * Two deployments, one rule. In development the face is served by Vite on its
 * own port while soul listens on 3000, so the host has to be rewritten. In
 * production soul serves the built face itself (`apps/soul` static root), so
 * the page origin *is* soul — and same-origin is the only shape that works
 * over HTTPS: a `wss://` page cannot open a `ws://` socket, and a plain-HTTP
 * origin is not a secure context, which costs us microphone and wake lock.
 */

/** Vite dev (5173) and preview (4173): the only case where soul is elsewhere. */
const DEV_PORTS = new Set(["4173", "5173"]);
const SOUL_DEV_PORT = 3000;

export type SoulLocation = Pick<Location, "protocol" | "hostname" | "host" | "port">;

export function resolveSoulUrl(location: SoulLocation, override?: string | null): string {
  if (override !== undefined && override !== null && override !== "") return override;
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  if (DEV_PORTS.has(location.port)) {
    return `${scheme}//${location.hostname}:${String(SOUL_DEV_PORT)}/v1/face`;
  }
  return `${scheme}//${location.host}/v1/face`;
}

/** HTTP base of the same soul, for the REST routes the face calls. */
export function soulHttpBase(soulUrl: string): string {
  return soulUrl.replace(/^ws/, "http").replace(/\/v1\/face$/, "");
}
