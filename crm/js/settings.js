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

Object.assign(App, { setTheme, saveSettings, exportData, importDataPick, importData, wipe });
