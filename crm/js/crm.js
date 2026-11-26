"use strict";
/* CRM: pipeline board, client list, client record with a timeline that builds itself
   from invoices, work, tasks, docs and events (plus manual notes/calls/emails). */

const STAGES = [["lead", "Lead"], ["quoted", "Quoted"], ["active", "Active"], ["won", "Won"], ["lost", "Lost"]];
const OPEN_STAGES = ["lead", "quoted", "active"];
const stageLabel = (s) => (STAGES.find((x) => x[0] === s) || [, s])[1];
let crmTab = "pipeline";

registerRoute("crm", {
  icon: "👥", label: "CRM", order: 20, tab: true, hint: "g then c",
  badge: () => staleDeals().length,
  render: renderCRM,
});

/* ----- derived ----- */
function staleDeals() {
  const limit = DB.settings.staleDays || 14;
  const t = today();
  return DB.deals
    .filter((d) => OPEN_STAGES.includes(d.stage) && d.clientId)
    .map((d) => ({ deal: d, last: lastTouch(d.clientId) || d.createdAt }))
    .filter((x) => daysBetween(x.last, t) >= limit);
}
const clientOwed = (id) => DB.invoices.filter((i) => i.clientId === id && ["sent", "overdue"].includes(invoiceStatus(i))).reduce((s, i) => s + invoiceTotal(i), 0);
const clientUnbilled = (id) => unbilledWork().filter((w) => w.clientId === id).reduce((s, w) => s + workAmount(w), 0);
const clientPaid = (id) => DB.invoices.filter((i) => i.clientId === id && i.status === "paid").reduce((s, i) => s + invoiceTotal(i), 0);

/* ----- main view ----- */
function renderCRM() {
  const seg = `<div class="seg">
    <button class="${crmTab === "pipeline" ? "active" : ""}" onclick="App.setCrmTab('pipeline')">Pipeline</button>
    <button class="${crmTab === "clients" ? "active" : ""}" onclick="App.setCrmTab('clients')">Clients</button></div>`;
  $("#main").innerHTML = `
    <div class="page-head"><h1>CRM</h1>
      <div class="actions" style="margin:0">
        <button class="btn-primary" onclick="App.editDeal()">＋ Deal</button>
        <button onclick="App.editClient()">＋ Client</button></div></div>
    ${seg}${crmTab === "pipeline" ? pipelineHtml() : clientsHtml()}`;
}
function setCrmTab(t) { crmTab = t; render(); }

function pipelineHtml() {
  if (!DB.deals.length) {
    return `<div class="card"><div class="empty"><span class="big">🧲</span>
      Track jobs from first enquiry to paid. Add a deal for a client and move it along as it progresses — it also advances on its own when you send and get paid on invoices.
      <div class="actions" style="justify-content:center"><button class="btn-primary" onclick="App.editDeal()">＋ Add your first deal</button></div></div></div>`;
  }
  const open = DB.deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const openVal = open.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const stale = new Set(staleDeals().map((x) => x.deal.id));
  const cols = STAGES.map(([key, label]) => {
    const ds = DB.deals.filter((d) => d.stage === key);
    const total = ds.reduce((s, d) => s + (Number(d.value) || 0), 0);
    const idx = STAGES.findIndex((s) => s[0] === key);
    const cards = ds.map((d) => `
      <div class="kcard" onclick="App.editDeal('${d.id}')">
        <div class="title">${esc(d.title)}</div>
        <div class="meta">${esc(clientName(d.clientId))}${stale.has(d.id) ? ' · <span class="pill overdue">going cold</span>' : ""}</div>
        <div class="row" style="margin-top:6px">
          <span class="amount">${d.value ? money(d.value) : ""}</span>
          <span class="right">
            ${idx > 0 ? `<button class="btn-small" title="Move back" onclick="event.stopPropagation();App.moveDeal('${d.id}',-1)">←</button>` : ""}
            ${idx < STAGES.length - 1 ? `<button class="btn-small" title="Move forward" onclick="event.stopPropagation();App.moveDeal('${d.id}',1)">→</button>` : ""}
          </span></div></div>`).join("");
    return `<div class="kcol"><div class="khead"><span>${label}</span><span class="muted small">${ds.length}${total ? " · " + money(total) : ""}</span></div>
      ${cards || '<div class="kempty">—</div>'}</div>`;
  }).join("");
  return `<p class="sub">${open.length} open deal${open.length === 1 ? "" : "s"} worth ${money(openVal)}</p><div class="board">${cols}</div>`;
}

