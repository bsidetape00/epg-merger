/* Business HQ — single-file app. Data stays in localStorage on each device. */
"use strict";

/* ---------------- Store ---------------- */
const STORE_KEY = "bizhq.data.v1";

const defaultData = () => ({
  version: 1,
  settings: {
    businessName: "",
    ownerName: "",
    email: "",
    phone: "",
    abn: "",
    currency: "AUD",
    hourlyRate: 0,
    kmRate: 0.88,           // per-km deduction rate (ATO cents/km method)
    invoicePrefix: "INV-",
    nextInvoiceNumber: 1,
    paymentTermsDays: 14,
    paymentDetails: "",     // bank details / payment instructions on invoices
  },
  clients: [],
  work: [],       // {id, clientId, date, desc, hours, rate, invoiceId}
  invoices: [],   // {id, number, clientId, issueDate, dueDate, items:[{desc,qty,unit}], status, paidDate, notes}
  trips: [],      // {id, date, from, to, km, purpose(business|personal|uncategorised), clientId, source, notes}
  fuel: [],       // {id, date, litres, cost, odometer, station, notes}
});

let DB = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultData();
    const d = JSON.parse(raw);
    return Object.assign(defaultData(), d, { settings: Object.assign(defaultData().settings, d.settings || {}) });
  } catch (e) {
    console.error("load failed", e);
    return defaultData();
  }
}
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(DB));
  renderNav(); // keep badges fresh
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------------- Helpers ---------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);

function money(n) {
  const cur = DB.settings.currency || "AUD";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n || 0); }
  catch { return cur + " " + (n || 0).toFixed(2); }
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
function addDays(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

const clientById = (id) => DB.clients.find((c) => c.id === id);
const clientName = (id) => (clientById(id) || {}).name || "(no client)";
const initials = (name) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

function invoiceTotal(inv) { return inv.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit) || 0), 0); }
function invoiceStatus(inv) {
  if (inv.status === "paid") return "paid";
  if (inv.status === "sent" && inv.dueDate && inv.dueDate < today()) return "overdue";
  return inv.status;
}
function workAmount(w) { return (Number(w.hours) || 0) * (Number(w.rate) || 0); }
const unbilledWork = () => DB.work.filter((w) => !w.invoiceId);

/* Financial year (AU: 1 July – 30 June) */
function fyStart() {
  const now = new Date();
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-07-01`;
}

/* ---------------- Nudges ---------------- */
function computeNudges() {
  const nudges = [];
  const t = today();

  for (const inv of DB.invoices) {
    if (invoiceStatus(inv) === "overdue") {
      nudges.push({
        level: "bad", icon: "⏰",
        title: `Invoice ${inv.number} is ${daysBetween(inv.dueDate, t)} day(s) overdue`,
        msg: `${clientName(inv.clientId)} owes ${money(invoiceTotal(inv))}. Chase it up.`,
        action: { label: "View", href: "#/invoices" },
      });
    }
  }
  for (const inv of DB.invoices) {
    if (inv.status === "draft" && daysBetween(inv.issueDate, t) >= 3) {
      nudges.push({
        level: "warn", icon: "📮",
        title: `Draft invoice ${inv.number} hasn't been sent`,
        msg: `Created ${daysBetween(inv.issueDate, t)} days ago for ${clientName(inv.clientId)} — ${money(invoiceTotal(inv))}. Send it!`,
        action: { label: "View", href: "#/invoices" },
      });
    }
  }
  // Unbilled work grouped by client
  const byClient = {};
  for (const w of unbilledWork()) {
    (byClient[w.clientId] = byClient[w.clientId] || []).push(w);
  }
  for (const [cid, ws] of Object.entries(byClient)) {
    const total = ws.reduce((s, w) => s + workAmount(w), 0);
    const oldest = ws.reduce((m, w) => (w.date < m ? w.date : m), t);
    if (total > 0 && daysBetween(oldest, t) >= 7) {
      nudges.push({
        level: "warn", icon: "🧾",
        title: `Time to invoice ${clientName(cid)}`,
        msg: `${ws.length} unbilled work item(s) worth ${money(total)} — oldest from ${fmtDate(oldest)}.`,
        action: { label: "Create invoice", onclick: `App.invoiceFromWork('${cid}')` },
      });
    }
  }
  const uncat = DB.trips.filter((tr) => tr.purpose === "uncategorised");
  if (uncat.length) {
    nudges.push({
      level: "warn", icon: "🚗",
      title: `${uncat.length} trip(s) need categorising`,
      msg: "Mark them business or personal so your travel deductions stay accurate.",
      action: { label: "Review", href: "#/trips" },
    });
  }
  const lastFuel = DB.fuel.map((f) => f.date).sort().pop();
  if (DB.fuel.length && lastFuel && daysBetween(lastFuel, t) > 21) {
    nudges.push({
      level: "warn", icon: "⛽️",
      title: "No fuel logged in 3+ weeks",
      msg: `Last fill-up recorded ${fmtDate(lastFuel)}. Snap your receipts before they fade.`,
      action: { label: "Add fuel", onclick: "App.editFuel()" },
    });
  }
  return nudges;
}

