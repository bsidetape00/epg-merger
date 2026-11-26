"use strict";
/* Calendar: one week view combining your events, task due dates and invoice due dates.
   Export to .ics to drop it into Apple Calendar on every device. */

let calWeek = weekStart(today());

registerRoute("calendar", {
  icon: "📅", label: "Calendar", order: 50, hint: "g then l",
  keys: {
    ArrowLeft: () => calShift(-7),
    ArrowRight: () => calShift(7),
    t: () => { calWeek = weekStart(today()); render(); },
    n: () => editEvent(null, { date: today() }),
  },
  render: renderCalendar,
});

function calShift(days) { calWeek = addDays(calWeek, days); render(); }

function eventsOn(date) {
  const items = [];
  for (const e of DB.events) if (e.date === date) items.push({ kind: "event", sort: e.start || "00:00", html: `<span class="ct">${e.start ? esc(e.start) : "all day"}</span> ${esc(e.title)}`, click: `App.editEvent('${e.id}')`, cls: "ev", e });
  for (const t of DB.tasks) if (t.status !== "done" && t.due === date) items.push({ kind: "task", sort: "24:00", html: `✅ ${esc(t.title)}`, click: `App.editTask('${t.id}')`, cls: date < today() ? "od" : "tk" });
  for (const i of DB.invoices) if (["sent", "overdue"].includes(invoiceStatus(i)) && i.dueDate === date) items.push({ kind: "invoice", sort: "24:01", html: `💰 ${esc(i.number)} due — ${money(invoiceTotal(i))}`, click: `App.invoiceDetail('${i.id}')`, cls: invoiceStatus(i) === "overdue" ? "od" : "iv" });
  return items.sort((a, b) => (a.sort < b.sort ? -1 : 1));
}

function renderCalendar() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(calWeek, i));
  const t0 = today();
  const label = `${fmtShort(days[0])} – ${fmtDate(days[6])}`;
  const cols = days.map((d) => {
    const dt = new Date(d + "T00:00:00");
    const items = eventsOn(d);
    return `<div class="cday ${d === t0 ? "today" : ""} ${dt.getDay() % 6 === 0 ? "wknd" : ""}">
      <div class="chead"><span><b>${dt.toLocaleDateString(undefined, { weekday: "short" })}</b> ${dt.getDate()}</span>
        <button class="btn-small" title="Add event" onclick="App.editEvent(null,{date:'${d}'})">＋</button></div>
      ${items.map((x) => `<div class="citem ${x.cls}" onclick="${x.click}">${x.html}</div>`).join("") || '<div class="cempty">—</div>'}</div>`;
  }).join("");
  $("#main").innerHTML = `
    <div class="page-head"><h1>Calendar</h1>
      <div class="actions" style="margin:0">
        <button onclick="App.calShift(-7)" aria-label="Previous week">‹</button>
        <button onclick="App.calToday()">Today</button>
        <button onclick="App.calShift(7)" aria-label="Next week">›</button>
        <button class="btn-primary" onclick="App.editEvent(null,{date:'${t0}'})">＋ Event</button></div></div>
    <p class="sub">${label} · <a href="#" onclick="App.exportIcs();return false">Export .ics for Apple Calendar</a></p>
    <div class="cal">${cols}</div>`;
}
function calToday() { calWeek = weekStart(today()); render(); }

function editEvent(id, preset = {}) {
  const e = id ? DB.events.find((x) => x.id === id) : Object.assign({ date: today(), start: "", end: "" }, preset);
  openModal(`
    <h2>${id ? "Edit event" : "New event"}</h2>
    <form onsubmit="App.saveEvent(event,'${id || ""}')">
      <div class="field"><label>Title *</label><input name="title" required value="${esc(e.title || "")}" placeholder="e.g. Site visit — Chen Electrical"></div>
      <div class="field-row">
        <div class="field"><label>Date</label><input name="date" type="date" required value="${e.date}"></div>
        <div class="field"><label>Start</label><input name="start" type="time" value="${e.start || ""}"></div>
        <div class="field"><label>End</label><input name="end" type="time" value="${e.end || ""}"></div>
      </div>
      <div class="field"><label>Client</label><select name="clientId">${clientOptions(e.clientId)}</select></div>
      <div class="modal-actions">
        ${id ? `<button type="button" class="btn-danger" onclick="App.deleteEvent('${id}')">Delete</button>` : `<button type="button" onclick="App.closeModal()">Cancel</button>`}
        <button class="btn-primary" type="submit">Save</button></div>
    </form>`);
}
function saveEvent(ev, id) {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const data = { title: f.get("title").trim(), date: f.get("date"), start: f.get("start") || "", end: f.get("end") || "", clientId: f.get("clientId") || null };
  if (id) Object.assign(DB.events.find((x) => x.id === id), data);
  else DB.events.push(Object.assign({ id: uid() }, data));
  if (data.date) calWeek = weekStart(data.date);
  save(); closeModal(); render();
}
function deleteEvent(id) { DB.events = DB.events.filter((e) => e.id !== id); save(); closeModal(); render(); }

/* ----- .ics export ----- */
const icsEsc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (iso) => iso.replace(/-/g, "");
const icsTime = (iso, hhmm) => icsDate(iso) + "T" + hhmm.replace(":", "") + "00";
function exportIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Business HQ//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Business HQ"];
  const allDay = (uidv, date, summary) => out.push("BEGIN:VEVENT", `UID:${uidv}@bizhq`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(date, 1))}`, `SUMMARY:${icsEsc(summary)}`, "END:VEVENT");
  for (const e of DB.events) {
    if (!e.start) { allDay(e.id, e.date, e.title); continue; }
    const end = e.end || (String(Math.min(23, Number(e.start.slice(0, 2)) + 1)).padStart(2, "0") + e.start.slice(2));
    out.push("BEGIN:VEVENT", `UID:${e.id}@bizhq`, `DTSTAMP:${stamp}`, `DTSTART:${icsTime(e.date, e.start)}`, `DTEND:${icsTime(e.date, end)}`, `SUMMARY:${icsEsc(e.title)}`, "END:VEVENT");
  }
  for (const t of DB.tasks) if (t.status !== "done" && t.due) allDay("t" + t.id, t.due, "✅ " + t.title);
  for (const i of DB.invoices) if (["sent", "overdue"].includes(invoiceStatus(i)) && i.dueDate) allDay("i" + i.id, i.dueDate, `💰 ${i.number} due (${clientName(i.clientId)})`);
  out.push("END:VCALENDAR");
  const blob = new Blob([out.join("\r\n") + "\r\n"], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "business-hq.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast("Calendar file downloaded");
}

Object.assign(App, { calShift, calToday, editEvent, saveEvent, deleteEvent, exportIcs });
