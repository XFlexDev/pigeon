const $ = (s) => document.querySelector(s);
const api = async (m, url, body) => {
  const r = await fetch(url, {
    method: m,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw j.detail || "something broke";
  return j;
};

let token = localStorage.getItem("pigeon:token");
let me = null;
let mode = "login";
let coop = null;
let mailTimer = null;
let flightRAF = null;
let currentFlight = null;

const D2R = Math.PI / 180;
function slerp(lat1, lon1, lat2, lon2, t) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, l1 = lon1 * D2R, l2 = lon2 * D2R;
  const ax = Math.cos(p1) * Math.cos(l1), ay = Math.cos(p1) * Math.sin(l1), az = Math.sin(p1);
  const bx = Math.cos(p2) * Math.cos(l2), by = Math.cos(p2) * Math.sin(l2), bz = Math.sin(p2);
  let dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz));
  const w = Math.acos(dot);
  if (w < 1e-6) return [lat1, lon1];
  const so = Math.sin(w);
  const ka = Math.sin((1 - t) * w) / so, kb = Math.sin(t * w) / so;
  const x = ka * ax + kb * bx, y = ka * ay + kb * by, z = ka * az + kb * bz;
  return [Math.asin(z) / D2R, Math.atan2(y, x) / D2R];
}

const LAT_MIN = -85, LAT_MAX = 85;
const project = (lon, lat, w, h) => [((lon + 180) / 360) * w, ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * h];
const unproject = (x, y, w, h) => [(x / w) * 360 - 180, LAT_MAX - (y / h) * (LAT_MAX - LAT_MIN)];

function drawLand(ctx, w, h, color, size) {
  ctx.fillStyle = color;
  for (const [lon, lat] of LAND) {
    const [x, y] = project(lon, lat, w, h);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, 7);
    ctx.fill();
  }
}

function drawCoop(ctx, lon, lat, w, h, label) {
  const [x, y] = project(lon, lat, w, h);
  ctx.strokeStyle = "#cfcfcf";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, 7);
  ctx.stroke();
  ctx.fillStyle = "#ededed";
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, 7);
  ctx.fill();
  if (label) {
    ctx.fillStyle = "#8a8a8a";
    ctx.font = "300 11px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y - 11);
  }
}

// tiny gull mark: two wing arcs
function drawBird(ctx, x, y, s, color, glow) {
  ctx.save();
  ctx.translate(x, y);
  if (glow) {
    ctx.shadowColor = "rgba(255,255,255,.9)";
    ctx.shadowBlur = 14;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-s, 0);
  ctx.quadraticCurveTo(-s * 0.45, -s * 0.7, -s * 0.05, -s * 0.12);
  ctx.quadraticCurveTo(s * 0.45, -s * 0.7, s, 0);
  ctx.stroke();
  ctx.restore();
}

function show(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === id));
  if (id !== "view-flight" && flightRAF) cancelAnimationFrame(flightRAF), (flightRAF = null);
  if (id === "view-mail") startMailPoll();
  else if (mailTimer) clearInterval(mailTimer), (mailTimer = null);
}

function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDur(sec) {
  if (sec < 3600) return `${Math.max(1, Math.round(sec / 60))}m`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}
function fmtLeft(f) {
  const left = Math.max(0, f.eta_at - Date.now() / 1000);
  return fmtDur(left);
}

// ---------- auth ----------

