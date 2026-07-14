// @quorum/dashboard — a single self-contained local web page (SPEC §8 / task 100).
// Rendered by renderDashboard(token) and served by the daemon at GET / (localhost only).
// No external CDN/scripts/fonts — everything inline, so it works offline and inside a future
// VS Code webview.

export const APP_VERSION = "0.8.0";

function logoMark(gradientId: string, className = "qLogo"): string {
  return `<svg class="${className}" viewBox="0 0 100 100" role="img" aria-label="Quorum logo">
  <defs>
    <linearGradient id="${gradientId}" x1="18" y1="22" x2="82" y2="78" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#10B981"/>
      <stop offset="0.52" stop-color="#0EA5A4"/>
      <stop offset="1" stop-color="#22D3EE"/>
    </linearGradient>
  </defs>
  <path class="ring" d="M50 14 80.3 32.5 80.3 67.5 50 86 19.7 67.5 19.7 32.5Z" fill="none" stroke="url(#${gradientId})" stroke-width="2.2" stroke-linejoin="round"/>
  <g stroke="#0A0F12" stroke-width="1.5" stroke-linejoin="round">
    <path d="M50 50 50 31 66.5 40.5Z" fill="#10B981"/>
    <path d="M50 50 66.5 40.5 66.5 59.5Z" fill="#0EA5A4"/>
    <path d="M50 50 66.5 59.5 50 69Z" fill="#22D3EE"/>
    <path d="M50 50 50 69 33.5 59.5Z" fill="#0EA5A4"/>
    <path d="M50 50 33.5 59.5 33.5 40.5Z" fill="#10B981"/>
    <path d="M50 50 33.5 40.5 50 31Z" fill="#22D3EE"/>
  </g>
  <circle cx="50" cy="14" r="4.8" fill="#10B981"/>
  <circle cx="80.3" cy="32.5" r="5.2" fill="#F59E0B"/>
  <circle cx="80.3" cy="67.5" r="4.8" fill="#22D3EE"/>
  <circle cx="50" cy="86" r="4.8" fill="#0EA5A4"/>
  <circle cx="19.7" cy="67.5" r="4.8" fill="#22D3EE"/>
  <circle cx="19.7" cy="32.5" r="4.8" fill="#10B981"/>
</svg>`;
}

