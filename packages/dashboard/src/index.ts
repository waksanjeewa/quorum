// @quorum/dashboard — a single self-contained local web page (SPEC §8 / task 100).
// Rendered by renderDashboard(token) and served by the daemon at GET / (localhost only).
// No external CDN/scripts/fonts — everything inline, so it works offline and inside a future
// VS Code webview.

const STYLE = `
:root { color-scheme: light dark; --bg:#fff; --fg:#1a1a1a; --muted:#6b7280; --line:#e5e7eb; --card:#f9fafb; --accent:#2563eb; --stop:#dc2626; }
@media (prefers-color-scheme: dark) { :root { --bg:#0f1115; --fg:#e5e7eb; --muted:#9aa4b2; --line:#252a33; --card:#161a21; --accent:#60a5fa; --stop:#f87171; } }
* { box-sizing: border-box; }
body { margin:0; font:14px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--fg); }
header { display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--bg); flex-wrap:wrap; }
h1 { font-size:15px; margin:0; font-weight:700; }
.stage { font-size:12px; color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:2px 10px; }
.spacer { flex:1; }
button { font:inherit; border:1px solid var(--line); background:var(--card); color:var(--fg); border-radius:8px; padding:6px 12px; cursor:pointer; }
button:hover { border-color:var(--accent); }
button.stop { background:var(--stop); color:#fff; border-color:var(--stop); font-weight:600; }
main { display:grid; grid-template-columns:220px 1fr; gap:0; height:calc(100vh - 53px); }
aside { border-right:1px solid var(--line); padding:12px; overflow:auto; }
.seat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:8px 10px; margin-bottom:8px; }
.seat .role { font-weight:600; text-transform:capitalize; }
.seat .model { font-size:12px; color:var(--muted); word-break:break-all; }
.seat.paused { opacity:.55; }
#feed { overflow:auto; padding:16px; }
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
form { display:flex; gap:8px; padding:12px 16px; border-top:1px solid var(--line); position:sticky; bottom:0; background:var(--bg); grid-column:1 / -1; }
input { flex:1; font:inherit; padding:8px 10px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--fg); }
.hint { font-size:11px; color:var(--muted); }
#settingsPanel { display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:50; }
#settingsPanel.open { display:flex; align-items:center; justify-content:center; }
.sheet { background:var(--bg); border:1px solid var(--line); border-radius:14px; width:min(680px,92vw); max-height:86vh; display:flex; flex-direction:column; padding:16px; gap:10px; }
.sheet h2 { margin:0; font-size:15px; }
.sheet textarea { flex:1; min-height:320px; font:12px/1.5 ui-monospace,monospace; background:var(--card); color:var(--fg); border:1px solid var(--line); border-radius:8px; padding:10px; resize:vertical; }
.sheet .row { display:flex; gap:8px; align-items:center; }
.sheet .msg { font-size:12px; flex:1; }
.sheet .msg.err { color:var(--stop); } .sheet .msg.ok { color:#16a34a; }
`;

const SEAT_COLORS = ["#0891b2", "#a21caf", "#16a34a", "#ca8a04", "#2563eb"];

