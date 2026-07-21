/* EnvoyMesh Relay Admin — same-origin fetch; browser Basic Auth from 401 prompt. */

const POLL_MS = 3000;

const el = {
  statusChip: document.getElementById("statusChip"),
  statusGrid: document.getElementById("statusGrid"),
  peersGrid: document.getElementById("peersGrid"),
  peersBody: document.getElementById("peersBody"),
  resGrid: document.getElementById("resGrid"),
  resBody: document.getElementById("resBody"),
  rosterGrid: document.getElementById("rosterGrid"),
  rosterBody: document.getElementById("rosterBody"),
  topicBody: document.getElementById("topicBody"),
  logView: document.getElementById("logView"),
  logLevel: document.getElementById("logLevel"),
  restartMsg: document.getElementById("restartMsg"),
};

function fmtMs(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function shortPeer(id) {
  if (!id || typeof id !== "string") return "—";
  return id.length > 28 ? `${id.slice(0, 12)}…${id.slice(-8)}` : id;
}

function setChip(status) {
  const s = String(status || "unknown");
  el.statusChip.textContent = s;
  el.statusChip.className = `chip chip-${s}`;
}

function fillDl(node, rows) {
  node.innerHTML = "";
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v == null || v === "" ? "—" : String(v);
    node.append(dt, dd);
  }
}

async function api(path, options) {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options && options.headers),
    },
  });
  if (res.status === 401) {
    throw new Error("Unauthorized — reload and enter admin credentials");
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error((data && data.error) || res.statusText || `HTTP ${res.status}`);
  }
  return data;
}

async function refreshStatus() {
  const s = await api("/admin/api/status");
  setChip(s.health && s.health.status);
  fillDl(el.statusGrid, [
    ["Uptime", fmtMs(s.uptimeMs)],
    ["Peer ID", s.peerId],
    ["Public mode", s.publicMode ? "yes" : "no"],
    ["Reservations", `${s.reservationCount ?? "—"} / ${s.maxReservations ?? "—"}`],
    ["Roster", s.rosterSize],
    ["Lookups", s.metrics ? `${s.metrics.lookupHits}/${s.metrics.lookups} hit` : "—"],
    ["Checkins", s.metrics ? s.metrics.checkins : "—"],
    ["Listen", (s.listenAddrs || []).join("\n") || "—"],
    ["Advertise", (s.advertiseAddrs || []).join("\n") || "—"],
    ["Network", s.versions && s.versions.network],
    ["Node", s.versions && s.versions.node],
  ]);
}

async function refreshPeers() {
  const p = await api("/admin/api/peers");
  fillDl(el.peersGrid, [
    ["Connected peers", p.connectedPeerCount],
    ["Circuit peers", p.circuitPeerCount],
    ["Direct connections", p.totalConnections],
    ["Roster size", p.rosterSize],
    ["WS proxy", p.wsProxyConnections],
    ["Home tunnels", p.homeTunnels],
    ["Direct WS clients", p.directClients],
  ]);
  el.peersBody.innerHTML = "";
  const circuit = new Set(p.circuitPeerIds || []);
  for (const id of p.connectedPeerIds || []) {
    const tr = document.createElement("tr");
    const tdId = document.createElement("td");
    tdId.textContent = shortPeer(id);
    tdId.title = id;
    const tdPath = document.createElement("td");
    tdPath.textContent = circuit.has(id) ? "circuit" : "direct";
    tr.append(tdId, tdPath);
    el.peersBody.append(tr);
  }
}

async function refreshReservations() {
  const r = await api("/admin/api/reservations");
  fillDl(el.resGrid, [
    ["Count", r.count],
    ["Checked at", r.checkedAt],
  ]);
  el.resBody.innerHTML = "";
  for (const item of r.reservations || []) {
    const tr = document.createElement("tr");
    const peer = typeof item === "string" ? item : item.peerId || item.id || JSON.stringify(item);
    const expiry =
      typeof item === "object" && item
        ? item.expireAt
          ? new Date(item.expireAt).toISOString()
          : item.expiry || item.expiresAt || item.expire || "—"
        : "—";
    const tdId = document.createElement("td");
    tdId.textContent = shortPeer(peer);
    tdId.title = String(peer);
    const tdExp = document.createElement("td");
    tdExp.textContent = String(expiry);
    tr.append(tdId, tdExp);
    el.resBody.append(tr);
  }
}

