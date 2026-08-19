/**
 * L'album nel pannello (ADR-109).
 *
 * Due cose sole, e sono le due che il proprietario ha chiesto: **la durata**,
 * che è l'unica manopola dell'album e sta sopra tutto il resto, e **gli
 * scatti**, con accanto quanto gli resta da vivere. Una foto che non dice
 * quando sparisce è una foto che si crede eterna.
 *
 * Il pannello non ha un bottone «scatta»: uno scatto lo si chiede al corpo, e
 * il corpo è il muso. Da qui si guarda e si butta, che è ciò per cui una
 * pagina di revisione esiste (la stessa ragione dei volti in `prints.ts`).
 *
 * NB: questo file è un template literal. Un backtick dentro un commento qui
 * chiude la stringa e `tsc` segnala l'errore venti righe più in là.
 */
export const ALBUM_JS = `
/** Le etichette della tendina: gli scalini vengono dal server, mai da qui. */
const albumStepLabel = (hours) => hours === 0
  ? "non si tengono"
  : hours === 24 ? "un giorno"
  : hours === 48 ? "due giorni"
  : hours === 72 ? "tre giorni"
  : hours + " ore";

/** Quanto le resta, detto come lo direbbe una persona. */
const albumLeft = (iso) => {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (minutes <= 0) return "scaduta: sparisce al prossimo giro";
  if (minutes < 60) return "le restano " + minutes + " minuti";
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "le resta un'ora" : "le restano " + hours + " ore";
};

async function loadAlbum() {
  const data = await call("/v1/album", {});
  const steps = data.steps ?? [0];
  const hours = data.retentionHours ?? 0;
  $("album-hours").innerHTML = steps.map((step) =>
    '<option value="' + step + '"' + (step === hours ? " selected" : "") + ">" +
    albumStepLabel(step) + "</option>").join("");

  // spento è uno stato, non un guasto — e va detto PERCHÉ, perché le due
  // ragioni si rimediano in modi diversissimi (la tendina, o una persona
  // che cambia idea sul «non guardarmi»)
  if (data.someoneRefuses === true) {
    say("album-msg", "L'album tace: qui c'è chi ha chiesto di non essere guardato, e " +
      "finché è così questa casa non conserva foto — qualunque durata tu scelga.", "info");
  } else if (hours === 0) {
    say("album-msg", "L'album è spento: non si conserva niente. Scegli una durata per accenderlo.", "info");
  }

  const photos = data.photos ?? [];
  $("album-grid").innerHTML = photos.length === 0
    ? '<p class="empty">Nessuno scatto. Le foto si chiedono a voce: «scatta una foto».</p>'
    : '<ul class="plain">' + photos.map((photo) =>
        '<li data-photo="' + escape(photo.id) + '" data-testid="album-row"><b>' +
        (photo.caption === "" ? "<i>senza didascalia</i>" : escape(photo.caption)) + "</b> · " +
        escape(new Date(photo.takenAt).toLocaleString("it-IT",
          { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) +
        ' <span class="persona">' + escape(albumLeft(photo.expiresAt)) + "</span>" +
        ' <button data-photo-open="' + escape(photo.id) + '">Apri</button>' +
        ' <button class="ghost" data-photo-drop="' + escape(photo.id) + '">Butta</button></li>'
      ).join("") + "</ul>";
}

$("album-save").addEventListener("click", async () => {
  const ore = Number($("album-hours").value);
  try {
    await call("/v1/album/retention", { method: "PUT", body: JSON.stringify({ ore }) });
    say("album-msg", ore === 0
      ? "Album spento. Le foto già scattate spariranno alla loro scadenza: la durata promessa quando sono state scattate resta quella."
      : "Fatto: da adesso le foto nuove durano " + albumStepLabel(ore) + ".", "ok");
    await loadAlbum();
  } catch (error) { say("album-msg", error.message, "err"); }
});

$("album-expire").addEventListener("click", async () => {
  if (!confirm("Far sparire adesso tutte le foto oltre la loro scadenza?")) return;
  $("album-expire").disabled = true;
  try {
    const gone = await call("/v1/album/expire", { method: "POST", body: JSON.stringify({}) });
    say("album-msg", "Passata la scadenza: " + (gone.destroyed ?? 0) + " foto via, file compresi.", "ok");
    await loadAlbum();
  } catch (error) { say("album-msg", error.message, "err"); }
  finally { $("album-expire").disabled = false; }
});

$("album-grid").addEventListener("click", async (event) => {
  const open = event.target.dataset.photoOpen;
  const drop = event.target.dataset.photoDrop;
  try {
    if (open !== undefined) {
      const shot = await call("/v1/album/" + encodeURIComponent(open), {});
      // niente innerHTML con dentro dei pixel: l'immagine si costruisce come
      // nodo, e la sorgente è un data: URI che non esce da questa pagina
      $("album-shot").innerHTML = "";
      const img = document.createElement("img");
      img.src = "data:image/jpeg;base64," + shot.image;
      img.alt = "Uno scatto dell'album";
      img.style.maxWidth = "min(100%, 40rem)";
      img.style.borderRadius = "0.4rem";
      img.dataset.testid = "album-open-shot";
      $("album-shot").appendChild(img);
    }
    if (drop !== undefined) {
      if (!confirm("Buttare questa foto adesso?")) return;
      await call("/v1/album/" + encodeURIComponent(drop), { method: "DELETE" });
      $("album-shot").innerHTML = "";
      say("album-msg", "Buttata: la riga e il file.", "ok");
      await loadAlbum();
    }
  } catch (error) { say("album-msg", error.message, "err"); }
});
`;
