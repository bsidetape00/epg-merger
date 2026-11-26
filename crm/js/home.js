"use strict";
/* Home: one prioritized feed of everything that needs attention, with keyboard triage.
   Items are computed fresh from your data each time, so there's nothing to keep in sync. */

registerRoute("home", {
  icon: "🏠", label: "Home", order: 10, tab: true, hint: "g then h",
  badge: () => feedItems().filter((i) => i.hot).length,
  keys: {
    j: () => moveSel(1), ArrowDown: () => moveSel(1),
    k: () => moveSel(-1), ArrowUp: () => moveSel(-1),
    Enter: () => feedAct(homeSel, 0),
    e: () => feedClear(homeSel),
    s: () => feedSnooze(homeSel, 1),
    S: () => feedSnooze(homeSel, 7),
    t: () => feedToTask(homeSel),
  },
  render: renderHome,
});

let homeSel = 0;
let homeItems = [];

const snoozedNow = (key) => (DB.snoozed[key] || "") > today();

function feedItems() {
  const items = [];
  const t = today();
  const add = (o) => { if (!snoozedNow(o.key)) items.push(Object.assign({ actions: [], hot: false }, o)); };

  // Overdue invoices
  for (const inv of DB.invoices) {
    if (invoiceStatus(inv) !== "overdue") continue;
    const c = clientById(inv.clientId);
    add({
      key: "inv-od:" + inv.id, score: 95, hot: true, icon: "⏰",
      title: `${inv.number} is ${daysBetween(inv.dueDate, t)} day(s) overdue`,
      msg: `${clientName(inv.clientId)} owes ${money(invoiceTotal(inv))}.`,
      actions: [
        { label: "Open", run: () => App.invoiceDetail(inv.id) },
        ...(c && c.email ? [{ label: "Email reminder", run: () => { location.href = reminderMailto(inv, c); } }] : []),
        { label: "＋ Task", run: () => followUpTask(inv.id) },
      ],
    });
  }
  // Tasks
  for (const task of DB.tasks) {
    if (task.status === "done" || !task.due || task.due > t) continue;
    const od = task.due < t;
    add({
      key: "task:" + task.id, score: (od ? 90 : 80) - task.priority, hot: od, icon: od ? "🔴" : "✅",
      title: task.title, msg: `${od ? "Overdue · " : "Due today · "}${task.clientId ? clientName(task.clientId) : "task"}`,
      done: () => setTaskStatus(task.id, "done"),
      actions: [{ label: "Done", run: () => setTaskStatus(task.id, "done") }, { label: "Open", run: () => App.editTask(task.id) }],
    });
  }
  // Today's events
  for (const e of DB.events) {
    if (e.date !== t) continue;
    add({
      key: "ev:" + e.id, score: 85, icon: "📅", title: e.title,
      msg: `Today${e.start ? " at " + e.start : ""}${e.clientId ? " · " + clientName(e.clientId) : ""}`,
      actions: [{ label: "Open", run: () => App.editEvent(e.id) }],
    });
  }
  // Time to invoice
  const byClient = {};
  for (const w of unbilledWork()) (byClient[w.clientId] = byClient[w.clientId] || []).push(w);
  for (const [cid, ws] of Object.entries(byClient)) {
    const total = ws.reduce((s, w) => s + workAmount(w), 0);
    const oldest = ws.reduce((m, w) => (w.date < m ? w.date : m), t);
    if (total > 0 && daysBetween(oldest, t) >= 7) {
      add({
        key: "bill:" + cid, score: 70, hot: true, icon: "🧾", title: `Time to invoice ${clientName(cid)}`,
        msg: `${ws.length} unbilled item(s) worth ${money(total)} — oldest from ${fmtDate(oldest)}.`,
        actions: [{ label: "Create invoice", run: () => App.invoiceFromWork(cid) }],
      });
    }
  }
  // Drafts never sent
  for (const inv of DB.invoices) {
    if (inv.status === "draft" && daysBetween(inv.issueDate, t) >= 3) {
      add({
        key: "draft:" + inv.id, score: 65, icon: "📮", title: `Draft ${inv.number} hasn't been sent`,
        msg: `${clientName(inv.clientId)} · ${money(invoiceTotal(inv))} · created ${daysBetween(inv.issueDate, t)} days ago.`,
        actions: [{ label: "Open", run: () => App.invoiceDetail(inv.id) }],
      });
    }
  }
  // Deals going cold
  for (const { deal, last } of staleDeals()) {
    add({
      key: "cold:" + deal.id, score: 60, icon: "🧊", title: `Follow up: ${deal.title}`,
      msg: `${clientName(deal.clientId)} · no activity for ${daysBetween(last, t)} days.`,
      actions: [{ label: "Open client", run: () => App.clientDetail(deal.clientId) },
        { label: "＋ Task", run: () => { createTask({ title: `Follow up with ${clientName(deal.clientId)} — ${deal.title}`, due: t, ref: "client:" + deal.clientId, clientId: deal.clientId }); toast("Task added"); render(); } }],
    });
  }
  // Trips
  const uncat = DB.trips.filter((tr) => tr.purpose === "uncategorised");
  if (uncat.length) {
    const auto = App.autotagPlan().length;
    add({
      key: "trips-uncat", score: 50, hot: true, icon: "🚗", title: `${uncat.length} trip(s) need categorising`,
      msg: auto ? `${auto} can be tagged automatically from your past trips.` : "Mark them business or personal so your deductions stay accurate.",
      actions: [...(auto ? [{ label: `✨ Auto-tag ${auto}`, run: () => App.autotagTrips() }] : []), { label: "Review", run: () => App.go("#/trips") }],
    });
  }
  // Fuel
  const lastFuel = DB.fuel.map((f) => f.date).sort().pop();
  if (lastFuel && daysBetween(lastFuel, t) > 21) {
    add({
      key: "fuel", score: 40, icon: "⛽️", title: "No fuel logged in 3+ weeks",
      msg: `Last fill-up ${fmtDate(lastFuel)}. Snap your receipts before they fade.`,
      actions: [{ label: "Add fuel", run: () => App.editFuel() }],
    });
  }
  // First-run setup
  if (!DB.settings.businessName) {
    add({ key: "setup", score: 30, icon: "⚙️", title: "Set up your business details",
      msg: "Name, ABN, hourly rate and payment details appear on every invoice.", actions: [{ label: "Open settings", run: () => App.go("#/settings") }] });
  }
  if (!DB.clients.length) {
    add({ key: "first-client", score: 29, icon: "👥", title: "Add your first client",
      msg: "Clients tie together work, invoices, trips, tasks and notes.", actions: [{ label: "＋ Client", run: () => App.editClient() }] });
  }
  return items.sort((a, b) => b.score - a.score);
}

