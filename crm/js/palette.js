"use strict";
/* Command palette (⌘K / Ctrl+K or "/"): search everything, jump anywhere, create things,
   and quick-add in plain English. Plus the global keyboard shortcuts. */

const pal = { open: false, q: "", results: [], sel: 0 };

/* ----- what you can do ----- */
function paletteActions() {
  const A = (icon, title, run, kw = "") => ({ group: "Create", icon, title, kw, run });
  return [
    A("✅", "New task", () => App.editTask(), "todo reminder"),
    A("🛠", "Log work", () => App.editWork(), "time hours job"),
    A("🧾", "New invoice", () => App.editInvoice(), "bill"),
    A("👤", "New client", () => App.editClient(), "contact customer"),
    A("🧲", "New deal", () => App.editDeal(), "lead quote opportunity"),
    A("📄", "New doc", () => App.newDoc(), "note meeting quote job sheet"),
    A("📅", "New event", () => App.editEvent(null, { date: today() }), "appointment meeting"),
    A("🚗", "Add trip", () => App.editTrip(), "travel km logbook"),
    A("⛽️", "Add fuel", () => App.editFuel(), "petrol receipt"),
    A("⬆", "Import GOFAR trips (CSV)", () => { App.go("#/trips"); setTimeout(() => App.gofarImport(), 50); }, "gofar csv logbook"),
    A("✨", "Auto-tag trips from past routes", () => App.autotagTrips(), "categorise business personal"),
    A("⬇", "Export backup", () => App.exportData(), "download save"),
    A("🗓", "Export calendar (.ics)", () => App.exportIcs(), "apple calendar"),
  ];
}
function paletteNav() {
  return sortedRoutes().map(([k, r]) => ({ group: "Go to", icon: r.icon, title: r.label, kw: k, run: () => App.go("#/" + k) }));
}