/* ---------------- Router & Nav ---------------- */
const ROUTES = {
  "dashboard": { icon: "🏠", label: "Home", render: renderDashboard },
  "clients": { icon: "👥", label: "Clients", render: renderClients },
  "invoices": { icon: "🧾", label: "Invoices", render: renderInvoices },
  "trips": { icon: "🚗", label: "Trips", render: renderTrips },
  "settings": { icon: "⚙️", label: "Settings", render: renderSettings },
};

function currentRoute() {
  const h = (location.hash || "#/dashboard").replace(/^#\//, "").split("/")[0];
  return ROUTES[h] ? h : "dashboard";
}

function renderNav() {
  const cur = currentRoute();
  const badges = { invoices: DB.invoices.filter((i) => invoiceStatus(i) === "overdue").length, trips: DB.trips.filter((t) => t.purpose === "uncategorised").length };
  const html = Object.entries(ROUTES).map(([key, r]) =>
    `<a href="#/${key}" class="${cur === key ? "active" : ""}">
       <span class="icon">${r.icon}</span><span>${r.label}</span>
       ${badges[key] ? `<span class="nav-badge">${badges[key]}</span>` : ""}
     </a>`).join("");
  $("#nav").innerHTML = html;
  $("#tabbar").innerHTML = html;
}

function render() {
  renderNav();
  ROUTES[currentRoute()].render();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", render);

/* ---------------- Dashboard ---------------- */
function renderDashboard() {
  const s = DB.settings;
  const t = today();
  const nudges = computeNudges();

  const owed = DB.invoices.filter((i) => ["sent", "overdue"].includes(invoiceStatus(i))).reduce((sum, i) => sum + invoiceTotal(i), 0);
  const unbilled = unbilledWork().reduce((sum, w) => sum + workAmount(w), 0);
  const fy = fyStart();
  const bizKm = DB.trips.filter((tr) => tr.purpose === "business" && tr.date >= fy).reduce((sum, tr) => sum + (Number(tr.km) || 0), 0);
  const fuelSpend = DB.fuel.filter((f) => f.date >= fy).reduce((sum, f) => sum + (Number(f.cost) || 0), 0);
  const paidFy = DB.invoices.filter((i) => i.status === "paid" && (i.paidDate || i.issueDate) >= fy).reduce((sum, i) => sum + invoiceTotal(i), 0);

  $("#main").innerHTML = `
    <h1>${esc(s.businessName || "G'day!")}</h1>
    <p class="sub">${new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>

    ${nudges.length ? nudges.map(nudgeHtml).join("") : `<div class="nudge good"><span class="icon">✅</span><div class="msg"><strong>All caught up</strong>No overdue invoices or loose ends. Nice.</div></div>`}

    <div class="stats">
      <div class="stat"><div class="label">Owed to you</div><div class="value">${money(owed)}</div><div class="hint">sent, unpaid</div></div>
      <div class="stat"><div class="label">Unbilled work</div><div class="value">${money(unbilled)}</div><div class="hint">not yet invoiced</div></div>
      <div class="stat"><div class="label">Paid this FY</div><div class="value">${money(paidFy)}</div><div class="hint">since ${fmtDate(fy)}</div></div>
      <div class="stat"><div class="label">Business km (FY)</div><div class="value">${bizKm.toFixed(0)}</div><div class="hint">≈ ${money(bizKm * (s.kmRate || 0))} deductible</div></div>
      <div class="stat"><div class="label">Fuel spend (FY)</div><div class="value">${money(fuelSpend)}</div><div class="hint">${DB.fuel.filter((f) => f.date >= fy).length} fill-ups</div></div>
    </div>

    <h2>Quick actions</h2>
    <div class="actions">
      <button class="btn-primary" onclick="App.editWork()">＋ Log work</button>
      <button onclick="App.editInvoice()">＋ New invoice</button>
      <button onclick="App.editTrip()">＋ Add trip</button>
      <button onclick="App.editFuel()">＋ Add fuel</button>
      <button onclick="App.editClient()">＋ New client</button>
    </div>

    <h2>Recent activity</h2>
    <div class="card list">${recentActivityHtml(t)}</div>
  `;
}

function nudgeHtml(n) {
  const act = n.action
    ? (n.action.href
        ? `<a class="btn btn-small" href="${n.action.href}">${n.action.label}</a>`
        : `<button class="btn-small" onclick="${n.action.onclick}">${n.action.label}</button>`)
    : "";
  return `<div class="nudge ${n.level}"><span class="icon">${n.icon}</span>
    <div class="msg"><strong>${esc(n.title)}</strong>${esc(n.msg)}</div>${act}</div>`;
}

function recentActivityHtml() {
  const events = [];
  for (const w of DB.work) events.push({ date: w.date, html: `<div class="grow"><div class="title">Work · ${esc(clientName(w.clientId))}</div><div class="meta">${esc(w.desc)}</div></div><span class="amount">${money(workAmount(w))}</span>` });
  for (const i of DB.invoices) events.push({ date: i.issueDate, html: `<div class="grow"><div class="title">Invoice ${esc(i.number)} · ${esc(clientName(i.clientId))}</div><div class="meta"><span class="pill ${invoiceStatus(i)}">${invoiceStatus(i)}</span></div></div><span class="amount">${money(invoiceTotal(i))}</span>` });
  for (const tr of DB.trips) events.push({ date: tr.date, html: `<div class="grow"><div class="title">Trip · ${esc(tr.from || "?")} → ${esc(tr.to || "?")}</div><div class="meta">${(Number(tr.km) || 0).toFixed(1)} km · <span class="pill ${tr.purpose}">${tr.purpose}</span></div></div>` });
  for (const f of DB.fuel) events.push({ date: f.date, html: `<div class="grow"><div class="title">Fuel · ${esc(f.station || "fill-up")}</div><div class="meta">${f.litres ? f.litres + " L" : ""}</div></div><span class="amount">${money(f.cost)}</span>` });
  events.sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!events.length) return `<div class="empty"><span class="big">🌱</span>Nothing yet. Add a client, log some work, take a trip.</div>`;
  return events.slice(0, 8).map((e) => `<div class="item" style="cursor:default"><span class="meta" style="width:74px;flex:0 0 auto">${fmtDate(e.date)}</span>${e.html}</div>`).join("");
}

/* ---------------- Clients ---------------- */
function renderClients() {
  const items = [...DB.clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
    const owed = DB.invoices.filter((i) => i.clientId === c.id && ["sent", "overdue"].includes(invoiceStatus(i))).reduce((s, i) => s + invoiceTotal(i), 0);
    const unb = unbilledWork().filter((w) => w.clientId === c.id).reduce((s, w) => s + workAmount(w), 0);
    const meta = [c.company, owed ? `owes ${money(owed)}` : "", unb ? `${money(unb)} unbilled` : ""].filter(Boolean).join(" · ");
    return `<div class="item" onclick="App.clientDetail('${c.id}')">
      <span class="avatar">${esc(initials(c.name))}</span>
      <div class="grow"><div class="title">${esc(c.name)}</div><div class="meta">${esc(meta) || "&nbsp;"}</div></div>
      <span class="muted">›</span></div>`;
  }).join("");

  $("#main").innerHTML = `
    <h1>Clients</h1>
    <div class="actions"><button class="btn-primary" onclick="App.editClient()">＋ New client</button></div>
    <div class="card list">${items || `<div class="empty"><span class="big">👥</span>No clients yet — add your first one.</div>`}</div>`;
}