async function refreshLogs() {
  const level = el.logLevel.value;
  const data = await api(`/admin/api/logs?limit=300&level=${encodeURIComponent(level)}`);
  el.logView.innerHTML = "";
  const entries = data.entries || [];
  if (entries.length === 0) {
    const span = document.createElement("span");
    span.className = "lvl-log";
    span.textContent = "(no log lines)";
    el.logView.appendChild(span);
  } else {
    for (const e of entries) {
      const span = document.createElement("span");
      span.className = `lvl-${e.level}`;
      // Use textContent (not innerHTML) to prevent XSS from attacker-influenced
      // log messages (e.g. mobile-client JSON-RPC frames bridged through /ws).
      span.textContent = `${e.ts} [${e.level}] ${e.message || ""}`;
      el.logView.appendChild(span);
      el.logView.appendChild(document.createTextNode("\n"));
    }
  }
  el.logView.scrollTop = el.logView.scrollHeight;
}

async function refreshRoster() {
  if (!el.rosterGrid || !el.rosterBody || !el.topicBody) return;
  const r = await api("/admin/api/roster");
  fillDl(el.rosterGrid, [
    ["Size", r.size],
    ["Checked at", r.checkedAt],
  ]);
  el.rosterBody.innerHTML = "";
  for (const item of r.entries || []) {
    const tr = document.createElement("tr");
    const tdId = document.createElement("td");
    tdId.textContent = shortPeer(item.peerId);
    tdId.title = item.peerId || "";
    const tdHop = document.createElement("td");
    tdHop.textContent = item.hasHopSlot ? "live" : "checkin";
    const tdTopics = document.createElement("td");
    const hashes = item.topicHashes || [];
    tdTopics.textContent = hashes.length
      ? hashes.map((h) => (h.length > 18 ? `${h.slice(0, 10)}…` : h)).join(", ")
      : "—";
    tdTopics.title = hashes.join("\n");
    tr.append(tdId, tdHop, tdTopics);
    el.rosterBody.append(tr);
  }
  el.topicBody.innerHTML = "";
  for (const t of r.topicHashes || []) {
    const tr = document.createElement("tr");
    const tdH = document.createElement("td");
    tdH.textContent = t.topicHash.length > 28 ? `${t.topicHash.slice(0, 16)}…` : t.topicHash;
    tdH.title = t.topicHash;
    const tdC = document.createElement("td");
    tdC.textContent = String(t.peerCount);
    tr.append(tdH, tdC);
    el.topicBody.append(tr);
  }
}

async function refreshAll() {
  try {
    await Promise.all([
      refreshStatus(),
      refreshPeers(),
      refreshReservations(),
      refreshRoster(),
      refreshLogs(),
    ]);
  } catch (err) {
    el.restartMsg.hidden = false;
    el.restartMsg.textContent = String(err.message || err);
  }
}

async function clearLogs() {
  await api("/admin/api/logs/clear", { method: "POST" });
  await refreshLogs();
}

async function restart(mode) {
  const label = mode === "libp2p" ? "soft (libp2p)" : "hard (process)";
  if (!confirm(`Confirm ${label} restart?`)) return;
  el.restartMsg.hidden = false;
  el.restartMsg.textContent = `Requesting ${label} restart…`;
  try {
    await api("/admin/api/restart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    el.restartMsg.textContent =
      mode === "process"
        ? "Process exiting — supervisor should restart the relay."
        : "Libp2p restart requested.";
    if (mode === "libp2p") setTimeout(refreshAll, 1500);
  } catch (err) {
    el.restartMsg.textContent = String(err.message || err);
  }
}

document.getElementById("btnRefresh").addEventListener("click", () => {
  void refreshAll();
});
document.getElementById("btnClearLogs").addEventListener("click", () => {
  void clearLogs();
});
document.getElementById("btnSoft").addEventListener("click", () => {
  void restart("libp2p");
});
document.getElementById("btnHard").addEventListener("click", () => {
  void restart("process");
});
el.logLevel.addEventListener("change", () => {
  void refreshLogs();
});

void refreshAll();
setInterval(() => {
  void refreshAll();
}, POLL_MS);
