import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

/**
 * MediaPipe's WebAssembly, copied from `node_modules` at build and serve time
 * (ADR-044).
 *
 * Not vendored into the repository because it is 35 MB of generated binary
 * that npm already versions for us, and not loaded from Google's CDN because
 * the dock is a PWA that has to work on a home network with no way out — and
 * because a face detector fetched from a third party at runtime is a camera
 * feed's worth of trust handed to a domain we do not control.
 */
function mediapipeWasm(): Plugin {
  const require = createRequire(import.meta.url);
  const from = resolve(require.resolve("@mediapipe/tasks-vision"), "../wasm");
  const into = resolve(import.meta.dirname, "public/vision");
  const copy = (): void => {
    mkdirSync(into, { recursive: true });
    for (const file of readdirSync(from)) cpSync(`${from}/${file}`, `${into}/${file}`);
  };
  return {
    name: "ugo-mediapipe-wasm",
    // both hooks: `dev` never runs buildStart's production path, and a dock
    // that works in `pnpm build` and not in `pnpm dev` wastes an afternoon
    buildStart: copy,
    configureServer: copy,
  };
}

export default defineConfig({
  plugins: [mediapipeWasm()],
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: {
        // the creature, and the bench that drives the very same modules —
        // keeping them in one app is what stops two copies of the expression
        // mapping from drifting apart
        index: resolve(import.meta.dirname, "index.html"),
        bench: resolve(import.meta.dirname, "bench.html"),
      },
    },
  },
  // Bind IPv4 explicitly. The default is `localhost`, which on a host with
  // IPv6 (every GitHub runner) resolves to ::1 first — so the server listens
  // on ::1 while Playwright polls http://127.0.0.1:4173 and waits forever.
  // Locally, without IPv6, the two happen to coincide and it looks fine.
  server: {
    host: "127.0.0.1",
    port: 4173,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
});
