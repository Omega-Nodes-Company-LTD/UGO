/* Service worker del muso (ADR-018 Tempo 1).
 *
 * Regole semplici e deliberate:
 * - `index.html` SEMPRE dal network (network-first con fallback alla cache):
 *   è ciò che il check version del muso confronta con `/v1/version`, e una
 *   copia stantìa servita dal worker renderebbe quel confronto finto.
 * - gli asset hashati (`/assets/*‑<hash>.*`) cache-first ma rivalidati
 *   (stale-while-revalidate): una build nuova produce asset nuovi, quindi
 *   la cache vecchia non può mai servire codice vecchio a una pagina nuova.
 * - tutto il resto ("navigate" verso altri cammini) passa.
 *
 * Niente notifiche qui: la parte push resta fuori finché il proprietario non
 * la decide (BACKLOG gruppo 2, accantonata).
 */

const CACHE = "ugo-face-v1";

self.addEventListener("install", (event) => {
  // non tenere in giro versioni vecchie del worker: appena ne arriva una,
  // l'attivazione vera è una questione di secondi e non di tabulati.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      ),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // l'HTML è sempre dal network, con la cache come ripiego offline
  if (request.mode === "navigate" || url.pathname.endsWith("index.html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? fetch(request))),
    );
    return;
  }

  // gli asset hashati: dalla cache subito, riallineati in sottofondo
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => undefined);
        return cached ?? network;
      }),
    );
    return;
  }
});