const coopMap = $("#coop-map");
function paintCoopMap() {
  const dpr = devicePixelRatio || 1;
  const w = coopMap.clientWidth, h = coopMap.clientHeight;
  coopMap.width = w * dpr;
  coopMap.height = h * dpr;
  const ctx = coopMap.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, w, h);
  drawLand(ctx, w, h, "#242424", 1.4);
  if (coop) drawCoop(ctx, coop.lon, coop.lat, w, h, "your coop");
}
coopMap.addEventListener("pointerdown", (e) => {
  const r = coopMap.getBoundingClientRect();
  const [lon, lat] = unproject(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  coop = { lon, lat };
  paintCoopMap();
});

function setMode(m) {
  mode = m;
  $("#tab-login").classList.toggle("active", m === "login");
  $("#tab-register").classList.toggle("active", m === "register");
  $("#coop-wrap").classList.toggle("hidden", m === "login");
  $("#auth-go").textContent = m === "login" ? "fly in" : "build coop";
  $("#auth-err").textContent = "";
  if (m === "register") requestAnimationFrame(paintCoopMap);
}
$("#tab-login").onclick = () => setMode("login");
$("#tab-register").onclick = () => setMode("register");

// animated pill under auth tabs
(() => {
  const pill = document.createElement("div");
  pill.id = "tab-pill";
  $(".auth-tabs").prepend(pill);
  const upd = () => (pill.style.transform = mode === "login" ? "translateX(0)" : "translateX(100%)");
  $("#tab-login").addEventListener("click", upd);
  $("#tab-register").addEventListener("click", upd);
  setMode("login");
})();

$("#auth-go").onclick = async () => {
  const username = $("#auth-user").value.trim();
  const password = $("#auth-pass").value;
  $("#auth-err").textContent = "";
  try {
    let r;
    if (mode === "register") {
      if (!coop) throw "place your coop on the map first";
      r = await api("POST", "/api/auth/register", { username, password, lat: coop.lat, lon: coop.lon });
    } else {
      r = await api("POST", "/api/auth/login", { username, password });
    }
    token = r.token;
    localStorage.setItem("pigeon:token", token);
    me = { username: r.username, lat: r.lat, lon: r.lon };
    $("#who").textContent = me.username;
    show("view-mail");
  } catch (e) {
    $("#auth-err").textContent = typeof e === "string" ? e : "nope";
  }
};

// ---------- mail ----------

let mail = { flying_out: [], flying_in: [], delivered: [] };

async function refreshMail() {
  try {
    mail = await api("GET", "/api/mail");
    renderMail();
  } catch (e) {
    if (String(e).includes("401")) logout();
  }
}
function startMailPoll() {
  refreshMail();
  mailTimer = setInterval(refreshMail, 8000);
}

function birdSVG(color) {
  return `<svg class="glyph" viewBox="-20 -12 40 24" fill="none">
    <path d="M-16 2 Q-9 -8 -1 -1 Q9 -8 16 2" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>
  </svg>`;
}

function renderMail() {
  const el = $("#mail-list");
  let html = "";
  const flying = [...mail.flying_in, ...mail.flying_out];
  if (flying.length) {
    html += `<div class="mail-section">in the air</div>`;
    for (const f of flying) {
      const pct = Math.round(f.progress * 100);
      const dir = f.direction === "in" ? `${esc(f.peer)} → you` : `you → ${esc(f.peer)}`;
      html += `<div class="mrow" data-flight="${f.id}">
        ${birdSVG("#7a7a7a")}
        <div class="body">
          <div class="line1">${esc(f.pigeon)} <span style="color:#4a4a4a;font-size:12px">· ${dir}</span></div>
          <div class="line2">${Math.round(f.dist_km * f.progress)} of ${Math.round(f.dist_km)} km · lands in ${fmtLeft(f)}</div>
          <div class="prog-rail"><div class="prog-fill" style="width:${pct}%"></div></div>
        </div>
      </div>`;
    }
  }
  if (mail.delivered.length) {
    html += `<div class="mail-section">landed</div>`;
    for (const l of mail.delivered) {
      const unread = l.direction === "in" && !l.read_at;
      const d = new Date(l.eta_at * 1000);
      const when = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const preview = l.body ? esc(l.body.split("\n")[0]).slice(0, 60) : "";
      html += `<div class="mrow" data-letter="${l.id}">
        ${birdSVG(unread ? "#ededed" : "#4a4a4a")}
        <div class="body">
          <div class="line1">${unread ? '<span class="unread-dot"></span>' : ""}${esc(l.pigeon)} <span style="color:#4a4a4a;font-size:12px">· ${l.direction === "in" ? "from " + esc(l.peer) : "to " + esc(l.peer)}</span></div>
          <div class="line2">${preview || "landed"} · ${when}</div>
        </div>
      </div>`;
    }
  }
  el.innerHTML = html || `<div class="empty">the sky is quiet.</div>`;
  el.querySelectorAll("[data-flight]").forEach((r) => (r.onclick = () => openFlight(+r.dataset.flight)));
  el.querySelectorAll("[data-letter]").forEach((r) => (r.onclick = () => openLetter(+r.dataset.letter)));
}

// ---------- compose ----------

$("#to-user").addEventListener("input", async () => {
  const u = $("#to-user").value.trim();
  const info = $("#to-info");
  if (u.length < 3) { info.textContent = ""; return; }
  try {
    const r = await api("GET", `/api/users/${encodeURIComponent(u)}`);
    info.textContent = `${Math.round(r.dist_km)} km by air · lands in ~${fmtDur(r.dur_sec)}`;
  } catch (e) {
    info.textContent = "no coop by that name";
  }
});

$("#btn-send").onclick = async () => {
  const to = $("#to-user").value.trim();
  const body = $("#letter-body").value;
  $("#compose-err").textContent = "";
  try {
    const f = await api("POST", "/api/letters", { to, body });
    $("#letter-body").value = "";
    $("#to-user").value = "";
    $("#to-info").textContent = "";
    openFlight(f.id, f);
  } catch (e) {
    $("#compose-err").textContent = typeof e === "string" ? e : "failed";
  }
};

// ---------- flight ----------

function openFlight(id, known) {
  const f = known || [...mail.flying_in, ...mail.flying_out].find((x) => x.id === id);
  if (!f) return;
  currentFlight = f;
  $("#flight-title").textContent = `${f.pigeon} · ${f.direction === "in" ? f.peer + " → you" : "you → " + f.peer}`;
  show("view-flight");
  const map = $("#flight-map");
  const dpr = devicePixelRatio || 1;
  const w = map.clientWidth, h = map.clientHeight;
  map.width = w * dpr;
  map.height = h * dpr;
  const ctx = map.getContext("2d");
  ctx.scale(dpr, dpr);

  // route arc points
  const route = [];
  for (let i = 0; i <= 120; i++) route.push(slerp(f.from.lat, f.from.lon, f.to.lat, f.to.lon, i / 120));

  const loop = () => {
    const t = Math.min(1, (Date.now() / 1000 - f.sent_at) / f.dur_sec);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    drawLand(ctx, w, h, "#1e1e1e", 1.3);

    // full route, faint dashes
    ctx.strokeStyle = "#2b2b2b";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    route.forEach(([la, lo], i) => {
      const [x, y] = project(lo, la, w, h);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();

    // flown segment, bright
    ctx.setLineDash([]);
    ctx.strokeStyle = "#d0d0d0";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const n = Math.max(2, Math.floor(t * 120));
    for (let i = 0; i <= n; i++) {
      const [x, y] = project(route[i][1], route[i][0], w, h);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();

    drawCoop(ctx, f.from.lon, f.from.lat, w, h, f.direction === "out" ? "you" : f.from.name);
    drawCoop(ctx, f.to.lon, f.to.lat, w, h, f.direction === "in" ? "you" : f.to.name);

    const [plat, plon] = slerp(f.from.lat, f.from.lon, f.to.lat, f.to.lon, t);
    const [px, py] = project(plon, plat, w, h);
    const bob = Math.sin(Date.now() / 380) * 2;
    drawBird(ctx, px, py + bob, 14, "#ffffff", true);

    $("#flight-stats").innerHTML = `
      <div><div class="k">flown</div><div class="v">${Math.round(f.dist_km * t)} km</div></div>
      <div><div class="k">left</div><div class="v">${Math.round(f.dist_km * (1 - t))} km</div></div>
      <div><div class="k">progress</div><div class="v">${Math.round(t * 100)}%</div></div>
      <div><div class="k">lands</div><div class="v">${fmtLeft(f)}</div></div>`;

    if (t >= 1) {
      flightRAF = null;
      $("#flight-title").textContent = `${f.pigeon} landed`;
      return;
    }
    flightRAF = requestAnimationFrame(loop);
  };
  loop();
}

// ---------- letter ----------

async function openLetter(id) {
  const l = mail.delivered.find((x) => x.id === id);
  if (!l) return;
  $("#letter-title").textContent = l.direction === "in" ? `from ${l.peer}` : `to ${l.peer}`;
  $("#letter-card").textContent = l.body || "";
  const d = new Date(l.eta_at * 1000);
  $("#letter-meta").textContent = `carried by ${l.pigeon} over ${Math.round(l.dist_km)} km · landed ${d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  show("view-letter");
  if (l.direction === "in" && !l.read_at) {
    l.read_at = Date.now() / 1000;
    api("POST", `/api/letters/${id}/read`).catch(() => {});
  }
}

// ---------- misc ----------

$("#btn-compose").onclick = () => show("view-compose");
document.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => show("view-mail")));
function logout() {
  localStorage.removeItem("pigeon:token");
  token = null;
  show("view-auth");
}
$("#btn-out").onclick = logout;

(async () => {
  if (token) {
    try {
      me = await api("GET", "/api/me");
      $("#who").textContent = me.username;
      show("view-mail");
      return;
    } catch (e) {
      logout();
    }
  }
  show("view-auth");
})();
