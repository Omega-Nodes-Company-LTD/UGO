/** Helpers and the way in: token handling, HTTP, and messages. */
export const CORE_JS = `
const $ = (id) => document.getElementById(id);
const token = () => sessionStorage.getItem("ugo_token") ?? "";
// content-type only when there IS a body: Fastify rejects an empty body sent
// as application/json, which silently broke every DELETE from this panel
const headers = (hasBody, contentType) => ({
  ...(hasBody ? { "content-type": contentType ?? "application/json" } : {}),
  authorization: "Bearer " + token(),
});
const say = (where, text, kind) => { $(where).innerHTML = ""; const d = document.createElement("div");
  d.className = "msg " + (kind ?? "info"); d.textContent = text; d.dataset.testid = where + "-text";
  $(where).appendChild(d); };

const SPECIES_LABEL = { human: "persona", dog: "cane", parrot: "pappagallo", reptile: "rettile" };

async function call(path, options) {
  const res = await fetch(path, {
    ...options,
    headers: headers(options?.body !== undefined, options?.contentType),
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty body is fine */ }
  if (!res.ok) {
    const detail = body?.detail ?? body?.title ?? ("HTTP " + res.status);
    const error = new Error(detail); error.status = res.status; throw error;
  }
  return body;
}

// --- accesso ---------------------------------------------------------------
$("save-token").addEventListener("click", async () => {
  sessionStorage.setItem("ugo_token", $("token").value.trim());
  try {
    await call("/v1/stats", {});
    $("app").hidden = false; $("auth-hero").hidden = true; $("mood-hero").hidden = false;
    await refresh();
    await loadPsyche();
    await loadHealth();
  } catch (error) {
    say("auth-msg", error.status === 401 ? "Token non valido." : "Non riesco a parlare con UGO: " + error.message, "err");
  }
});
`;
