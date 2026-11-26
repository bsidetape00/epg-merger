"use strict";
/* Tasks: board + list, priorities, due dates, recurring "routines", links to clients/invoices. */

registerRoute("tasks", {
  icon: "✅", label: "Tasks", order: 30, tab: true, hint: "g then t",
  badge: () => DB.tasks.filter((t) => t.status !== "done" && t.due && t.due <= today()).length,
  render: renderTasks,
});

const T_STATUS = [["todo", "To do"], ["doing", "Doing"], ["done", "Done"]];
const PRIO = { 1: "High", 2: "Medium", 3: "Low" };
const RECUR = [["", "Doesn't repeat"], ["weekly", "Weekly"], ["fortnightly", "Fortnightly"], ["monthly", "Monthly"], ["quarterly", "Quarterly (BAS)"]];
let tasksView = "board";

/* ----- natural-language bits, shared with the quick-add bar ----- */
const DOW_RE = "(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)";
function parseWhen(text) {
  let s = " " + text + " ", due = null, priority = null;
  const grab = (re, fn) => {
    const m = re.exec(s);
    if (!m) return false;
    s = s.slice(0, m.index) + " " + s.slice(m.index + m[0].length);
    fn(m); return true;
  };
  grab(/\s[!p]([123])(?=\s)/i, (m) => (priority = Number(m[1])));
  const found =
    grab(/\s(\d{4}-\d{2}-\d{2})(?=\s)/, (m) => (due = m[1])) ||
    grab(/\s(?:today|tonight)(?=\s)/i, () => (due = today())) ||
    grab(/\s(?:tomorrow|tmrw)(?=\s)/i, () => (due = addDays(today(), 1))) ||
    grab(/\s\+(\d{1,3})d(?=\s)/i, (m) => (due = addDays(today(), Number(m[1])))) ||
    grab(/\sin (\d{1,3}) days?(?=\s)/i, (m) => (due = addDays(today(), Number(m[1])))) ||
    grab(/\snext week(?=\s)/i, () => (due = addDays(weekStart(today()), 7)));
  if (!found) {
    grab(new RegExp("\\s(?:on |next |this )?" + DOW_RE + "(?=\\s)", "i"), (m) => {
      const want = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(m[1].slice(0, 3).toLowerCase());
      const now = new Date().getDay();
      due = addDays(today(), ((want - now + 6) % 7) + 1); // next occurrence, never today
    });
  }
  return { title: s.replace(/\s+/g, " ").trim(), due, priority: priority || 2 };
}

/* ----- CRUD ----- */
function createTask(f) {
  const t = Object.assign({ id: uid(), title: "", status: "todo", priority: 2, due: null, clientId: null, ref: null, notes: "", recur: "", createdAt: today(), doneAt: null }, f);
  DB.tasks.push(t);
  save();
  return t;
}
function nextDue(t) {
  const base = t.due && t.due > today() ? t.due : (t.due || today());
  switch (t.recur) {
    case "weekly": return addDays(base, 7);
    case "fortnightly": return addDays(base, 14);
    case "monthly": return addMonths(base, 1);
    case "quarterly": return addMonths(base, 3);
    default: return null;
  }
}
function setTaskStatus(id, status) {
  const t = DB.tasks.find((x) => x.id === id);
  if (!t) return;
  const was = t.status;
  t.status = status;
  if (status === "done" && was !== "done") {
    t.doneAt = today();
    if (t.recur) {
      const n = nextDue(t);
      DB.tasks.push(Object.assign({}, t, { id: uid(), status: "todo", due: n, doneAt: null, createdAt: today() }));
      toast(`Done. Next one is due ${fmtShort(n)} 🔁`);
    }
  } else if (status !== "done") {
    t.doneAt = null;
  }
  save(); render();
}
function toggleTask(id) {
  const t = DB.tasks.find((x) => x.id === id);
  setTaskStatus(id, t.status === "done" ? "todo" : "done");
}
function shiftTask(id, dir) {
  const t = DB.tasks.find((x) => x.id === id);
  const i = T_STATUS.findIndex((s) => s[0] === t.status) + dir;
  if (i >= 0 && i < T_STATUS.length) setTaskStatus(id, T_STATUS[i][0]);
}

