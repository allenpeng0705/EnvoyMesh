# EnvoyMesh Relay Server Deployment

**Audience:** operators running a long-lived community or org relay (24×7), plus developers starting a relay from a terminal on macOS/Windows.

**Related:** [run-relay-scripts](./run-relay-scripts.md) · [relay-supervisor-recipes](./relay-supervisor-recipes.md) · [operator-relay-fleet](./operator-relay-fleet.md) · [relay-server-design](./relay-server-design.md)

**Contents:** [§3 terminal (macOS/Windows)](#3-run-from-terminal-macos--windows) · [§4 Linux systemd](#4-linux-systemd--recommended-production-shape) · [§5 Windows NSSM](#5-windows--nssm-recommended--powershell-liveness)

---

## 1. Why two recovery layers are required

| Layer | What it catches | What it misses |
|-------|-----------------|----------------|
| **A. Process supervisor** (`Restart=always` / NSSM restart) | Crash, OOM kill, intentional `process.exit(2)` after critical health | Process **alive but wedged** (ports LISTEN, event loop starved) |
| **B. HTTP liveness watchdog** | Alive-but-wedged: `GET /health` times out even though TCP accepts | Nothing useful if HTTP health is not enabled |

**Both layers are required** for hands-off 24×7 operation.

Default HTTP port for `/health`, `/info`, and `/admin` is **`15432`** (`--http-port`). Do **not** assume `8080` unless you set that explicitly.

**Symptom of a wedged relay (seen on community cn-relay):** `curl http://HOST:15432/health` **connects then times out** (TCP SYN-ACK, no HTTP body), while libp2p `:4001` may also be unreachable. In-process health cannot exit because it shares the starved event loop — you need the sibling/`http-liveness-watch` SIGKILL + `Restart=always`.

Probe (unauthenticated):

```bash
curl -fsS --max-time 2 http://127.0.0.1:15432/health
curl -fsS --max-time 2 http://127.0.0.1:15432/readyz   # 503 = mesh not ready; /health still 200 if alive
```

---

## 2. Ports and firewall

| Port | Purpose | Public? |
|------|---------|---------|
| **4001/tcp** (default listen) | libp2p / circuit-relay | Yes (community relay) |
| **15432/tcp** (default `--http-port`) | `/health`, Admin UI, optional WS proxy | Prefer **loopback + TLS reverse proxy** for Admin; `/health` can stay local-only for the watchdog |

Open security-group / firewall rules for the libp2p listen port. Keep Admin behind TLS (Caddy/nginx) if exposed remotely. Change default Admin credentials before public exposure.

---

## 3. Run from terminal (macOS & Windows)

Use this for local testing or a foreground session. For 24×7 production, prefer [§4 Linux systemd](#4-linux-systemd--recommended-production-shape) or [§5 Windows NSSM](#5-windows--nssm-recommended--powershell-liveness).

**Prerequisites (both platforms):**

- Node.js 18+ on PATH
- Repo cloned; from repo root: `npm install`
- Scripts rebuild `apps/relay` on start (incremental `tsc -b`)

More script flags: [run-relay-scripts](./run-relay-scripts.md).

### 3.1 macOS (Terminal / zsh)

```bash
cd /path/to/EnvoyMesh
chmod +x ./scripts/run-relay.sh

# Local-only (LAN / laptop test) — no public advertise
./scripts/run-relay.sh

# Public / cloud-style (replace with your public IP)
./scripts/run-relay.sh --advertise 47.93.11.212 --public-mode --http-port 15432

# Custom listen port + profile
./scripts/run-relay.sh --port 4001 --profile ./data/relay --advertise 47.93.11.212 --http-port 15432
```

Optional Admin credentials for this shell:

```bash
export ENVOYMESH_RELAY_ADMIN_USER=admin
export ENVOYMESH_RELAY_ADMIN_PASSWORD='CHANGE_ME'
./scripts/run-relay.sh --advertise 47.93.11.212 --public-mode --http-port 15432
```

**What “ready” looks like:**

```text
[relay] Relay server started.
[relay] Peer ID: 12D3KooW…
[relay] Listen addresses: /ip4/…/tcp/4001/p2p/…
[relay] HTTP info + WebSocket proxy listening on port 15432
[relay] Ready to accept relay connections.
```

**Verify in another terminal:**

```bash
curl -fsS --max-time 2 http://127.0.0.1:15432/health
echo
```

**Stop:** `Ctrl+C` in the relay terminal.

**macOS firewall / network notes:**

- Local test: no advertise needed; peers on the same LAN can use the printed `/ip4/<lan-ip>/tcp/4001/p2p/…` multiaddr.
- WAN test: set `--advertise <public-ip>`, open TCP **4001** on the router/security group, and prefer `--http-port 15432` so `/health` works for probes.
- Leaving a Terminal window open is **not** a supervisor — if the Mac sleeps or the process wedges, nothing auto-restarts. Use launchd (see [relay-supervisor-recipes](./relay-supervisor-recipes.md)) or a Linux VPS for production.

### 3.2 Windows (cmd or PowerShell)

From repo root:

**Command Prompt:**

```cmd
cd C:\path\to\EnvoyMesh
scripts\run-relay.bat

:: Public / cloud-style
scripts\run-relay.bat --advertise 47.93.11.212 --public-mode --http-port 15432
```

**PowerShell:**

```powershell
cd C:\path\to\EnvoyMesh
.\scripts\run-relay.bat

# Public / cloud-style
.\scripts\run-relay.bat --advertise 47.93.11.212 --public-mode --http-port 15432

# Custom profile / port
.\scripts\run-relay.bat --profile .\data\relay --port 4001 --advertise 47.93.11.212 --http-port 15432
```

Optional Admin credentials for this session:

```powershell
$env:ENVOYMESH_RELAY_ADMIN_USER = "admin"
$env:ENVOYMESH_RELAY_ADMIN_PASSWORD = "CHANGE_ME"
.\scripts\run-relay.bat --advertise 47.93.11.212 --public-mode --http-port 15432
```

**Verify in another window:**

```powershell
curl.exe -fsS --max-time 2 http://127.0.0.1:15432/health
# or:
Invoke-WebRequest -Uri http://127.0.0.1:15432/health -UseBasicParsing -TimeoutSec 2
```

**Stop:** `Ctrl+C` in the relay window.

**Windows firewall:** allow inbound TCP **4001** (and **15432** only if you need remote Admin — prefer TLS reverse proxy). Terminal-only runs do not auto-recover; use [§5 NSSM](#5-windows--nssm-recommended--powershell-liveness) for 24×7.

### 3.3 Common terminal flags

| Flag | Meaning | Typical value |
|------|---------|----------------|
| `--advertise <IP>` | Public IP for advertised multiaddr | your VPS public IP |
| `--public-mode` | Community-relay circuit-relay-v2 presets | set for WAN community relays |
| `--http-port <port>` | `/health`, `/admin`, `/info` | `15432` |
| `--port <port>` | libp2p listen TCP port | `4001` |
| `--profile <dir>` | Identity / state directory | `./data/relay` |

Share the printed multiaddr with clients:

```text
/ip4/<advertise-or-lan-ip>/tcp/4001/p2p/<peer-id>
```

Admin UI (local): `http://127.0.0.1:15432/admin/`

---

## 4. Linux (systemd) — recommended production shape

Assumes repo checkout at `/home/admin/mygithub/EnvoyMesh` and Node via nvm (adjust paths/user to match your host).

### 4.1 Main relay unit

Create `/etc/systemd/system/envoymesh-relay.service`:

```ini
[Unit]
Description=EnvoyMesh Relay Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/admin/mygithub/EnvoyMesh
User=admin
ExecStart=/bin/bash /home/admin/mygithub/EnvoyMesh/scripts/run-relay.sh --advertise YOUR_PUBLIC_IP --public-mode --http-port 15432
Restart=always
RestartSec=5
StartLimitIntervalSec=300
StartLimitBurst=10
Environment=ENVOYMESH_RELAY_PUBLIC_MODE=1
Environment=NODE_OPTIONS=--experimental-global-customevent
Environment=PATH=/home/admin/.nvm/versions/node/v24.11.1/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=ENVOYMESH_RELAY_ADMIN_USER=admin
Environment=ENVOYMESH_RELAY_ADMIN_PASSWORD=CHANGE_ME

[Install]
WantedBy=multi-user.target
```

Notes:

- `--advertise YOUR_PUBLIC_IP` makes the binary advertise a public multiaddr (required for WAN clients).
- `--public-mode` / `ENVOYMESH_RELAY_PUBLIC_MODE=1` applies community-relay circuit-relay-v2 presets (redundant if both set; harmless).
- Explicit `--http-port 15432` keeps the health URL unambiguous for the watchdog.
- Do **not** commit real Admin passwords into git; set them only in the unit or a root-owned env file (`EnvironmentFile=-/etc/envoymesh/relay.env` with `chmod 600`).

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now envoymesh-relay.service
sudo systemctl status envoymesh-relay.service
```

### 4.2 Liveness watchdog unit

Create `/etc/systemd/system/envoymesh-relay-liveness.service`:

```ini
[Unit]
Description=EnvoyMesh Relay HTTP liveness watchdog
After=envoymesh-relay.service
# Use Wants= (not Requires=). Requires= stops this watchdog whenever the relay
# exits — including when the watchdog itself kills a wedged MainPID — so the
# liveness unit unnecessarily restarts on every recovery.
Wants=envoymesh-relay.service

[Service]
Type=simple
WorkingDirectory=/home/admin/mygithub/EnvoyMesh
User=admin
ExecStart=/home/admin/mygithub/EnvoyMesh/scripts/http-liveness-watch.sh --url http://127.0.0.1:15432/health --systemctl envoymesh-relay
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Important:** `--systemctl UNIT` kills the unit’s **MainPID** (SIGKILL). That works when the liveness service runs as the **same `User=`** as the relay (`admin` in the example). systemd then respawns the relay because of `Restart=always`.

Do **not** use `--systemctl-restart` unless the watchdog runs as **root** (or has a sudoers NOPASSWD rule). Otherwise you get:

```text
Failed to restart envoymesh-relay.service: Interactive authentication required.
```

Make the script executable (once):

```bash
chmod +x /home/admin/mygithub/EnvoyMesh/scripts/http-liveness-watch.sh
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now envoymesh-relay-liveness.service
```

#### Migrate an existing unit (`Requires=` → `Wants=`)

If you already installed the liveness unit with `Requires=envoymesh-relay.service`, update it so the watchdog stays up across recoveries:

```bash
# Confirm current dependency
systemctl show -p Requires -p Wants envoymesh-relay-liveness.service

sudo systemctl edit --full envoymesh-relay-liveness.service
# In [Unit]: remove Requires=envoymesh-relay.service
#            add    Wants=envoymesh-relay.service
# Keep After=envoymesh-relay.service

sudo systemctl daemon-reload
sudo systemctl restart envoymesh-relay-liveness.service
systemctl show -p Requires -p Wants envoymesh-relay-liveness.service
# Expect Wants=…envoymesh-relay.service and Requires= without envoymesh-relay
```

**Symptom of the old `Requires=` unit:** after a successful wedge kill, the liveness journal shows a **new** `watching http://…` line (watchdog PID bounced). With `Wants=`, only the relay restarts; the same liveness PID keeps probing.

Watchdog defaults (override with env on the unit if needed):

| Env | Default | Meaning |
|-----|---------|---------|
| `LIVENESS_INTERVAL_SEC` | `15` | Seconds between probes |
| `LIVENESS_TIMEOUT_SEC` | `2` | curl max time |
| `LIVENESS_FAILS` | `3` | Failures before restart (~45s after grace) |
| `LIVENESS_GRACE_SEC` | `90` | Ignore failures right after (re)start |

**Normal vs action-needed probe noise:** occasional `probe failed (1/3)` or `(2/3)` followed by `recovered after N failure(s)` is OK under load. Action only after **`(3/3)`** + `killing wedged pid`.

### 4.3 Verify on Linux — is everything working?

#### 1. Is the relay service up?

```bash
systemctl status envoymesh-relay.service
systemctl is-active envoymesh-relay.service
```

Expect: **`active (running)`** / `active`.

#### 2. Is the watchdog service up?

```bash
systemctl status envoymesh-relay-liveness.service
systemctl is-active envoymesh-relay-liveness.service
```

Expect: **`active (running)`** / `active`.

#### 3. Is `/health` answering?

```bash
curl -fsS --max-time 2 http://127.0.0.1:15432/health
echo
```

Expect: JSON body, curl exit code **0**.  
If you see `Failed to connect … port 8080`, you used the wrong port — use **15432** (or the port you set with `--http-port`).

#### 4. Is the watchdog actually probing?

```bash
journalctl -u envoymesh-relay-liveness.service -n 50 --no-pager
```

Expect a line like:

```text
[liveness] watching http://127.0.0.1:15432/health every 15s (fail=3, timeout=2s, grace=90s)
```

After the grace window, a healthy relay should **not** show sustained `probe failed (3/3)` lines. Brief `1/3` / `2/3` that recover are fine.

Follow live:

```bash
journalctl -u envoymesh-relay-liveness.service -f
```

#### 5. Quick “all good” checklist (Linux)

| Check | OK means |
|-------|----------|
| `systemctl is-active envoymesh-relay` | `active` |
| `systemctl is-active envoymesh-relay-liveness` | `active` |
| journal shows `watching http://…/health` | script started |
| `curl …:15432/health` succeeds | probe target works |
| no sustained `probe failed (3/3)` | relay event loop answering |
| liveness unit uses `Wants=` not `Requires=` | watchdog does not bounce on every relay restart |

#### 6. Prove the watchdog can restart (optional, maintenance window)

**Before testing — confirm the new script is what systemd is running:**

```bash
grep -n 'SIGKILL\|killing wedged pid\|restarting unit' "$(systemctl show -p ExecStart --value envoymesh-relay-liveness.service | awk '{print $1}')" 2>/dev/null \
  || grep -n 'SIGKILL\|killing wedged pid' /home/admin/mygithub/EnvoyMesh/scripts/http-liveness-watch.sh

sudo systemctl restart envoymesh-relay-liveness.service
journalctl -u envoymesh-relay-liveness.service -n 3 --no-pager
# Must show a FRESH "watching http://127.0.0.1:15432/health" line (new PID).
```

If journals still say `restarting unit …` / `Interactive authentication required` / `TERM then KILL`, that is an **old** script still in memory — pull latest `scripts/http-liveness-watch.sh` and `sudo systemctl restart envoymesh-relay-liveness.service`.

**Sanity check (does `User=admin` have permission to kill the relay?):**

```bash
pid=$(systemctl show -p MainPID --value envoymesh-relay.service)
echo "MainPID=$pid"
kill -0 "$pid" && echo "can signal pid" || echo "cannot signal pid"
# Optional: kill once and confirm systemd restarts (will drop live traffic briefly)
# kill -KILL "$pid"; sleep 3; systemctl is-active envoymesh-relay.service
```

**Wedge simulation with `SIGSTOP` (valid test):**

`kill -STOP` freezes the process so `/health` times out. That is a correct wedge simulation.  
Note: a STOP’d process ignores `SIGTERM` until `CONT`; the watchdog must use **`SIGKILL`** (current script does).

```bash
# Record the current liveness PID (should stay the same after recovery if Wants=)
liveness_pid=$(systemctl show -p MainPID --value envoymesh-relay-liveness.service)
echo "liveness MainPID=$liveness_pid"

sudo systemctl restart envoymesh-relay.service   # clean start; clear any prior STOP
# run-relay.sh may rebuild apps/relay — wait until /health answers (often 30–120s)
for i in $(seq 1 60); do
  curl -fsS --max-time 2 http://127.0.0.1:15432/health >/dev/null && echo health_ok && break
  sleep 2
done

sudo kill -STOP $(systemctl show -p MainPID --value envoymesh-relay.service)

# Wait ~60–90s (3 failed probes @ 15s). Then:
journalctl -u envoymesh-relay-liveness.service -n 20 --no-pager
systemctl is-active envoymesh-relay.service
# Again wait for rebuild + HTTP bind before declaring failure:
for i in $(seq 1 60); do
  curl -fsS --max-time 2 http://127.0.0.1:15432/health && break
  sleep 2
done

echo "liveness was=$liveness_pid now=$(systemctl show -p MainPID --value envoymesh-relay-liveness.service)"
```

**Expect (success):**

```text
[liveness] probe failed (3/3) ...
[liveness] unit=envoymesh-relay MainPID=...
[liveness] killing wedged pid ... (SIGKILL); supervisor should Restart=always
```

Then:

- `systemctl is-active envoymesh-relay` → `active`
- `/health` returns JSON (e.g. `"status":"healthy"`, fresh `uptimeMs`)
- With `Wants=`: liveness MainPID is **unchanged** (no new `watching` line right after the kill)
- With leftover `Requires=`: liveness MainPID changes and a new `watching` line appears — migrate per [§4.2](#migrate-an-existing-unit-requires--wants)

**If it fails, clean up a leftover STOP:**

```bash
sudo kill -CONT $(systemctl show -p MainPID --value envoymesh-relay.service) 2>/dev/null || true
sudo systemctl restart envoymesh-relay.service
```

#### 7. Useful ops commands

```bash
# Relay logs
journalctl -u envoymesh-relay.service -n 100 --no-pager

# Both units
systemctl status envoymesh-relay.service envoymesh-relay-liveness.service

# What the unit actually runs
systemctl cat envoymesh-relay.service

# Listening ports
ss -lntp | rg '4001|15432'
```

---

## 5. Windows — NSSM (recommended) + PowerShell liveness

### 5.1 Prerequisites

- Node.js on PATH (or full path to `node.exe` / `npm.cmd`)
- Repo clone, e.g. `C:\envoymesh\EnvoyMesh`
- [NSSM](https://nssm.cc/) installed and on PATH (or use full path to `nssm.exe`)
- Git Bash **or** PowerShell 5+ (liveness script below is PowerShell)

Build / deps once from an elevated Developer PowerShell in the repo:

```powershell
cd C:\envoymesh\EnvoyMesh
npm install
# run-relay.ps1 / run-relay.sh will rebuild apps/relay on start in normal flows
```

### 5.2 Install the main relay service (NSSM)

Adjust paths and public IP. Prefer `scripts\run-relay.ps1` if present; otherwise call Node on the built relay entry.

**Option A — via `run-relay` script (Git Bash / bash):**

```powershell
nssm install EnvoyMeshRelay "C:\Program Files\Git\bin\bash.exe"
nssm set EnvoyMeshRelay AppDirectory "C:\envoymesh\EnvoyMesh"
nssm set EnvoyMeshRelay AppParameters "scripts/run-relay.sh --advertise YOUR_PUBLIC_IP --public-mode --http-port 15432"
nssm set EnvoyMeshRelay AppExit Default Restart
nssm set EnvoyMeshRelay AppRestartDelay 5000
nssm set EnvoyMeshRelay AppEnvironmentExtra "ENVOYMESH_RELAY_PUBLIC_MODE=1" "ENVOYMESH_RELAY_ADMIN_USER=admin" "ENVOYMESH_RELAY_ADMIN_PASSWORD=CHANGE_ME"
nssm start EnvoyMeshRelay
```

**Option B — direct Node on built relay:**

```powershell
nssm install EnvoyMeshRelay "C:\Program Files\nodejs\node.exe"
nssm set EnvoyMeshRelay AppDirectory "C:\envoymesh\EnvoyMesh"
nssm set EnvoyMeshRelay AppParameters "apps\relay\dist\index.js --profile C:\envoymesh\relay-data --listen /ip4/0.0.0.0/tcp/4001 --advertise-addr /ip4/YOUR_PUBLIC_IP/tcp/4001 --http-port 15432 --relay-public-mode"
nssm set EnvoyMeshRelay AppExit Default Restart
nssm set EnvoyMeshRelay AppRestartDelay 5000
nssm set EnvoyMeshRelay AppEnvironmentExtra "ENVOYMESH_RELAY_ADMIN_USER=admin" "ENVOYMESH_RELAY_ADMIN_PASSWORD=CHANGE_ME"
nssm start EnvoyMeshRelay
```

Open Windows Firewall for TCP **4001** (and **15432** only if you expose Admin remotely — prefer TLS reverse proxy).

### 5.3 Install the liveness watchdog (NSSM + PowerShell)

```powershell
nssm install EnvoyMeshRelayLiveness "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
nssm set EnvoyMeshRelayLiveness AppDirectory "C:\envoymesh\EnvoyMesh"
nssm set EnvoyMeshRelayLiveness AppParameters "-NoProfile -ExecutionPolicy Bypass -File C:\envoymesh\EnvoyMesh\scripts\http-liveness-watch.ps1 -Url http://127.0.0.1:15432/health -ServiceName EnvoyMeshRelay"
nssm set EnvoyMeshRelayLiveness AppExit Default Restart
nssm set EnvoyMeshRelayLiveness AppRestartDelay 5000
nssm start EnvoyMeshRelayLiveness
```

The PowerShell watchdog (`scripts/http-liveness-watch.ps1`) mirrors the Linux script: grace period, N failed `GET /health` probes, then `Restart-Service EnvoyMeshRelay`.

### 5.4 Verify on Windows

Run PowerShell **as Administrator** where noted.

#### 1. Is the relay service up?

```powershell
Get-Service EnvoyMeshRelay
nssm status EnvoyMeshRelay
```

Expect: **Running**.

#### 2. Is the watchdog service up?

```powershell
Get-Service EnvoyMeshRelayLiveness
nssm status EnvoyMeshRelayLiveness
```

Expect: **Running**.

#### 3. Is `/health` answering?

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:15432/health -UseBasicParsing -TimeoutSec 2
# or:
curl.exe -fsS --max-time 2 http://127.0.0.1:15432/health
```

Expect: HTTP **200** and a JSON body.

#### 4. Is the watchdog actually probing?

NSSM can redirect stdout/stderr to files:

```powershell
nssm set EnvoyMeshRelayLiveness AppStdout C:\envoymesh\logs\relay-liveness.log
nssm set EnvoyMeshRelayLiveness AppStderr C:\envoymesh\logs\relay-liveness.err.log
nssm restart EnvoyMeshRelayLiveness
Get-Content C:\envoymesh\logs\relay-liveness.log -Tail 50
```

Expect:

```text
[liveness] watching http://127.0.0.1:15432/health every 15s ...
```

and no sustained `probe failed` after grace.

#### 5. Quick “all good” checklist (Windows)

| Check | OK means |
|-------|----------|
| `Get-Service EnvoyMeshRelay` → Running | relay up |
| `Get-Service EnvoyMeshRelayLiveness` → Running | watchdog up |
| liveness log shows `watching http://…/health` | script started |
| `Invoke-WebRequest …/health` succeeds | probe target works |
| no sustained `probe failed` | relay event loop answering |

#### 6. Prove the watchdog can restart (optional)

```powershell
# Pause the relay process (requires Sysinternals pssuspend, or stop the service briefly)
# Safer demo: stop the relay service and confirm watchdog / NSSM bring it back,
# or use Resource Monitor to suspend the node PID, wait ~60s, then check logs.

Get-Content C:\envoymesh\logs\relay-liveness.log -Tail 30
Get-Service EnvoyMeshRelay
```

Expect: `probe failed` then `restarting service EnvoyMeshRelay`, service **Running** again.

#### 7. Useful ops commands (Windows)

```powershell
nssm status EnvoyMeshRelay
nssm edit EnvoyMeshRelay          # GUI editor
Get-NetTCPConnection -LocalPort 4001,15432 -ErrorAction SilentlyContinue
Get-WinEvent -LogName Application -MaxEvents 20   # if you log there
```

### 5.5 WinSW alternative (sketch)

If you prefer [WinSW](https://github.com/winsw/winsw) instead of NSSM, point two XML services at:

1. Relay `ExecStart` equivalent (`run-relay` / `node apps/relay/dist/index.js … --http-port 15432`)
2. `powershell.exe -File …\http-liveness-watch.ps1 -Url http://127.0.0.1:15432/health -ServiceName EnvoyMeshRelay`

Set `<onfailure action="restart" delay="5 sec"/>` on both.

---

## 6. Security checklist

- [ ] Change `ENVOYMESH_RELAY_ADMIN_PASSWORD` from defaults / shared secrets
- [ ] Prefer TLS reverse proxy in front of `:15432` for remote Admin
- [ ] Keep liveness probes on **localhost** (`127.0.0.1`) so the watchdog does not depend on public HTTP
- [ ] Do not commit unit files with real passwords into the EnvoyMesh git repo
- [ ] Restrict who can `systemctl restart` / manage the Windows service

---

## 7. How recovery behaves (summary)

```
┌──────────────────┐  crash / exit(2)   ┌─────────────────────┐
│  relay process   │ ─────────────────► │ systemd / NSSM /    │ → restart
└────────┬─────────┘                    │ run-relay supervise │
         │ heartbeat stale OR /health   └─────────▲───────────┘
         │ timeout (wedged)                       │
         └──── sibling + external liveness ───────┘
```

In-process health (relay) — **stricter than home node**:

- Lag threshold **1.5s** (home 2s); exit after **2** ticks at **15s** cadence ≈ **30s** (home ≈ 90s)
- RSS exit default **3072 MB** (home 4096 MB)
- Sibling watchdog: **heartbeat file + GET /health** (home is HTTP-only); 5s interval / 2s timeout / 2 fails / 60s grace
- `run-relay.sh` restarts by default (`ENVOYMESH_RELAY_SUPERVISE=0` to disable)
- Prunes anonymous swarm peers under dial pressure while **protecting live reservation holders**
- `/health` always **200** if the loop answers; use `/readyz` for mesh readiness

External liveness (`scripts/http-liveness-watch.sh`):

- `GET /health` fail × 3 (after grace) → restart the relay service

Prefer **both** the built-in sibling and the systemd external unit for community relays.
---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `curl …:8080/health` connection refused | Wrong port | Use **15432** or your `--http-port` |
| `curl …:15432/health` refused right after restart | `run-relay.sh` still rebuilding / binding | Wait up to ~2 min; poll `/health` in a loop (do not only `sleep 3`) |
| `curl …:15432/health` refused for longer | HTTP not listening / relay down | Check `systemctl status` / NSSM; ensure `--http-port` / binary default |
| Watchdog `active` but no `watching` line | Wrong `ExecStart` path / script not executable | `chmod +x` (Linux); fix path; check journal/log |
| Watchdog restarts relay in a loop | Wrong URL / health never binds | Increase `LIVENESS_GRACE_SEC`; fix URL; `/health` is always 200 when alive — check sibling heartbeat path |
| Occasional `probe failed (1/3)` then `recovered` | Transient load / slow event loop | Normal — only `(3/3)` triggers kill |
| Liveness PID restarts every time relay is killed | Unit still has `Requires=envoymesh-relay` | Switch to `Wants=` ([§4.2 migrate](#migrate-an-existing-unit-requires--wants)) |
| `Interactive authentication required` on restart | Watchdog used `systemctl restart` as non-root | Use `--systemctl` (kill MainPID) with same `User=` as relay; pull latest `http-liveness-watch.sh` and `systemctl restart envoymesh-relay-liveness` |
| Journal still says `TERM then KILL` | Old script in memory | `git pull` + `systemctl restart envoymesh-relay-liveness` |
| Admin UI hard restart never comes back | No `Restart=always` / NSSM AppExit Restart | Fix supervisor unit |
| Clients cannot dial WAN | Missing `--advertise` / firewall | Set public IP advertise; open TCP 4001 |

---

## 9. Cross-links

- Terminal quick start (macOS / Windows): [§3](#3-run-from-terminal-macos--windows)
- Script flags and Admin UI: [run-relay-scripts](./run-relay-scripts.md)
- Shorter supervisor snippets (macOS launchd / Docker / k8s): [relay-supervisor-recipes](./relay-supervisor-recipes.md)
- Fleet / community relay ops: [operator-relay-fleet](./operator-relay-fleet.md)
- Linux watchdog script: [`scripts/http-liveness-watch.sh`](../scripts/http-liveness-watch.sh)
- Windows watchdog script: [`scripts/http-liveness-watch.ps1`](../scripts/http-liveness-watch.ps1)