function clientsHtml() {
  const items = [...DB.clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
    const owed = clientOwed(c.id), unb = clientUnbilled(c.id), last = lastTouch(c.id);
    const meta = [c.company, owed ? `owes ${money(owed)}` : "", unb ? `${money(unb)} unbilled` : "", last ? `last activity ${relDay(last)}` : ""].filter(Boolean).join(" · ");
    return `<div class="item" onclick="App.clientDetail('${c.id}')">
      <span class="avatar">${esc(initials(c.name))}</span>
      <div class="grow"><div class="title">${esc(c.name)}</div><div class="meta">${esc(meta) || "&nbsp;"}</div></div>
      <span class="muted">›</span></div>`;
  }).join("");
  return `<div class="card list">${items || `<div class="empty"><span class="big">👥</span>No clients yet — add your first one.</div>`}</div>`;
}

/* ----- deals ----- */
function editDeal(id, presetClient) {
  const d = id ? DB.deals.find((x) => x.id === id) : { stage: "lead", clientId: presetClient || "" };
  if (!DB.clients.length) { toast("Add a client first"); return editClient(); }
  openModal(`
    <h2>${id ? "Edit deal" : "New deal"}</h2>
    <form onsubmit="App.saveDeal(event,'${id || ""}')">
      <div class="field"><label>What's the job? *</label><input name="title" required value="${esc(d.title || "")}" placeholder="e.g. Switchboard upgrade"></div>
      <div class="field"><label>Client *</label><select name="clientId" required>${clientOptions(d.clientId, "— pick —")}</select></div>
      <div class="field-row">
        <div class="field"><label>Value</label><input name="value" type="number" step="0.01" min="0" value="${d.value ?? ""}"></div>
        <div class="field"><label>Stage</label><select name="stage">${STAGES.map(([k, l]) => `<option value="${k}" ${d.stage === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      </div>
      <div class="modal-actions">
        ${id ? `<button type="button" class="btn-danger" onclick="App.deleteDeal('${id}')">Delete</button>` : `<button type="button" onclick="App.closeModal()">Cancel</button>`}
        <button class="btn-primary" type="submit">Save</button></div>
    </form>`);
}
function saveDeal(ev, id) {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const data = { title: f.get("title").trim(), clientId: f.get("clientId"), value: Number(f.get("value")) || 0, stage: f.get("stage") };
  if (id) Object.assign(DB.deals.find((x) => x.id === id), data);
  else DB.deals.push(Object.assign({ id: uid(), createdAt: today() }, data));
  save(); closeModal(); render();
}
function deleteDeal(id) {
  if (!confirm("Delete this deal?")) return;
  DB.deals = DB.deals.filter((d) => d.id !== id);
  save(); closeModal(); render();
}
function moveDeal(id, dir) {
  const d = DB.deals.find((x) => x.id === id);
  const i = STAGES.findIndex((s) => s[0] === d.stage) + dir;
  if (i < 0 || i >= STAGES.length) return;
  d.stage = STAGES[i][0];
  save(); render();
}

/* Pipeline keeps itself current as invoices progress. Returns messages for a toast. */
function crmAfterInvoiceChange(inv, newStatus) {
  const notes = [];
  const mine = DB.deals.filter((d) => d.clientId === inv.clientId);
  if (newStatus === "sent") {
    for (const d of mine) if (d.stage === "lead" || d.stage === "quoted") { d.stage = "active"; notes.push(`“${d.title}” → Active`); }
  } else if (newStatus === "paid") {
    const stillOwed = DB.invoices.some((i) => i.clientId === inv.clientId && i.id !== inv.id && ["sent", "overdue"].includes(invoiceStatus(i)));
    if (!stillOwed) for (const d of mine) if (d.stage === "active") { d.stage = "won"; notes.push(`“${d.title}” → Won 🎉`); }
  }
  return notes;
}

/* ----- clients ----- */
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
  if (!confirm("Delete this client, their deals and CRM notes? Invoices, work, trips, tasks and docs stay but lose the link.")) return;
  DB.clients = DB.clients.filter((c) => c.id !== id);
  DB.deals = DB.deals.filter((d) => d.clientId !== id);
  DB.activities = DB.activities.filter((a) => a.clientId !== id);
  for (const list of [DB.work, DB.invoices, DB.trips, DB.tasks, DB.docs, DB.events]) for (const x of list) if (x.clientId === id) x.clientId = null;
  save(); closeModal(); render();
}

/* Timeline = manual log + everything the rest of the app already knows about this client */
const ACT_ICON = { note: "📝", call: "📞", email: "✉️", meeting: "🤝" };
function timelineFor(id) {
  const ev = [];
  for (const a of DB.activities) if (a.clientId === id) ev.push({ date: a.date, icon: ACT_ICON[a.type] || "📝", text: `${a.type[0].toUpperCase() + a.type.slice(1)}: ${a.text}`, manual: a.id });
  for (const w of DB.work) if (w.clientId === id) ev.push({ date: w.date, icon: "🛠", text: `Work: ${w.desc} (${w.hours}h)` });
  for (const i of DB.invoices) if (i.clientId === id) {
    ev.push({ date: i.issueDate, icon: "🧾", text: `Invoice ${i.number} created — ${money(invoiceTotal(i))}` });
    if (i.status === "paid") ev.push({ date: i.paidDate || i.issueDate, icon: "💰", text: `Invoice ${i.number} paid` });
  }
  for (const t of DB.tasks) if (t.clientId === id && t.doneAt) ev.push({ date: t.doneAt, icon: "✅", text: `Task done: ${t.title}` });
  for (const d of DB.docs) if (d.clientId === id) ev.push({ date: d.createdAt ? localDay(d.createdAt) : "", icon: "📄", text: `Doc: ${d.title}` });
  for (const e of DB.events) if (e.clientId === id && e.date <= today()) ev.push({ date: e.date, icon: "📅", text: `Event: ${e.title}` });
  return ev.filter((x) => x.date).sort((a, b) => (a.date < b.date ? 1 : -1));
}

function clientDetail(id) {
  const c = clientById(id);
  if (!c) return;
  const tl = timelineFor(id);
  const tasks = DB.tasks.filter((t) => t.clientId === id && t.status !== "done");
  const docs = DB.docs.filter((d) => d.clientId === id);
  const deals = DB.deals.filter((d) => d.clientId === id);
  const unb = clientUnbilled(id), owed = clientOwed(id), paid = clientPaid(id);
  const kmTotal = DB.trips.filter((t) => t.clientId === id).reduce((s, t) => s + (Number(t.km) || 0), 0);

  openModal(`
    <h2>${esc(c.name)}</h2>
    <p class="small muted">${esc([c.company, c.email, c.phone].filter(Boolean).join(" · "))}</p>
    ${c.notes ? `<p class="small">${esc(c.notes)}</p>` : ""}
    <div class="stats" style="grid-template-columns:repeat(3,1fr);margin:8px 0 6px">
      <div class="stat"><div class="label">Owes</div><div class="value" style="font-size:17px">${money(owed)}</div></div>
      <div class="stat"><div class="label">Unbilled</div><div class="value" style="font-size:17px">${money(unb)}</div></div>
      <div class="stat"><div class="label">Paid</div><div class="value" style="font-size:17px">${money(paid)}</div></div>
    </div>
    <div class="actions">
      <button class="btn-small" onclick="App.editClient('${id}')">Edit</button>
      <button class="btn-small" onclick="App.editWork(null,'${id}')">＋ Work</button>
      <button class="btn-small" onclick="App.editTask(null,{clientId:'${id}'})">＋ Task</button>
      <button class="btn-small" onclick="App.editDeal(null,'${id}')">＋ Deal</button>
      <button class="btn-small" onclick="App.newDoc('${id}')">＋ Doc</button>
      <button class="btn-small" onclick="App.editEvent(null,{clientId:'${id}'})">＋ Event</button>
      ${unb > 0 ? `<button class="btn-small btn-primary" onclick="App.invoiceFromWork('${id}')">Invoice ${money(unb)}</button>` : ""}
      ${c.email ? `<a class="btn btn-small" href="mailto:${esc(c.email)}">Email</a>` : ""}
      ${c.phone ? `<a class="btn btn-small" href="tel:${esc(c.phone)}">Call</a>` : ""}
    </div>

    <h2>Log activity</h2>
    <form class="row" style="gap:6px" onsubmit="App.addActivity(event,'${id}')">
      <select name="type" style="width:auto">${Object.keys(ACT_ICON).map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
      <input name="text" required placeholder="What happened? (paste an email subject, call summary…)" style="flex:1">
      <button class="btn-primary" type="submit">Add</button>
    </form>

    ${deals.length ? `<h2>Deals</h2><div class="list">${deals.map((d) => `<div class="item" onclick="App.editDeal('${d.id}')"><div class="grow"><div class="title">${esc(d.title)}</div></div><span class="pill ${d.stage === "won" ? "paid" : d.stage === "lost" ? "draft" : "sent"}">${stageLabel(d.stage)}</span><span class="amount">${d.value ? money(d.value) : ""}</span></div>`).join("")}</div>` : ""}
    ${tasks.length ? `<h2>Open tasks</h2><div class="list">${tasks.map((t) => `<div class="item" onclick="App.editTask('${t.id}')"><div class="grow"><div class="title">${esc(t.title)}</div></div><span class="meta">${t.due ? relDay(t.due) : ""}</span></div>`).join("")}</div>` : ""}
    ${docs.length ? `<h2>Docs</h2><div class="list">${docs.map((d) => `<div class="item" onclick="App.closeModal();App.go('#/docs/${d.id}')"><div class="grow"><div class="title">📄 ${esc(d.title)}</div></div></div>`).join("")}</div>` : ""}

    <h2>Timeline</h2>
    ${tl.length ? `<div class="timeline">${tl.slice(0, 25).map((e) => `<div class="tl"><span class="tl-ic">${e.icon}</span><div class="grow"><div>${esc(e.text)}</div><div class="meta">${fmtDate(e.date)}</div></div>
      ${e.manual ? `<button class="btn-small" title="Remove" onclick="App.deleteActivity('${e.manual}','${id}')">✕</button>` : ""}</div>`).join("")}</div>
      ${tl.length > 25 ? `<p class="small muted">Showing the latest 25 of ${tl.length}.</p>` : ""}` : `<p class="small muted">Nothing yet. Work, invoices, tasks and notes will appear here automatically.</p>`}
    ${kmTotal ? `<p class="small muted">🚗 ${kmTotal.toFixed(0)} km of trips linked to this client.</p>` : ""}
    <div class="modal-actions">
      <button class="btn-danger" onclick="App.deleteClient('${id}')">Delete</button>
      <button onclick="App.closeModal()">Close</button>
    </div>`);
}
function addActivity(ev, clientId) {
  ev.preventDefault();
  const f = new FormData(ev.target);
  DB.activities.push({ id: uid(), clientId, type: f.get("type"), text: f.get("text").trim(), date: today() });
  save(); clientDetail(clientId); render();
}
function deleteActivity(aid, clientId) {
  DB.activities = DB.activities.filter((a) => a.id !== aid);
  save(); clientDetail(clientId); render();
}

Object.assign(App, {
  setCrmTab, editDeal, saveDeal, deleteDeal, moveDeal,
  editClient, saveClient, deleteClient, clientDetail, addActivity, deleteActivity,
});
