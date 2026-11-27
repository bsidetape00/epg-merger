"use strict";
/* Settings: business details, appearance, workspace rules, backup/restore. */

registerRoute("settings", { icon: "⚙️", label: "Settings", order: 90, hint: "g then s", render: renderSettings });

const THEMES = [
  ["auto", "Auto", "Follows your device", "#3730a3"],
  ["light", "Paper", "Light and clean", "#3730a3"],
  ["dark", "Indigo", "Dark, the classic", "#101120"],
  ["graphite", "Graphite", "Neutral dark grey", "#161616"],
  ["void", "Void", "True black (OLED)", "#000000"],
  ["ember", "Ember", "Warm orange accent", "#1c1410"],
  ["forest", "Forest", "Deep green", "#0f1a15"],
];
function applyTheme(name) {
  const t = THEMES.find((x) => x[0] === name) || THEMES[0];
  if (t[0] === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t[0]);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t[3]);
}
function setTheme(name) {
  DB.settings.theme = name;
  applyTheme(name);
  save(); render();
}

function renderSettings() {
  const s = DB.settings;
  $("#main").innerHTML = `
    <div class="page-head"><h1>Settings</h1></div>

    <div class="card">
      <h2 style="margin-top:0">Appearance</h2>
      <div class="themes">${THEMES.map(([k, label, sub]) => `
        <button class="theme-tile ${s.theme === k ? "active" : ""}" data-t="${k}" onclick="App.setTheme('${k}')">
          <span class="swatch sw-${k}"></span><b>${label}</b><span class="muted small">${sub}</span></button>`).join("")}</div>
    </div>

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
        <h2>Workspace</h2>
        <div class="field"><label>Flag open deals as “going cold” after (days without activity)</label><input name="staleDays" type="number" min="1" value="${s.staleDays}"></div>
        <button class="btn-primary" type="submit">Save settings</button>
      </form>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Try it with sample data</h2>
      <p class="small muted">Adds a few made-up clients, invoices, tasks, a doc, a pipeline and trips so you can see every screen working. Everything added is marked as a sample and can be removed in one click without touching your real records.</p>
      <div class="actions">
        <button class="btn-primary" onclick="App.loadSample()">Load sample data</button>
        <button onclick="App.clearSample()" ${hasSample() ? "" : "disabled"}>Remove sample data${hasSample() ? "" : " (none loaded)"}</button>
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Backup &amp; move between devices</h2>
      <p class="small muted">Data lives in this browser only. Export a backup file regularly, keep it in iCloud Drive, and import it on your other devices to bring them up to date. Your .ics calendar export is on the Calendar page.</p>
      <div class="actions">
        <button class="btn-primary" onclick="App.exportData()">⬇ Export backup</button>
        <button onclick="App.importDataPick()">⬆ Import backup</button>
        <input type="file" id="import-file" accept=".json,application/json" style="display:none" onchange="App.importData(event)">
      </div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Keyboard</h2>
      <p class="small muted">Press <kbd>?</kbd> anywhere for every shortcut, or <kbd>⌘K</kbd> / <kbd>Ctrl K</kbd> to search and quick-add.</p>
      <button onclick="App.shortcuts()">Show shortcuts</button>
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
  for (const k of ["hourlyRate", "kmRate", "nextInvoiceNumber", "paymentTermsDays", "staleDays"]) s[k] = Number(f.get(k)) || 0;
  s.nextInvoiceNumber = Math.max(1, Math.round(s.nextInvoiceNumber));
  s.staleDays = Math.max(1, Math.round(s.staleDays) || 14);
  save(); toast("Settings saved"); render();
}
function exportData() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bizhq-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importDataPick() { $("#import-file").click(); }
function importData(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(String(reader.result));
      if (!d || ![1, 2].includes(d.version) || !Array.isArray(d.clients)) throw new Error("not a BizHQ backup");
      const m = migrate(d); // older (v1) backups gain the new empty sections
      if (!confirm(`Replace everything on this device with the backup?\n(${m.clients.length} clients, ${m.invoices.length} invoices, ${m.trips.length} trips, ${m.tasks.length} tasks, ${m.docs.length} docs)`)) return;
      DB = m;
      applyTheme(DB.settings.theme);
      save(); render(); toast("Backup imported");
    } catch (e) { alert("That file doesn't look like a Business HQ backup. " + e.message); }
    ev.target.value = "";
  };
  reader.readAsText(file);
}
function wipe() {
  if (!confirm("Erase ALL data on this device? Export a backup first if you want to keep anything.")) return;
  if (!confirm("Really sure? This cannot be undone.")) return;
  DB = defaultData();
  applyTheme(DB.settings.theme);
  save(); render();
}

/* ----- sample data: every record carries sample:true so it can be removed cleanly ----- */
const LISTS = ["clients", "work", "invoices", "trips", "fuel", "tasks", "docs", "deals", "activities", "events"];
const hasSample = () => LISTS.some((k) => DB[k].some((x) => x.sample));
function loadSample() {
  if (hasSample() && !confirm("Sample data is already loaded. Add another copy?")) return;
  const t = today(), d = (n) => addDays(t, n), S = (o) => Object.assign({ id: uid(), sample: true }, o);
  const sarah = S({ name: "Sarah Chen", company: "Chen Electrical", email: "sarah@chenelectrical.example", phone: "0400 111 222", notes: "Prefers email. Pays on time.", createdAt: d(-40) });
  const marcus = S({ name: "Marcus Webb", company: "Webb Plumbing", email: "marcus@webbplumbing.example", phone: "0400 333 444", notes: "", createdAt: d(-60) });
  const priya = S({ name: "Priya Nair", company: "Nair Dental", email: "priya@nairdental.example", phone: "0400 555 666", notes: "", createdAt: d(-20) });
  DB.clients.push(sarah, marcus, priya);
  const rate = DB.settings.hourlyRate || 110;

  DB.work.push(
    S({ clientId: sarah.id, date: d(-10), desc: "Switchboard site visit and quote", hours: 3, rate, invoiceId: null }),
    S({ clientId: sarah.id, date: d(-9), desc: "Load calculations", hours: 1.5, rate, invoiceId: null }),
    S({ clientId: priya.id, date: d(-3), desc: "Initial consult", hours: 2, rate, invoiceId: null }));

  const num = () => { const n = nextInvoiceNumber(); DB.settings.nextInvoiceNumber++; return n; };
  DB.invoices.push(
    S({ number: num(), clientId: marcus.id, issueDate: d(-20), dueDate: d(-6), status: "sent", notes: "", items: [{ desc: "Bathroom rough-in electrical", qty: 8, unit: rate }, { desc: "Materials", qty: 1, unit: 340 }] }),
    S({ number: num(), clientId: priya.id, issueDate: d(-5), dueDate: d(9), status: "draft", notes: "", items: [{ desc: "Scoping workshop", qty: 2, unit: rate }] }));

  DB.deals.push(
    S({ clientId: sarah.id, title: "Switchboard upgrade", value: 4200, stage: "quoted", createdAt: d(-9) }),
    S({ clientId: marcus.id, title: "Bathroom renovation", value: 12800, stage: "active", createdAt: d(-30) }),
    S({ clientId: priya.id, title: "Clinic fit-out", value: 6500, stage: "lead", createdAt: d(-3) }));

  DB.tasks.push(
    S({ title: "Call Sarah about the quote", status: "todo", priority: 1, due: t, clientId: sarah.id, notes: "", recur: "", createdAt: d(-2), doneAt: null, ref: "client:" + sarah.id }),
    S({ title: "Order cable for Webb job", status: "doing", priority: 2, due: d(1), clientId: marcus.id, notes: "", recur: "", createdAt: d(-4), doneAt: null, ref: null }),
    S({ title: "Lodge BAS", status: "todo", priority: 2, due: d(12), clientId: null, notes: "", recur: "quarterly", createdAt: d(-30), doneAt: null, ref: null }),
    S({ title: "Send Priya the scope outline", status: "todo", priority: 3, due: d(-1), clientId: priya.id, notes: "", recur: "", createdAt: d(-3), doneAt: null, ref: null }));

  DB.events.push(S({ title: "Site visit — Webb Plumbing", date: d(1), start: "09:30", end: "11:00", clientId: marcus.id }));
  DB.activities.push(S({ clientId: priya.id, type: "call", text: "Wants a fixed price, not hourly", date: d(-3) }));

  const now = new Date().toISOString();
  DB.docs.push(S({ title: "Quote — Chen Electrical", clientId: sarah.id, createdAt: now, updatedAt: now, versions: [],
    body: `# Quote for Sarah Chen\n\nDate: ${fmtDate(t)}\nValid for: 30 days\n\n## Scope of work\n- Replace main switchboard with 12-circuit RCD board\n- Test and tag all circuits\n\n## Pricing\n- Labour — 12h\n- Materials — board, breakers, cable\n\n**Total:** $4,200 + GST\n\n## Next steps\n- [ ] Sarah to confirm by Friday\n- [x] Site visit done\n\nSee @[Sarah Chen](client:${sarah.id}) for contact details.\n` }));

  DB.trips.push(
    S({ date: d(-6), km: 23.4, from: "Home", to: "Chen Electrical", purpose: "business", clientId: sarah.id, source: "manual", notes: "" }),
    S({ date: d(-6), km: 23.7, from: "Chen Electrical", to: "Home", purpose: "uncategorised", clientId: null, source: "gofar", notes: "" }),
    S({ date: d(-4), km: 8.1, from: "Home", to: "Bunnings", purpose: "personal", clientId: null, source: "manual", notes: "" }));
  DB.fuel.push(S({ date: d(-5), cost: 92.5, litres: 48.2, odometer: 84210, station: "Ampol Penrith" }));

  save(); render(); toast("Sample data loaded. Remove it anytime in Settings.");
}
function clearSample() {
  if (!hasSample()) return;
  if (!confirm("Remove all sample records? Your own data is not touched.")) return;
  for (const k of LISTS) DB[k] = DB[k].filter((x) => !x.sample);
  for (const x of [...DB.work, ...DB.trips]) if (x.invoiceId && !DB.invoices.some((i) => i.id === x.invoiceId)) x.invoiceId = null;
  DB.snoozed = {};
  save(); render(); toast("Sample data removed");
}

Object.assign(App, { setTheme, saveSettings, exportData, importDataPick, importData, wipe, loadSample, clearSample });