const STYLE = `
:root { color-scheme: light dark;
  --bg:#f7faf9; --fg:#0b1210; --muted:#5b6b68; --line:#e0e9e6; --card:#ffffff;
  --accent:#0EA5A4; --accent2:#0891b2; --amber:#b45309; --stop:#dc2626; --ontint:#04120e;
  --grad:linear-gradient(135deg,#10B981,#0EA5A4 55%,#22D3EE); }
@media (prefers-color-scheme: dark) { :root {
  --bg:#0A0F12; --fg:#E6F1EE; --muted:#8FA3A0; --line:#20312f; --card:#101719;
  --accent:#10B981; --accent2:#22D3EE; --amber:#F59E0B; --stop:#f87171; --ontint:#04120e;
  --grad:linear-gradient(135deg,#10B981,#0EA5A4 55%,#22D3EE); } }
* { box-sizing: border-box; }
body { margin:0; font:14px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--fg); display:flex; flex-direction:column; height:100vh; overflow:hidden; }
header { display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:1px solid var(--line); background:var(--bg); flex-wrap:wrap; flex:none; }
h1 { font-size:15px; margin:0; font-weight:700; }
.brand { display:flex; align-items:center; gap:8px; letter-spacing:-.01em; }
.qLogo { width:24px; height:24px; flex:none; display:block; }
.qLogo .ring { opacity:.62; }
.version { font-size:10px; color:var(--amber); border:1px solid color-mix(in srgb, var(--amber) 55%, transparent); border-radius:999px; padding:1px 7px; letter-spacing:.04em; background:color-mix(in srgb, var(--amber) 8%, transparent); }
.dia { background:var(--grad); -webkit-background-clip:text; background-clip:text; color:transparent; font-weight:800; }
.stage { font-size:12px; color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:2px 10px; }
.spacer { flex:1; }
button { font:inherit; border:1px solid var(--line); background:var(--card); color:var(--fg); border-radius:8px; padding:6px 12px; cursor:pointer; }
button:hover { border-color:var(--accent); }
button.stop { background:var(--stop); color:#fff; border-color:var(--stop); font-weight:600; }
button.primary { background:var(--grad); color:var(--ontint); border:none; font-weight:700; }
button.primary:hover { filter:brightness(1.08); }

/* ── Goal bar (live view) ─────────────────────────────────────────── */
.goalbar { display:none; align-items:flex-start; gap:10px; padding:9px 16px; border-bottom:1px solid var(--line); background:var(--card); flex:none; }
body[data-view="live"] .goalbar { display:flex; }
.goalbar .lbl { font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; margin-top:3px; flex:none; }
.goalbar .g { font-weight:600; white-space:pre-wrap; word-break:break-word; }

/* ── Compose / landing (no active session) ───────────────────────── */
#compose { display:none; flex:1; overflow:auto; background:radial-gradient(60% 45% at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent); }
body[data-view="compose"] #compose { display:block; }
main { display:none; flex:1; min-height:0; grid-template-columns:280px 1fr; grid-template-rows:1fr auto; }
body[data-view="live"] main { display:grid; }
.composeWrap { max-width:760px; margin:0 auto; padding:44px 20px; }
.composeWrap h2 { text-align:center; font-size:28px; margin:0 0 6px; letter-spacing:-.01em; }
.heroBrand { display:inline-flex; align-items:center; justify-content:center; gap:10px; }
.heroLogo { width:42px; height:42px; filter:drop-shadow(0 12px 30px color-mix(in srgb, var(--accent) 25%, transparent)); }
.composeWrap .tag { display:inline-block; font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:var(--accent); border:1px solid var(--accent); border-radius:999px; padding:1px 8px; vertical-align:middle; margin-left:8px; }
.composeWrap .subtitle { text-align:center; color:var(--muted); margin:0 auto 22px; max-width:560px; }
.composeCard { border:1px solid var(--line); border-radius:16px; background:var(--card); padding:18px; box-shadow:0 18px 50px -28px color-mix(in srgb, var(--accent) 70%, transparent); }
.presets { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
.preset { border:1px solid var(--line); background:var(--bg); border-radius:999px; padding:6px 16px; cursor:pointer; font-size:13px; }
.preset.active { background:var(--grad); color:var(--ontint); border-color:transparent; font-weight:700; }
.preset.frugal { border-color:color-mix(in srgb, var(--amber) 48%, var(--line)); color:var(--amber); }
.preset.frugal.active { background:var(--amber); color:#0A0F12; border-color:var(--amber); }
#composeMsg { display:none; margin-top:14px; padding:12px 14px; border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:10px; background:var(--bg); font-size:13px; }
#composeMsg.show { display:block; }
#composeMsg.err { border-left-color:var(--stop); color:var(--stop); }
#composeMsg .who { font-weight:700; color:var(--accent); margin-bottom:4px; }
#composeMsg .srow { display:flex; gap:8px; margin:2px 0; }
#composeMsg .srole { color:var(--muted); text-transform:capitalize; min-width:70px; }
.mchips { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
.mchip { display:flex; gap:6px; align-items:center; border:1px solid var(--line); border-radius:8px; padding:6px 10px; font-size:13px; background:var(--bg); }
.mchip .role { color:var(--muted); text-transform:capitalize; }
.mchip .badge { font-size:9px; padding:1px 5px; border-radius:4px; border:1px solid #16a34a; color:#16a34a; }
.fuse { font-size:12px; color:var(--muted); margin-bottom:12px; }
.fuse b { color:var(--amber); }
#goalInput { width:100%; min-height:130px; font:inherit; padding:12px 14px; border:1px solid var(--line); border-radius:12px; background:var(--bg); color:var(--fg); resize:vertical; }
.composeRow { display:flex; justify-content:space-between; align-items:center; margin-top:12px; gap:12px; }
.composeRow .start { padding:9px 20px; font-size:14px; }

aside { border-right:1px solid var(--line); padding:12px; overflow:auto; grid-row:1; grid-column:1; display:flex; flex-direction:column; gap:14px; }
.sideBlock h3 { margin:0 0 8px; font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; }
.sessionItem { display:block; width:100%; text-align:left; border:1px solid var(--line); background:var(--card); border-radius:10px; padding:8px 10px; margin-bottom:8px; }
.sessionItem.active { border-color:var(--accent); box-shadow:0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent) inset; }
.sessionItem .goal { font-weight:650; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sessionItem .meta { font-size:11px; color:var(--muted); margin-top:2px; }
.emptySide { color:var(--muted); font-size:12px; border:1px dashed var(--line); border-radius:10px; padding:9px; }
.activityCard { background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 12%,var(--card)),var(--card)); border:1px solid var(--line); border-radius:12px; padding:10px; }
.activityTop { display:flex; align-items:center; gap:8px; font-weight:700; }
.pulse { width:8px; height:8px; border-radius:999px; background:var(--accent); box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 18%,transparent); }
.activityNote { margin-top:7px; color:var(--fg); font-size:12px; }
.activityMeta { margin-top:6px; color:var(--muted); font-size:11px; }
.activitySeats { display:flex; gap:5px; flex-wrap:wrap; margin-top:8px; }
.activitySeat { border:1px solid var(--line); border-radius:999px; padding:2px 7px; font-size:10px; color:var(--muted); }
#feed { overflow:auto; padding:16px; grid-row:1; grid-column:2; }
.ev { margin-bottom:14px; }
.ev .who { font-weight:600; }
.ev .model { font-size:11px; color:var(--muted); margin-left:6px; }
.ev .content { white-space:pre-wrap; margin-top:2px; }
.ev.human .who { color:var(--accent); }
.ev.control, .ev.seat_change { color:var(--muted); font-size:12px; }
.ev.stage { font-weight:700; text-align:center; color:var(--muted); border-top:1px solid var(--line); padding-top:8px; }
.ev.thinking { color:var(--muted); font-style:italic; opacity:.85; }
.ev.thinking::before { content:"⋯ "; }
.move { font-size:11px; color:var(--muted); border:1px solid var(--line); border-radius:4px; padding:0 5px; margin-left:6px; }
form { display:flex; gap:8px; padding:12px 16px; border-top:1px solid var(--line); background:var(--bg); grid-column:1 / -1; grid-row:2; }
input { flex:1; font:inherit; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--fg); }
.hint { font-size:11px; color:var(--muted); }
body[data-view="compose"] .liveonly { display:none; }

#settingsPanel { display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:50; }
#settingsPanel.open { display:flex; align-items:center; justify-content:center; }
.sheet { background:var(--bg); border:1px solid var(--line); border-radius:14px; width:min(680px,92vw); max-height:86vh; display:flex; flex-direction:column; padding:16px; gap:10px; }
.sheet h2 { margin:0; font-size:15px; }
.sheet textarea { flex:1; min-height:320px; font:12px/1.5 ui-monospace,monospace; background:var(--card); color:var(--fg); border:1px solid var(--line); border-radius:8px; padding:10px; resize:vertical; }
.sheet .row { display:flex; gap:8px; align-items:center; }
.sheet .msg { font-size:12px; flex:1; }
.sheet .msg.err { color:var(--stop); } .sheet .msg.ok { color:#16a34a; }
#settingsBody { overflow:auto; display:flex; flex-direction:column; gap:14px; }
.seatCard { border:1px solid var(--line); border-radius:10px; padding:10px 12px; }
.seatCard h3 { margin:0 0 6px; font-size:13px; text-transform:capitalize; }
.seatCard .sub { font-size:11px; color:var(--muted); margin-bottom:8px; }
.chainItem { display:flex; align-items:center; gap:6px; padding:5px 8px; background:var(--card); border:1px solid var(--line); border-radius:8px; margin-bottom:5px; font-size:13px; }
.chainItem .mid { flex:1; word-break:break-all; }
.chainItem .badge { font-size:10px; padding:1px 5px; border-radius:4px; border:1px solid var(--line); color:var(--muted); }
.chainItem .badge.exec { color:#16a34a; border-color:#16a34a; }
.chainItem .badge.free { color:var(--accent); border-color:var(--accent); }
.chainItem button, .addRow button { border:1px solid var(--line); background:var(--bg); color:var(--fg); border-radius:6px; padding:2px 7px; cursor:pointer; font-size:12px; }
.addRow { display:flex; gap:6px; margin-top:6px; }
.addRow select, .addRow input { font:inherit; font-size:12px; padding:4px 6px; border:1px solid var(--line); border-radius:6px; background:var(--card); color:var(--fg); }
.keyRow { display:flex; gap:6px; align-items:center; font-size:12px; margin-bottom:6px; flex-wrap:wrap; }
.keyRow .name { min-width:150px; }
.keyRow input { flex:1; min-width:140px; font:inherit; font-size:12px; padding:4px 6px; border:1px solid var(--line); border-radius:6px; background:var(--card); color:var(--fg); }
.keyRow button.signout { color:var(--stop); border-color:var(--stop); }
.section h3 { margin:0 0 6px; font-size:13px; }
.frugalBox { border:1px solid color-mix(in srgb, var(--amber) 42%, var(--line)); border-radius:12px; padding:10px 12px; background:color-mix(in srgb, var(--amber) 7%, transparent); }
.frugalBox .hint { display:block; margin-bottom:8px; }
.pill { font-size:10px; padding:1px 6px; border-radius:999px; border:1px solid var(--line); }
.pill.ok { color:#16a34a; border-color:#16a34a; } .pill.no { color:var(--muted); }
code.cmd { background:var(--card); border:1px solid var(--line); border-radius:4px; padding:0 4px; }
`;

