"use strict";
/* Money: work log -> invoices (draft / sent / paid), print-to-PDF and email templates. */

registerRoute("invoices", {
  icon: "🧾", label: "Money", order: 35, tab: true, hint: "g then m",
  badge: () => DB.invoices.filter((i) => invoiceStatus(i) === "overdue").length,
  render: renderInvoices,
});

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
      ${["sent", "overdue"].includes(st) ? `<button class="btn-small" onclick="App.closeModal();App.followUpTask('${id}')">＋ Follow-up task</button>` : ""}
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
  const was = inv.status;
  inv.status = status;
  if (status === "paid") inv.paidDate = today();
  if (status === "sent" && was === "paid") inv.paidDate = null;
  const moved = was !== status ? crmAfterInvoiceChange(inv, status) : [];
  save(); closeModal(); render();
  if (moved.length) toast("Pipeline: " + moved.join(", "), 3600);
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

Object.assign(App, {
  editWork, saveWork,
  editInvoice, saveInvoice, invoiceDetail, invoiceFromWork, markInvoice, deleteInvoice, printInvoice, addLine,
});
