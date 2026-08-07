import type { FastifyInstance } from "fastify";

/** Minimal dev-only chat page (Fase 1 DoD): no build step, no dependencies. */
const PAGE = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UGO — chat di debug</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
  #log { border: 1px solid #ccc; border-radius: .5rem; padding: 1rem; min-height: 14rem; }
  .me { text-align: right; color: #333; }
  .ugo { color: #7a3030; }
  .mood { color: #888; font-size: .8rem; }
  form { display: flex; gap: .5rem; margin-top: 1rem; }
  input[type=text] { flex: 1; padding: .5rem; }
</style>
</head>
<body>
<h1>UGO 🐷 <small>chat di debug</small></h1>
<div id="log" data-testid="chat-log"></div>
<form id="f">
  <input type="text" id="t" data-testid="chat-input" placeholder="Di' qualcosa a UGO…" autocomplete="off">
  <button data-testid="chat-send">Invia</button>
</form>
<script>
const log = document.getElementById("log");
function line(cls, text) {
  const p = document.createElement("p");
  p.className = cls;
  p.textContent = text;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}
document.getElementById("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("t");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  line("me", text);
  try {
    const res = await fetch("/v1/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "home", text }),
    });
    const body = await res.json();
    if (!res.ok) { line("mood", "errore: " + (body.title ?? res.status)); return; }
    line("ugo", body.reply);
    line("mood", "umore: " + body.moodLabel + " · ricordi usati: " + body.memoriesUsed.length);
  } catch (err) {
    line("mood", "errore di rete");
  }
});
</script>
</body>
</html>`;

export function registerDebugChatRoute(app: FastifyInstance): void {
  app.get("/debug/chat", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(PAGE);
  });
}
