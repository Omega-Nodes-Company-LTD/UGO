import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2022",
    sourcemap: true,
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