function editTask(id, preset = {}) {
  const t = id ? DB.tasks.find((x) => x.id === id) : Object.assign({ status: "todo", priority: 2, recur: "" }, preset);
  openModal(`
    <h2>${id ? "Edit task" : "New task"}</h2>
    <form onsubmit="App.saveTask(event,'${id || ""}')">
      <div class="field"><label>Task *</label><input name="title" required value="${esc(t.title || "")}" placeholder="e.g. Call Sarah about the quote"></div>
      <div class="field-row">
        <div class="field"><label>Due</label><input name="due" type="date" value="${t.due || ""}"></div>
        <div class="field"><label>Priority</label><select name="priority">${[1, 2, 3].map((p) => `<option value="${p}" ${Number(t.priority) === p ? "selected" : ""}>${PRIO[p]}</option>`).join("")}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Status</label><select name="status">${T_STATUS.map(([k, l]) => `<option value="${k}" ${t.status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="field"><label>Repeats</label><select name="recur">${RECUR.map(([k, l]) => `<option value="${k}" ${t.recur === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>Client</label><select name="clientId">${clientOptions(t.clientId)}</select></div>
      <div class="field"><label>Notes</label><textarea name="notes" rows="3">${esc(t.notes || "")}</textarea></div>
      <input type="hidden" name="ref" value="${esc(t.ref || "")}">
      <div class="modal-actions">
        ${id ? `<button type="button" class="btn-danger" onclick="App.deleteTask('${id}')">Delete</button>` : `<button type="button" onclick="App.closeModal()">Cancel</button>`}
        <button class="btn-primary" type="submit">Save</button></div>
    </form>`);
}
function saveTask(ev, id) {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const data = {
    title: f.get("title").trim(), due: f.get("due") || null, priority: Number(f.get("priority")) || 2,
    clientId: f.get("clientId") || null, notes: f.get("notes").trim(), recur: f.get("recur"), ref: f.get("ref") || null,
  };
  const status = f.get("status");
  if (id) {
    const t = DB.tasks.find((x) => x.id === id);
    Object.assign(t, data);
    closeModal();
    if (t.status !== status) return setTaskStatus(id, status); // handles doneAt + recurrence
  } else {
    const t = createTask(Object.assign(data, { status: "todo" }));
    closeModal();
    if (status !== "todo") return setTaskStatus(t.id, status);
  }
  save(); render();
}
function deleteTask(id) {
  DB.tasks = DB.tasks.filter((t) => t.id !== id);
  save(); closeModal(); render();
}
function quickTask(ev) {
  ev.preventDefault();
  const input = ev.target.elements.q;
  const p = parseWhen(input.value);
  if (!p.title) return;
  createTask({ title: p.title, due: p.due, priority: p.priority });
  input.value = "";
  render();
  const again = $("#qt"); if (again) again.focus();
}

/* A reference like "invoice:ID" lets a task jump back to the thing it came from */
function openRef(ref) {
  const [type, id] = String(ref || "").split(":");
  if (type === "invoice") return App.invoiceDetail(id);
  if (type === "client") return App.clientDetail(id);
  if (type === "doc") return App.go("#/docs/" + id);
}

/* ----- views ----- */
function dueChip(t) {
  if (!t.due) return "";
  const od = t.status !== "done" && t.due < today();
  const td = t.due === today();
  return `<span class="pill ${od ? "overdue" : td ? "uncategorised" : "draft"}">${relDay(t.due)}</span>`;
}
function taskMeta(t) {
  return [t.clientId ? esc(clientName(t.clientId)) : "", t.recur ? "🔁 " + t.recur : ""].filter(Boolean).join(" · ");
}
function taskCard(t) {
  const idx = T_STATUS.findIndex((s) => s[0] === t.status);
  return `<div class="kcard ${t.status === "done" ? "done" : ""}" onclick="App.editTask('${t.id}')">
    <div class="row" style="align-items:flex-start">
      <button class="check ${t.status === "done" ? "on" : ""}" title="Complete" onclick="event.stopPropagation();App.toggleTask('${t.id}')">${t.status === "done" ? "✓" : ""}</button>
      <div class="grow"><div class="title"><span class="prio p${t.priority}" title="${PRIO[t.priority]} priority"></span>${esc(t.title)}</div>
      <div class="meta">${taskMeta(t)}</div></div></div>
    <div class="row" style="margin-top:6px">${dueChip(t)}
      ${t.ref ? `<button class="btn-small" title="Open linked item" onclick="event.stopPropagation();App.openRef('${esc(t.ref)}')">↗</button>` : ""}
      <span class="right">
        ${idx > 0 ? `<button class="btn-small" onclick="event.stopPropagation();App.shiftTask('${t.id}',-1)">←</button>` : ""}
        ${idx < 2 ? `<button class="btn-small" onclick="event.stopPropagation();App.shiftTask('${t.id}',1)">→</button>` : ""}
      </span></div></div>`;
}
const byUrgency = (a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : (a.due || "9999") > (b.due || "9999") ? 1 : a.priority - b.priority;

function renderTasks() {
  const recentDone = DB.tasks.filter((t) => t.status === "done" && t.doneAt && daysBetween(t.doneAt, today()) <= 14);
  const open = DB.tasks.filter((t) => t.status !== "done");
  const seg = `<div class="seg">
    <button class="${tasksView === "board" ? "active" : ""}" onclick="App.setTasksView('board')">Board</button>
    <button class="${tasksView === "list" ? "active" : ""}" onclick="App.setTasksView('list')">List</button></div>`;
  let body;
  if (!DB.tasks.length) {
    body = `<div class="card"><div class="empty"><span class="big">✅</span>No tasks yet. Type one above — try “call Sarah tomorrow” or “BAS statement +30d”.<br>
      Set a task to repeat for routines like weekly invoicing or quarterly BAS.</div></div>`;
  } else if (tasksView === "board") {
    body = `<div class="board three">` + T_STATUS.map(([k, label]) => {
      const list = (k === "done" ? recentDone : open.filter((t) => t.status === k)).sort(k === "done" ? (a, b) => (a.doneAt < b.doneAt ? 1 : -1) : byUrgency);
      return `<div class="kcol"><div class="khead"><span>${label}</span><span class="muted small">${list.length}</span></div>
        ${list.map(taskCard).join("") || '<div class="kempty">—</div>'}</div>`;
    }).join("") + `</div>`;
  } else {
    const t0 = today();
    const groups = [
      ["Overdue", open.filter((t) => t.due && t.due < t0)],
      ["Today", open.filter((t) => t.due === t0)],
      ["Upcoming", open.filter((t) => t.due && t.due > t0)],
      ["No date", open.filter((t) => !t.due)],
      ["Done (last 14 days)", recentDone],
    ];
    body = groups.filter(([, l]) => l.length).map(([label, l]) =>
      `<h2>${label} <span class="muted small">${l.length}</span></h2><div class="card list">${l.sort(byUrgency).map((t) => `
        <div class="item" onclick="App.editTask('${t.id}')">
          <button class="check ${t.status === "done" ? "on" : ""}" onclick="event.stopPropagation();App.toggleTask('${t.id}')">${t.status === "done" ? "✓" : ""}</button>
          <div class="grow"><div class="title ${t.status === "done" ? "strike" : ""}"><span class="prio p${t.priority}"></span>${esc(t.title)}</div><div class="meta">${taskMeta(t)}</div></div>
          ${dueChip(t)}</div>`).join("")}</div>`).join("") || `<div class="card"><div class="empty">All clear 🎉</div></div>`;
  }
  $("#main").innerHTML = `
    <div class="page-head"><h1>Tasks</h1>${seg}</div>
    <form class="quick" onsubmit="App.quickTask(event)">
      <input id="qt" name="q" autocomplete="off" placeholder="Add a task… e.g. “send quote to Sarah fri !1”">
      <button class="btn-primary" type="submit">Add</button></form>
    ${body}`;
}
function setTasksView(v) { tasksView = v; render(); }

Object.assign(App, { editTask, saveTask, deleteTask, toggleTask, shiftTask, quickTask, setTasksView, openRef, createTask, parseWhen, setTaskStatus });
