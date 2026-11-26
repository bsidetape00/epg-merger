"use strict";
/* Docs: plain-markdown notes with @mentions, live preview, autosave and version history. */

registerRoute("docs", {
  icon: "📄", label: "Docs", order: 40, hint: "g then d",
  render: (param) => (param ? renderDocEditor(param) : renderDocList()),
});

const DOC_TEMPLATES = {
  blank: { label: "Blank", icon: "📄", body: () => "" },
  meeting: { label: "Meeting notes", icon: "🤝", body: (c) => `# Meeting${c ? " with " + c.name : ""} — ${fmtDate(today())}\n\n## Notes\n- \n\n## Actions\n- [ ] \n` },
  quote: { label: "Quote / proposal", icon: "💬", body: (c) => `# Quote${c ? " for " + c.name : ""}\n\nDate: ${fmtDate(today())}\nValid for: 30 days\n\n## Scope of work\n- \n\n## Pricing\n- Labour — \n- Materials — \n\n**Total:** \n\n## Terms\n- Payment within ${DB.settings.paymentTermsDays || 14} days of invoice.\n` },
  job: { label: "Job sheet", icon: "🛠", body: (c) => `# Job sheet${c ? " — " + c.name : ""}\n\nSite: \nStart: ${fmtDate(today())}\n\n## Checklist\n- [ ] \n\n## Materials\n- \n\n## Notes\n` },
};

