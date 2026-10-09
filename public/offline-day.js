/* Local editor. All writes go through the service worker's persisted queue. */
(() => {
  let state, busy = false;
  const en = document.documentElement.lang === "en";
  const t = (es, english) => en ? english : es;
  const statusLabels = en ? { PENDING: "Pending", IN_PROGRESS: "In progress", DONE: "Completed", SKIPPED: "Skipped", CANCELLED: "Removed" } : { PENDING: "Pendiente", IN_PROGRESS: "En curso", DONE: "Completado", SKIPPED: "Omitido", CANCELLED: "Retirado" };
  function node(tag, text, parent) { const item = document.createElement(tag); if (text != null) item.textContent = text; if (parent) parent.append(item); return item; }
  async function message(data) {
    const worker = navigator.serviceWorker.controller ?? (await navigator.serviceWorker.ready).active;
    if (!worker) throw new Error(t("Abre Afaire con conexión una vez para preparar la copia local.", "Open Afaire online once to prepare a local copy."));
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error(t("No se pudo acceder a la cola local. Inténtalo de nuevo.", "Could not access the local queue. Try again."))); }, 10_000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); if (event.data?.error) reject(new Error(event.data.error)); else resolve(event.data); };
      worker.postMessage(data, [channel.port2]);
    });
  }
  async function load(preserveDraft = false) {
    state = await message({ type: "GET_OFFLINE_STATE" });
    // Background refreshes must not replace a form while someone is editing it.
    if (!preserveDraft || !document.querySelector("details[open]")) render();
  }
  async function run(action, preserveDraft = false) {
    if (busy) return;
    busy = true; document.querySelectorAll("button").forEach(button => { button.disabled = true; });
    try { await action(); await load(preserveDraft); }
    catch (error) { document.getElementById("sync-status").textContent = error.message; }
    finally { busy = false; document.querySelectorAll("button").forEach(button => { button.disabled = false; }); }
  }
  function button(parent, label, action, preserveDraft = false) { const control = node("button", label, parent); control.type = "button"; control.addEventListener("click", () => { void run(action, preserveDraft); }); return control; }
  function field(form, label, name, type, value, maximum) {
    const wrapper = node("label", label, form); const input = node(type === "textarea" ? "textarea" : "input", null, wrapper);
    input.name = name; if (type !== "textarea") input.type = type; input.value = value ?? "";
    if (maximum) input.maxLength = maximum;
    if (["title", "date", "endDate", "startTime", "endTime", "travelMinutes"].includes(name)) input.required = true;
    if (name === "travelMinutes") { input.min = "0"; input.max = "180"; }
    return input;
  }
  async function queue(event, change) {
    const snapshot = state.snapshot;
    await message({ type: "QUEUE_CHANGE", change: { id: crypto.randomUUID(), owner: snapshot.owner, deviceSessionId: snapshot.deviceSessionId, sessionVersion: snapshot.sessionVersion, eventId: event.id, expectedUpdatedAt: event.updatedAt, ...change } });
    if (navigator.onLine) void message({ type: "SYNC_CHANGES" }).catch(() => {});
  }
  function render() {
    const events = document.getElementById("offline-events"), changes = document.getElementById("queued-changes"), status = document.getElementById("sync-status");
    events.replaceChildren(); changes.replaceChildren();
    status.textContent = state.pending ? `${state.pending} ${state.pending === 1 ? t("cambio guardado en este dispositivo, pendiente de sincronizar.", "change saved on this device, waiting to sync.") : t("cambios guardados en este dispositivo, pendientes de sincronizar.", "changes saved on this device, waiting to sync.")}${state.conflicts ? " " + t("Hay conflictos que debes revisar.", "There are conflicts to review.") : ""}` : t("Sin cambios pendientes. Los cambios se guardan aquí y se envían al recuperar la conexión.", "No pending changes. Changes are saved here and sent when connection returns.");
    if (!state.snapshot) node("p", t("La copia de hoy caducó. Tus cambios pendientes se conservan; conecta para sincronizarlos y descargar el nuevo día.", "Today's copy expired. Pending changes are kept; reconnect to sync and download the new day."), events);
    if (state.pending) button(changes, t("Sincronizar ahora", "Sync now"), async () => { await message({ type: "SYNC_CHANGES" }); }, true);
    const grouped = new Map();
    for (const change of state.changes) grouped.set(change.eventId, [...(grouped.get(change.eventId) ?? []), change]);
    for (const [eventId, pending] of grouped) {
      const box = node("div", null, changes); box.className = "queued";
      node("strong", pending[0].title, box);
      for (const change of pending) {
        node("p", change.kind === "STATUS" ? statusLabels[change.status] : `${t("Horario/título guardado:", "Saved time/title:")} ${change.edit.title} · ${change.edit.date} ${change.edit.startTime}–${change.edit.endDate ?? change.edit.date} ${change.edit.endTime}`, box);
        if (change.error) { const error = node("p", t("Conflicto: ", "Conflict: ") + change.error, box); error.className = "error"; }
      }
      button(box, t("Descartar cambios de este bloque", "Discard changes for this block"), async () => {
        if (!confirm(t("¿Descartar los cambios locales de este bloque?", "Discard local changes for this block?"))) return;
        await message({ type: "DISCARD_EVENT_CHANGES", owner: pending[0].owner, deviceSessionId: pending[0].deviceSessionId, eventId });
      });
    }
    for (const original of state.snapshot?.events ?? []) {
      const pending = grouped.get(original.id) ?? [], conflict = pending.some(change => change.error);
      const event = { ...original };
      if (!conflict) for (const change of pending) {
        if (change.kind === "STATUS") event.status = change.status;
        else { Object.assign(event, change.edit); event.start = change.edit.startTime; event.end = change.edit.endTime; }
      }
      const row = node("li", null, events);
      node("strong", `${event.start}–${event.end} · ${event.title}`, row);
      node("p", `${statusLabels[event.status] ?? event.status}${pending.length ? " · " + t("Cambios locales", "Local changes") : ""}`, row);
      if (event.location) node("p", event.location, row);
      if (event.notes) node("p", event.notes, row);
      if (conflict) { node("p", t("Versión actual del servidor. Descarta los cambios en conflicto antes de editar.", "Current server version. Discard conflicting changes before editing."), row); continue; }
      if (!original.id || !state.snapshot.deviceSessionId || ["SKIPPED", "CANCELLED"].includes(event.status)) continue;
      const actions = node("div", null, row); actions.className = "actions";
      if (event.status === "DONE") button(actions, t("Reabrir", "Reopen"), () => queue(original, { kind: "STATUS", status: "PENDING" }));
      else {
        if (event.status === "PENDING") button(actions, t("Empezar", "Start"), () => queue(original, { kind: "STATUS", status: "IN_PROGRESS" }));
        button(actions, t("Hecho ✓", "Done ✓"), () => queue(original, { kind: "STATUS", status: "DONE" }));
        button(actions, t("Omitir hoy", "Skip today"), () => queue(original, { kind: "STATUS", status: "SKIPPED" }));
        button(actions, t("Quitar", "Remove"), async () => { if (confirm(t("¿Retirar este bloque?", "Remove this block?"))) await queue(original, { kind: "STATUS", status: "CANCELLED" }); });
      }
      const details = node("details", null, row); node("summary", t("Editar este bloque", "Edit this block"), details);
      details.addEventListener("toggle", () => { if (!details.open && details.isConnected && !busy) void load(true).catch(() => {}); });
      const form = node("form", null, details);
      field(form, t("Título", "Title"), "title", "text", event.title, 160);
      const date = field(form, t("Fecha inicial", "Start date"), "date", "date", event.date);
      if (event.habit) date.readOnly = true;
      field(form, t("Fecha final", "End date"), "endDate", "date", event.endDate);
      field(form, t("Inicio", "Start"), "startTime", "time", event.startTime);
      field(form, t("Fin", "End"), "endTime", "time", event.endTime);
      field(form, t("Ubicación", "Location"), "location", "text", event.location, 200);
      field(form, t("Traslado · minutos", "Travel · minutes"), "travelMinutes", "number", event.travelMinutes ?? 0);
      field(form, t("Notas", "Notes"), "notes", "textarea", event.notes, 2000);
      node("p", t("Se modifica solo este bloque y queda fijo. El servidor comprobará los solapamientos al sincronizar.", "Only this block changes and its time becomes fixed. The server checks overlaps when syncing."), form);
      const submit = node("button", t("Guardar en este dispositivo", "Save on this device"), form); submit.type = "submit";
      form.addEventListener("submit", event => {
        event.preventDefault(); if (!form.reportValidity()) return;
        const edit = Object.fromEntries(new FormData(form)); edit.travelMinutes = Number(edit.travelMinutes);
        void run(() => queue(original, { kind: "EDIT", edit }));
      });
    }
  }
  navigator.serviceWorker.addEventListener("message", event => { if (event.data?.type === "CHANGE_QUEUE_UPDATE" && !busy) void load(true).catch(() => {}); });
  const sync = () => { if (navigator.onLine && !busy) void run(async () => { await message({ type: "SYNC_CHANGES" }); }, true); };
  window.addEventListener("online", sync); setInterval(sync, 30_000);
  void load().then(sync).catch(error => { document.getElementById("sync-status").textContent = error.message; });
})();