function clientDetail(id) {
  const c = clientById(id);
  if (!c) return;
  const work = DB.work.filter((w) => w.clientId === id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const invs = DB.invoices.filter((i) => i.clientId === id).sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));
  const trips = DB.trips.filter((t) => t.clientId === id);
  const unb = work.filter((w) => !w.invoiceId).reduce((s, w) => s + workAmount(w), 0);

  openModal(`
    <h2>${esc(c.name)}</h2>
    <p class="small muted">${esc([c.company, c.email, c.phone].filter(Boolean).join(" · "))}</p>
    ${c.notes ? `<p class="small">${esc(c.notes)}</p>` : ""}
    <div class="actions">
      <button class="btn-small" onclick="App.editClient('${id}')">Edit</button>
      <button class="btn-small" onclick="App.editWork(null,'${id}')">＋ Log work</button>
      ${unb > 0 ? `<button class="btn-small btn-primary" onclick="App.invoiceFromWork('${id}')">Invoice ${money(unb)} unbilled</button>` : ""}
      ${c.email ? `<a class="btn btn-small" href="mailto:${esc(c.email)}">Email</a>` : ""}
      ${c.phone ? `<a class="btn btn-small" href="tel:${esc(c.phone)}">Call</a>` : ""}
    </div>
    <h2>Work</h2>
    ${work.length ? `<table class="simple"><tr><th>Date</th><th>What</th><th class="num">Amount</th></tr>${work.slice(0, 10).map((w) => `<tr><td>${fmtDate(w.date)}</td><td>${esc(w.desc)}${w.invoiceId ? "" : ' <span class="pill uncategorised">unbilled</span>'}</td><td class="num">${money(workAmount(w))}</td></tr>`).join("")}</table>` : `<p class="small muted">No work logged.</p>`}
    <h2>Invoices</h2>
    ${invs.length ? `<table class="simple">${invs.slice(0, 10).map((i) => `<tr><td>${esc(i.number)}</td><td><span class="pill ${invoiceStatus(i)}">${invoiceStatus(i)}</span></td><td class="num">${money(invoiceTotal(i))}</td></tr>`).join("")}</table>` : `<p class="small muted">No invoices.</p>`}
    ${trips.length ? `<h2>Trips</h2><p class="small muted">${trips.length} trip(s), ${trips.reduce((s, t) => s + (Number(t.km) || 0), 0).toFixed(0)} km linked to this client.</p>` : ""}
    <div class="modal-actions">
      <button class="btn-danger" onclick="App.deleteClient('${id}')">Delete</button>
      <button onclick="App.closeModal()">Close</button>
    </div>`);
}

