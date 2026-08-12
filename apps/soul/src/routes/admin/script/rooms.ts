/**
 * The rooms, and moving somebody between them (ADR-036).
 *
 * A device shows a room, not a creature, so this page is where the owner
 * decides who appears on which screen. It is the only control that does — the
 * birth form sets a first room, and after that people move house.
 */
export const ROOMS_JS = `
async function loadRooms() {
  const list = (await call("/v1/gosini", {})).gosini ?? [];

  // grouped by room, with the homeless in their own group at the end: they are
  // not an error, they simply do not appear on any device yet
  const byRoom = new Map();
  const homeless = [];
  for (const g of list) {
    const room = (g.where ?? "").trim();
    if (room === "") { homeless.push(g); continue; }
    const key = room.toLowerCase();
    byRoom.set(key, { room, gosini: [...(byRoom.get(key)?.gosini ?? []), g] });
  }

  const card = (title, gosini, note) =>
    '<div class="deed"><div class="act">' + escape(title) +
    (gosini.length > 1 ? ' <span class="deed-act">· ' + gosini.length + " insieme</span>" : "") +
    "</div>" +
    '<div class="because">' + gosini.map((g) => escape(g.name)).join(" · ") + "</div>" +
    (note ? '<div class="because">' + note + "</div>" : "") + "</div>";

  const rooms = [...byRoom.values()];
  $("rooms-list").innerHTML =
    (rooms.length === 0 ? '<p class="empty">Nessuna stanza, per ora.</p>'
      : rooms.map((r) => card(r.room, r.gosini,
          "indirizzo: <code>/?stanza=" + escape(r.room) + "</code>")).join("")) +
    (homeless.length === 0 ? ""
      : card("Senza stanza", homeless, "non compaiono su nessun dispositivo"));

  $("move-who").innerHTML = list.map((g) =>
    '<option value="' + g.id + '">' + escape(g.name) +
    (g.where ? " · " + escape(g.where) : " · senza stanza") + "</option>").join("");
  $("rooms-known").innerHTML = rooms.map((r) => '<option value="' + escape(r.room) + '">').join("");
}

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
    $("move-room").value = "";
    await loadRooms();
    // the rail names the rooms too, and it has just gone stale
    await loadGosini();
    drawRail(route().page);
  } catch (error) {
    say("rooms-msg", error.message, "err");
  } finally { $("move-go").disabled = false; }
});
`;