/* ----- quick add: "task call Sarah tomorrow", "log 2h Sarah site visit", "fuel 92.50 Ampol 48l" ----- */
function matchClient(text) {
  const t = text.trim().toLowerCase();
  let best = null;
  for (const c of DB.clients) {
    for (const name of [c.name.toLowerCase(), c.name.toLowerCase().split(/\s+/)[0], (c.company || "").toLowerCase()]) {
      if (!name) continue;
      if ((t === name || t.startsWith(name + " ")) && (!best || name.length > best.len)) best = { client: c, len: name.length };
    }
  }
  return best ? { client: best.client, rest: text.trim().slice(best.len).trim() } : null;
}
function parseTime(s) {
  const m = s.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!m) return null;
  let h = Number(m[1]); const min = m[2] || "00"; const ap = (m[3] || "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return { start: `${String(h).padStart(2, "0")}:${min}`, text: m[0] };
}
function parseQuick(q) {
  const out = [];
  const Q = (title, sub, run) => out.push({ group: "Quick add", icon: "⚡", title, sub, run, quick: true });
  let m;
  if ((m = q.match(/^t(?:ask)?\s+(.+)$/i))) {
    const p = parseWhen(m[1]);
    if (p.title) Q(`Create task: ${p.title}`, [p.due ? "due " + relDay(p.due) : "no date", PRIO[p.priority] + " priority"].join(" · "),
      () => { createTask({ title: p.title, due: p.due, priority: p.priority }); toast("Task added"); render(); });
  }
  if ((m = q.match(/^log\s+(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?\s*(.*)$/i))) {
    const hours = Number(m[1]), hit = matchClient(m[2]);
    if (hit) {
      const desc = hit.rest || "Work";
      Q(`Log ${hours}h for ${hit.client.name}`, desc + (DB.settings.hourlyRate ? ` · ${money(hours * DB.settings.hourlyRate)}` : ""),
        () => { DB.work.push({ id: uid(), clientId: hit.client.id, date: today(), desc, hours, rate: DB.settings.hourlyRate || 0, invoiceId: null }); save(); toast("Work logged"); render(); });
    } else {
      Q(`Log ${hours}h of work`, "Start with a client name, e.g. “log 2h Sarah site visit”", () => App.editWork());
    }
  }
  if ((m = q.match(/^fuel\s+\$?(\d+(?:\.\d+)?)\s*(.*)$/i))) {
    const cost = Number(m[1]);
    let rest = m[2], litres = null;
    const lm = rest.match(/(\d+(?:\.\d+)?)\s*l(?:itres?|trs?)?\b/i);
    if (lm) { litres = Number(lm[1]); rest = rest.replace(lm[0], " "); }
    const station = rest.replace(/\s+/g, " ").trim();
    Q(`Add fuel: ${money(cost)}`, [station, litres ? litres + " L" : ""].filter(Boolean).join(" · ") || "today",
      () => { DB.fuel.push({ id: uid(), date: today(), cost, litres, odometer: null, station }); save(); toast("Fuel logged"); render(); });
  }
  if ((m = q.match(/^trip\s+(\d+(?:\.\d+)?)\s*km\s*(business|biz|personal)?\s*(.*)$/i))) {
    const km = Number(m[1]);
    const purpose = !m[2] ? "uncategorised" : /^p/i.test(m[2]) ? "personal" : "business";
    const route = m[3].match(/^(.+?)\s+to\s+(.+)$/i);
    Q(`Add ${km} km trip${purpose !== "uncategorised" ? " (" + purpose + ")" : ""}`, route ? `${route[1]} → ${route[2]}` : "today",
      () => { DB.trips.push({ id: uid(), date: today(), km, from: route ? route[1].trim() : "", to: route ? route[2].trim() : "", purpose, clientId: null, source: "manual", notes: "" }); save(); toast("Trip added"); render(); });
  }
  if ((m = q.match(/^(?:new\s+)?client\s+(.+)$/i))) {
    const name = m[1].trim(); // copy out of `m`: it is reassigned by the checks below before any run() fires
    Q(`Create client: ${name}`, "", () => { DB.clients.push({ id: uid(), name, company: "", email: "", phone: "", notes: "", createdAt: today() }); save(); toast("Client added"); render(); });
  }
  if ((m = q.match(/^(note|call|email|meeting)\s+(.+)$/i))) {
    const type = m[1].toLowerCase(), hit = matchClient(m[2]);
    if (hit && hit.rest) Q(`Log ${type} on ${hit.client.name}`, hit.rest,
      () => { DB.activities.push({ id: uid(), clientId: hit.client.id, type, text: hit.rest, date: today() }); save(); toast("Logged to CRM"); render(); });
  }
  if ((m = q.match(/^event\s+(.+)$/i))) {
    const tm = parseTime(m[1]);
    const p = parseWhen(tm ? m[1].replace(tm.text, " ") : m[1]);
    if (p.title) Q(`Create event: ${p.title}`, `${fmtShort(p.due || today())}${tm ? " at " + tm.start : ""}`,
      () => { DB.events.push({ id: uid(), title: p.title, date: p.due || today(), start: tm ? tm.start : "", end: "", clientId: null }); save(); toast("Event added"); render(); });
  }
  return out;
}

/* ----- search ----- */
function score(text, q) {
  const t = String(text || "").toLowerCase();
  if (!t) return 0;
  if (t === q) return 5;
  if (t.startsWith(q)) return 4;
  if (t.includes(" " + q)) return 3;
  return t.includes(q) ? 2 : 0;
}
function searchData(q) {
  const hits = [];
  const add = (group, icon, title, sub, run, s) => { if (s > 0) hits.push({ group, icon, title, sub, run, s }); };
  for (const c of DB.clients) add("Clients", "👤", c.name, [c.company, c.email, c.phone].filter(Boolean).join(" · "), () => App.clientDetail(c.id),
    Math.max(score(c.name, q) * 2, score(c.company, q), score(c.email, q), score(c.phone, q), score(c.notes, q) && 1));
  for (const i of DB.invoices) add("Invoices", "🧾", `${i.number} · ${clientName(i.clientId)}`, `${invoiceStatus(i)} · ${money(invoiceTotal(i))}`, () => App.invoiceDetail(i.id),
    Math.max(score(i.number, q) * 2, score(clientName(i.clientId), q), score(i.items.map((x) => x.desc).join(" "), q)));
  for (const t of DB.tasks) add("Tasks", t.status === "done" ? "☑️" : "✅", t.title, [t.due ? relDay(t.due) : "", t.clientId ? clientName(t.clientId) : ""].filter(Boolean).join(" · "), () => App.editTask(t.id), score(t.title, q) * 2 || score(t.notes, q));
  for (const d of DB.docs) add("Docs", "📄", d.title, plainText(d.body).slice(0, 70), () => App.go("#/docs/" + d.id), Math.max(score(d.title, q) * 2, score(d.body, q)));
  for (const d of DB.deals) add("Deals", "🧲", d.title, `${clientName(d.clientId)} · ${stageLabel(d.stage)}`, () => App.editDeal(d.id), Math.max(score(d.title, q) * 2, score(clientName(d.clientId), q)));
  for (const w of DB.work) add("Work", "🛠", w.desc, `${clientName(w.clientId)} · ${fmtShort(w.date)}`, () => App.editWork(w.id), score(w.desc, q));
  for (const t of DB.trips) add("Trips", "🚗", `${t.from || "?"} → ${t.to || "?"}`, `${fmtShort(t.date)} · ${t.km} km · ${t.purpose}`, () => App.editTrip(t.id), Math.max(score(t.from, q), score(t.to, q), score(t.notes, q)));
  for (const f of DB.fuel) add("Fuel", "⛽️", f.station || "Fill-up", `${fmtShort(f.date)} · ${money(f.cost)}`, () => App.editFuel(f.id), score(f.station, q));
  for (const e of DB.events) add("Events", "📅", e.title, `${fmtShort(e.date)}${e.start ? " " + e.start : ""}`, () => App.editEvent(e.id), score(e.title, q));
  for (const a of DB.activities) add("CRM notes", ACT_ICON[a.type] || "📝", a.text, `${clientName(a.clientId)} · ${a.type}`, () => App.clientDetail(a.clientId), score(a.text, q));
  return hits.sort((a, b) => b.s - a.s);
}
function computeResults(q) {
  q = q.trim();
  if (!q) return [...paletteActions().slice(0, 8), ...paletteNav()];
  const ql = q.toLowerCase();
  const cmd = [...paletteActions(), ...paletteNav()].map((x) => Object.assign({}, x, { s: Math.max(score(x.title, ql) * 2, score(x.kw, ql)) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 5);
  const data = searchData(ql);
  const perGroup = {}, capped = [];
  for (const h of data) { perGroup[h.group] = (perGroup[h.group] || 0) + 1; if (perGroup[h.group] <= 5) capped.push(h); }
  return [...parseQuick(q), ...cmd, ...capped].slice(0, 40);
}

/* ----- view ----- */
function openPalette(prefill = "") {
  if (!pal.open) closeModal();
  pal.open = true; pal.q = prefill; pal.sel = 0;
  $("#palette-root").innerHTML = `
    <div class="pal-backdrop" onclick="if(event.target===this)App.closePalette()">
      <div class="pal" role="dialog" aria-label="Command palette">
        <input id="pal-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Search or type a command… (task, log, fuel, trip)" value="${esc(prefill)}"
          oninput="App.palInput(this.value)" onkeydown="App.palKey(event)">
        <div id="pal-list" class="pal-list"></div>
        <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> run</span><span><kbd>Esc</kbd> close</span></div>
      </div></div>`;
  paintPalette();
  $("#pal-input").focus();
}
function closePalette() { pal.open = false; $("#palette-root").innerHTML = ""; }
function palInput(v) { pal.q = v; pal.sel = 0; paintPalette(); }
function paintPalette() {
  pal.results = computeResults(pal.q);
  let last = "", html = "";
  pal.results.forEach((r, i) => {
    if (r.group !== last) { html += `<div class="pal-group">${esc(r.group)}</div>`; last = r.group; }
    html += `<div class="pal-item ${i === pal.sel ? "sel" : ""} ${r.quick ? "quick" : ""}" data-i="${i}" onclick="App.palRun(${i})" onmousemove="App.palHover(${i})">
      <span class="icon">${r.icon}</span><div class="grow"><div class="title">${esc(r.title)}</div>${r.sub ? `<div class="meta">${esc(r.sub)}</div>` : ""}</div></div>`;
  });
  $("#pal-list").innerHTML = html || `<div class="empty">No matches. Try “task …”, “log 2h Sarah …” or “fuel 80”.</div>`;
  const sel = $("#pal-list .sel"); if (sel) sel.scrollIntoView({ block: "nearest" });
}
function palHover(i) { if (pal.sel !== i) { pal.sel = i; $$("#pal-list .pal-item").forEach((el, j) => el.classList.toggle("sel", j === i)); } }
function palRun(i) {
  const r = pal.results[i];
  if (!r) return;
  closePalette();
  r.run();
}
function palKey(ev) {
  if (ev.key === "ArrowDown") { ev.preventDefault(); pal.sel = Math.min(pal.results.length - 1, pal.sel + 1); paintPalette(); }
  else if (ev.key === "ArrowUp") { ev.preventDefault(); pal.sel = Math.max(0, pal.sel - 1); paintPalette(); }
  else if (ev.key === "Enter") { ev.preventDefault(); palRun(pal.sel); }
  else if (ev.key === "Escape") { ev.preventDefault(); closePalette(); }
}

/* ----- global shortcuts ----- */
const GO = { h: "home", c: "crm", t: "tasks", m: "invoices", d: "docs", l: "calendar", r: "trips", s: "settings" };
let gPending = false, gTimer;
const isTyping = (el) => !!el && (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT" ||
  (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes(el.type)));

document.addEventListener("keydown", (ev) => {
  const mod = ev.metaKey || ev.ctrlKey;
  if (mod && ev.key.toLowerCase() === "k") { ev.preventDefault(); pal.open ? closePalette() : openPalette(""); return; }
  if (ev.key === "Escape") { if (pal.open) closePalette(); else if (modalOpen()) closeModal(); return; }
  if (pal.open || mod || ev.altKey || isTyping(ev.target) || modalOpen()) return;

  if (gPending) {
    gPending = false; clearTimeout(gTimer);
    const dest = GO[ev.key.toLowerCase()];
    if (dest) { ev.preventDefault(); App.go("#/" + dest); }
    return;
  }
  if (ev.key === "g") { gPending = true; gTimer = setTimeout(() => (gPending = false), 1200); return; }
  if (ev.key === "?") { ev.preventDefault(); return shortcuts(); }
  if (ev.key === "/" || ev.key === "c") { ev.preventDefault(); return openPalette(""); }
  // Enter on a focused button/link should just press it, not also trigger the page shortcut
  if (ev.key === "Enter" && ["BUTTON", "A"].includes(ev.target.tagName)) return;
  const keys = ROUTES[currentRoute().key].keys;
  if (keys && keys[ev.key]) { ev.preventDefault(); keys[ev.key](ev); }
});

function shortcuts() {
  const row = (k, d) => `<tr><td>${k.map((x) => `<kbd>${x}</kbd>`).join(" ")}</td><td>${d}</td></tr>`;
  openModal(`<h2>Keyboard shortcuts</h2>
    <table class="simple">
      ${row(["⌘K"], "Search &amp; command palette (Ctrl+K on Windows)")}
      ${row(["/"], "Open search")}${row(["c"], "Create something")}
      ${row(["g", "h"], "Go to Home")}${row(["g", "c"], "Go to CRM")}${row(["g", "t"], "Go to Tasks")}${row(["g", "m"], "Go to Money")}
      ${row(["g", "d"], "Go to Docs")}${row(["g", "l"], "Go to Calendar")}${row(["g", "r"], "Go to Trips")}${row(["g", "s"], "Go to Settings")}
      ${row(["j", "k"], "Home: move down / up")}${row(["Enter"], "Home: run first action")}
      ${row(["e"], "Home: mark done / clear")}${row(["s"], "Home: snooze a day (Shift+S: a week)")}${row(["t"], "Home: turn into a task")}
      ${row(["←", "→"], "Calendar: previous / next week")}${row(["t"], "Calendar: this week")}${row(["n"], "Calendar: new event")}
      ${row(["Esc"], "Close")}
    </table>
    <h2>Quick add (in the palette)</h2>
    <p class="small muted">
      <b>task</b> call Sarah tomorrow !1 · <b>log</b> 2h Sarah site visit · <b>fuel</b> 92.50 Ampol 48l ·
      <b>trip</b> 23km business Home to Penrith · <b>event</b> quote with Sarah fri 3pm ·
      <b>call</b> Sarah wants a revised quote · <b>client</b> Bob Smith</p>
    <div class="modal-actions"><button onclick="App.closeModal()">Close</button></div>`);
}

Object.assign(App, { openPalette, closePalette, palInput, palKey, palRun, palHover, shortcuts });