function script(token: string, baseUrl: string): string {
  return `
const TOKEN = ${JSON.stringify(token)};
const BASE = ${JSON.stringify(baseUrl)};
const H = { authorization: "Bearer " + TOKEN, "content-type": "application/json" };
const api = (p, m="GET", b) => fetch(BASE + p, { method:m, headers:H, body: b?JSON.stringify(b):undefined });
const feed = document.getElementById("feed");
const seatsEl = document.getElementById("seats");
const stageEl = document.getElementById("stage");
const seatColor = s => { let h=0; for (const c of s) h=(h*31+c.charCodeAt(0))>>>0; return ${JSON.stringify(SEAT_COLORS)}[h % ${SEAT_COLORS.length}]; };
let sessionId = null;

function setThinking(text) {
  let el = document.getElementById("thinking");
  if (!el) { el = document.createElement("div"); el.id = "thinking"; el.className = "ev thinking"; }
  el.textContent = text;
  feed.appendChild(el); // keep it at the bottom
  feed.scrollTop = feed.scrollHeight;
}
function clearThinking() { const el = document.getElementById("thinking"); if (el) el.remove(); }

function addEvent(e) {
  if (e.type === "thinking") { setThinking("◌ " + e.seat + " (" + e.model + ") is thinking…"); return; }
  clearThinking();
  const div = document.createElement("div");
  div.className = "ev " + e.type;
  if (e.type === "turn") {
    div.innerHTML = '<span class="who" style="color:'+seatColor(e.seat)+'">'+e.seat+'</span><span class="model">'+e.model+'</span>'+(e.move?'<span class="move">'+e.move+'</span>':'')+'<div class="content"></div>';
    div.querySelector(".content").textContent = e.content;
  } else if (e.type === "human") {
    div.innerHTML = '<span class="who">you</span><div class="content"></div>';
    div.querySelector(".content").textContent = e.content;
  } else if (e.type === "stage") { div.textContent = "stage → " + e.to; stageEl.textContent = e.to; }
  else if (e.type === "seat_change") div.textContent = "↪ " + e.seat + ": " + e.from + " → " + e.to + " (" + e.reason + ")";
  else if (e.type === "control") div.textContent = "• " + e.action + (e.detail? ": "+e.detail : "") + " (" + e.by + ")";
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

async function refreshSeats() {
  if (!sessionId) return;
  const s = await (await api("/sessions/"+sessionId)).json();
  stageEl.textContent = s.stage + "  ·  " + s.state;
  seatsEl.innerHTML = "";
  for (const [seat, info] of Object.entries(s.seats)) {
    const d = document.createElement("div");
    d.className = "seat" + (info.paused? " paused":"");
    d.innerHTML = '<div class="role" style="color:'+seatColor(seat)+'">'+seat+'</div><div class="model">'+info.model+'</div>';
    seatsEl.appendChild(d);
  }
}

async function boot() {
  const list = await (await api("/sessions")).json();
  const latest = list.sessions[list.sessions.length-1];
  if (!latest) { feed.textContent = "No active session."; return; }
  sessionId = latest.id;
  document.getElementById("sid").textContent = sessionId;
  await refreshSeats();
  setInterval(refreshSeats, 2000);
  const es = new EventSource(BASE + "/sessions/"+sessionId+"/events?token="+encodeURIComponent(TOKEN));
  es.onmessage = ev => addEvent(JSON.parse(ev.data));
}

document.getElementById("form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const inp = document.getElementById("msg");
  const text = inp.value.trim(); if (!text || !sessionId) return;
  inp.value = "";
  if (text.startsWith("/")) await api("/sessions/"+sessionId+"/command", "POST", { command: text });
  else await api("/sessions/"+sessionId+"/inject", "POST", { content: text });
});
const panel = document.getElementById("settingsPanel");
const cfgMsg = document.getElementById("cfgMsg");
document.getElementById("settings").addEventListener("click", async () => {
  const r = await (await api("/config")).json();
  document.getElementById("cfgText").value = r.yaml || "";
  cfgMsg.textContent = ""; cfgMsg.className = "msg";
  panel.classList.add("open");
});
document.getElementById("cfgClose").addEventListener("click", () => panel.classList.remove("open"));
document.getElementById("cfgSave").addEventListener("click", async () => {
  const res = await api("/config", "PUT", { yaml: document.getElementById("cfgText").value });
  const body = await res.json();
  cfgMsg.textContent = res.ok ? (body.note || "Saved.") : (body.error || "Invalid config");
  cfgMsg.className = "msg " + (res.ok ? "ok" : "err");
});
document.getElementById("pause").addEventListener("click", () => api("/sessions/"+sessionId+"/pause","POST").then(refreshSeats));
document.getElementById("resume").addEventListener("click", () => api("/sessions/"+sessionId+"/resume","POST").then(refreshSeats));
document.getElementById("stop").addEventListener("click", () => api("/sessions/"+sessionId+"/stop","POST").then(refreshSeats));
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
  <h1>Quorum</h1>
  <span class="stage" id="stage">…</span>
  <span class="hint">session <span id="sid">—</span></span>
  <span class="spacer"></span>
  <button id="settings">⚙ Settings</button>
  <button id="pause">Pause</button>
  <button id="resume">Resume</button>
  <button class="stop" id="stop">◼ STOP</button>
</header>
<div id="settingsPanel">
  <div class="sheet">
    <h2>Settings — models, seats &amp; budgets</h2>
    <span class="hint">Seats and failover chains (claude, codex, ollama/&lt;model&gt;, openrouter/&lt;model&gt;…), budgets, providers. Validated on save; applies to the <b>next</b> session.</span>
    <textarea id="cfgText" spellcheck="false"></textarea>
    <div class="row">
      <span class="msg" id="cfgMsg"></span>
      <button id="cfgClose">Close</button>
      <button id="cfgSave">Save</button>
    </div>
  </div>
</div>
<main>
  <aside id="seats"></aside>
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
