"use strict";
/* Business HQ core: store, helpers, router, modal, toast.
   Classic scripts share one global scope, so every module can use these directly. */

const App = (window.App = {});
const STORE_KEY = "bizhq.data.v1"; // key kept so existing data carries over
const SCHEMA = 2;

/* ---------------- Store ---------------- */
const defaultData = () => ({
  version: SCHEMA,
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
    paymentDetails: "",
    theme: "auto",
    staleDays: 14,          // open deal with no contact for this long -> follow-up nudge
  },
  clients: [],
  work: [],       // {id, clientId, date, desc, hours, rate, invoiceId}
  invoices: [],   // {id, number, clientId, issueDate, dueDate, items:[{desc,qty,unit}], status, paidDate, notes}
  trips: [],      // {id, date, from, to, km, purpose, clientId, source, notes}
  fuel: [],       // {id, date, litres, cost, odometer, station}
  tasks: [],      // {id, title, status, priority, due, clientId, notes, recur, createdAt, doneAt}
  docs: [],       // {id, title, body, clientId, createdAt, updatedAt, versions:[{at, body}]}
  deals: [],      // {id, clientId, title, value, stage, createdAt}
  activities: [], // {id, clientId, type, text, date}  (manual CRM log: note/call/email/meeting)
  events: [],     // {id, title, date, start, end, clientId}
  snoozed: {},    // home-feed key -> ISO date until which it stays hidden
});

function migrate(d) {
  const base = defaultData();
  const out = Object.assign(base, d || {});
  out.settings = Object.assign(defaultData().settings, (d && d.settings) || {});
  for (const k of ["clients", "work", "invoices", "trips", "fuel", "tasks", "docs", "deals", "activities", "events"]) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  if (!out.snoozed || typeof out.snoozed !== "object") out.snoozed = {};
  out.version = SCHEMA;
  return out;
}

let DB = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? migrate(JSON.parse(raw)) : defaultData();
  } catch (e) {
    console.error("load failed", e);
    return defaultData();
  }
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(DB));
  } catch (e) {
    alert("Couldn't save: this browser's storage is full or blocked. Export a backup from Settings.");
  }
  renderNav();
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------------- Helpers ---------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Local-date helpers. (toISOString() is UTC, which gives the wrong day in the
   morning for anyone east of Greenwich, so never use it for calendar dates.) */
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const today = () => isoLocal(new Date());
const localDay = (stamp) => isoLocal(new Date(stamp)); // ISO timestamp (UTC) -> the user's calendar day
function addDays(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoLocal(d); }
function daysBetween(a, b) { return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000); }
function addMonths(iso, n) {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return isoLocal(d);
}
function weekStart(iso) { // Monday
  const d = new Date(iso + "T00:00:00");
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return isoLocal(d);
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function fmtShort(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
function relDay(iso) {
  if (!iso) return "";
  const n = daysBetween(today(), iso);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n < 0) return `${-n}d overdue`;
  if (n < 7) return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" });
  return fmtShort(iso);
}
function money(n) {
  const cur = DB.settings.currency || "AUD";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n || 0); }
  catch { return cur + " " + (n || 0).toFixed(2); }
}
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const clientById = (id) => DB.clients.find((c) => c.id === id);
const clientName = (id) => (clientById(id) || {}).name || "(no client)";
const initials = (name) => String(name || "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
const clientOptions = (selected, blank = "— none —") =>
  `<option value="">${blank}</option>` +
  [...DB.clients].sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `<option value="${c.id}" ${selected === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("");

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

/* Last time anything happened with a client (for the "going cold" nudge) */
function lastTouch(clientId) {
  const dates = [];
  for (const a of DB.activities) if (a.clientId === clientId) dates.push(a.date);
  for (const w of DB.work) if (w.clientId === clientId) dates.push(w.date);
  for (const i of DB.invoices) if (i.clientId === clientId) dates.push(i.paidDate || i.issueDate);
  for (const t of DB.tasks) if (t.clientId === clientId && t.doneAt) dates.push(t.doneAt);
  for (const e of DB.events) if (e.clientId === clientId && e.date <= today()) dates.push(e.date);
  return dates.sort().pop() || null;
}

/* ---------------- Router ---------------- */
const ROUTES = {};
function registerRoute(key, def) { ROUTES[key] = def; }

function currentRoute() {
  const parts = (location.hash || "#/home").replace(/^#\//, "").split("/");
  const key = ROUTES[parts[0]] ? parts[0] : "home";
  return { key, param: parts[1] || "" };
}
const sortedRoutes = () => Object.entries(ROUTES).sort((a, b) => (a[1].order || 99) - (b[1].order || 99));

function navLink(key, r, cur) {
  const n = r.badge ? r.badge() : 0;
  return `<a href="#/${key}" class="${cur === key ? "active" : ""}" ${r.hint ? `title="${esc(r.hint)}"` : ""}>
    <span class="icon">${r.icon}</span><span class="lbl">${r.label}</span>
    ${n ? `<span class="nav-badge">${n}</span>` : ""}</a>`;
}

function renderNav() {
  const { key: cur } = currentRoute();
  const all = sortedRoutes();
  $("#nav").innerHTML = all.map(([k, r]) => navLink(k, r, cur)).join("");
  const tabs = all.filter(([, r]) => r.tab);
  const moreActive = !tabs.some(([k]) => k === cur);
  const moreBadge = all.filter(([, r]) => !r.tab).reduce((s, [, r]) => s + (r.badge ? r.badge() : 0), 0);
  $("#tabbar").innerHTML = tabs.map(([k, r]) => navLink(k, r, cur)).join("") +
    `<a href="#" class="${moreActive ? "active" : ""}" onclick="App.moreMenu();return false">
       <span class="icon">⋯</span><span class="lbl">More</span>${moreBadge ? `<span class="nav-badge">${moreBadge}</span>` : ""}</a>`;
}

App.moreMenu = function () {
  const { key: cur } = currentRoute();
  const rows = sortedRoutes().filter(([, r]) => !r.tab).map(([k, r]) => {
    const n = r.badge ? r.badge() : 0;
    return `<a class="item" href="#/${k}" onclick="App.closeModal()" style="text-decoration:none;color:inherit">
      <span class="avatar">${r.icon}</span>
      <div class="grow"><div class="title">${r.label}${k === cur ? " ·" : ""}</div></div>
      ${n ? `<span class="nav-badge" style="margin:0">${n}</span>` : ""}</a>`;
  }).join("");
  openModal(`<h2>More</h2><div class="list">${rows}</div>
    <div class="modal-actions"><button onclick="App.closeModal()">Close</button></div>`);
};

function render() {
  renderNav();
  const { key, param } = currentRoute();
  const r = ROUTES[key];
  document.title = `${r.label} · Business HQ`;
  document.body.dataset.route = key;
  r.render(param);
}
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

/* ---------------- Modal & toast ---------------- */
function openModal(html) {
  $("#modal-root").innerHTML = `<div class="modal-backdrop" onclick="if(event.target===this)App.closeModal()"><div class="modal" role="dialog">${html}</div></div>`;
  const first = $("#modal-root input:not([type=hidden]):not([type=file]), #modal-root textarea");
  if (first && matchMedia("(hover: hover)").matches) first.focus();
}
function closeModal() { $("#modal-root").innerHTML = ""; }
const modalOpen = () => !!$("#modal-root .modal-backdrop");

let toastTimer;
function toast(msg, ms = 2400) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

Object.assign(App, { closeModal, go: (h) => { location.hash = h; } });
