/**
 * The rooms: making them, filling them, unmaking them (ADR-036, ADR-039).
 *
 * A device shows a room, not a creature, so this page is where the owner
 * decides who appears on which screen. Since ADR-039 the room is a thing of its
 * own rather than whatever was typed into a text field, which is what lets an
 * empty room exist — and what lets "in che stanza" be a list to pick from
 * instead of a field that grows a new room out of every typo.
 */
export const ROOMS_JS = `
async function loadRooms() {
  // the catalogue is the source: a room nobody lives in is still a room
  const known = (await call("/v1/rooms", {})).rooms ?? [];
  const list = (await call("/v1/gosini", {})).gosini ?? [];
  const homeless = list.filter((g) => (g.where ?? "").trim() === "");

  const card = (room) =>
    '<div class="deed"><div class="act">' + escape(room.room) +
    (room.gosini.length > 1 ? ' <span class="deed-act">· ' + room.gosini.length + " insieme</span>" : "") +
    '<button class="ghost room-del" data-room="' + room.id + '" data-name="' + escape(room.room) +
    '" data-testid="room-del">disfa</button></div>' +
    '<div class="because">' +
    (room.gosini.length === 0 ? "<i>vuota</i>" : room.gosini.map((g) => escape(g.name)).join(" · ")) +
    "</div>" +
    // encoded, because a room may legitimately be called "sala da pranzo" and
    // an address you cannot copy is not an address
    '<div class="because">indirizzo: <code>/?stanza=' +
    escape(encodeURIComponent(room.room)) + "</code></div></div>";

  $("rooms-list").innerHTML =
    (known.length === 0 ? '<p class="empty">Nessuna stanza, per ora. Fanne una qui sopra.</p>'
      : known.map(card).join("")) +
    (homeless.length === 0 ? ""
      : '<div class="deed"><div class="act">Senza stanza</div><div class="because">' +
        homeless.map((g) => escape(g.name)).join(" · ") +
        '</div><div class="because">non compaiono su nessun dispositivo</div></div>');

  $("move-who").innerHTML = list.map((g) =>
    '<option value="' + g.id + '">' + escape(g.name) +
    (g.where ? " · " + escape(g.where) : " · senza stanza") + "</option>").join("");
  // an explicit "out of every room" entry: taking somebody off every screen is
  // a thing you choose, not an empty field you have to guess means that
  $("move-room").innerHTML = '<option value="">— nessuna stanza —</option>' +
    known.map((r) => '<option value="' + escape(r.room) + '">' + escape(r.room) + "</option>").join("");
}

$("room-go").addEventListener("click", async () => {
  const name = $("room-name").value.trim();
  if (name === "") { say("rooms-msg", "Serve un nome.", "info"); return; }
  $("room-go").disabled = true;
  try {
    const made = await call("/v1/rooms", { method: "POST", body: JSON.stringify({ name }) });
    say("rooms-msg", made.created
      ? "Adesso c'è " + made.room + ". È vuota: mettici qualcuno."
      : made.room + " c'era già.", made.created ? "ok" : "info");
    $("room-name").value = "";
    await loadRooms();
  } catch (error) {
    say("rooms-msg", error.message, "err");
  } finally { $("room-go").disabled = false; }
});

$("rooms-list").addEventListener("click", async (event) => {
  const button = event.target.closest(".room-del");
  if (button === null) return;
  // disfare una stanza sposta delle creature: si chiede, non si fa e basta
  if (!confirm("Disfare " + button.dataset.name + "? Chi ci vive resta senza stanza.")) return;
  button.disabled = true;
  try {
    const gone = await call("/v1/rooms/" + encodeURIComponent(button.dataset.room), { method: "DELETE" });
    say("rooms-msg", gone.evicted === 0
      ? gone.room + " non c'è più."
      : gone.room + " non c'è più: " + gone.evicted + (gone.evicted === 1 ? " è" : " sono") + " senza stanza.", "ok");
    await loadRooms();
    await loadGosini();
    drawRail(route().page);
  } catch (error) {
    say("rooms-msg", error.message, "err");
    button.disabled = false;
  }
});

$("move-go").addEventListener("click", async () => {
  const id = $("move-who").value;
  if (id === "") { say("rooms-msg", "Non c'è nessuno da spostare.", "info"); return; }
  const room = $("move-room").value.trim();
  $("move-go").disabled = true;
  try {
    const moved = await call("/v1/gosini/" + encodeURIComponent(id), {
      method: "PATCH", body: JSON.stringify({ locationLabel: room }),
    });
    say("rooms-msg", moved.where
      ? moved.name + " adesso sta in " + moved.where + "."
      : moved.name + " non sta più in nessuna stanza.", "ok");
    await loadRooms();
    // the rail names the rooms too, and it has just gone stale
    await loadGosini();
    drawRail(route().page);
  } catch (error) {
    say("rooms-msg", error.message, "err");
  } finally { $("move-go").disabled = false; }
});
`;