const SEAT_COLORS = ["#10B981", "#0EA5A4", "#22D3EE", "#F59E0B", "#8FA3A0"];

function script(token: string, baseUrl: string): string {
  return `
const TOKEN = ${JSON.stringify(token)};
const BASE = ${JSON.stringify(baseUrl)};
const H = { authorization: "Bearer " + TOKEN, "content-type": "application/json" };
const api = (p, m="GET", b) => fetch(BASE + p, { method:m, headers:H, body: b?JSON.stringify(b):undefined });
const $ = id => document.getElementById(id);
const feed = $("feed");
const sessionsEl = $("sessions");
const activityEl = $("activity");
const stageEl = $("stage");
const seatColor = s => { let h=0; for (const c of s) h=(h*31+c.charCodeAt(0))>>>0; return ${JSON.stringify(SEAT_COLORS)}[h % ${SEAT_COLORS.length}]; };
const el = (tag, props, ...kids) => { const e = document.createElement(tag); Object.assign(e, props||{}); for (const k of kids) if(k!=null) e.append(k); return e; };
const isFreeId = (id) => id.startsWith("ollama/") || /:free$/i.test(id);
const isExecId = (id) => /^(claude|codex)(\\/|$)/.test(id);
const uniq = xs => [...new Set((xs||[]).filter(Boolean))];
const parseModelList = text => uniq(String(text||"").split(/[,\n]+/).map(x=>x.trim()));
const allSeatModels = seats => uniq(Object.values(seats||{}).flatMap(s => s.chain || []));
const splitFrugalModels = seats => {
  const ids = allSeatModels(seats);
  return { free: ids.filter(isFreeId), paid: ids.filter(id => !isFreeId(id)) };
};
function applyFrugalChains(seats, freeIds, paidIds) {
  const free = uniq(freeIds), paid = uniq(paidIds);
  if (!free.length || !paid.length) return { ok:false, message:"Frugal mode needs at least one free model and one paid/subscription model." };
  seats.proposer = seats.proposer || { chain:[] };
  seats.critic = seats.critic || { chain:[] };
  seats.arbiter = seats.arbiter || { chain:[] };
  seats.proposer.chain = uniq([...free, ...paid]);             // free drafts first
  seats.critic.chain = uniq([...paid, ...free]);               // paid verifies first
  seats.arbiter.chain = uniq([...paid].reverse().concat(free)); // different paid model gets first call when possible
  return { ok:true, message:"Frugal mode enabled: free models draft; paid/subscription models verify and decide." };
}
let sessionId = null;
let settings = null;   // cached /settings for the compose view
let es = null;         // live EventSource
let activeStatus = null;
let activityNote = "";
const fmtElapsed = ms => { const s=Math.floor((ms||0)/1000); return s<60 ? s+"s" : Math.floor(s/60)+"m "+(s%60)+"s"; };

async function loadSettings() { settings = await (await api("/settings")).json(); return settings; }

// ── Live transcript view ────────────────────────────────────────────
function setThinking(text) {
  let e = $("thinking");
  if (!e) { e = document.createElement("div"); e.id = "thinking"; e.className = "ev thinking"; }
  e.textContent = text; feed.appendChild(e); feed.scrollTop = feed.scrollHeight;
  setActivity(text);
}
function clearThinking() { const e = $("thinking"); if (e) e.remove(); }

function setActivity(note) { activityNote = note || ""; renderActivity(activeStatus); }
function renderActivity(status) {
  if (status) activeStatus = status;
  activityEl.innerHTML = "";
  if (!activeStatus) {
    activityEl.append(el("div", {className:"emptySide", textContent:"No active roundtable selected."}));
    return;
  }
  const s = activeStatus;
  const card = el("div", {className:"activityCard"});
  card.append(el("div", {className:"activityTop"}, el("span", {className:"pulse"}), el("span", {textContent:s.state + " · " + s.stage})));
  card.append(el("div", {className:"activityNote", textContent:activityNote || (s.currentTask ? "Building task " + s.currentTask : "Waiting for the next model turn…")}));
  card.append(el("div", {className:"activityMeta", textContent:s.turns + " turns · " + fmtElapsed(s.elapsedMs) + (s.currentTask ? " · task " + s.currentTask : "")}));
  const seats = el("div", {className:"activitySeats"});
  for (const [seat, info] of Object.entries(s.seats || {})) seats.append(el("span", {className:"activitySeat", textContent:seat + ": " + info.model}));
  card.append(seats);
  activityEl.append(card);
}

function addEvent(e) {
  if (e.type === "thinking") { setThinking("◌ " + e.seat + " (" + e.model + ") is thinking…"); return; }
  clearThinking();
  const div = document.createElement("div");
  div.className = "ev " + e.type;
  if (e.type === "turn") {
    div.innerHTML = '<span class="who" style="color:'+seatColor(e.seat)+'">'+e.seat+'</span><span class="model">'+e.model+'</span>'+(e.move?'<span class="move">'+e.move+'</span>':'')+'<div class="content"></div>';
    div.querySelector(".content").textContent = e.content;
    setActivity(e.seat + " answered" + (e.move ? " · " + e.move : ""));
  } else if (e.type === "human") {
    div.innerHTML = '<span class="who">you</span><div class="content"></div>';
    div.querySelector(".content").textContent = e.content;
    setActivity("You injected a message; it will reach the table next turn.");
  } else if (e.type === "stage") { div.textContent = "stage → " + e.to; stageEl.textContent = e.to; setActivity("Stage advanced to " + e.to); }
  else if (e.type === "seat_change") { div.textContent = "↪ " + e.seat + ": " + e.from + " → " + e.to + " (" + e.reason + ")" + (e.detail ? ": " + e.detail : ""); setActivity(e.seat + " handed off to " + e.to); }
  else if (e.type === "control") { div.textContent = "• " + e.action + (e.detail? ": "+e.detail : "") + " (" + e.by + ")"; setActivity(e.action + (e.detail ? ": " + e.detail : "")); }
  else if (e.type === "task_start") { div.textContent = "▶ building task " + e.task + " with " + e.model; setActivity("Workshop building task " + e.task); }
  else if (e.type === "merge") { div.textContent = "✓ " + e.task + " " + e.result + (e.detail ? ": " + e.detail : ""); setActivity(e.task + " " + e.result); }
  feed.appendChild(div); feed.scrollTop = feed.scrollHeight;
}

function renderSessions(list) {
  sessionsEl.innerHTML = "";
  if (!list.length) {
    sessionsEl.append(el("div", {className:"emptySide", textContent:"No roundtables yet."}));
    return;
  }
  [...list].reverse().forEach(s => {
    const b = el("button", {className:"sessionItem" + (s.id===sessionId ? " active" : "")});
    b.append(el("div", {className:"goal", textContent:s.goal || s.id}));
    b.append(el("div", {className:"meta", textContent:s.state + " · " + s.stage + " · " + s.turns + " turns"}));
    b.onclick = () => showLive(s);
    sessionsEl.append(b);
  });
}
async function refreshSessions() {
  const body = await (await api("/sessions")).json();
  renderSessions(body.sessions || []);
  return body.sessions || [];
}

async function refreshSeats() {
  if (!sessionId) return;
  const s = await (await api("/sessions/"+sessionId)).json();
  activeStatus = s;
  stageEl.textContent = s.stage + "  ·  " + s.state;
  if (s.goal) $("goalText").textContent = s.goal;
  renderActivity(s);
  refreshSessions().catch(()=>{});
}

function showLive(status) {
  sessionId = status.id;
  activeStatus = status;
  activityNote = status.currentTask ? "Building task " + status.currentTask : "Opening roundtable…";
  document.body.dataset.view = "live";
  $("sid").textContent = sessionId;
  $("goalText").textContent = status.goal || "(no goal recorded)";
  stageEl.textContent = status.stage + "  ·  " + status.state;
  feed.innerHTML = "";
  renderActivity(status);
  refreshSessions().catch(()=>{});
  refreshSeats();
  if (!showLive._iv) showLive._iv = setInterval(() => { if (sessionId) refreshSeats(); }, 2000);
  if (es) es.close();
  es = new EventSource(BASE + "/sessions/"+sessionId+"/events?token="+encodeURIComponent(TOKEN));
  es.onmessage = ev => addEvent(JSON.parse(ev.data));
}

// ── Compose / landing view ──────────────────────────────────────────
let preset = "Quality";
function tierScore(id, p) {
  const free = isFreeId(id), exec = isExecId(id);
  const fast = /haiku|flash|mini|8b|instant|nano|small/i.test(id);
  if (p === "Budget") return free ? 0 : 2;              // legacy alias
  if (p === "Fast")   return fast ? 0 : (free ? 1 : 2); // fast first
  return exec ? 0 : (free ? 2 : 1);                     // Quality: executor/paid first
}
function renderCompose() {
  const seats = (settings && settings.seats) || {};
  const chips = $("mchips"); chips.innerHTML = "";
  for (const [seat, s] of Object.entries(seats)) {
    const lead = s.chain[0] || "account default";
    const c = el("div", {className:"mchip"});
    c.append(el("span", {className:"role", textContent: seat + ":"}), el("span", {textContent: lead}));
    if (isExecId(lead)) c.append(el("span", {className:"badge", textContent:"builds"}));
    chips.append(c);
  }
  chips.append(el("button", {textContent:"⚙ change models", onclick: openSettings}));
  const arb = seats.arbiter && seats.arbiter.chain[0];
  $("fuse").innerHTML = "Converged by <b>" + (arb || "arbiter") + "</b> — the arbiter weighs the debate and calls the result.";
  const canBuild = Object.values(seats).some(s => s.chain.some(isExecId));
  $("composeHint").textContent = canBuild ? "Plans and builds — Claude/Codex present." : "Plans only — add Claude or Codex in Settings to build.";
}
function showCompose() {
  if (es) { es.close(); es = null; }
  sessionId = null;
  activeStatus = null;
  activityNote = "";
  $("sid").textContent = "—";
  stageEl.textContent = "new roundtable";
  $("composeMsg").className = "";
  document.body.dataset.view = "compose";
  renderCompose();
  refreshSessions().catch(()=>{});
}
function showComposeMsg(content, kind) {
  const box = $("composeMsg");
  box.innerHTML = ""; box.className = "show" + (kind ? " " + kind : "");
  if (typeof content === "string") box.textContent = content; else box.append(content);
}
// A support answer built from local settings — shown when the user asks about the setup.
function settingsHelpNode() {
  const wrap = el("div");
  wrap.append(el("div", { className:"who", textContent:"Your setup" }));
  const seats = (settings && settings.seats) || {};
  for (const [seat, s] of Object.entries(seats)) {
    const rest = s.chain.length > 1 ? "  → " + s.chain.slice(1).join(" → ") : "";
    wrap.append(el("div", { className:"srow" }, el("span", { className:"srole", textContent: seat }), el("span", { textContent: (s.chain[0] || "account default") + rest })));
  }
  const provs = new Set();
  for (const s of Object.values(seats)) for (const m of s.chain) {
    if (m === "claude" || m.startsWith("claude/")) provs.add("Claude (login)");
    else if (m === "codex" || m.startsWith("codex/")) provs.add("Codex (login)");
    else if (m.startsWith("ollama/")) provs.add("Ollama (local)");
    else if (m.includes("/")) provs.add(m.split("/")[0] + " (API key)");
  }
  if (provs.size) wrap.append(el("div", { className:"srow" }, el("span", { className:"srole", textContent:"apis" }), el("span", { textContent: [...provs].join(" · ") })));
  const e = (settings && settings.execution) || {};
  const agents = (e.parallel === false ? "one at a time" : "swarm" + (e.maxConcurrency ? " ×" + e.maxConcurrency : " (auto)")) + " · subagents " + (e.subagents === false ? "off" : "on");
  wrap.append(el("div", { className:"srow" }, el("span", { className:"srole", textContent:"agents" }), el("span", { textContent: agents })));
  const p = el("div", { style:"margin-top:8px" });
  p.append(document.createTextNode("Add a model, paste an API key, toggle agents, or check what's reachable in "));
  const b = el("button", { textContent:"⚙ Settings" }); b.onclick = openSettings; b.style.padding = "2px 8px";
  p.append(b);
  wrap.append(p);
  return wrap;
}
async function startFusion() {
  let goal = $("goalInput").value.trim(); if (!goal) return;
  const forced = /^\\/goal\\b/i.test(goal);           // "/goal …" skips triage and starts straight away
  if (forced) goal = goal.replace(/^\\/goal\\b\\s*/i, "").trim();
  if (!goal) return;
  const btn = $("startBtn"); const label = btn.textContent; btn.disabled = true; btn.textContent = "…";
  try {
    if (!forced) {
      const t = await (await api("/triage", "POST", { text: goal })).json();
      if (t.intent === "chat") {
        const n = el("div"); n.append(el("div", { className:"who", textContent:"Quorum" }), el("div", { textContent: t.reply || "Hi! Tell me what you'd like to build or plan." }));
        showComposeMsg(n, "chat"); return;
      }
      if (t.intent === "clarify") {
        const n = el("div"); n.append(el("div", { className:"who", textContent:"Quorum" }), el("div", { textContent: t.reply || "What should the models build or change?" }));
        showComposeMsg(n, "chat"); $("goalInput").focus(); return;
      }
      if (t.intent === "meta") { showComposeMsg(settingsHelpNode(), ""); return; }
    }
    $("composeMsg").className = "";
    $("goalInput").value = "";                          // clear only once a real roundtable starts
    const res = await api("/sessions", "POST", { goal });
    if (!res.ok) throw new Error((await res.json()).error || res.status);
    showLive(await res.json());
  } catch (err) {
    showComposeMsg("Couldn't start: " + err, "err");
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

// ── Boot ────────────────────────────────────────────────────────────
async function boot() {
  try { await loadSettings(); } catch (e) { settings = { seats:{}, budgets:{}, catalog:{providers:[]} }; }
  let latest = null;
  try { const sessions = await refreshSessions(); latest = sessions[sessions.length-1]; } catch (e) {}
  if (!latest) { showCompose(); return; }
  showLive(latest);
}

// compose interactions
$("presets").addEventListener("click", async e => {
  const b = e.target.closest(".preset"); if (!b) return;
  const p = b.dataset.p;
  if (p === "Custom") { openSettings(); return; }
  preset = p;
  if (p === "Frugal") {
    const picks = splitFrugalModels(settings.seats);
    const applied = applyFrugalChains(settings.seats, picks.free, picks.paid);
    if (!applied.ok) {
      showComposeMsg(applied.message + " Open Settings to add an Ollama/OpenRouter :free model and Claude/Codex/API verifier.", "err");
      return;
    }
    showComposeMsg(applied.message, "");
  } else {
    $("composeMsg").className = "";
    for (const s of Object.values(settings.seats)) {
      s.chain = s.chain.map((id,i)=>({id,i})).sort((a,b)=> tierScore(a.id,p)-tierScore(b.id,p) || a.i-b.i).map(x=>x.id);
    }
  }
  document.querySelectorAll(".preset").forEach(x => x.classList.toggle("active", x === b));
  await api("/settings","PUT",{ seats:settings.seats, budgets:settings.budgets, providers:settings.providers, execution:settings.execution });
  renderCompose();
});
$("startBtn").addEventListener("click", startFusion);
$("goalInput").addEventListener("keydown", e => { if ((e.metaKey||e.ctrlKey) && e.key === "Enter") startFusion(); });
$("newBtn").addEventListener("click", async () => { await loadSettings(); $("goalInput").value = ""; document.querySelectorAll(".preset").forEach(x=>x.classList.toggle("active", x.dataset.p===preset)); showCompose(); $("goalInput").focus(); });

// live inject box
$("form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const inp = $("msg");
  const text = inp.value.trim(); if (!text || !sessionId) return;
  inp.value = "";
  if (text.startsWith("/")) await api("/sessions/"+sessionId+"/command", "POST", { command: text });
  else await api("/sessions/"+sessionId+"/inject", "POST", { content: text });
});

// ── Settings sheet (model manager) ──────────────────────────────────
const panel = $("settingsPanel");
const cfgMsg = $("cfgMsg");
const sbody = $("settingsBody");
let S = null;
const modelId = (provId, model) => { const p = S.catalog.providers.find(x=>x.id===provId); if(!p) return model; return p.kind==="login" ? (model?provId+"/"+model:provId) : p.prefix+model; };

function renderSettings() {
  sbody.innerHTML = "";
  const frugal = splitFrugalModels(S.seats);
  const fsec = el("div",{className:"section frugalBox"});
  fsec.append(el("h3",{textContent:"Frugal mode"}));
  fsec.append(el("span",{className:"hint", textContent:"Choose which free models draft volume work and which paid/subscription models verify, critique, and decide. Click Apply, then Save."}));
  const frow = el("div",{className:"keyRow"});
  const freeInput = el("input",{value:frugal.free.join(", "), placeholder:"ollama/llama3, openrouter/deepseek/deepseek-chat:free"});
  frow.append(el("span",{className:"name", textContent:"Free draft models"}), freeInput);
  const prow = el("div",{className:"keyRow"});
  const paidInput = el("input",{value:frugal.paid.join(", "), placeholder:"claude, codex, openrouter/anthropic/claude-3.7-sonnet"});
  prow.append(el("span",{className:"name", textContent:"Paid verifier models"}), paidInput);
  const apply = el("button",{textContent:"Apply frugal chains"});
  apply.onclick=()=>{
    const res = applyFrugalChains(S.seats, parseModelList(freeInput.value), parseModelList(paidInput.value));
    cfgMsg.textContent = res.ok ? res.message + " Save to use this for the next session." : res.message;
    cfgMsg.className = "msg " + (res.ok ? "ok" : "err");
    if (res.ok) renderSettings();
  };
  fsec.append(frow, prow, apply);
  sbody.append(fsec);

  for (const [seat, s] of Object.entries(S.seats)) {
    const card = el("div", {className:"seatCard"});
    card.append(el("h3", {textContent: seat}));
    card.append(el("div", {className:"sub", textContent:"failover chain — first available model takes the turn"}));
    s.chain.forEach((mid, i) => {
      const item = el("div", {className:"chainItem"});
      item.append(el("span", {className:"mid", textContent: mid || "(account default)"}));
      if (isExecId(mid)) item.append(el("span", {className:"badge exec", textContent:"can build"}));
      if (isFreeId(mid)) item.append(el("span", {className:"badge free", textContent:"free"}));
      const up = el("button",{textContent:"↑"}); up.onclick=()=>{ if(i>0){ const c=s.chain; [c[i-1],c[i]]=[c[i],c[i-1]]; renderSettings(); } };
      const dn = el("button",{textContent:"↓"}); dn.onclick=()=>{ const c=s.chain; if(i<c.length-1){ [c[i+1],c[i]]=[c[i],c[i+1]]; renderSettings(); } };
      const rm = el("button",{textContent:"✕"}); rm.onclick=()=>{ s.chain.splice(i,1); renderSettings(); };
      item.append(up, dn, rm);
      card.append(item);
    });
    const provSel = el("select");
    S.catalog.providers.forEach(p => provSel.append(el("option",{value:p.id, textContent:p.label})));
    const modSel = el("select");
    const fillModels = () => { modSel.innerHTML=""; const p=S.catalog.providers.find(x=>x.id===provSel.value); (p.models||[]).forEach(m=>modSel.append(el("option",{value:m, textContent: m===""?"account default":m}))); modSel.append(el("option",{value:"__c__", textContent:"other… (type id)"})); };
    fillModels(); provSel.onchange=fillModels;
    const addBtn = el("button",{textContent:"+ add"});
    addBtn.onclick=()=>{ let m=modSel.value; if(m==="__c__"){ m=prompt("Model id for "+provSel.value+":")||""; if(!m) return; } s.chain.push(modelId(provSel.value,m)); renderSettings(); };
    const addRow = el("div",{className:"addRow"}); addRow.append(provSel, modSel, addBtn);
    card.append(addRow);
    sbody.append(card);
  }
  const sec = el("div",{className:"section"});
  sec.append(el("h3",{textContent:"Logins & API keys"}));
  const dMap = {}; (S.doctor||[]).forEach(d=>{ if(d.ok) dMap[d.id]=true; if(d.id.indexOf("/")>0) dMap[d.id.split("/")[0]]=dMap[d.id.split("/")[0]]||d.ok; });
  S.catalog.providers.forEach(p => {
    const row = el("div",{className:"keyRow"});
    row.append(el("span",{className:"name", textContent:p.label}));
    if (p.kind==="login") {
      const ok = dMap[p.id];
      row.append(el("span",{className:"pill "+(ok?"ok":"no"), textContent: ok?"signed in":"sign in"}));
      if(!ok){ const c=el("span"); c.innerHTML='run <code class="cmd">'+p.loginCmd+'</code> in a terminal'; row.append(c); }
      else if(p.logoutCmd){
        const so=el("button",{className:"signout", textContent:"Sign out"});
        so.onclick=()=>{ const c=el("span",{className:"hint"}); c.innerHTML='run <code class="cmd">'+p.logoutCmd+'</code> in a terminal to switch accounts'; so.replaceWith(c); };
        row.append(so);
      }
    } else if (p.kind==="api") {
      const set = S.providerKeys[p.keyEnv];
      row.append(el("span",{className:"pill "+(set?"ok":"no"), textContent: set?"key saved":"no key"}));
      if (set) {
        const so=el("button",{className:"signout", textContent:"Sign out"});
        so.onclick=async()=>{ await api("/keys","DELETE",{env:p.keyEnv}); S.providerKeys[p.keyEnv]=false; renderSettings(); };
        row.append(so);
      } else {
        const inp = el("input",{type:"password", placeholder:"paste "+p.keyEnv});
        const save = el("button",{textContent:"save"});
        save.onclick=async()=>{ if(!inp.value) return; const r=await (await api("/keys","POST",{env:p.keyEnv,value:inp.value})).json(); S.providerKeys[p.keyEnv]=!!r.ok; inp.value=""; renderSettings(); };
        row.append(inp, save);
      }
    } else {
      row.append(el("span",{className:"pill ok", textContent:"free · local"}));
    }
    sec.append(row);
  });
  if (!S.keychainAvailable) sec.append(el("div",{className:"sub", textContent:"No OS Keychain here — export the env var instead."}));
  sbody.append(sec);
  const bsec = el("div",{className:"section"});
  bsec.append(el("h3",{textContent:"Budgets"}));
  const brow = el("div",{className:"keyRow"});
  const turns = el("input",{type:"number", value:S.budgets.maxTurnsPerStage??12}); turns.style.maxWidth="80px";
  turns.onchange=()=>{ S.budgets.maxTurnsPerStage=Number(turns.value)||12; };
  const cost = el("input",{type:"number", step:"0.5", placeholder:"none"}); cost.value=S.budgets.maxCostUsd??""; cost.style.maxWidth="90px";
  cost.onchange=()=>{ S.budgets.maxCostUsd = cost.value===""?undefined:Number(cost.value); };
  brow.append(el("span",{className:"name", textContent:"max turns / stage"}), turns, el("span",{className:"name", textContent:"max cost (USD)"}), cost);
  bsec.append(brow); sbody.append(bsec);

  // Agents & execution — the "swarm": parallel executor agents + subagents (Claude Task tool).
  S.execution = S.execution || { parallel:true, subagents:true };
  const toggle = (checked, on) => { const c = el("input",{type:"checkbox"}); c.checked = checked; c.style.flex="none"; c.style.width="16px"; c.style.height="16px"; c.onchange=()=>on(c.checked); return c; };
  const asec = el("div",{className:"section"});
  asec.append(el("h3",{textContent:"Agents & execution"}));
  const r1 = el("div",{className:"keyRow"});
  r1.append(el("span",{className:"name", textContent:"Parallel agents (swarm)"}), toggle(S.execution.parallel!==false, v=>S.execution.parallel=v), el("span",{className:"hint", textContent:"build independent tasks at once"}));
  asec.append(r1);
  const r2 = el("div",{className:"keyRow"});
  const conc = el("input",{type:"number", placeholder:"auto"}); conc.value=S.execution.maxConcurrency??""; conc.style.maxWidth="80px";
  conc.onchange=()=>{ S.execution.maxConcurrency = conc.value===""?undefined:Number(conc.value); };
  r2.append(el("span",{className:"name", textContent:"Max concurrent agents"}), conc, el("span",{className:"hint", textContent:"blank = auto"}));
  asec.append(r2);
  const r3 = el("div",{className:"keyRow"});
  r3.append(el("span",{className:"name", textContent:"Subagents"}), toggle(S.execution.subagents!==false, v=>S.execution.subagents=v), el("span",{className:"hint", textContent:"let Claude executors spawn subagents (Task tool) when useful"}));
  asec.append(r3);
  sbody.append(asec);
}

async function openSettings() {
  cfgMsg.textContent=""; cfgMsg.className="msg"; sbody.textContent="Loading…";
  panel.classList.add("open");
  S = await (await api("/settings")).json();
  renderSettings();
}
$("settings").addEventListener("click", openSettings);
$("cfgClose").addEventListener("click", () => panel.classList.remove("open"));
$("cfgSave").addEventListener("click", async () => {
  if(!S) return;
  const res = await api("/settings","PUT",{ seats:S.seats, budgets:S.budgets, providers:S.providers, execution:S.execution });
  const b = await res.json();
  cfgMsg.textContent = res.ok ? (b.note||"Saved.") : (b.error||"Invalid");
  cfgMsg.className = "msg "+(res.ok?"ok":"err");
  if (res.ok && document.body.dataset.view === "compose") { await loadSettings(); renderCompose(); }
});
$("pause").addEventListener("click", () => { if(sessionId) api("/sessions/"+sessionId+"/pause","POST").then(refreshSeats); });
$("resume").addEventListener("click", () => { if(sessionId) api("/sessions/"+sessionId+"/resume","POST").then(refreshSeats); });
$("stop").addEventListener("click", () => { if(sessionId) api("/sessions/"+sessionId+"/stop","POST").then(refreshSeats); });
boot();
`;
}

