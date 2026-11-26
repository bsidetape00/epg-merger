"use strict";

/* Trips & fuel log, GOFAR CSV import, and auto-tagging of trips from your own history. */

registerRoute("trips", {
  icon: "🚗", label: "Trips", order: 60, hint: "g then r",
  badge: () => DB.trips.filter((t) => t.purpose === "uncategorised").length,
  render: renderTrips,
});

let tripsTab = "trips";
function renderTrips() {
  const fy = fyStart();
  const bizKm = DB.trips.filter((t) => t.purpose === "business" && t.date >= fy).reduce((s, t) => s + (Number(t.km) || 0), 0);
  const seg = `<div class="seg">
    <button class="${tripsTab === "trips" ? "active" : ""}" onclick="App.setTripsTab('trips')">Trips</button>
    <button class="${tripsTab === "fuel" ? "active" : ""}" onclick="App.setTripsTab('fuel')">Fuel</button></div>`;

  let body;
  if (tripsTab === "trips") {
    const rows = [...DB.trips].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 200).map((t) => `
      <div class="item" onclick="App.editTrip('${t.id}')">
        <div class="grow"><div class="title">${esc(t.from || "?")} → ${esc(t.to || "?")}</div>
        <div class="meta">${fmtDate(t.date)} · ${(Number(t.km) || 0).toFixed(1)} km${t.clientId ? " · " + esc(clientName(t.clientId)) : ""}${t.source === "gofar" ? " · GOFAR" : ""}</div></div>
        <span class="pill ${t.purpose}">${t.purpose}</span></div>`).join("");
    body = `
      <div class="actions">
        <button class="btn-primary" onclick="App.editTrip()">＋ Add trip</button>
        <button onclick="App.gofarImport()">⬆ Import GOFAR CSV</button>
        ${autotagPlan().length ? `<button onclick="App.autotagTrips()">✨ Auto-tag ${autotagPlan().length}</button>` : ""}
      </div>
      <div class="card list">${rows || `<div class="empty"><span class="big">🚗</span>No trips yet. Add one, or export a CSV from your GOFAR app and import it here.</div>`}</div>`;
  } else {
    const rows = [...DB.fuel].sort((a, b) => (a.date < b.date ? 1 : -1)).map((f) => `
      <div class="item" onclick="App.editFuel('${f.id}')">
        <div class="grow"><div class="title">${esc(f.station || "Fill-up")}</div>
        <div class="meta">${fmtDate(f.date)}${f.litres ? " · " + f.litres + " L" : ""}${f.odometer ? " · " + f.odometer + " km odo" : ""}</div></div>
        <span class="amount">${money(f.cost)}</span></div>`).join("");
    body = `
      <div class="actions"><button class="btn-primary" onclick="App.editFuel()">＋ Add fuel</button></div>
      <div class="card list">${rows || `<div class="empty"><span class="big">⛽️</span>No fuel logged yet. Keep receipts — add them here as you go.</div>`}</div>`;
  }

  $("#main").innerHTML = `
    <div class="page-head"><h1>Trips &amp; Fuel</h1></div>
    <p class="sub">This FY: ${bizKm.toFixed(0)} business km ≈ ${money(bizKm * (DB.settings.kmRate || 0))} deductible at ${money(DB.settings.kmRate)}/km</p>
    ${seg}${body}`;
}
function setTripsTab(t) { tripsTab = t; render(); }