function editClient(id) {
  const c = id ? clientById(id) : {};
  openModal(`
    <h2>${id ? "Edit client" : "New client"}</h2>
    <form onsubmit="App.saveClient(event,'${id || ""}')">
      <div class="field"><label>Name *</label><input name="name" required value="${esc(c.name || "")}"></div>
      <div class="field"><label>Company</label><input name="company" value="${esc(c.company || "")}"></div>
      <div class="field-row">
        <div class="field"><label>Email</label><input name="email" type="email" value="${esc(c.email || "")}"></div>
        <div class="field"><label>Phone</label><input name="phone" type="tel" value="${esc(c.phone || "")}"></div>
      </div>
      <div class="field"><label>Notes</label><textarea name="notes" rows="3">${esc(c.notes || "")}</textarea></div>
      <div class="modal-actions"><button type="button" onclick="App.closeModal()">Cancel</button><button class="btn-primary" type="submit">Save</button></div>
    </form>`);
}
function saveClient(ev, id) {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const data = { name: f.get("name").trim(), company: f.get("company").trim(), email: f.get("email").trim(), phone: f.get("phone").trim(), notes: f.get("notes").trim() };
  if (id) Object.assign(clientById(id), data);
  else DB.clients.push(Object.assign({ id: uid(), createdAt: today() }, data));
  save(); closeModal(); render();
}
function deleteClient(id) {
  if (!confirm("Delete this client? Their work, invoices and trips stay but lose the link.")) return;
  DB.clients = DB.clients.filter((c) => c.id !== id);
  save(); closeModal(); render();
}