/**
 * Render the full self-contained dashboard page with the daemon's bearer token embedded.
 * Pass `baseUrl` (the daemon's http://127.0.0.1:PORT) when hosting inside a VS Code webview, so the
 * page's fetch/EventSource use absolute URLs; a CSP allowing that origin is then added. Leave it ""
 * for the browser case (served by the daemon at its own origin, relative URLs).
 */
export function renderDashboard(token: string, baseUrl = ""): string {
  const csp = baseUrl
    ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src ${baseUrl};"/>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>${csp}
<title>Quorum</title><style>${STYLE}</style></head>
<body>
<header>
  <h1 class="brand">${logoMark("q-logo-header")}<span>Quorum</span></h1>
  <span class="version">v${APP_VERSION}</span>
  <span class="stage" id="stage">…</span>
  <span class="hint">session <span id="sid">—</span></span>
  <span class="spacer"></span>
  <button id="newBtn">＋ New roundtable</button>
  <button id="settings">⚙ Settings</button>
  <button class="liveonly" id="pause">Pause</button>
  <button class="liveonly" id="resume">Resume</button>
  <button class="stop liveonly" id="stop">◼ STOP</button>
</header>
<div class="goalbar"><span class="lbl">Goal</span><span class="g" id="goalText"></span></div>
<div id="settingsPanel">
  <div class="sheet">
    <div class="row"><h2>Settings — models &amp; seats</h2><span style="flex:1"></span><button id="cfgClose">Close</button><button id="cfgSave">Save</button></div>
    <span class="hint">Each seat is a <b>failover chain</b> — tried top to bottom. Free models draft, paid verify; only Claude/Codex can build. Applies to the <b>next</b> session.</span>
    <span class="msg" id="cfgMsg"></span>
    <div id="settingsBody">Loading…</div>
  </div>
</div>
<section id="compose"><div class="composeWrap">
  <h2><span class="heroBrand">${logoMark("q-logo-hero", "qLogo heroLogo")}<span>Convene the roundtable</span></span> <span class="tag">beta · v${APP_VERSION}</span></h2>
  <p class="subtitle">A <b>quorum</b> of AI models debates your goal and converges on the best answer — brainstorming, planning, and building together.</p>
  <div class="composeCard">
    <div class="presets" id="presets">
      <button class="preset active" data-p="Quality">Quality</button>
      <button class="preset frugal" data-p="Frugal">Frugal</button>
      <button class="preset" data-p="Fast">Fast</button>
      <button class="preset" data-p="Custom">Custom…</button>
    </div>
    <div class="mchips" id="mchips"></div>
    <div class="fuse" id="fuse"></div>
    <textarea id="goalInput" placeholder="Describe your goal — what should the models figure out or build?  (⌘/Ctrl+Enter · say hi to chat · /goal … to start straight away)"></textarea>
    <div class="composeRow">
      <span class="hint" id="composeHint"></span>
      <button class="primary start" id="startBtn">Convene ▸</button>
    </div>
    <div id="composeMsg"></div>
  </div>
</div></section>
<main>
  <aside>
    <section class="sideBlock">
      <h3>Roundtables</h3>
      <div id="sessions"></div>
    </section>
    <section class="sideBlock">
      <h3>Activity</h3>
      <div id="activity"></div>
    </section>
  </aside>
  <div id="feed"></div>
  <form id="form">
    <input id="msg" placeholder="Say something to the table…  (or /pause, /stop, /status)" autocomplete="off"/>
    <button type="submit">Send</button>
  </form>
</main>
<script>${script(token, baseUrl)}</script>
</body></html>`;
}

export const DASHBOARD_PACKAGE = "@quorum/dashboard";