function editTrip(id) {
  const t = id ? DB.trips.find((x) => x.id === id) : {};
  const opts = DB.clients.map((c) => `<option value="${c.id}" ${t.clientId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  openModal(`
    <h2>${id ? "Edit trip" : "Add trip"}</h2>
    <form onsubmit="App.saveTrip(event,'${id || ""}')">
      <div class="field-row">
        <div class="field"><label>Date</label><input name="date" type="date" value="${t.date || today()}"></div>
        <div class="field"><label>Distance (km) *</label><input name="km" type="number" step="0.1" min="0" required value="${t.km ?? ""}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>From</label><input name="from" value="${esc(t.from || "")}"></div>
        <div class="field"><label>To</label><input name="to" value="${esc(t.to || "")}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Purpose</label><select name="purpose">
          ${["business", "personal", "uncategorised"].map((p) => `<option ${t.purpose === p ? "selected" : ""}>${p}</option>`).join("")}</select></div>
        <div class="field"><label>Client (optional)</label><select name="clientId"><option value="">—</option>${opts}</select></div>
      </div>
      <div class="field"><label>Notes</label><input name="notes" value="${esc(t.notes || "")}"></div>
      <div class="modal-actions">
        ${id ? `<button type="button" class="btn-danger" onclick="App.deleteTrip('${id}')">Delete</button>` : `<button type="button" onclick="App.closeModal()">Cancel</button>`}
        <button class="btn-primary" type="submit">Save</button>
      </div>
    </form>`);
}
function saveTrip(ev, id) {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const data = { date: f.get("date") || today(), km: Number(f.get("km")) || 0, from: f.get("from").trim(), to: f.get("to").trim(), purpose: f.get("purpose"), clientId: f.get("clientId") || null, notes: f.get("notes").trim() };
  if (id) Object.assign(DB.trips.find((x) => x.id === id), data);
  else DB.trips.push(Object.assign({ id: uid(), source: "manual" }, data));
  save(); closeModal(); render();
}
function deleteTrip(id) { DB.trips = DB.trips.filter((x) => x.id !== id); save(); closeModal(); render(); }

function editFuel(id) {
  const f0 = id ? DB.fuel.find((x) => x.id === id) : {};
  openModal(`
    <h2>${id ? "Edit fuel" : "Add fuel"}</h2>
    <form onsubmit="App.saveFuel(event,'${id || ""}')">
      <div class="field-row">
        <div class="field"><label>Date</label><input name="date" type="date" value="${f0.date || today()}"></div>
        <div class="field"><label>Cost *</label><input name="cost" type="number" step="0.01" min="0" required value="${f0.cost ?? ""}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Litres</label><input name="litres" type="number" step="0.01" min="0" value="${f0.litres ?? ""}"></div>
        <div class="field"><label>Odometer (km)</label><input name="odometer" type="number" min="0" value="${f0.odometer ?? ""}"></div>
      </div>
      <div class="field"><label>Station / notes</label><input name="station" value="${esc(f0.station || "")}"></div>
      <div class="modal-actions">
        ${id ? `<button type="button" class="btn-danger" onclick="App.deleteFuel('${id}')">Delete</button>` : `<button type="button" onclick="App.closeModal()">Cancel</button>`}
        <button class="btn-primary" type="submit">Save</button>
      </div>
    </form>`);
}
function saveFuel(ev, id) {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const data = { date: f.get("date") || today(), cost: Number(f.get("cost")) || 0, litres: Number(f.get("litres")) || null, odometer: Number(f.get("odometer")) || null, station: f.get("station").trim() };
  if (id) Object.assign(DB.fuel.find((x) => x.id === id), data);
  else DB.fuel.push(Object.assign({ id: uid() }, data));
  save(); closeModal(); render();
}
function deleteFuel(id) { DB.fuel = DB.fuel.filter((x) => x.id !== id); save(); closeModal(); render(); }

/* ---------------- GOFAR CSV import ---------------- */
let csvState = null; // {headers, rows}

function gofarImport() {
  openModal(`
    <h2>Import GOFAR trips</h2>
    <p class="small muted">In the GOFAR app: Logbook → Export → CSV, then save the file somewhere you can reach (Files / iCloud Drive) and pick it below. Works with any trip CSV, not just GOFAR.</p>
    <div class="field"><input type="file" accept=".csv,text/csv" onchange="App.csvChosen(event)"></div>
    <div id="csv-map"></div>
    <div class="modal-actions"><button onclick="App.closeModal()">Cancel</button></div>`);
}

function csvChosen(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCSV(String(reader.result));
    if (rows.length < 2) return alert("Couldn't find data rows in that CSV.");
    csvState = { headers: rows[0], rows: rows.slice(1).filter((r) => r.some((c) => c.trim())) };
    renderCsvMap();
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const CSV_FIELDS = [
  { key: "date", label: "Date / start time", match: /start.*(time|date)|^date|^when/i },
  { key: "km", label: "Distance (km)", match: /distance|(^|[^a-z])km([^a-z]|$)|kilometre/i },
  { key: "from", label: "From / start location", match: /start.*(location|address|place|suburb)|^from|origin/i },
  { key: "to", label: "To / end location", match: /end.*(location|address|place|suburb)|^to$|destination/i },
  { key: "purpose", label: "Purpose / tag (optional)", match: /purpose|tag|category|business|type/i },
];

function renderCsvMap() {
  const { headers, rows } = csvState;
  const selects = CSV_FIELDS.map((f) => {
    const guess = headers.findIndex((h) => f.match.test(h));
    const opts = headers.map((h, i) => `<option value="${i}" ${i === guess ? "selected" : ""}>${esc(h)}</option>`).join("");
    return `<div class="field"><label>${f.label}</label>
      <select id="map-${f.key}"><option value="-1">— skip —</option>${opts}</select></div>`;
  }).join("");
  $("#csv-map").innerHTML = `
    <p class="small"><strong>${rows.length}</strong> rows found. Match the columns:</p>
    ${selects}
    <p class="small muted">Preview: ${esc(rows[0].slice(0, 4).join(" | ")).slice(0, 120)}…</p>
    <button class="btn-primary btn-block" onclick="App.runCsvImport()">Import ${rows.length} trips</button>`;
}

function runCsvImport() {
  const idx = {};
  for (const f of CSV_FIELDS) idx[f.key] = Number($("#map-" + f.key).value);
  if (idx.km < 0 || idx.date < 0) return alert("Date and distance columns are required.");
  const existing = new Set(DB.trips.map((t) => t.date + "|" + Number(t.km).toFixed(1)));
  let added = 0, skipped = 0;
  for (const r of csvState.rows) {
    const date = parseLooseDate(r[idx.date] || "");
    const km = parseFloat(String(r[idx.km]).replace(/[^\d.]/g, ""));
    if (!date || !isFinite(km) || km <= 0) { skipped++; continue; }
    const key = date + "|" + km.toFixed(1);
    if (existing.has(key)) { skipped++; continue; }
    existing.add(key);
    let purpose = "uncategorised";
    if (idx.purpose >= 0) {
      const p = String(r[idx.purpose] || "").trim().toLowerCase();
      if (/^(bus|work|yes|y$|true|1$)/.test(p)) purpose = "business";
      else if (/^(pers|priv|no$|n$|false|0$)/.test(p)) purpose = "personal";
    }
    DB.trips.push({
      id: uid(), date, km: Math.round(km * 10) / 10,
      from: idx.from >= 0 ? (r[idx.from] || "").trim() : "",
      to: idx.to >= 0 ? (r[idx.to] || "").trim() : "",
      purpose, clientId: null, source: "gofar", notes: "",
    });
    added++;
  }
  const tagged = applyAutotag();
  save(); closeModal();
  tripsTab = "trips";
  render();
  alert(`Imported ${added} trip(s). Skipped ${skipped} (duplicates or unreadable).` +
    (tagged ? `\n${tagged} were tagged automatically from your past trips.` : ""));
}

/* "2026-06-25 08:12", "25/06/2026 8:12 am", "2026-06-25T08:12:00Z" -> local ISO date.
   Slash dates are read day-first (Australian). Avoids new Date(str), which Safari rejects for
   space-separated times and which shifts the day when converted through UTC. */
function parseLooseDate(str) {
  const s = String(str).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return isNaN(d) ? null : isoLocal(d);
}

/* ----- auto-tagging: learn from trips you've already categorised ----- */
const routeKey = (t) => {
  const n = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const a = n(t.from), b = n(t.to);
  return a && b ? [a, b].sort().join("|") : ""; // A→B and B→A count as the same route
};
function autotagPlan() {
  const known = {};
  for (const t of DB.trips) {
    if (t.purpose === "uncategorised") continue;
    const k = routeKey(t);
    if (!k) continue;
    const r = (known[k] = known[k] || { business: 0, personal: 0, clients: new Set() });
    r[t.purpose] = (r[t.purpose] || 0) + 1;
    r.clients.add(t.clientId || "");
  }
  const plan = [];
  for (const t of DB.trips) {
    if (t.purpose !== "uncategorised") continue;
    const r = known[routeKey(t)];
    if (!r) continue;
    let purpose = null;
    if (r.business && !r.personal) purpose = "business";
    else if (r.personal && !r.business) purpose = "personal";
    if (!purpose) continue; // history disagrees with itself, so leave it for a human
    const only = r.clients.size === 1 ? [...r.clients][0] : ""; // every past trip on this route had the same client
    plan.push({ trip: t, purpose, clientId: only || null });
  }
  return plan;
}
function applyAutotag() {
  const plan = autotagPlan();
  for (const { trip, purpose, clientId } of plan) {
    trip.purpose = purpose;
    if (!trip.clientId && clientId) trip.clientId = clientId;
  }
  return plan.length;
}
function autotagTrips() {
  const n = applyAutotag();
  if (!n) return toast("Nothing to auto-tag yet. Categorise a few trips first.");
  save(); render();
  toast(`✨ Auto-tagged ${n} trip${n === 1 ? "" : "s"} from your past routes`);
}

Object.assign(App, {
  setTripsTab, editTrip, saveTrip, deleteTrip, editFuel, saveFuel, deleteFuel,
  gofarImport, csvChosen, runCsvImport, autotagPlan, autotagTrips,
});

