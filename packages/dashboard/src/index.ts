// @quorum/dashboard — a single self-contained local web page (SPEC §8 / task 100).
// Rendered by renderDashboard(token) and served by the daemon at GET / (localhost only).
// No external CDN/scripts/fonts — everything inline, so it works offline and inside a future
// VS Code webview.

const STYLE = `
:root { color-scheme: light dark; --bg:#fff; --fg:#1a1a1a; --muted:#6b7280; --line:#e5e7eb; --card:#f9fafb; --accent:#2563eb; --stop:#dc2626; }
@media (prefers-color-scheme: dark) { :root { --bg:#0f1115; --fg:#e5e7eb; --muted:#9aa4b2; --line:#252a33; --card:#161a21; --accent:#60a5fa; --stop:#f87171; } }
* { box-sizing: border-box; }
body { margin:0; font:14px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--fg); display:flex; flex-direction:column; height:100vh; overflow:hidden; }
header { display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:1px solid var(--line); background:var(--bg); flex-wrap:wrap; flex:none; }
h1 { font-size:15px; margin:0; font-weight:700; }
.stage { font-size:12px; color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:2px 10px; }
.spacer { flex:1; }
button { font:inherit; border:1px solid var(--line); background:var(--card); color:var(--fg); border-radius:8px; padding:6px 12px; cursor:pointer; }
button:hover { border-color:var(--accent); }
button.stop { background:var(--stop); color:#fff; border-color:var(--stop); font-weight:600; }
button.primary { background:var(--accent); color:#fff; border-color:var(--accent); font-weight:600; }

/* ── Goal bar (live view) ─────────────────────────────────────────── */
.goalbar { display:none; align-items:flex-start; gap:10px; padding:9px 16px; border-bottom:1px solid var(--line); background:var(--card); flex:none; }
body[data-view="live"] .goalbar { display:flex; }
.goalbar .lbl { font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; margin-top:3px; flex:none; }
.goalbar .g { font-weight:600; white-space:pre-wrap; word-break:break-word; }

/* ── Compose / landing (no active session) ───────────────────────── */
#compose { display:none; flex:1; overflow:auto; }
body[data-view="compose"] #compose { display:block; }
main { display:none; flex:1; min-height:0; grid-template-columns:220px 1fr; grid-template-rows:1fr auto; }
body[data-view="live"] main { display:grid; }
.composeWrap { max-width:760px; margin:0 auto; padding:40px 20px; }
.composeWrap h2 { text-align:center; font-size:26px; margin:0 0 6px; }
.composeWrap .tag { display:inline-block; font-size:11px; color:var(--accent); border:1px solid var(--accent); border-radius:999px; padding:1px 8px; vertical-align:middle; margin-left:8px; }
.composeWrap .subtitle { text-align:center; color:var(--muted); margin:0 0 22px; }
.composeCard { border:1px solid var(--line); border-radius:16px; background:var(--card); padding:16px; }
.presets { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
.preset { border:1px solid var(--line); background:var(--bg); border-radius:999px; padding:6px 16px; cursor:pointer; font-size:13px; }
.preset.active { background:var(--fg); color:var(--bg); border-color:var(--fg); font-weight:600; }
.mchips { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
.mchip { display:flex; gap:6px; align-items:center; border:1px solid var(--line); border-radius:8px; padding:6px 10px; font-size:13px; background:var(--bg); }
.mchip .role { color:var(--muted); text-transform:capitalize; }
.mchip .badge { font-size:9px; padding:1px 5px; border-radius:4px; border:1px solid #16a34a; color:#16a34a; }
.fuse { font-size:12px; color:var(--muted); margin-bottom:12px; }
.fuse b { color:var(--fg); }
#goalInput { width:100%; min-height:130px; font:inherit; padding:12px 14px; border:1px solid var(--line); border-radius:12px; background:var(--bg); color:var(--fg); resize:vertical; }
.composeRow { display:flex; justify-content:space-between; align-items:center; margin-top:12px; gap:12px; }
.composeRow .start { padding:9px 20px; font-size:14px; }

aside { border-right:1px solid var(--line); padding:12px; overflow:auto; grid-row:1; grid-column:1; }
.seat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:8px 10px; margin-bottom:8px; }
.seat .role { font-weight:600; text-transform:capitalize; }
.seat .model { font-size:12px; color:var(--muted); word-break:break-all; }
.seat.paused { opacity:.55; }
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
.pill { font-size:10px; padding:1px 6px; border-radius:999px; border:1px solid var(--line); }
.pill.ok { color:#16a34a; border-color:#16a34a; } .pill.no { color:var(--muted); }
code.cmd { background:var(--card); border:1px solid var(--line); border-radius:4px; padding:0 4px; }
`;

const SEAT_COLORS = ["#0891b2", "#a21caf", "#16a34a", "#ca8a04", "#2563eb"];