/* ---------------- Work log ---------------- */
function editWork(id, presetClient) {
  const w = id ? DB.work.find((x) => x.id === id) : {};
  const opts = DB.clients.map((c) => `<option value="${c.id}" ${(w.clientId || presetClient) === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  openModal(`
    <h2>${id ? "Edit work" : "Log work"}</h2>
    <form onsubmit="App.saveWork(event,'${id || ""}')">
      <div class="field"><label>Client *</label><select name="clientId" required><option value="">— pick —</option>${opts}</select></div>
      <div class="field"><label>What did you do? *</label><input name="desc" required value="${esc(w.desc || "")}" placeholder="e.g. Site visit and quote"></div>
      <div class="field-row">
        <div class="field"><label>Date</label><input name="date" type="date" value="${w.date || today()}"></div>
        <div class="field"><label>Hours</label><input name="hours" type="number" step="0.25" min="0" value="${w.hours ?? 1}"></div>
        <div class="field"><label>Rate/hr</label><input name="rate" type="number" step="0.01" min="0" value="${w.rate ?? (DB.settings.hourlyRate || "")}"></div>
      </div>
      <div class="modal-actions"><button type="button" onclick="App.closeModal()">Cancel</button><button class="btn-primary" type="submit">Save</button></div>
    </form>`);
}
function saveWork(ev, id) {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const data = { clientId: f.get("clientId"), desc: f.get("desc").trim(), date: f.get("date") || today(), hours: Number(f.get("hours")) || 0, rate: Number(f.get("rate")) || 0 };
  if (id) Object.assign(DB.work.find((x) => x.id === id), data);
  else DB.work.push(Object.assign({ id: uid(), invoiceId: null }, data));
  save(); closeModal(); render();
}

/* ---------------- Invoices ---------------- */
function renderInvoices() {
  const unb = unbilledWork();
  const unbByClient = {};
  for (const w of unb) (unbByClient[w.clientId] = unbByClient[w.clientId] || []).push(w);

  const unbilledHtml = Object.entries(unbByClient).map(([cid, ws]) => {
    const total = ws.reduce((s, w) => s + workAmount(w), 0);
    return `<div class="item" style="cursor:default">
      <div class="grow"><div class="title">${esc(clientName(cid))}</div><div class="meta">${ws.length} item(s) unbilled</div></div>
      <span class="amount">${money(total)}</span>
      <button class="btn-small btn-primary" onclick="App.invoiceFromWork('${cid}')">Invoice</button></div>`;
  }).join("");

  const invs = [...DB.invoices].sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1)).map((i) => {
    const st = invoiceStatus(i);
    return `<div class="item" onclick="App.invoiceDetail('${i.id}')">
      <div class="grow"><div class="title">${esc(i.number)} · ${esc(clientName(i.clientId))}</div>
      <div class="meta">${fmtDate(i.issueDate)}${i.dueDate ? " · due " + fmtDate(i.dueDate) : ""}</div></div>
      <span class="pill ${st}">${st}</span><span class="amount">${money(invoiceTotal(i))}</span></div>`;
  }).join("");

  $("#main").innerHTML = `
    <h1>Invoices</h1>
    <div class="actions">
      <button class="btn-primary" onclick="App.editInvoice()">＋ New invoice</button>
      <button onclick="App.editWork()">＋ Log work</button>
    </div>
    ${unbilledHtml ? `<h2>Ready to bill</h2><div class="card list">${unbilledHtml}</div>` : ""}
    <h2>All invoices</h2>
    <div class="card list">${invs || `<div class="empty"><span class="big">🧾</span>No invoices yet.</div>`}</div>`;
}

function nextInvoiceNumber() {
  const s = DB.settings;
  const num = s.invoicePrefix + String(s.nextInvoiceNumber).padStart(4, "0");
  return num;
}

function invoiceFromWork(clientId) {
  const ws = unbilledWork().filter((w) => w.clientId === clientId);
  if (!ws.length) return alert("No unbilled work for this client.");
  const inv = {
    id: uid(),
    number: nextInvoiceNumber(),
    clientId,
    issueDate: today(),
    dueDate: addDays(today(), DB.settings.paymentTermsDays || 14),
    items: ws.map((w) => ({ desc: `${fmtDate(w.date)} — ${w.desc}`, qty: w.hours || 1, unit: w.rate || 0 })),
    status: "draft",
    notes: "",
  };
  DB.settings.nextInvoiceNumber++;
  DB.invoices.push(inv);
  for (const w of ws) w.invoiceId = inv.id;
  save(); closeModal();
  location.hash = "#/invoices";
  invoiceDetail(inv.id);
}

function editInvoice(id) {
  const inv = id ? DB.invoices.find((x) => x.id === id) : {
    number: nextInvoiceNumber(), clientId: "", issueDate: today(),
    dueDate: addDays(today(), DB.settings.paymentTermsDays || 14),
    items: [{ desc: "", qty: 1, unit: DB.settings.hourlyRate || 0 }], notes: "",
  };
  const opts = DB.clients.map((c) => `<option value="${c.id}" ${inv.clientId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  const lines = inv.items.map((it) => lineRowHtml(it)).join("");
  openModal(`
    <h2>${id ? "Edit invoice " + esc(inv.number) : "New invoice"}</h2>
    <form onsubmit="App.saveInvoice(event,'${id || ""}')">
      <div class="field-row">
        <div class="field"><label>Number</label><input name="number" value="${esc(inv.number)}"></div>
        <div class="field"><label>Client *</label><select name="clientId" required><option value="">— pick —</option>${opts}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Issue date</label><input name="issueDate" type="date" value="${inv.issueDate}"></div>
        <div class="field"><label>Due date</label><input name="dueDate" type="date" value="${inv.dueDate || ""}"></div>
      </div>
      <label>Line items (description / qty / unit price)</label>
      <div id="inv-lines">${lines}</div>
      <button type="button" class="btn-small" onclick="App.addLine()">＋ Add line</button>
      <div class="field" style="margin-top:12px"><label>Notes (shown on invoice)</label><textarea name="notes" rows="2">${esc(inv.notes || "")}</textarea></div>
      <div class="modal-actions"><button type="button" onclick="App.closeModal()">Cancel</button><button class="btn-primary" type="submit">Save</button></div>
    </form>`);
}
function lineRowHtml(it = { desc: "", qty: 1, unit: 0 }) {
  return `<div class="line-row">
    <input name="li-desc" placeholder="Description" value="${esc(it.desc)}">
    <input name="li-qty" type="number" step="0.01" value="${it.qty}">
    <input name="li-unit" type="number" step="0.01" value="${it.unit}">
    <button type="button" class="del" onclick="this.parentElement.remove()">✕</button></div>`;
}
function addLine() { $("#inv-lines").insertAdjacentHTML("beforeend", lineRowHtml()); }

function saveInvoice(ev, id) {
  ev.preventDefault();
  const form = ev.target;
  const f = new FormData(form);
  const items = [...form.querySelectorAll(".line-row")].map((r) => ({
    desc: r.querySelector('[name="li-desc"]').value.trim(),
    qty: Number(r.querySelector('[name="li-qty"]').value) || 0,
    unit: Number(r.querySelector('[name="li-unit"]').value) || 0,
  })).filter((it) => it.desc || it.qty * it.unit);
  const data = { number: f.get("number").trim(), clientId: f.get("clientId"), issueDate: f.get("issueDate"), dueDate: f.get("dueDate"), items, notes: f.get("notes").trim() };
  if (id) Object.assign(DB.invoices.find((x) => x.id === id), data);
  else {
    DB.invoices.push(Object.assign({ id: uid(), status: "draft" }, data));
    DB.settings.nextInvoiceNumber++;
  }
  save(); closeModal(); render();
}

function invoiceDetail(id) {
  const inv = DB.invoices.find((x) => x.id === id);
  if (!inv) return;
  const st = invoiceStatus(inv);
  const c = clientById(inv.clientId) || {};
  openModal(`
    <h2>${esc(inv.number)} <span class="pill ${st}">${st}</span></h2>
    <p class="small muted">${esc(clientName(inv.clientId))} · issued ${fmtDate(inv.issueDate)}${inv.dueDate ? " · due " + fmtDate(inv.dueDate) : ""}</p>
    <table class="simple"><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr>
      ${inv.items.map((it) => `<tr><td>${esc(it.desc)}</td><td class="num">${it.qty}</td><td class="num">${money(it.unit)}</td><td class="num">${money(it.qty * it.unit)}</td></tr>`).join("")}
      <tr><td colspan="3" style="text-align:right;font-weight:700">Total</td><td class="num" style="font-weight:800">${money(invoiceTotal(inv))}</td></tr>
    </table>
    <div class="actions">
      ${inv.status === "draft" ? `<button class="btn-primary btn-small" onclick="App.markInvoice('${id}','sent')">Mark sent</button>` : ""}
      ${inv.status === "sent" ? `<button class="btn-primary btn-small" onclick="App.markInvoice('${id}','paid')">Mark paid 🎉</button>` : ""}
      ${inv.status === "paid" ? `<button class="btn-small" onclick="App.markInvoice('${id}','sent')">Un-pay</button>` : ""}
      <button class="btn-small" onclick="App.printInvoice('${id}')">Print / PDF</button>
      ${c.email ? `<a class="btn btn-small" href="${mailtoInvoice(inv, c)}">Email client</a>` : ""}
      <button class="btn-small" onclick="App.editInvoice('${id}')">Edit</button>
    </div>
    <div class="modal-actions">
      <button class="btn-danger" onclick="App.deleteInvoice('${id}')">Delete</button>
      <button onclick="App.closeModal()">Close</button>
    </div>`);
}
function mailtoInvoice(inv, c) {
  const s = DB.settings;
  const subject = encodeURIComponent(`Invoice ${inv.number} from ${s.businessName || s.ownerName || "me"}`);
  const body = encodeURIComponent(
    `Hi ${c.name.split(" ")[0]},\n\nPlease find invoice ${inv.number} for ${money(invoiceTotal(inv))}, due ${fmtDate(inv.dueDate)}.\n\n` +
    inv.items.map((it) => `• ${it.desc} — ${money(it.qty * it.unit)}`).join("\n") +
    (s.paymentDetails ? `\n\nPayment details:\n${s.paymentDetails}` : "") +
    `\n\nThanks!\n${s.ownerName || s.businessName || ""}`);
  return `mailto:${c.email}?subject=${subject}&body=${body}`;
}
function markInvoice(id, status) {
  const inv = DB.invoices.find((x) => x.id === id);
  inv.status = status;
  if (status === "paid") inv.paidDate = today();
  save(); closeModal(); render();
}
function deleteInvoice(id) {
  if (!confirm("Delete this invoice? Linked work becomes unbilled again.")) return;
  for (const w of DB.work) if (w.invoiceId === id) w.invoiceId = null;
  DB.invoices = DB.invoices.filter((x) => x.id !== id);
  save(); closeModal(); render();
}
function printInvoice(id) {
  const inv = DB.invoices.find((x) => x.id === id);
  const s = DB.settings, c = clientById(inv.clientId) || {};
  $("#print-area").innerHTML = `
    <div class="inv-doc">
      <header>
        <div><h1>INVOICE</h1><div>${esc(inv.number)}</div></div>
        <div style="text-align:right">
          <strong>${esc(s.businessName || s.ownerName || "")}</strong><br>
          ${s.abn ? "ABN " + esc(s.abn) + "<br>" : ""}${esc(s.email || "")}<br>${esc(s.phone || "")}
        </div>
      </header>
      <div><strong>Bill to:</strong> ${esc(c.name || "")}${c.company ? " — " + esc(c.company) : ""}<br>
      Issued: ${fmtDate(inv.issueDate)} &nbsp; Due: ${fmtDate(inv.dueDate)}</div>
      <table><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr>
      ${inv.items.map((it) => `<tr><td>${esc(it.desc)}</td><td class="num">${it.qty}</td><td class="num">${money(it.unit)}</td><td class="num">${money(it.qty * it.unit)}</td></tr>`).join("")}
      <tr class="total-row"><td colspan="3" class="num">Total due</td><td class="num">${money(invoiceTotal(inv))}</td></tr></table>
      <footer>${esc(inv.notes || "")}${s.paymentDetails ? "\n\nPayment details:\n" + esc(s.paymentDetails) : ""}</footer>
    </div>`;
  window.print();
}

/* ---------------- Trips & Fuel ---------------- */
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
    <h1>Trips & Fuel</h1>
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
    const rawDate = r[idx.date] || "";
    const d = new Date(rawDate);
    const date = isNaN(d) ? null : d.toISOString().slice(0, 10);
    const km = parseFloat(String(r[idx.km]).replace(/[^\d.]/g, ""));
    if (!date || !isFinite(km) || km <= 0) { skipped++; continue; }
    const key = date + "|" + km.toFixed(1);
    if (existing.has(key)) { skipped++; continue; }
    existing.add(key);
    let purpose = "uncategorised";
    if (idx.purpose >= 0) {
      const p = String(r[idx.purpose] || "").toLowerCase();
      if (/bus|work|yes|true/.test(p)) purpose = "business";
      else if (/pers|priv|no|false/.test(p)) purpose = "personal";
    }
    DB.trips.push({
      id: uid(), date, km: Math.round(km * 10) / 10,
      from: idx.from >= 0 ? (r[idx.from] || "").trim() : "",
      to: idx.to >= 0 ? (r[idx.to] || "").trim() : "",
      purpose, clientId: null, source: "gofar", notes: "",
    });
    added++;
  }
  save(); closeModal();
  tripsTab = "trips";
  render();
  alert(`Imported ${added} trip(s). Skipped ${skipped} (duplicates or unreadable).`);
}