/* Plain-text preview of a markdown body, for list rows and search results */
function plainText(src) {
  return String(src)
    .replace(/@\[([^\]]+)\]\([a-z]+:[a-z0-9]+\)/g, "@$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*]\s+\[[ xX]\]\s*/gm, "")
    .replace(/^\s*([-*>]|\d+[.)]|#{1,3})\s+/gm, "")
    .replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
}

/* ----- list ----- */
let docFilter = "";
function renderDocList() {
  const q = docFilter.trim().toLowerCase();
  const docs = [...DB.docs].filter((d) => !q || (d.title + " " + d.body).toLowerCase().includes(q))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const rows = docs.map((d) => {
    const snippet = plainText(d.body).slice(0, 90);
    return `<div class="item" onclick="App.go('#/docs/${d.id}')">
      <span class="avatar">📄</span>
      <div class="grow"><div class="title">${esc(d.title || "Untitled")}</div>
      <div class="meta">${d.clientId ? esc(clientName(d.clientId)) + " · " : ""}${esc(snippet)}</div></div>
      <span class="meta">${fmtShort(localDay(d.updatedAt))}</span></div>`;
  }).join("");
  $("#main").innerHTML = `
    <div class="page-head"><h1>Docs</h1><button class="btn-primary" onclick="App.newDoc()">＋ New doc</button></div>
    <form class="quick" onsubmit="return false"><input id="docq" placeholder="Search docs…" value="${esc(docFilter)}" oninput="App.docSearch(this.value)"></form>
    <div class="card list" id="doclist">${rows || `<div class="empty"><span class="big">📄</span>${q ? "No docs match." : "Meeting notes, quotes and job sheets live here. Mention clients and invoices with @."}</div>`}</div>`;
}
function docSearch(v) {
  docFilter = v;
  const pos = v.length;
  renderDocList();
  const i = $("#docq"); i.focus(); i.setSelectionRange(pos, pos);
}

function newDoc(clientId) {
  const c = clientId ? clientById(clientId) : null;
  openModal(`<h2>New doc${c ? " for " + esc(c.name) : ""}</h2><div class="list">` +
    Object.entries(DOC_TEMPLATES).map(([k, t]) => `<div class="item" onclick="App.createDoc('${k}','${clientId || ""}')">
      <span class="avatar">${t.icon}</span><div class="grow"><div class="title">${t.label}</div></div></div>`).join("") +
    `</div><div class="modal-actions"><button onclick="App.closeModal()">Cancel</button></div>`);
}
function createDoc(tpl, clientId) {
  const c = clientId ? clientById(clientId) : null;
  const t = DOC_TEMPLATES[tpl] || DOC_TEMPLATES.blank;
  const body = t.body(c);
  const first = (body.split("\n")[0] || "").replace(/^#+\s*/, "");
  const now = new Date().toISOString();
  const doc = { id: uid(), title: first || "Untitled", body, clientId: clientId || null, createdAt: now, updatedAt: now, versions: [] };
  DB.docs.push(doc);
  save(); closeModal();
  App.go("#/docs/" + doc.id);
}

/* ----- markdown ----- */
function mdInline(s) {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/@\[([^\]]+)\]\((client|invoice|doc):([a-z0-9]+)\)/g, (_, label, type, id) => `<a class="mention" href="#" onclick="App.openRef('${type}:${id}');return false">@${label}</a>`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
}
function md(src, docId) {
  const lines = esc(src).split("\n");
  const out = [];
  let list = null, inCode = false, para = [], check = 0;
  const flushPara = () => { if (para.length) { out.push("<p>" + mdInline(para.join("<br>")) + "</p>"); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of lines) {
    if (/^```/.test(raw)) { flushPara(); closeList(); out.push(inCode ? "</pre>" : "<pre>"); inCode = !inCode; continue; }
    if (inCode) { out.push(raw + "\n"); continue; }
    let m;
    if ((m = raw.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); closeList(); out.push(`<h${m[1].length}>${mdInline(m[2])}</h${m[1].length}>`); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(raw)) { flushPara(); closeList(); out.push("<hr>"); continue; }
    if ((m = raw.match(/^\s*[-*]\s+\[( |x|X)\]\s?(.*)$/))) {
      flushPara(); if (list !== "ul") { closeList(); out.push('<ul class="checks">'); list = "ul"; }
      const on = m[1] !== " ";
      out.push(`<li class="${on ? "on" : ""}"><input type="checkbox" ${on ? "checked" : ""} onclick="App.toggleCheck('${docId}',${check++})"> ${mdInline(m[2])}</li>`);
      continue;
    }
    if ((m = raw.match(/^\s*[-*]\s+(.*)$/))) { flushPara(); if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; } out.push(`<li>${mdInline(m[1])}</li>`); continue; }
    if ((m = raw.match(/^\s*\d+[.)]\s+(.*)$/))) { flushPara(); if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push(`<li>${mdInline(m[1])}</li>`); continue; }
    if ((m = raw.match(/^&gt;\s?(.*)$/))) { flushPara(); closeList(); out.push(`<blockquote>${mdInline(m[1])}</blockquote>`); continue; }
    if (!raw.trim()) { flushPara(); closeList(); continue; }
    closeList(); para.push(raw);
  }
  flushPara(); closeList();
  if (inCode) out.push("</pre>");
  return out.join("\n");
}

/* ----- editor ----- */
let docMode = "write"; // phone only; desktop shows both panes
let mentionAt = null;

function renderDocEditor(id) {
  const doc = DB.docs.find((d) => d.id === id);
  if (!doc) { App.go("#/docs"); return; }
  $("#main").innerHTML = `
    <div class="page-head" style="margin-bottom:8px">
      <button onclick="App.go('#/docs')">← Docs</button>
      <div class="actions" style="margin:0">
        <button class="btn-small" onclick="App.docHistory('${id}')">History</button>
        <button class="btn-small" onclick="App.insertMention()">＠ Mention</button>
        <button class="btn-small btn-danger" onclick="App.deleteDoc('${id}')">Delete</button></div></div>
    <input class="doc-title" id="doc-title" value="${esc(doc.title)}" placeholder="Untitled" oninput="App.docEdit('${id}')">
    <div class="row" style="margin:6px 0 10px;gap:10px">
      <select id="doc-client" style="width:auto;max-width:50%" onchange="App.docEdit('${id}')">${clientOptions(doc.clientId, "No client")}</select>
      <div class="seg doc-seg" style="margin:0">
        <button class="${docMode === "write" ? "active" : ""}" onclick="App.setDocMode('write','${id}')">Write</button>
        <button class="${docMode === "preview" ? "active" : ""}" onclick="App.setDocMode('preview','${id}')">Preview</button></div>
      <span class="muted small right" id="doc-saved">Saved</span></div>
    <div class="doc-edit mode-${docMode}">
      <textarea id="doc-body" spellcheck="true" placeholder="Start writing… Markdown works. Type @ to mention a client or invoice." oninput="App.docEdit('${id}')" onkeydown="App.docKey(event)">${esc(doc.body)}</textarea>
      <div class="doc-preview md" id="doc-preview">${md(doc.body, id)}</div>
    </div>`;
}
function setDocMode(m, id) { docMode = m; renderDocEditor(id); }

const SNAP_EVERY_MS = 5 * 60 * 1000;
function pushVersion(doc, body) {
  doc.versions = doc.versions || [];
  doc.versions.push({ at: new Date().toISOString(), body });
  if (doc.versions.length > 30) doc.versions.shift();
}
const persistDoc = debounce(() => { save(); const s = $("#doc-saved"); if (s) s.textContent = "Saved"; }, 500);

function docEdit(id) {
  const doc = DB.docs.find((d) => d.id === id);
  if (!doc) return;
  const body = $("#doc-body").value;
  const changedBody = body !== doc.body;
  const last = doc.versions && doc.versions[doc.versions.length - 1];
  if (changedBody && (!last || Date.now() - Date.parse(last.at) > SNAP_EVERY_MS)) pushVersion(doc, doc.body || body);
  doc.body = body;
  doc.title = $("#doc-title").value.trim() || "Untitled";
  doc.clientId = $("#doc-client").value || null;
  doc.updatedAt = new Date().toISOString();
  $("#doc-preview").innerHTML = md(body, id);
  const s = $("#doc-saved"); if (s) s.textContent = "Saving…";
  persistDoc();
  // "@" typed at a word boundary opens the mention picker
  if (changedBody) {
    const ta = $("#doc-body"), pos = ta.selectionStart;
    if (body[pos - 1] === "@" && (pos === 1 || /\s/.test(body[pos - 2]))) { mentionAt = pos - 1; openMentionPicker(id); }
  }
}
function toggleCheck(docId, n) {
  const doc = DB.docs.find((d) => d.id === docId);
  let i = 0;
  doc.body = doc.body.split("\n").map((line) => {
    const m = line.match(/^(\s*[-*]\s+\[)( |x|X)(\].*)$/);
    if (!m) return line;
    return i++ === n ? m[1] + (m[2] === " " ? "x" : " ") + m[3] : line;
  }).join("\n");
  doc.updatedAt = new Date().toISOString();
  save();
  renderDocEditor(docId);
}
/* Enter continues bullets / checklists / numbered lists; Enter on an empty item ends the list */
function docKey(ev) {
  if (ev.key !== "Enter" || ev.shiftKey || ev.metaKey || ev.ctrlKey || ev.isComposing) return;
  const ta = ev.target, pos = ta.selectionStart;
  if (pos !== ta.selectionEnd) return;
  const start = ta.value.lastIndexOf("\n", pos - 1) + 1;
  const line = ta.value.slice(start, pos);
  const m = line.match(/^(\s*)([-*]\s+\[[ xX]\]\s+|[-*]\s+|(\d+)[.)]\s+)(.*)$/);
  if (!m) return;
  ev.preventDefault();
  if (!m[4].trim()) { ta.setRangeText("", start, pos, "end"); }
  else {
    let marker = m[2].replace(/\[[xX]\]/, "[ ]");
    if (m[3]) marker = marker.replace(/^\d+/, String(Number(m[3]) + 1));
    ta.setRangeText("\n" + m[1] + marker, pos, pos, "end");
  }
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

/* ----- mentions ----- */
function mentionTargets() {
  return [
    ...DB.clients.map((c) => ({ type: "client", id: c.id, label: c.name, sub: c.company || "Client" })),
    ...DB.invoices.map((i) => ({ type: "invoice", id: i.id, label: i.number, sub: `Invoice · ${clientName(i.clientId)}` })),
    ...DB.docs.map((d) => ({ type: "doc", id: d.id, label: d.title, sub: "Doc" })),
  ];
}
function openMentionPicker(docId) {
  openModal(`<h2>Mention…</h2>
    <input id="mq" placeholder="Search clients, invoices, docs" autocomplete="off" oninput="App.mentionFilter('${docId}')">
    <div class="list" id="mlist" style="margin-top:8px"></div>
    <div class="modal-actions"><button onclick="App.cancelMention()">Cancel</button></div>`);
  mentionFilter(docId);
  const q = $("#mq"); if (q) q.focus();
}
function mentionFilter(docId) {
  const q = ($("#mq").value || "").toLowerCase();
  const hits = mentionTargets().filter((t) => !q || (t.label + " " + t.sub).toLowerCase().includes(q)).slice(0, 12);
  $("#mlist").innerHTML = hits.map((t, i) => `<div class="item" onclick="App.pickMention('${docId}','${t.type}','${t.id}')">
    <div class="grow"><div class="title">${esc(t.label)}</div><div class="meta">${esc(t.sub)}</div></div></div>`).join("") || `<div class="empty">Nothing found.</div>`;
}
function insertMention() {
  const ta = $("#doc-body");
  mentionAt = null;
  const id = location.hash.split("/")[2];
  openMentionPicker(id);
  App._mentionCaret = ta ? ta.selectionStart : 0;
}
function pickMention(docId, type, id) {
  const t = mentionTargets().find((x) => x.type === type && x.id === id);
  const ta = $("#doc-body");
  const token = `@[${t.label.replace(/[\[\]]/g, "")}](${type}:${id}) `;
  if (mentionAt !== null) ta.setRangeText(token, mentionAt, mentionAt + 1, "end"); // replace the typed "@"
  else { const p = App._mentionCaret ?? ta.value.length; ta.setRangeText(token, p, p, "end"); }
  mentionAt = null;
  closeModal();
  ta.focus();
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
function cancelMention() { mentionAt = null; closeModal(); const ta = $("#doc-body"); if (ta) ta.focus(); }

/* ----- history & delete ----- */
function docHistory(id) {
  const doc = DB.docs.find((d) => d.id === id);
  const vs = [...(doc.versions || [])].reverse();
  openModal(`<h2>Version history</h2>
    <p class="small muted">Snapshots are taken automatically as you write. Restoring keeps your current text as a new version, so it's undoable.</p>
    <div class="list">${vs.map((v, i) => `<div class="item" style="cursor:default">
      <div class="grow"><div class="title">${new Date(v.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</div>
      <div class="meta">${esc(plainText(v.body).slice(0, 80)) || "(empty)"}</div></div>
      <button class="btn-small" onclick="App.restoreVersion('${id}',${vs.length - 1 - i})">Restore</button></div>`).join("") || '<div class="empty">No earlier versions yet — keep writing.</div>'}</div>
    <div class="modal-actions"><button onclick="App.closeModal()">Close</button></div>`);
}
function restoreVersion(id, idx) {
  const doc = DB.docs.find((d) => d.id === id);
  const v = doc.versions[idx];
  if (!v) return;
  pushVersion(doc, doc.body);
  doc.body = v.body;
  doc.updatedAt = new Date().toISOString();
  save(); closeModal(); renderDocEditor(id);
  toast("Version restored");
}
function deleteDoc(id) {
  if (!confirm("Delete this doc?")) return;
  DB.docs = DB.docs.filter((d) => d.id !== id);
  save(); App.go("#/docs");
}

Object.assign(App, {
  newDoc, createDoc, docSearch, docEdit, docKey, setDocMode, toggleCheck,
  insertMention, mentionFilter, pickMention, cancelMention, docHistory, restoreVersion, deleteDoc,
});