function script(token: string, baseUrl: string): string {
  return `
const TOKEN = ${JSON.stringify(token)};
const BASE = ${JSON.stringify(baseUrl)};
const H = { authorization: "Bearer " + TOKEN, "content-type": "application/json" };
const api = (p, m="GET", b) => fetch(BASE + p, { method:m, headers:H, body: b?JSON.stringify(b):undefined });
const $ = id => document.getElementById(id);
const feed = $("feed");
const seatsEl = $("seats");
const stageEl = $("stage");
const seatColor = s => { let h=0; for (const c of s) h=(h*31+c.charCodeAt(0))>>>0; return ${JSON.stringify(SEAT_COLORS)}[h % ${SEAT_COLORS.length}]; };
const el = (tag, props, ...kids) => { const e = document.createElement(tag); Object.assign(e, props||{}); for (const k of kids) if(k!=null) e.append(k); return e; };
const isFreeId = (id) => id.startsWith("ollama/") || /:free$/i.test(id);
const isExecId = (id) => /^(claude|codex)(\\/|$)/.test(id);
let sessionId = null;
let settings = null;   // cached /settings for the compose view
let es = null;         // live EventSource

async function loadSettings() { settings = await (await api("/settings")).json(); return settings; }

// ── Live transcript view ────────────────────────────────────────────
function setThinking(text) {
  let e = $("thinking");
  if (!e) { e = document.createElement("div"); e.id = "thinking"; e.className = "ev thinking"; }
  e.textContent = text; feed.appendChild(e); feed.scrollTop = feed.scrollHeight;
}
function clearThinking() { const e = $("thinking"); if (e) e.remove(); }

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
  feed.appendChild(div); feed.scrollTop = feed.scrollHeight;
}

async function refreshSeats() {
  if (!sessionId) return;
  const s = await (await api("/sessions/"+sessionId)).json();
  stageEl.textContent = s.stage + "  ·  " + s.state;
  if (s.goal) $("goalText").textContent = s.goal;
  seatsEl.innerHTML = "";
  for (const [seat, info] of Object.entries(s.seats)) {
    const d = document.createElement("div");
    d.className = "seat" + (info.paused? " paused":"");
    d.innerHTML = '<div class="role" style="color:'+seatColor(seat)+'">'+seat+'</div><div class="model">'+info.model+'</div>';
    seatsEl.appendChild(d);
  }
}

function showLive(status) {
  sessionId = status.id;
  document.body.dataset.view = "live";
  $("sid").textContent = sessionId;
  $("goalText").textContent = status.goal || "(no goal recorded)";
  stageEl.textContent = status.stage + "  ·  " + status.state;
  feed.innerHTML = "";
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
  if (p === "Budget") return free ? 0 : 2;              // free first
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
  $("fuse").innerHTML = "Fuse with <b>" + (arb || "arbiter") + "</b> — the arbiter weighs the debate and converges it into one answer.";
  const canBuild = Object.values(seats).some(s => s.chain.some(isExecId));
  $("composeHint").textContent = canBuild ? "Plans and builds — Claude/Codex present." : "Plans only — add Claude or Codex in Settings to build.";
}
function showCompose() {
  if (es) { es.close(); es = null; }
  sessionId = null;
  document.body.dataset.view = "compose";
  renderCompose();
}
async function startFusion() {
  const goal = $("goalInput").value.trim(); if (!goal) return;
  const btn = $("startBtn"); btn.disabled = true; btn.textContent = "Starting…";
  try {
    const res = await api("/sessions", "POST", { goal });
    if (!res.ok) throw new Error((await res.json()).error || res.status);
    showLive(await res.json());
  } catch (err) { btn.disabled = false; btn.textContent = "Start ▸"; alert("Could not start: " + err); }
}

// ── Boot ────────────────────────────────────────────────────────────
async function boot() {
  try { await loadSettings(); } catch (e) { settings = { seats:{}, budgets:{}, catalog:{providers:[]} }; }
  let latest = null;
  try { const list = await (await api("/sessions")).json(); latest = list.sessions[list.sessions.length-1]; } catch (e) {}
  if (!latest) { showCompose(); return; }
  showLive(latest);
}

// compose interactions
$("presets").addEventListener("click", async e => {
  const b = e.target.closest(".preset"); if (!b) return;
  const p = b.dataset.p;
  if (p === "Custom") { openSettings(); return; }
  document.querySelectorAll(".preset").forEach(x => x.classList.toggle("active", x === b));
  preset = p;
  for (const s of Object.values(settings.seats)) {
    s.chain = s.chain.map((id,i)=>({id,i})).sort((a,b)=> tierScore(a.id,p)-tierScore(b.id,p) || a.i-b.i).map(x=>x.id);
  }
  await api("/settings","PUT",{ seats:settings.seats, budgets:settings.budgets, providers:settings.providers, execution:settings.execution });
  renderCompose();
});
$("startBtn").addEventListener("click", startFusion);
$("goalInput").addEventListener("keydown", e => { if ((e.metaKey||e.ctrlKey) && e.key === "Enter") startFusion(); });
$("newBtn").addEventListener("click", async () => { await loadSettings(); $("goalInput").value = ""; document.querySelectorAll(".preset").forEach(x=>x.classList.toggle("active", x.dataset.p===preset)); showCompose(); });

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
  <h1>Quorum</h1>
  <span class="stage" id="stage">…</span>
  <span class="hint">session <span id="sid">—</span></span>
  <span class="spacer"></span>
  <button id="newBtn">＋ New fusion</button>
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
  <h2>Model Fusion <span class="tag">beta</span></h2>
  <p class="subtitle">Run multiple models together on one goal — they debate, then converge into the best result.</p>
  <div class="composeCard">
    <div class="presets" id="presets">
      <button class="preset active" data-p="Quality">Quality</button>
      <button class="preset" data-p="Budget">Budget</button>
      <button class="preset" data-p="Fast">Fast</button>
      <button class="preset" data-p="Custom">Custom…</button>
    </div>
    <div class="mchips" id="mchips"></div>
    <div class="fuse" id="fuse"></div>
    <textarea id="goalInput" placeholder="Describe your goal — what should the models build or figure out?  (⌘/Ctrl+Enter to start)"></textarea>
    <div class="composeRow">
      <span class="hint" id="composeHint"></span>
      <button class="primary start" id="startBtn">Start ▸</button>
    </div>
  </div>
</div></section>
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