/* ---------------- Settings ---------------- */
function renderSettings() {
  const s = DB.settings;
  $("#main").innerHTML = `
    <h1>Settings</h1>
    <div class="card">
      <form onsubmit="App.saveSettings(event)">
        <h2 style="margin-top:0">Your business</h2>
        <div class="field"><label>Business name</label><input name="businessName" value="${esc(s.businessName)}"></div>
        <div class="field-row">
          <div class="field"><label>Your name</label><input name="ownerName" value="${esc(s.ownerName)}"></div>
          <div class="field"><label>ABN / Tax ID</label><input name="abn" value="${esc(s.abn)}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Email</label><input name="email" value="${esc(s.email)}"></div>
          <div class="field"><label>Phone</label><input name="phone" value="${esc(s.phone)}"></div>
        </div>
        <h2>Money</h2>
        <div class="field-row">
          <div class="field"><label>Currency</label><input name="currency" value="${esc(s.currency)}" maxlength="3" placeholder="AUD"></div>
          <div class="field"><label>Default rate/hr</label><input name="hourlyRate" type="number" step="0.01" value="${s.hourlyRate || ""}"></div>
          <div class="field"><label>Per-km rate</label><input name="kmRate" type="number" step="0.01" value="${s.kmRate}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Invoice prefix</label><input name="invoicePrefix" value="${esc(s.invoicePrefix)}"></div>
          <div class="field"><label>Next number</label><input name="nextInvoiceNumber" type="number" min="1" value="${s.nextInvoiceNumber}"></div>
          <div class="field"><label>Payment terms (days)</label><input name="paymentTermsDays" type="number" min="0" value="${s.paymentTermsDays}"></div>
        </div>
        <div class="field"><label>Payment details (shown on invoices)</label><textarea name="paymentDetails" rows="3" placeholder="BSB / account, PayID, etc.">${esc(s.paymentDetails)}</textarea></div>
        <button class="btn-primary" type="submit">Save settings</button>
      </form>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Backup & move between devices</h2>
      <p class="small muted">Data lives in this browser only. Export a backup file regularly, keep it in iCloud Drive, and import it on your other devices to bring them up to date.</p>
      <div class="actions">
        <button class="btn-primary" onclick="App.exportData()">⬇ Export backup</button>
        <button onclick="App.importDataPick()">⬆ Import backup</button>
        <input type="file" id="import-file" accept=".json,application/json" style="display:none" onchange="App.importData(event)">
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Danger zone</h2>
      <button class="btn-danger" onclick="App.wipe()">Erase all data on this device</button>
    </div>
    <p class="small muted" style="text-align:center">Business HQ · works offline · your data never leaves your devices</p>`;
}
function saveSettings(ev) {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const s = DB.settings;
  for (const k of ["businessName", "ownerName", "abn", "email", "phone", "currency", "invoicePrefix", "paymentDetails"]) s[k] = String(f.get(k) || "").trim();
  s.currency = (s.currency || "AUD").toUpperCase();
  for (const k of ["hourlyRate", "kmRate", "nextInvoiceNumber", "paymentTermsDays"]) s[k] = Number(f.get(k)) || 0;
  s.nextInvoiceNumber = Math.max(1, Math.round(s.nextInvoiceNumber));
  save(); alert("Saved."); render();
}
function exportData() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bizhq-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function importDataPick() { $("#import-file").click(); }
function importData(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(String(reader.result));
      if (!d || d.version !== 1 || !Array.isArray(d.clients)) throw new Error("not a BizHQ backup");
      if (!confirm(`Replace everything on this device with the backup?\n(${d.clients.length} clients, ${d.invoices.length} invoices, ${d.trips.length} trips)`)) return;
      DB = Object.assign(defaultData(), d, { settings: Object.assign(defaultData().settings, d.settings || {}) });
      save(); render(); alert("Imported.");
    } catch (e) { alert("That file doesn't look like a Business HQ backup. " + e.message); }
  };
  reader.readAsText(file);
}
function wipe() {
  if (!confirm("Erase ALL data on this device? Export a backup first if you want to keep anything.")) return;
  if (!confirm("Really sure? This cannot be undone.")) return;
  DB = defaultData();
  save(); render();
}

/* ---------------- Modal ---------------- */
function openModal(html) {
  $("#modal-root").innerHTML = `<div class="modal-backdrop" onclick="if(event.target===this)App.closeModal()"><div class="modal">${html}</div></div>`;
}
function closeModal() { $("#modal-root").innerHTML = ""; }

/* ---------------- Boot ---------------- */
window.App = {
  editClient, saveClient, deleteClient, clientDetail,
  editWork, saveWork,
  editInvoice, saveInvoice, invoiceDetail, invoiceFromWork, markInvoice, deleteInvoice, printInvoice, addLine,
  editTrip, saveTrip, deleteTrip, editFuel, saveFuel, deleteFuel, setTripsTab,
  gofarImport, csvChosen, runCsvImport,
  saveSettings, exportData, importDataPick, importData, wipe,
  closeModal,
};

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
render();