function reminderMailto(inv, c) {
  const s = DB.settings;
  const subject = encodeURIComponent(`Reminder: invoice ${inv.number} (${money(invoiceTotal(inv))}) was due ${fmtDate(inv.dueDate)}`);
  const body = encodeURIComponent(`Hi ${c.name.split(" ")[0]},\n\nJust a friendly reminder that invoice ${inv.number} for ${money(invoiceTotal(inv))} was due on ${fmtDate(inv.dueDate)}.` +
    (s.paymentDetails ? `\n\nPayment details:\n${s.paymentDetails}` : "") + `\n\nIf you've already paid, please ignore this. Thanks!\n${s.ownerName || s.businessName || ""}`);
  return `mailto:${c.email}?subject=${subject}&body=${body}`;
}
function followUpTask(invId) {
  const inv = DB.invoices.find((i) => i.id === invId);
  createTask({ title: `Chase ${inv.number} — ${clientName(inv.clientId)}`, due: addDays(today(), 1), clientId: inv.clientId, ref: "invoice:" + invId, priority: 1 });
  toast("Follow-up task added for tomorrow");
  render();
}

/* ----- view ----- */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
function renderHome() {
  const s = DB.settings, fy = fyStart();
  homeItems = feedItems();
  homeSel = Math.min(homeSel, Math.max(0, homeItems.length - 1));

  const owed = DB.invoices.filter((i) => ["sent", "overdue"].includes(invoiceStatus(i))).reduce((sum, i) => sum + invoiceTotal(i), 0);
  const unbilled = unbilledWork().reduce((sum, w) => sum + workAmount(w), 0);
  const paidFy = DB.invoices.filter((i) => i.status === "paid" && (i.paidDate || i.issueDate) >= fy).reduce((sum, i) => sum + invoiceTotal(i), 0);
  const pipeline = DB.deals.filter((d) => OPEN_STAGES.includes(d.stage)).reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const bizKm = DB.trips.filter((tr) => tr.purpose === "business" && tr.date >= fy).reduce((sum, tr) => sum + (Number(tr.km) || 0), 0);
  const fuelSpend = DB.fuel.filter((f) => f.date >= fy).reduce((sum, f) => sum + (Number(f.cost) || 0), 0);

  const rows = homeItems.map((it, i) => `
    <div class="frow ${i === homeSel ? "sel" : ""} ${it.hot ? "hot" : ""}" data-i="${i}" onclick="App.feedSelect(${i})">
      <span class="icon">${it.icon}</span>
      <div class="grow"><div class="title">${esc(it.title)}</div><div class="meta">${esc(it.msg)}</div></div>
      <div class="fact">
        ${it.actions.map((a, ai) => `<button class="btn-small ${ai === 0 ? "btn-primary" : ""}" onclick="event.stopPropagation();App.feedAct(${i},${ai})">${esc(a.label)}</button>`).join("")}
        <button class="btn-small" title="Snooze until tomorrow (s)" onclick="event.stopPropagation();App.feedSnooze(${i},1)">💤</button>
      </div></div>`).join("");

  $("#main").innerHTML = `
    <div class="page-head"><div><h1 style="margin-bottom:0">${greeting()}${s.ownerName ? ", " + esc(s.ownerName.split(" ")[0]) : ""}</h1>
      <p class="sub" style="margin:2px 0 0">${new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}${s.businessName ? " · " + esc(s.businessName) : ""}</p></div>
      <div class="actions" style="margin:0"><button class="btn-primary" onclick="App.openPalette('')">＋ Quick add</button></div></div>

    <div class="stats compact">
      <div class="stat"><div class="label">Owed to you</div><div class="value">${money(owed)}</div></div>
      <div class="stat"><div class="label">Unbilled</div><div class="value">${money(unbilled)}</div></div>
      <div class="stat"><div class="label">Pipeline</div><div class="value">${money(pipeline)}</div></div>
      <div class="stat"><div class="label">Paid this FY</div><div class="value">${money(paidFy)}</div></div>
      <div class="stat"><div class="label">Business km</div><div class="value">${bizKm.toFixed(0)}</div><div class="hint">≈ ${money(bizKm * (s.kmRate || 0))}</div></div>
      <div class="stat"><div class="label">Fuel (FY)</div><div class="value">${money(fuelSpend)}</div></div>
    </div>

    <h2>Needs your attention <span class="muted small">${homeItems.length}</span></h2>
    <div class="feed">${rows || `<div class="nudge good"><span class="icon">✅</span><div class="msg"><strong>Inbox zero</strong>No overdue invoices, tasks or loose ends. Nice.</div></div>`}</div>
    <p class="small muted kbhint"><kbd>j</kbd> <kbd>k</kbd> move · <kbd>Enter</kbd> act · <kbd>e</kbd> done · <kbd>s</kbd> snooze · <kbd>t</kbd> make task · <kbd>⌘K</kbd> search &amp; quick add · <kbd>?</kbd> all shortcuts</p>`;
}

/* ----- triage ----- */
function paintSel() {
  $$(".frow").forEach((el, i) => el.classList.toggle("sel", i === homeSel));
  const el = $$(".frow")[homeSel];
  if (el) el.scrollIntoView({ block: "nearest" });
}
function moveSel(d) { if (!homeItems.length) return; homeSel = Math.max(0, Math.min(homeItems.length - 1, homeSel + d)); paintSel(); }
function feedSelect(i) { homeSel = i; paintSel(); }
function feedAct(i, a) { const it = homeItems[i]; if (it && it.actions[a]) it.actions[a].run(); }
function feedClear(i) {
  const it = homeItems[i];
  if (!it) return;
  if (it.done) it.done(); else feedSnooze(i, 1);
}
function feedSnooze(i, days) {
  const it = homeItems[i];
  if (!it) return;
  DB.snoozed[it.key] = addDays(today(), days);
  save(); render();
  toast(days === 1 ? "Snoozed until tomorrow" : `Snoozed for ${days} days`);
}
function feedToTask(i) {
  const it = homeItems[i];
  if (!it) return;
  createTask({ title: it.title, due: today() });
  toast("Task created");
  render();
}

Object.assign(App, { feedAct, feedSelect, feedSnooze, followUpTask });
