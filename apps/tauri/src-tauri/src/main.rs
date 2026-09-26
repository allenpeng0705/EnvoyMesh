use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Manager, State};
use tracing::{error, info, warn, Level};
use tracing::subscriber::set_global_default;
use tracing_subscriber::FmtSubscriber;

#[derive(Clone)]
struct NodeSpawnConfig {
    node_exe: PathBuf,
    node_path: PathBuf,
    node_cwd: PathBuf,
    profile_dir: PathBuf,
    ipfs_repo_dir: PathBuf,
    bundled_ipfs: Option<PathBuf>,
    tauri_resource_dir: Option<PathBuf>,
    node_log_file: Option<Arc<Mutex<File>>>,
}

/// Tracks intentional stops vs critical health exits so the guardian can
/// decide whether to auto-respawn the home-node child.
struct NodeGuardianState {
    /// When true, the monitor must not respawn (app quit, OTA stop, manual restart).
    suppress_respawn: bool,
    /// Wall-clock times of recent auto-respawns (rate limit window).
    recent_respawn_at: Vec<Instant>,
    /// Consecutive failed GET /health probes while the child is still running.
    consecutive_liveness_failures: u32,
    /// When the current child was (re)spawned — grace period before probing.
    child_started_at: Option<Instant>,
    last_liveness_probe_at: Option<Instant>,
}

struct NodeProcessState {
    child: Mutex<Option<Child>>,
    config: NodeSpawnConfig,
    guardian: Mutex<NodeGuardianState>,
    /// When set, this window did not spawn a child — another process owns the home
    /// and we talk to its WebSocket (attach-first, design §7 / S3).
    attached: Mutex<Option<AttachedHomeNode>>,
}

/// A verified home node we are using without supervising its process.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AttachedHomeNode {
    app: String,
    pid: u32,
    port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    owner_id: Option<String>,
}

/// What Social shows for home discovery (S2) and attach-or-spawn (S3).
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HomeNodeModeStatus {
    /// `supervised` | `attached` | `none`
    mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    headline: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    holder_app: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    holder_pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    port: Option<u16>,
}

/// Home node `exitForNodeSupervisor` uses `process.exit(2)`.
const NODE_SUPERVISOR_EXIT_CODE: i32 = 2;
/// Damaged / unreadable profile (`apps/node` home discovery) — must not auto-respawn.
const NODE_DAMAGED_HOME_EXIT_CODE: i32 = 4;
/// Another process already owns the home (`acquireNodeLock` loser).
const NODE_HOME_IN_USE_EXIT_CODE: i32 = 3;
const NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR: usize = 3;
const NODE_GUARDIAN_POLL_INTERVAL: Duration = Duration::from_secs(2);
/// Desktop Social WS port (Tauri home node). Alive-but-wedged detection.
const NODE_LIVENESS_PORT: u16 = 3030;
const NODE_LIVENESS_PROBE_INTERVAL: Duration = Duration::from_secs(10);
const NODE_LIVENESS_PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const NODE_LIVENESS_FAILS_BEFORE_KILL: u32 = 3;
const NODE_LIVENESS_STARTUP_GRACE: Duration = Duration::from_secs(90);

#[derive(Clone)]
struct AppLogPaths {
    logs_dir: PathBuf,
    node_log: PathBuf,
    social_log: PathBuf,
}

fn ensure_logs_dir(app_data_dir: &Path) -> AppLogPaths {
    let logs_dir = app_data_dir.join("logs");
    std::fs::create_dir_all(&logs_dir).expect("Failed to create logs dir");
    AppLogPaths {
        node_log: logs_dir.join("node.log"),
        social_log: logs_dir.join("social.log"),
        logs_dir,
    }
}

fn open_append_log(path: &Path) -> Option<File> {
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .ok()
}

fn pipe_child_logs(
    label: &str,
    stream: Option<impl std::io::Read + Send + 'static>,
    log_file: Option<Arc<Mutex<File>>>,
) {
    if let Some(stream) = stream {
        let label = label.to_string();
        std::thread::spawn(move || {
            for line in BufReader::new(stream).lines() {
                match line {
                    Ok(line) if !line.is_empty() => {
                        info!("[{}] {}", label, line);
                        if let Some(ref file) = log_file {
                            if let Ok(mut guard) = file.lock() {
                                let _ = writeln!(guard, "[{}] {}", label, line);
                                let _ = guard.flush();
                            }
                        }
                    }
                    Ok(_) => {}
                    Err(_) => break,
                }
            }
        });
    }
}

/// Strip the Windows extended-length path prefix (`\\?\`) from a PathBuf.
///
/// `std::env::current_exe()`, `canonicalize()`, and Tauri's `resource_dir()`
/// all return verbatim `\\?\C:\...` paths on Windows. Node.js's module
/// resolver cannot handle this prefix — `realpathSync` fails with
/// `EISDIR: illegal operation on a directory, lstat 'C:'` because the
/// prefix is stripped incorrectly during path resolution, leaving just
/// the bare drive letter.
///
/// On non-Windows platforms this is a no-op. On Windows, we strip:
///   `\\?\C:\path`  →  `C:\path`
///   `\\?\UNC\host\share`  →  `\\host\share`
///
/// Only strips when the path is safe to represent in the legacy form
/// (under MAX_PATH). We don't bother checking length here because all
/// our resource paths are well under the limit.
fn strip_verbatim_prefix(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        use std::ffi::OsString;
        // OsStrExt provides encode_wide() on &OsStr (reading).
        // OsStringExt provides from_wide() on OsString (writing).
        // Both live in std::os::windows::ffi — easy to grab one and forget
        // the other, which is exactly the compile error we just fixed.
        use std::os::windows::ffi::{OsStrExt, OsStringExt};
        let s = path.as_os_str();
        let chars: Vec<u16> = s.encode_wide().collect();
        // `\\?\` = [backslash, backslash, question, backslash]
        if chars.len() >= 4 && chars[0] == b'\\' as u16 && chars[1] == b'\\' as u16
            && chars[2] == b'?' as u16 && chars[3] == b'\\' as u16
        {
            // Check for `\\?\UNC\` (UNC path verbatim form).
            // UNC verbatim: `\\?\UNC\server\share\...` → `\\server\share\...`
            const UNC: &[u16] = &[b'U' as u16, b'N' as u16, b'C' as u16, b'\\' as u16];
            if chars.len() >= 8 && chars[4..8] == *UNC {
                // Replace `\\?\UNC\` with `\\` (single leading pair of backslashes).
                let mut stripped: Vec<u16> = vec![b'\\' as u16, b'\\' as u16];
                stripped.extend_from_slice(&chars[8..]);
                return PathBuf::from(OsString::from_wide(&stripped));
            }
            // Plain verbatim: `\\?\C:\...` → `C:\...`
            return PathBuf::from(OsString::from_wide(&chars[4..]));
        }
        path
    }
    #[cfg(not(windows))]
    {
        path
    }
}

/// Compile-time manifest dir (dev builds) — only valid on the machine that built the binary.
fn resource_dir_from_exe() -> Option<PathBuf> {
    // current_exe() returns `\\?\`-prefixed paths on Windows. We strip
    // that here because the result flows into Node.js spawn args, where
    // the verbatim prefix breaks Node's module resolver.
    let exe = strip_verbatim_prefix(std::env::current_exe().ok()?);
    #[cfg(target_os = "macos")]
    {
        // .../EnvoyMesh.app/Contents/MacOS/envoymesh → .../Contents/Resources
        let macos_dir = exe.parent()?;
        let contents = macos_dir.parent()?;
        let resources = contents.join("Resources");
        if resources.is_dir() {
            return Some(resources);
        }
    }
    #[cfg(target_os = "windows")]
    {
        let dir = exe.parent()?;
        let resources = dir.join("resources");
        if resources.is_dir() {
            return Some(resources);
        }
    }
    #[cfg(target_os = "linux")]
    {
        let dir = exe.parent()?;
        let resources = dir.join("resources");
        if resources.is_dir() {
            return Some(resources);
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = exe;
    }
    None
}

fn resolve_resource_dir(app: &tauri::App) -> Option<PathBuf> {
    let dir = app
        .path()
        .resource_dir()
        .ok()
        .or_else(resource_dir_from_exe)?;
    // Strip the `\\?\` verbatim prefix on Windows — Node.js's module
    // resolver can't handle it (EISDIR on lstat 'C:'). See
    // strip_verbatim_prefix docs for details.
    Some(normalize_bundle_content_dir(strip_verbatim_prefix(dir)))
}

/// Tauri's `resource_dir()` is `…/Contents/Resources` on macOS (and the
/// install `resources/` folder on Windows/Linux). Bundled trees from
/// `bundle.resources` entries like `resources/pi/` land one level deeper:
/// `…/Contents/Resources/resources/pi/`. Prefer that nested content root
/// when it holds node/openclaw/pi so ENVOYMESH_* / TAURI_RESOURCE_DIR and
/// OpenClaw heal all resolve the same paths.
fn normalize_bundle_content_dir(resource_dir: PathBuf) -> PathBuf {
    let nested = resource_dir.join("resources");
    let nested_has_bundle = nested.join("node").is_dir()
        || nested.join("openclaw").is_dir()
        || nested.join("pi").is_dir();
    if nested_has_bundle {
        return nested;
    }
    resource_dir
}

fn dev_repo_root_from_manifest() -> Option<PathBuf> {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo = manifest.parent()?.parent()?.parent()?;
    Some(repo.to_path_buf())
}

fn dev_node_entry_from_repo(repo_root: &Path) -> PathBuf {
    repo_root.join("apps/node/dist/src/index.js")
}

fn bundled_node_runtime_candidates(resource_dir: Option<&Path>, repo_root: Option<&Path>) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(dir) = resource_dir {
        #[cfg(windows)]
        {
            paths.push(dir.join("node-runtime/node.exe"));
            paths.push(dir.join("resources/node-runtime/node.exe"));
        }
        #[cfg(not(windows))]
        {
            paths.push(dir.join("node-runtime/node"));
            paths.push(dir.join("resources/node-runtime/node"));
        }
    }
    if let Some(repo) = repo_root {
        #[cfg(windows)]
        paths.push(
            repo.join("apps/tauri/src-tauri/resources/node-runtime/node.exe"),
        );
        #[cfg(not(windows))]
        paths.push(repo.join("apps/tauri/src-tauri/resources/node-runtime/node"));
    }
    paths
}

fn resolve_bundled_node_exe(resource_dir: Option<&Path>) -> Option<PathBuf> {
    let repo = dev_repo_root_from_manifest();
    for path in bundled_node_runtime_candidates(resource_dir, repo.as_deref()) {
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

fn resolve_node_exe(resource_dir: Option<&Path>) -> PathBuf {
    if let Ok(from_env) = std::env::var("ENVOYMESH_NODE_EXE") {
        let path = PathBuf::from(from_env.trim());
        if path.is_file() {
            return path;
        }
        warn!("ENVOYMESH_NODE_EXE is set but not a file: {:?}", path);
    }

    if let Some(bundled) = resolve_bundled_node_exe(resource_dir) {
        return bundled;
    }

    PathBuf::from("node")
}

fn node_app_root(node_entry: &Path) -> PathBuf {
    // Bundled layout: resources/node/dist/src/index.js → cwd is resources/node
    if node_entry
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.file_name())
        .is_some_and(|name| name == "dist")
    {
        return node_entry
            .parent()
            .and_then(|src| src.parent())
            .and_then(|dist| dist.parent())
            .map(Path::to_path_buf)
            .unwrap_or_else(|| node_entry.parent().unwrap_or(node_entry).to_path_buf());
    }
    // Legacy flat layout: resources/node/src/index.js → cwd is resources/node
    node_entry
        .parent()
        .and_then(|src| src.parent())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| node_entry.parent().unwrap_or(node_entry).to_path_buf())
}

fn bundled_node_entry(resource_dir: &Path) -> Option<PathBuf> {
    let candidates = [
        resource_dir.join("node/dist/src/index.js"),
        resource_dir.join("resources/node/dist/src/index.js"),
        resource_dir.join("node/src/index.js"),
        resource_dir.join("resources/node/src/index.js"),
    ];
    candidates.into_iter().find(|path| path.is_file())
}

fn resolve_node_entry(resource_dir: Option<&Path>) -> Option<PathBuf> {
    if let Ok(from_env) = std::env::var("ENVOYMESH_NODE_ENTRY") {
        let path = PathBuf::from(from_env.trim());
        if path.is_file() {
            return Some(path);
        }
        warn!("ENVOYMESH_NODE_ENTRY is set but not a file: {:?}", path);
    }

    if let Some(dir) = resource_dir {
        if let Some(bundled) = bundled_node_entry(dir) {
            return Some(bundled);
        }
    }

    if let Some(repo) = dev_repo_root_from_manifest() {
        let dev_entry = dev_node_entry_from_repo(&repo);
        if dev_entry.is_file() {
            return Some(dev_entry);
        }
    }

    None
}

fn bundled_ipfs_candidates(repo_root: Option<&Path>, resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(dir) = resource_dir {
        #[cfg(windows)]
        {
            paths.push(dir.join("resources/kubo/ipfs.exe"));
            paths.push(dir.join("kubo/ipfs.exe"));
        }
        #[cfg(not(windows))]
        {
            paths.push(dir.join("resources/kubo/ipfs"));
            paths.push(dir.join("kubo/ipfs"));
        }
    }
    if let Some(repo) = repo_root {
        // Canonical staging path (fetch-kubo-sidecar.sh + tauri.conf.full.json).
        #[cfg(windows)]
        {
            paths.push(repo.join("apps/tauri/src-tauri/resources/kubo/ipfs.exe"));
            paths.push(repo.join("apps/tauri/resources/kubo/ipfs.exe")); // legacy
        }
        #[cfg(not(windows))]
        {
            paths.push(repo.join("apps/tauri/src-tauri/resources/kubo/ipfs"));
            paths.push(repo.join("apps/tauri/resources/kubo/ipfs")); // legacy
        }
    }
    paths
}

fn resolve_bundled_ipfs_exe(resource_dir: Option<&Path>) -> Option<PathBuf> {
    let repo = dev_repo_root_from_manifest();
    for path in bundled_ipfs_candidates(repo.as_deref(), resource_dir) {
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

/// Install-time probe + self-heal for the OpenClaw bundle's
/// `node_modules/openclaw/` workspace self-reference.
///
/// The bundled tree is shipped with a self-reference created at build
/// time (`scripts/stage-tauri-openclaw-bundle.sh` and the PowerShell twin
/// `scripts/build-desktop.ps1`), but macOS Gatekeeper and Windows SmartScreen
/// / NSIS have been observed to strip or break symlinks/junctions during
/// install. Absolute junctions created at build time also point at the
/// *build machine* path and are dead after install.
///
/// Without a usable `node_modules/openclaw/{package.json,dist}` the home
/// node refuses to start (or dies during OpenClaw boot) and the Social UI
/// stays on "Connecting to EnvoyMesh".
///
/// Probes the staged tree; if the self-ref is missing or not usable, the
/// function re-creates it (symlink when possible, deep-copy fallback).
/// Idempotent — safe to call on every launch.
fn ensure_openclaw_self_ref(resource_dir: &Path) -> HealOutcome {
    let oc_dir = resource_dir.join("openclaw");
    if !oc_dir.is_dir() {
        return HealOutcome::NoBundle;
    }
    let self_ref_dir = oc_dir.join("node_modules").join("openclaw");
    let self_ref_pkg = self_ref_dir.join("package.json");
    let self_ref_dist = self_ref_dir.join("dist");

    // Healthy only when package.json resolves AND dist is a real usable tree.
    // A lone package.json with a broken dist junction used to report Healthy
    // and left the installed app stuck on the connecting splash.
    let dist_usable = self_ref_dist.is_dir()
        && (self_ref_dist.join("entry.js").is_file()
            || self_ref_dist.join("config").join("config.js").is_file());
    if self_ref_pkg.is_file() && dist_usable {
        return HealOutcome::Healthy;
    }

    warn!(
        "OpenClaw node_modules/openclaw self-reference is missing or broken at {:?} (pkg_ok={}, dist_usable={}) — healing",
        self_ref_pkg,
        self_ref_pkg.is_file(),
        dist_usable
    );

    if let Err(e) = std::fs::create_dir_all(&self_ref_dir) {
        warn!(
            "Cannot create {:?} for self-reference heal: {}",
            self_ref_dir, e
        );
        return HealOutcome::HealFailed {
            reason: format!("mkdir {:?}: {e}", self_ref_dir),
        };
    }

    let root_pkg = oc_dir.join("package.json");
    if !root_pkg.is_file() {
        warn!(
            "Cannot heal OpenClaw self-reference — staged tree is missing package.json at {:?}",
            root_pkg
        );
        return HealOutcome::HealFailed {
            reason: format!("staged tree missing package.json at {root_pkg:?}"),
        };
    }

    // Remove broken package.json link/file before recreating.
    if self_ref_pkg.exists() || self_ref_pkg.symlink_metadata().is_ok() {
        let _ = std::fs::remove_file(&self_ref_pkg);
        // Directory junctions / mistaken dirs
        let _ = std::fs::remove_dir_all(&self_ref_pkg);
    }

    #[cfg(unix)]
    let symlink_ok = std::os::unix::fs::symlink("../../package.json", &self_ref_pkg).is_ok();
    #[cfg(windows)]
    let symlink_ok = std::os::windows::fs::symlink_file(
        std::path::Path::new("../../package.json"),
        &self_ref_pkg,
    )
    .is_ok();

    if !symlink_ok {
        if let Err(e) = std::fs::copy(&root_pkg, &self_ref_pkg) {
            warn!(
                "Failed to deep-copy {:?} → {:?}: {} — gateway may refuse to start",
                root_pkg, self_ref_pkg, e
            );
            return HealOutcome::HealFailed {
                reason: format!(
                    "copy {root_pkg:?} → {self_ref_pkg:?}: {e} (symlink failed too)"
                ),
            };
        }
        warn!(
            "OpenClaw self-ref package.json was a deep copy (symlink creation failed — likely missing \
             developer mode / elevation)."
        );
    }

    let root_mjs = oc_dir.join("openclaw.mjs");
    let self_ref_mjs = self_ref_dir.join("openclaw.mjs");
    if root_mjs.is_file() && !self_ref_mjs.is_file() {
        if self_ref_mjs.exists() || self_ref_mjs.symlink_metadata().is_ok() {
            let _ = std::fs::remove_file(&self_ref_mjs);
        }
        #[cfg(unix)]
        let _ = std::os::unix::fs::symlink("../../openclaw.mjs", &self_ref_mjs);
        #[cfg(windows)]
        let _ = std::os::windows::fs::symlink_file(
            std::path::Path::new("../../openclaw.mjs"),
            &self_ref_mjs,
        );
        if !self_ref_mjs.is_file() {
            let _ = std::fs::copy(&root_mjs, &self_ref_mjs);
        }
    }

    // Sibling top-level entries the plugin SDK reads. Always require a usable
    // target — a dangling junction/symlink counts as broken and is replaced.
    for top in ["dist", "extensions", "skills"] {
        let root_top = oc_dir.join(top);
        let self_ref_top = self_ref_dir.join(top);
        if !root_top.is_dir() {
            continue;
        }
        let top_usable = if top == "dist" {
            self_ref_top.is_dir()
                && (self_ref_top.join("entry.js").is_file()
                    || self_ref_top.join("config").join("config.js").is_file())
        } else {
            self_ref_top.is_dir()
        };
        if top_usable {
            continue;
        }
        // Remove broken reparse points / empty dirs before recreate.
        if self_ref_top.exists() || self_ref_top.symlink_metadata().is_ok() {
            let _ = std::fs::remove_dir_all(&self_ref_top);
            let _ = std::fs::remove_file(&self_ref_top);
        }
        #[cfg(unix)]
        {
            let _ = std::os::unix::fs::symlink(format!("../../{top}"), &self_ref_top);
        }
        #[cfg(windows)]
        {
            // Prefer an absolute junction target (relative /J is cwd-relative
            // and breaks after install). Fall back to symlink_dir, then copy.
            let abs = root_top.canonicalize().unwrap_or_else(|_| root_top.clone());
            let junction_ok = std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(&self_ref_top)
                .arg(&abs)
                .status()
                .map(|s| s.success())
                .unwrap_or(false);
            if !junction_ok {
                let _ = std::os::windows::fs::symlink_dir(&abs, &self_ref_top);
            }
        }
        let usable_after_link = if top == "dist" {
            self_ref_top.is_dir()
                && (self_ref_top.join("entry.js").is_file()
                    || self_ref_top.join("config").join("config.js").is_file())
        } else {
            self_ref_top.is_dir()
        };
        if !usable_after_link {
            if let Err(e) = deep_copy_dir(&root_top, &self_ref_top) {
                warn!(
                    "Failed to deep-copy {:?} → {:?}: {}",
                    root_top, self_ref_top, e
                );
            }
        }
    }

    let dist_ok = self_ref_dir.join("dist").is_dir()
        && (self_ref_dir.join("dist/entry.js").is_file()
            || self_ref_dir.join("dist/config/config.js").is_file());
    if !self_ref_pkg.is_file() || !dist_ok {
        return HealOutcome::HealFailed {
            reason: format!(
                "after heal: pkg_ok={} dist_ok={} at {:?}",
                self_ref_pkg.is_file(),
                dist_ok,
                self_ref_dir
            ),
        };
    }

    info!(
        "Restored node_modules/openclaw/ self-reference at {:?}",
        self_ref_dir
    );
    HealOutcome::Healed
}

/// Reported by the Tauri `get_openclaw_heal_status` command. Serializes
/// directly to JSON for the Social UI. The shape is intentionally stable —
/// callers (UI diagnostics, doctor scripts, future agent tools) can rely on
/// the `state` discriminator across versions.
#[derive(Debug, Clone, serde::Serialize)]
pub struct OpenclawHealReport {
    /// "healthy"        — self-ref was already in place when the probe ran.
    /// "healed"         — probe detected broken/missing self-ref and
    ///                     successfully re-created it at launch.
    /// "heal-failed"    — probe detected a broken self-ref but the heal did
    ///                     not complete (e.g. permission denied, see logs).
    /// "no-bundle"      — no `openclaw/` tree in resources at all
    ///                     (sidecar-only build).
    pub state: &'static str,
    /// Absolute path to the staged OpenClaw tree, or None when no-bundle.
    pub openclaw_dir: Option<String>,
    /// Absolute path to the self-reference `package.json`, if relevant.
    pub self_ref_pkg: Option<String>,
    /// Human-readable summary suitable for log/UI display.
    pub message: String,
}

/// Outcome of `ensure_openclaw_self_ref`. Used both internally and to
/// produce the serializable `OpenclawHealReport` for the UI command.
#[derive(Debug, Clone)]
enum HealOutcome {
    NoBundle,
    Healthy,
    Healed,
    HealFailed { reason: String },
}

impl From<HealOutcome> for OpenclawHealReport {
    fn from(o: HealOutcome) -> Self {
        match o {
            HealOutcome::NoBundle => OpenclawHealReport {
                state: "no-bundle",
                openclaw_dir: None,
                self_ref_pkg: None,
                message: "No bundled OpenClaw tree in resources/ (sidecar-only build)."
                    .to_string(),
            },
            HealOutcome::Healthy => OpenclawHealReport {
                state: "healthy",
                openclaw_dir: None,
                self_ref_pkg: None,
                message: "OpenClaw self-reference is healthy.".to_string(),
            },
            HealOutcome::Healed => OpenclawHealReport {
                state: "healed",
                openclaw_dir: None,
                self_ref_pkg: None,
                message: "OpenClaw self-reference was repaired at launch.".to_string(),
            },
            HealOutcome::HealFailed { reason } => OpenclawHealReport {
                state: "heal-failed",
                openclaw_dir: None,
                self_ref_pkg: None,
                message: format!("OpenClaw self-reference is broken and could not be healed: {reason}"),
            },
        }
    }
}

/// Recursive deep copy of a directory. Used as a fallback when symlink
/// creation fails on Windows (unprivileged, no Developer Mode). Best-effort
/// — errors are surfaced to the caller for logging.
fn deep_copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            deep_copy_dir(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

fn is_port_in_use(port: u16) -> bool {
    std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_err()
}

#[cfg(unix)]
const NODE_SIDECAR_PORTS: [u16; 3] = [3030, 3031, 3032];

/// What the node records about itself in `<home>/node.json`
/// (`packages/node-core/src/node-registry.ts`).
///
/// Read for exactly one reason: before this app kills a process holding a node
/// port — or believes a `/health` answer — it has to know whether that process is
/// *its own* sidecar. Every EnvoyMesh-family product serves the same `/health` body
/// and uses the same default ports, so with a second product installed on the same
/// machine "something is listening on 3030" and "my node is alive" are different
/// questions, and the code below used to treat them as one.
#[derive(serde::Deserialize)]
struct NodeSidecarDescriptor {
    pid: u32,
    #[serde(default)]
    app: Option<String>,
    #[serde(default)]
    port: Option<u16>,
    #[serde(rename = "ownerId", default)]
    owner_id: Option<String>,
    #[serde(rename = "managedBy", default)]
    managed_by: Option<String>,
    #[serde(default)]
    version: Option<String>,
}

fn is_pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    #[cfg(unix)]
    {
        // Signal 0: existence check without delivering a signal.
        let status = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        matches!(status, Ok(s) if s.success())
    }
    #[cfg(windows)]
    {
        // Best-effort: OpenProcess fails when the pid is gone.
        let output = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .output();
        match output {
            Ok(out) => {
                let text = String::from_utf8_lossy(&out.stdout);
                text.contains(&pid.to_string())
            }
            Err(_) => false,
        }
    }
}

/// Attach when another family app already owns this home and `/health` matches identity.
///
/// Mirrors `resolveRunningNode` → `status === "running"` on the TypeScript side: live claim,
/// published endpoint, and a verified health body. Callers must **not** spawn (or kill ports)
/// when this returns `Some`.
fn try_attach_existing_home_node(profile_dir: &Path) -> Option<AttachedHomeNode> {
    let desc = read_node_sidecar_descriptor(profile_dir)?;
    if !is_pid_alive(desc.pid) {
        return None;
    }
    let port = desc.port.unwrap_or(NODE_LIVENESS_PORT);
    if !probe_home_node_liveness(
        port,
        NODE_LIVENESS_PROBE_TIMEOUT,
        desc.owner_id.as_deref(),
    ) {
        return None;
    }
    Some(AttachedHomeNode {
        app: desc
            .app
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| "another EnvoyMesh app".to_string()),
        pid: desc.pid,
        port,
        owner_id: desc.owner_id,
    })
}

/// `<home>/profile` → `<home>`; anything else is its own home. Mirrors
/// `homeForProfileDir` in `@envoymesh/node-core` so both sides agree.
fn home_dir_for_profile(profile_dir: &Path) -> PathBuf {
    match profile_dir.file_name().and_then(|name| name.to_str()) {
        Some("profile") => profile_dir
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| profile_dir.to_path_buf()),
        _ => profile_dir.to_path_buf(),
    }
}

/// The descriptor this profile's node wrote, if it is readable.
fn read_node_sidecar_descriptor(profile_dir: &Path) -> Option<NodeSidecarDescriptor> {
    let file = home_dir_for_profile(profile_dir).join("node.json");
    let raw = std::fs::read_to_string(file).ok()?;
    serde_json::from_str(&raw).ok()
}

const NODE_SERVICE_LABEL: &str = "mesh.envoy.node";

fn service_respawn_flag(profile_dir: &Path) -> PathBuf {
    home_dir_for_profile(profile_dir).join("background-service.respawn")
}

fn service_starting_flag(profile_dir: &Path) -> PathBuf {
    home_dir_for_profile(profile_dir).join("background-service.starting")
}

fn service_launcher_spec(profile_dir: &Path) -> PathBuf {
    home_dir_for_profile(profile_dir).join("background-service-launch.json")
}

fn background_service_unit_path() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME")?;
        return Some(
            PathBuf::from(home)
                .join("Library/LaunchAgents")
                .join(format!("{NODE_SERVICE_LABEL}.plist")),
        );
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let home = std::env::var_os("HOME")?;
        return Some(
            PathBuf::from(home)
                .join(".config/systemd/user")
                .join(format!("{NODE_SERVICE_LABEL}.service")),
        );
    }
    #[cfg(windows)]
    {
        let home = std::env::var_os("USERPROFILE")?;
        return Some(
            PathBuf::from(home)
                .join("AppData/Local/EnvoyMesh")
                .join(format!("{NODE_SERVICE_LABEL}.xml")),
        );
    }
    #[allow(unreachable_code)]
    None
}

fn background_service_unit_installed() -> bool {
    background_service_unit_path()
        .map(|path| path.is_file())
        .unwrap_or(false)
}

/// Quit stops an app-spawned child. A pid the background service owns stays up.
fn should_stop_app_child(
    child_pid: u32,
    managed_by: Option<&str>,
    endpoint_pid: Option<u32>,
) -> bool {
    !(managed_by == Some("service") && endpoint_pid == Some(child_pid))
}

#[cfg(target_os = "macos")]
fn current_uid() -> Option<u32> {
    let output = Command::new("id").arg("-u").output().ok()?;
    String::from_utf8(output.stdout).ok()?.trim().parse().ok()
}

fn restart_background_service() {
    #[cfg(target_os = "macos")]
    if let Some(uid) = current_uid() {
        let target = format!("gui/{uid}/{NODE_SERVICE_LABEL}");
        let domain = format!("gui/{uid}");
        // bootout + bootstrap so a job stopped for OTA (or never loaded) comes back.
        let _ = Command::new("launchctl").args(["bootout", &target]).status();
        if let Some(path) = background_service_unit_path() {
            let _ = Command::new("launchctl")
                .args(["bootstrap", &domain, &path.to_string_lossy()])
                .status();
        }
        let _ = Command::new("launchctl")
            .args(["kickstart", "-k", &target])
            .status();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = Command::new("systemctl")
            .args(["--user", "daemon-reload"])
            .status();
        let _ = Command::new("systemctl")
            .args(["--user", "restart", &format!("{NODE_SERVICE_LABEL}.service")])
            .status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("schtasks")
            .args(["/End", "/TN", NODE_SERVICE_LABEL])
            .status();
        let _ = Command::new("schtasks")
            .args(["/Run", "/TN", NODE_SERVICE_LABEL])
            .status();
    }
}

/// Point an installed service at this app's node when an upgrade moved the bundle.
/// Returns true when the supervisor was asked to restart.
fn refresh_service_launcher(profile_dir: &Path, config: &NodeSpawnConfig) -> bool {
    if !background_service_unit_installed() {
        return false;
    }
    let spec_path = service_launcher_spec(profile_dir);
    let Ok(raw) = std::fs::read_to_string(&spec_path) else {
        return false;
    };
    let Ok(mut spec) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return false;
    };
    let entry = spec.get("entry").and_then(|v| v.as_str()).unwrap_or("");
    let exec = spec.get("execPath").and_then(|v| v.as_str()).unwrap_or("");
    let new_entry = config.node_path.to_string_lossy().to_string();
    let new_exec = config.node_exe.to_string_lossy().to_string();
    let env_dir = spec
        .pointer("/env/TAURI_RESOURCE_DIR")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let new_dir = config
        .tauri_resource_dir
        .as_ref()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default();
    // An in-place upgrade replaces EnvoyMesh.app but keeps the same paths.
    // The running service is still the previous process until it is restarted.
    let running_version = read_node_sidecar_descriptor(profile_dir)
        .and_then(|desc| desc.version)
        .unwrap_or_default();
    let app_version = env!("CARGO_PKG_VERSION");
    let version_changed = !running_version.is_empty() && running_version != app_version;
    if !version_changed
        && entry == new_entry
        && exec == new_exec
        && (new_dir.is_empty() || env_dir == new_dir)
    {
        return false;
    }
    spec["entry"] = serde_json::Value::String(new_entry);
    spec["execPath"] = serde_json::Value::String(new_exec.clone());
    spec["cwd"] = serde_json::Value::String(config.node_cwd.to_string_lossy().to_string());
    if let Some(env) = spec.get_mut("env").and_then(|value| value.as_object_mut()) {
        if !new_dir.is_empty() {
            env.insert(
                "TAURI_RESOURCE_DIR".to_string(),
                serde_json::Value::String(new_dir),
            );
        }
        env.insert(
            "ENVOYMESH_NODE_BUNDLE_DIR".to_string(),
            serde_json::Value::String(config.node_cwd.to_string_lossy().to_string()),
        );
        if config.node_exe.is_file() {
            env.insert(
                "ENVOYMESH_NODE_EXE".to_string(),
                serde_json::Value::String(new_exec),
            );
        }
    }
    let Ok(pretty) = serde_json::to_string_pretty(&spec) else {
        return false;
    };
    if std::fs::write(&spec_path, format!("{pretty}\n")).is_err() {
        return false;
    }
    info!("Background service launcher points at this app now; restarting it");
    restart_background_service();
    true
}

fn wait_for_attached_home_node(profile_dir: &Path, timeout: Duration) -> Option<AttachedHomeNode> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if let Some(existing) = try_attach_existing_home_node(profile_dir) {
            return Some(existing);
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    None
}

/// English Task Scheduler `/FO LIST` line `Status: Running` (same rule as
/// `parseNodeServiceStatus` in apps/node). Translated status words → false.
fn windows_schtasks_list_is_running(stdout: &str) -> bool {
    for line in stdout.lines() {
        let lower = line.trim().to_ascii_lowercase();
        let Some(rest) = lower.strip_prefix("status:") else {
            continue;
        };
        return rest.trim() == "running";
    }
    false
}

fn service_job_running() -> bool {
    #[cfg(target_os = "macos")]
    {
        let Some(uid) = current_uid() else {
            return false;
        };
        let target = format!("gui/{uid}/{NODE_SERVICE_LABEL}");
        let Ok(output) = Command::new("launchctl").args(["print", &target]).output() else {
            return false;
        };
        return String::from_utf8_lossy(&output.stdout).contains("state = running");
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let unit = format!("{NODE_SERVICE_LABEL}.service");
        return Command::new("systemctl")
            .args(["--user", "is-active", "--quiet", &unit])
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
    }
    #[cfg(windows)]
    {
        let Ok(output) = Command::new("schtasks")
            .args(["/Query", "/TN", NODE_SERVICE_LABEL, "/FO", "LIST"])
            .output()
        else {
            return false;
        };
        if !output.status.success() {
            return false;
        }
        return windows_schtasks_list_is_running(&String::from_utf8_lossy(&output.stdout));
    }
    #[cfg(not(any(target_os = "macos", unix, windows)))]
    {
        false
    }
}

/// Unload / stop the login job without deleting the unit file (OTA / restart).
fn stop_background_service_job() {
    #[cfg(target_os = "macos")]
    if let Some(uid) = current_uid() {
        let target = format!("gui/{uid}/{NODE_SERVICE_LABEL}");
        let _ = Command::new("launchctl").args(["bootout", &target]).status();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = Command::new("systemctl")
            .args(["--user", "stop", &format!("{NODE_SERVICE_LABEL}.service")])
            .status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("schtasks")
            .args(["/End", "/TN", NODE_SERVICE_LABEL])
            .status();
    }
}

/// After the app-owned node exits so a service can take the home: wait for that
/// service, and start an app-owned node if it never answers.
fn finish_service_handoff(state: &NodeProcessState) -> bool {
    let flag = service_starting_flag(&state.config.profile_dir);
    if !flag.is_file() {
        return false;
    }
    if let Some(existing) = try_attach_existing_home_node(&state.config.profile_dir) {
        let _ = std::fs::remove_file(&flag);
        let pid = existing.pid;
        if let Ok(mut attached) = state.attached.lock() {
            *attached = Some(existing);
        }
        if let Ok(mut guardian) = state.guardian.lock() {
            guardian.suppress_respawn = true;
        }
        info!("Attached to the background service (pid {pid})");
        return true;
    }
    let age = std::fs::metadata(&flag)
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|modified| modified.elapsed().ok())
        .unwrap_or(Duration::ZERO);
    if age < Duration::from_secs(45) || service_job_running() {
        return true;
    }
    let _ = std::fs::remove_file(&flag);
    warn!("Background service did not start; running the home node with the app");
    match spawn_node_process(&state.config) {
        Ok(child) => {
            if let Ok(mut slot) = state.child.lock() {
                *slot = Some(child);
            }
            if let Ok(mut guardian) = state.guardian.lock() {
                guardian.suppress_respawn = false;
                guardian.child_started_at = Some(Instant::now());
                guardian.consecutive_liveness_failures = 0;
            }
            if let Ok(mut attached) = state.attached.lock() {
                *attached = None;
            }
        }
        Err(err) => error!("Could not start the home node: {err}"),
    }
    true
}

/// Kill a listener on the node ports — **only if this profile's `node.json` names
/// that pid**.
///
/// It used to kill whatever held 3030/3031/3032, by pid from `lsof`, with no check
/// of whose process it was. That is fine while EnvoyMesh is the only product on the
/// machine and dangerous the moment it is not: launching the desktop app would kill
/// a second product's host, and any process on those ports could be mistaken for the
/// node this app supervises. Ownership is knowable — the node publishes its pid — so
/// it is checked, and an unprovable case is left alone rather than guessed at.
///
/// Unix-only: uses `lsof` to discover listeners. On Windows the sidecar port
/// cleanup is skipped (the Windows port-binding model is different and we
/// don't have a reliable cross-platform equivalent in the build script).
#[cfg(unix)]
fn kill_stale_listeners_on_node_ports(profile_dir: &Path) {
    let Some(desc) = read_node_sidecar_descriptor(profile_dir) else {
        if NODE_SIDECAR_PORTS.iter().any(|port| is_port_in_use(*port)) {
            info!(
                "Node ports are in use but this profile has no node.json — leaving the listeners alone \
                 (they are not known to be this app's sidecar)"
            );
        }
        return;
    };
    if desc.managed_by.as_deref() == Some("service") && is_pid_alive(desc.pid) {
        info!(
            "node.json belongs to the background service (pid {}); leaving it running",
            desc.pid
        );
        return;
    }
    let owned_pid = desc.pid;

    #[cfg(unix)]
    {
        for pass in 0..2 {
            let signal = if pass == 0 { "-TERM" } else { "-KILL" };
            for port in NODE_SIDECAR_PORTS {
                if !is_port_in_use(port) {
                    continue;
                }
                let Ok(output) = Command::new("lsof")
                    .args(["-ti", &format!(":{}", port)])
                    .output()
                else {
                    continue;
                };
                let pids = String::from_utf8_lossy(&output.stdout);
                for pid_str in pids.lines() {
                    let Ok(pid) = pid_str.trim().parse::<u32>() else {
                        continue;
                    };
                    if pid != owned_pid {
                        info!(
                            "Port {} is held by pid {} — not this app's node (pid {}); leaving it alone",
                            port, pid, owned_pid
                        );
                        continue;
                    }
                    warn!(
                        "{} stale listener on port {} (pid {}, from node.json)",
                        if pass == 0 { "Terminating" } else { "Force-killing" },
                        port,
                        pid
                    );
                    let _ = Command::new("kill").args([signal, &pid.to_string()]).status();
                }
            }
            std::thread::sleep(Duration::from_millis(if pass == 0 { 400 } else { 200 }));
        }
    }
}

fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if is_port_in_use(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

fn stop_node_child(child_slot: &mut Option<Child>) {
    if let Some(mut child) = child_slot.take() {
        #[cfg(unix)]
        let pid = child.id();
        #[cfg(unix)]
        {
            let _ = Command::new("kill")
                .args(["-TERM", &format!("-{pid}")])
                .status();
        }
        #[cfg(not(unix))]
        {
            let _ = child.kill();
        }
        let _ = child.wait();
    }
}

fn stop_node_from_app(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<NodeProcessState>() {
        let desc = read_node_sidecar_descriptor(&state.config.profile_dir);
        let managed_by = desc.as_ref().and_then(|item| item.managed_by.as_deref());
        let endpoint_pid = desc.as_ref().map(|item| item.pid);
        if let Ok(mut guardian) = state.guardian.lock() {
            guardian.suppress_respawn = true;
        }
        if let Ok(mut child_guard) = state.child.lock() {
            match child_guard.as_ref().map(|child| child.id()) {
                Some(pid) if !should_stop_app_child(pid, managed_by, endpoint_pid) => {
                    info!("Leaving the background service running (pid {pid})");
                }
                Some(_) => {
                    stop_node_child(&mut *child_guard);
                    info!("Node process stopped");
                }
                None if managed_by == Some("service") || background_service_unit_installed() => {
                    info!("Window closing; the background service keeps the home node running");
                }
                None => {}
            }
        }
    }
}

/// Decide whether Tauri should auto-respawn a home-node child that exited.
/// Only critical supervisor exits (`process.exit(2)`) are eligible; clean
/// shutdowns and intentional stops are ignored. Rate-limited to 3/hour.
fn should_auto_respawn_node(
    exit_code: Option<i32>,
    suppress_respawn: bool,
    recent_respawn_at: &[Instant],
    now: Instant,
    max_per_hour: usize,
) -> bool {
    if suppress_respawn {
        return false;
    }
    if exit_code != Some(NODE_SUPERVISOR_EXIT_CODE) {
        return false;
    }
    let window = Duration::from_secs(3600);
    let recent = recent_respawn_at
        .iter()
        .filter(|t| now.saturating_duration_since(**t) < window)
        .count();
    recent < max_per_hour
}

fn guardian_backoff_delay(recent_in_window: usize) -> Duration {
    // 5s, 10s, 20s… capped at 2 minutes — avoids thrash if the node exits(2) immediately.
    let exp = recent_in_window.min(6) as u32;
    Duration::from_secs(5u64.saturating_mul(2u64.saturating_pow(exp))).min(Duration::from_secs(120))
}

/// Does a `/health` response belong to the node this app supervises?
///
/// Split out of [`probe_home_node_liveness`] so the rule can be tested without a
/// socket. Getting it wrong in either direction is expensive: a false "alive" leaves
/// a wedged node unsupervised, a false "dead" respawns a healthy one.
fn health_body_matches_identity(text: &str, expected_owner_id: Option<&str>) -> bool {
    if !text.contains("200") || !text.contains("\"ok\":true") {
        return false;
    }
    match expected_owner_id {
        Some(expected) => text.contains(&format!("\"ownerId\":\"{expected}\"")),
        None => true,
    }
}

/// Probe `GET /health` on the home-node Social WS HTTP server.
/// Returns false on connect/read timeout, non-OK body, or a reply from a node that
/// is not *this* one — including the alive-but-wedged case where the port LISTENs
/// but the event loop never answers.
///
/// The identity check is the point: every EnvoyMesh-family product answers `/health`
/// with the same `{"ok":true,"service":"envoymesh-home-ws",…}` body, so a second
/// product holding 3030 used to satisfy this probe while the supervised node was
/// wedged — the guardian then never respawned, and the UI simply did not work. When
/// the profile's `node.json` names an owner, the body must name the same one.
fn probe_home_node_liveness(port: u16, timeout: Duration, expected_owner_id: Option<&str>) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = match TcpStream::connect_timeout(&addr, timeout) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));
    let req = format!(
        "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    // 512 bytes used to be enough for the body; identity is appended at the end, so
    // a truncated read would silently look like a mismatch.
    let mut buf = [0u8; 2048];
    match stream.read(&mut buf) {
        Ok(n) if n > 0 => {
            let text = String::from_utf8_lossy(&buf[..n]);
            health_body_matches_identity(&text, expected_owner_id)
        }
        _ => false,
    }
}

fn guardian_rate_limit_allows(recent_respawn_at: &[Instant], now: Instant) -> (bool, usize) {
    let recent: Vec<Instant> = recent_respawn_at
        .iter()
        .copied()
        .filter(|t| now.saturating_duration_since(*t) < Duration::from_secs(3600))
        .collect();
    (recent.len() < NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR, recent.len())
}

fn try_guardian_respawn(state: &NodeProcessState, reason: &str) {
    let (suppress, recent_count, allow) = {
        let Ok(guardian) = state.guardian.lock() else {
            return;
        };
        let now = Instant::now();
        let (under_limit, recent) =
            guardian_rate_limit_allows(&guardian.recent_respawn_at, now);
        (
            guardian.suppress_respawn,
            recent,
            !guardian.suppress_respawn && under_limit,
        )
    };

    if !allow {
        if suppress {
            info!("Home-node guardian: respawn skipped ({reason}) — suppressed");
        } else {
            error!(
                "Home-node guardian: respawn skipped ({reason}) — rate limit ({}/hour)",
                NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR
            );
        }
        return;
    }

    let delay = guardian_backoff_delay(recent_count);
    warn!(
        "Home-node guardian: {} — respawning in {:?}",
        reason, delay
    );
    std::thread::sleep(delay);

    {
        let Ok(guardian) = state.guardian.lock() else {
            return;
        };
        if guardian.suppress_respawn {
            info!("Home-node guardian: respawn cancelled (suppress set during backoff)");
            return;
        }
    }

    {
        let Ok(child_guard) = state.child.lock() else {
            return;
        };
        if child_guard.is_some() {
            info!("Home-node guardian: child already present after backoff — skip spawn");
            return;
        }
    }

    match spawn_node_process(&state.config) {
        Ok(child) => {
            if let Ok(mut guardian) = state.guardian.lock() {
                let now = Instant::now();
                guardian
                    .recent_respawn_at
                    .retain(|t| now.saturating_duration_since(*t) < Duration::from_secs(3600));
                guardian.recent_respawn_at.push(now);
                guardian.consecutive_liveness_failures = 0;
                guardian.child_started_at = Some(now);
                guardian.last_liveness_probe_at = None;
            }
            if let Ok(mut child_guard) = state.child.lock() {
                if child_guard.is_none() {
                    *child_guard = Some(child);
                    info!("Home-node guardian: respawned home node ({reason})");
                } else {
                    let mut extra = Some(child);
                    stop_node_child(&mut extra);
                    info!("Home-node guardian: discarded duplicate spawn (manual restart won)");
                }
            }
        }
        Err(e) => {
            error!("Home-node guardian: respawn failed: {}", e);
        }
    }
}

fn start_node_guardian(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        info!(
            "Home-node guardian started (exit {} + GET :{}/health liveness, max {}/hour)",
            NODE_SUPERVISOR_EXIT_CODE, NODE_LIVENESS_PORT, NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR
        );
        loop {
            std::thread::sleep(NODE_GUARDIAN_POLL_INTERVAL);
            let Some(state) = app.try_state::<NodeProcessState>() else {
                break;
            };

            // --- Path A: process exited ---
            let exited = {
                let Ok(mut child_guard) = state.child.lock() else {
                    continue;
                };
                match child_guard.as_mut() {
                    Some(child) => match child.try_wait() {
                        Ok(Some(status)) => {
                            let code = status.code();
                            let _ = child_guard.take();
                            Some(code)
                        }
                        Ok(None) => None,
                        Err(e) => {
                            warn!("Home-node guardian: try_wait failed: {}", e);
                            let _ = child_guard.take();
                            None
                        }
                    },
                    None => None,
                }
            };

            if let Some(exit_code) = exited {
                let allow_exit_respawn = {
                    let Ok(guardian) = state.guardian.lock() else {
                        continue;
                    };
                    should_auto_respawn_node(
                        exit_code,
                        guardian.suppress_respawn,
                        &guardian.recent_respawn_at,
                        Instant::now(),
                        NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR,
                    )
                };
                if allow_exit_respawn {
                    try_guardian_respawn(
                        &state,
                        &format!("supervisor exit code {NODE_SUPERVISOR_EXIT_CODE}"),
                    );
                } else if exit_code == Some(NODE_DAMAGED_HOME_EXIT_CODE) {
                    error!(
                        "Home-node exited with damaged-profile code {} — not restarting (fix or move the profile folder)",
                        NODE_DAMAGED_HOME_EXIT_CODE
                    );
                } else if exit_code == Some(NODE_HOME_IN_USE_EXIT_CODE) {
                    // Race: another product claimed the home while we were spawning.
                    if let Some(existing) = try_attach_existing_home_node(&state.config.profile_dir)
                    {
                        info!(
                            "Home was already in use — attaching to {} (pid {})",
                            existing.app, existing.pid
                        );
                        if let Ok(mut attached) = state.attached.lock() {
                            *attached = Some(existing);
                        }
                        if let Ok(mut guardian) = state.guardian.lock() {
                            guardian.suppress_respawn = true;
                        }
                    } else {
                        warn!(
                            "Home-node exited (code {}) — home in use but attach probe failed",
                            NODE_HOME_IN_USE_EXIT_CODE
                        );
                    }
                } else if exit_code == Some(NODE_SUPERVISOR_EXIT_CODE) {
                    error!(
                        "Home-node exited with supervisor code {} — not restarting (suppress or rate limit)",
                        NODE_SUPERVISOR_EXIT_CODE
                    );
                } else if finish_service_handoff(&state) {
                    // Still starting, attached to the service, or running with the app again.
                } else {
                    warn!(
                        "Home-node exited (code {:?}) — not auto-respawning",
                        exit_code
                    );
                }
                continue;
            }

            // --- Path B: alive but wedged (port up, /health never answers) ---
            let child_alive = state
                .child
                .lock()
                .map(|g| g.is_some())
                .unwrap_or(false);
            if !child_alive {
                if finish_service_handoff(&state) {
                    continue;
                }
                let profile = &state.config.profile_dir;
                let flag = service_respawn_flag(profile);
                if flag.is_file() && try_attach_existing_home_node(profile).is_none() {
                    match spawn_node_process(&state.config) {
                        Ok(child) => {
                            let _ = std::fs::remove_file(&flag);
                            if let Ok(mut slot) = state.child.lock() {
                                if slot.is_none() {
                                    *slot = Some(child);
                                } else {
                                    let mut extra = Some(child);
                                    stop_node_child(&mut extra);
                                }
                            }
                            if let Ok(mut guardian) = state.guardian.lock() {
                                guardian.suppress_respawn = false;
                                guardian.child_started_at = Some(Instant::now());
                                guardian.consecutive_liveness_failures = 0;
                            }
                            if let Ok(mut attached) = state.attached.lock() {
                                *attached = None;
                            }
                            info!("Home node is running with the app again");
                        }
                        Err(err) => {
                            error!(
                                "Could not start the home node after the background service stopped: {err}"
                            );
                        }
                    }
                    continue;
                }
                if background_service_unit_installed() {
                    if let Some(existing) = try_attach_existing_home_node(profile) {
                        let _ = std::fs::remove_file(service_starting_flag(profile));
                        if let Ok(mut attached) = state.attached.lock() {
                            *attached = Some(existing);
                        }
                        if let Ok(mut guardian) = state.guardian.lock() {
                            guardian.suppress_respawn = true;
                        }
                    }
                }
                continue;
            }

            let should_probe = {
                let Ok(mut guardian) = state.guardian.lock() else {
                    continue;
                };
                if guardian.suppress_respawn {
                    continue;
                }
                let now = Instant::now();
                if let Some(started) = guardian.child_started_at {
                    if now.saturating_duration_since(started) < NODE_LIVENESS_STARTUP_GRACE {
                        continue;
                    }
                } else {
                    // First observe of a running child (initial spawn).
                    guardian.child_started_at = Some(now);
                    continue;
                }
                match guardian.last_liveness_probe_at {
                    Some(last)
                        if now.saturating_duration_since(last) < NODE_LIVENESS_PROBE_INTERVAL =>
                    {
                        false
                    }
                    _ => {
                        guardian.last_liveness_probe_at = Some(now);
                        true
                    }
                }
            };
            if !should_probe {
                continue;
            }

            let expected_owner_id =
                read_node_sidecar_descriptor(&state.config.profile_dir).and_then(|d| d.owner_id);
            let ok = probe_home_node_liveness(
                NODE_LIVENESS_PORT,
                NODE_LIVENESS_PROBE_TIMEOUT,
                expected_owner_id.as_deref(),
            );
            let failures = {
                let Ok(mut guardian) = state.guardian.lock() else {
                    continue;
                };
                if ok {
                    guardian.consecutive_liveness_failures = 0;
                    0
                } else {
                    guardian.consecutive_liveness_failures =
                        guardian.consecutive_liveness_failures.saturating_add(1);
                    guardian.consecutive_liveness_failures
                }
            };

            if failures > 0 {
                warn!(
                    "Home-node liveness probe failed ({}/{}) on http://127.0.0.1:{}/health",
                    failures, NODE_LIVENESS_FAILS_BEFORE_KILL, NODE_LIVENESS_PORT
                );
            }
            if failures < NODE_LIVENESS_FAILS_BEFORE_KILL {
                continue;
            }

            error!(
                "Home-node unresponsive ({} failed /health probes) — killing wedged child for respawn",
                failures
            );
            {
                let Ok(mut child_guard) = state.child.lock() else {
                    continue;
                };
                stop_node_child(&mut child_guard);
            }
            if let Ok(mut guardian) = state.guardian.lock() {
                guardian.consecutive_liveness_failures = 0;
                guardian.child_started_at = None;
            }
            try_guardian_respawn(&state, "liveness probe timeout (alive but wedged)");
        }
    });
}


// ─── the shared EnvoyMesh home (mirrors @envoymesh/node-core) ───────────────────

/// The conventional root for this OS.
///
/// **Mirrors `defaultHomeDir` in `@envoymesh/node-core`.** It has to: the node CLI and
/// this app must resolve the *same* directory or one machine holds two identities
/// depending on how EnvoyMesh was started, which is the bug this replaced —
/// `app_data_dir.join("profile")` here against `profileDirIn(resolveHomeDir())` there.
/// `LOCALAPPDATA`, not `APPDATA`, on Windows: the root holds the owner private key and
/// roaming syncs it off the machine.
fn default_home_dir(platform: &str, env: &std::collections::HashMap<String, String>, home: &Path) -> PathBuf {
    let env_path = |key: &str| -> Option<PathBuf> {
        env.get(key)
            .map(|v| v.trim())
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
    };
    match platform {
        "windows" => {
            let base = env_path("LOCALAPPDATA").unwrap_or_else(|| home.join("AppData").join("Local"));
            base.join("EnvoyMesh")
        }
        "macos" => home.join("Library").join("Application Support").join("EnvoyMesh"),
        _ => env_path("XDG_DATA_HOME")
            .unwrap_or_else(|| home.join(".local").join("share"))
            .join("EnvoyMesh"),
    }
}

/// Does this directory already hold an EnvoyMesh home? (Same three markers the node uses.)
fn looks_like_home(dir: &Path) -> bool {
    dir.join("envoymesh.json").exists() || dir.join("profile").is_dir() || dir.join("profile.json").is_file()
}

/// Where this app's profile lives, resolved the way the node resolves it.
///
/// `ENVOYMESH_HOME` wins, then an existing home at the per-OS default, then the legacy
/// `~/.envoymesh`, then the default. Two desktop-specific additions on top of the node's
/// rule, because the desktop app has been shipping since before the shared root existed:
///
///   * an existing **`app_data_dir/profile`** (where this app used to keep it) is
///     adopted when the shared root has no home yet — so an installed user keeps their
///     identity instead of appearing to lose their contacts;
///   * the adopted legacy directory is logged, because moving it is the user's call.
fn resolve_shared_home(app_data_dir: &Path) -> (PathBuf, Option<PathBuf>) {
    let env: std::collections::HashMap<String, String> = std::env::vars().collect();
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    resolve_shared_home_with(platform, &env, &home, app_data_dir)
}

/// The resolution rule with everything injected, so it can be tested without touching the
/// process environment — the same shape as the node's `resolveHomeDir({ env, platform,
/// homeDir, exists })`, and for the same reason.
fn resolve_shared_home_with(
    platform: &str,
    env: &std::collections::HashMap<String, String>,
    home: &Path,
    app_data_dir: &Path,
) -> (PathBuf, Option<PathBuf>) {
    if let Some(explicit) = env
        .get("ENVOYMESH_HOME")
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
    {
        return (PathBuf::from(explicit), None);
    }
    let preferred = default_home_dir(platform, env, home);
    if looks_like_home(&preferred) {
        return (preferred, None);
    }
    // The desktop app's own history: adopt it rather than start a second identity.
    let legacy_desktop = app_data_dir.join("profile");
    if legacy_desktop.join("profile.json").is_file() {
        return (app_data_dir.to_path_buf(), Some(legacy_desktop));
    }
    let legacy_shared = home.join(".envoymesh");
    if looks_like_home(&legacy_shared) {
        return (legacy_shared, None);
    }
    (preferred, None)
}

fn spawn_node_process(config: &NodeSpawnConfig) -> Result<Child, String> {
    #[cfg(unix)]
    kill_stale_listeners_on_node_ports(&config.profile_dir);
    if !config.node_path.is_file() {
        return Err(format!(
            "Node entry not found at {:?} (rebuild the app)",
            config.node_path
        ));
    }
    if !config.node_exe.is_file() && config.node_exe != Path::new("node") {
        return Err(format!(
            "Node.js runtime not found at {:?} (rebuild the app)",
            config.node_exe
        ));
    }

    let mut command = Command::new(&config.node_exe);
    command
        .arg(&config.node_path)
        .current_dir(&config.node_cwd)
        .env(
            "ENVOYMESH_PROFILE",
            config
                .profile_dir
                .to_str()
                .unwrap_or("./data/default"),
        )
        .env("ENVOYMESH_IPFS_PATH", &config.ipfs_repo_dir)
        .env("RUST_LOG", "info")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    if let Some(exe) = &config.bundled_ipfs {
        command.env("ENVOYMESH_IPFS_EXE", exe);
    }

    if let Some(ref dir) = config.tauri_resource_dir {
        command.env("TAURI_RESOURCE_DIR", dir);
        let openclaw_dir = dir.join("openclaw");
        if openclaw_dir.is_dir() {
            command.env("ENVOYMESH_OPENCLAW_DIR", &openclaw_dir);
        }
        // Pin Pi CLI + tools dir explicitly — discoverPiCli() also walks
        // TAURI_RESOURCE_DIR, but GUI PATH is stripped and Pi hangs without
        // bundled fd/rg. Mirrors the OpenClaw env shortcut above.
        let pi_cli = dir
            .join("pi")
            .join("node_modules")
            .join("@earendil-works")
            .join("pi-coding-agent")
            .join("dist")
            .join("cli.js");
        let pi_tools = dir.join("pi").join("bin");
        #[cfg(windows)]
        let pi_fd = pi_tools.join("fd.exe");
        #[cfg(not(windows))]
        let pi_fd = pi_tools.join("fd");
        // Fail-closed for GUI: only advertise Pi when fd/rg were staged too.
        // Otherwise discoverPiCli succeeds and Pi hangs on GitHub download.
        if pi_cli.is_file() && pi_fd.is_file() {
            command.env("ENVOYMESH_PI_CLI", &pi_cli);
            command.env("ENVOYMESH_PI_DIR", dir.join("pi"));
            command.env("ENVOYMESH_PI_TOOLS_DIR", &pi_tools);
            info!("Bundled Pi CLI + tools: {:?} (tools {:?})", pi_cli, pi_tools);
        } else if pi_cli.is_file() {
            warn!(
                "Pi CLI present at {:?} but tools missing at {:?} — \
                 Ext Agent Pi disabled (rebuild with fetch-pi-tools)",
                pi_cli, pi_fd
            );
        } else {
            info!("No bundled Pi CLI at {:?} — Ext Agent Pi disabled unless staged", pi_cli);
        }
    }

    let bundled_skills = config.node_cwd.join("skills");
    if bundled_skills.is_dir() {
        command.env("ENVOYMESH_BUNDLED_SKILLS_DIR", &bundled_skills);
    }

    if config.node_exe.is_file() {
        command.env("ENVOYMESH_NODE_EXE", &config.node_exe);
    }

    command.env("ENVOYMESH_NODE_BUNDLE_DIR", &config.node_cwd);
    // Content root next to resources/node — staged envoy-harness trees live here
    // (envoy-harness/, envoy-harness-tui/, …). ACP spawn + TUI resolve use this.
    if let Some(parent) = config.node_cwd.parent() {
        command.env("ENVOY_HARNESS_RESOURCES", parent);
    }
    // Tauri supervises the child: allow sustained event-loop lag to exit(2)
    // so the guardian can respawn a wedged home node overnight.
    command.env("ENVOYMESH_GUARDIAN_EXIT_ON_LAG", "1");

    let log_file = config.node_log_file.clone();
    command.spawn().map_err(|e| {
        format!(
            "Failed to spawn node process ({:?}): {}",
            config.node_exe, e
        )
    }).map(|mut child| {
        pipe_child_logs("node", child.stdout.take(), log_file.clone());
        pipe_child_logs("node", child.stderr.take(), log_file);
        child
    })
}

#[derive(serde::Serialize)]
struct AppLogPathsResponse {
    logs_dir: String,
    node_log: String,
    social_log: String,
}

#[tauri::command]
fn get_app_log_paths(log_paths: State<'_, AppLogPaths>) -> AppLogPathsResponse {
    AppLogPathsResponse {
        logs_dir: log_paths.logs_dir.display().to_string(),
        node_log: log_paths.node_log.display().to_string(),
        social_log: log_paths.social_log.display().to_string(),
    }
}

#[tauri::command]
fn append_social_log(log_paths: State<'_, AppLogPaths>, line: String) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_paths.social_log)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{line}").map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reveal_log_dir(log_paths: State<'_, AppLogPaths>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&log_paths.logs_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&log_paths.logs_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&log_paths.logs_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_home_node_mode(state: State<'_, NodeProcessState>) -> Result<HomeNodeModeStatus, String> {
    if let Ok(attached) = state.attached.lock() {
        if let Some(info) = attached.as_ref() {
            return Ok(HomeNodeModeStatus {
                mode: "attached".to_string(),
                headline: Some(format!(
                    "{} is already using this profile.",
                    info.app
                )),
                detail: Some(
                    "This window is sharing that home node instead of starting a second one."
                        .to_string(),
                ),
                holder_app: Some(info.app.clone()),
                holder_pid: Some(info.pid),
                port: Some(info.port),
            });
        }
    }
    let supervising = state
        .child
        .lock()
        .map(|g| g.is_some())
        .unwrap_or(false);
    if supervising {
        return Ok(HomeNodeModeStatus {
            mode: "supervised".to_string(),
            headline: None,
            detail: None,
            holder_app: Some("EnvoyMesh".to_string()),
            holder_pid: None,
            port: Some(NODE_LIVENESS_PORT),
        });
    }
    Ok(HomeNodeModeStatus {
        mode: "none".to_string(),
        headline: Some("The home node is not running yet.".to_string()),
        detail: Some(
            "Wait a moment, or restart from this screen if it still does not connect.".to_string(),
        ),
        holder_app: None,
        holder_pid: None,
        port: None,
    })
}

#[tauri::command]
fn restart_node_process(state: State<'_, NodeProcessState>) -> Result<(), String> {
    {
        let attached = state.attached.lock().map_err(|e| e.to_string())?;
        if let Some(info) = attached.as_ref() {
            // Re-probe: if the other app is still healthy, keep attaching.
            if try_attach_existing_home_node(&state.config.profile_dir).is_some() {
                info!(
                    "Restart skipped — still attached to {} (pid {})",
                    info.app, info.pid
                );
                return Ok(());
            }
            return Err(format!(
                "{} (pid {}) was using this profile and is no longer answering. Quit that app, then relaunch EnvoyMesh.",
                info.app, info.pid
            ));
        }
    }
    {
        let mut guardian = state.guardian.lock().map_err(|e| e.to_string())?;
        guardian.suppress_respawn = true;
    }
    let mut child_guard = state.child.lock().map_err(|e| e.to_string())?;
    stop_node_child(&mut child_guard);
    #[cfg(unix)]
    kill_stale_listeners_on_node_ports(&state.config.profile_dir);

    // Another product may have claimed the home while we were stopped.
    if let Some(existing) = try_attach_existing_home_node(&state.config.profile_dir) {
        info!(
            "After stop, attaching to {} (pid {}) instead of spawning",
            existing.app, existing.pid
        );
        *child_guard = None;
        drop(child_guard);
        if let Ok(mut attached) = state.attached.lock() {
            *attached = Some(existing);
        }
        if let Ok(mut guardian) = state.guardian.lock() {
            guardian.suppress_respawn = true;
            guardian.consecutive_liveness_failures = 0;
            guardian.child_started_at = None;
            guardian.last_liveness_probe_at = None;
        }
        return Ok(());
    }

    // Login service owns the node — restart that job instead of spawning a second child.
    let respawn_requested = service_respawn_flag(&state.config.profile_dir).is_file();
    if background_service_unit_installed() && !respawn_requested {
        drop(child_guard);
        info!("Restarting the background service instead of spawning an app-owned node");
        restart_background_service();
        if let Some(existing) =
            wait_for_attached_home_node(&state.config.profile_dir, Duration::from_secs(20))
        {
            if let Ok(mut attached) = state.attached.lock() {
                *attached = Some(existing);
            }
            if let Ok(mut guardian) = state.guardian.lock() {
                guardian.suppress_respawn = true;
                guardian.consecutive_liveness_failures = 0;
                guardian.child_started_at = None;
                guardian.last_liveness_probe_at = None;
            }
            return Ok(());
        }
        warn!("Background service did not answer after restart; spawning an app-owned node");
        child_guard = state.child.lock().map_err(|e| e.to_string())?;
    }

    let child = spawn_node_process(&state.config)?;
    info!("Node process restarted from Social UI");
    *child_guard = Some(child);
    drop(child_guard);
    if let Ok(mut attached) = state.attached.lock() {
        *attached = None;
    }
    if let Ok(mut guardian) = state.guardian.lock() {
        guardian.suppress_respawn = false;
        guardian.consecutive_liveness_failures = 0;
        guardian.child_started_at = Some(Instant::now());
        guardian.last_liveness_probe_at = None;
    }
    Ok(())
}

/// Stop the home-node child without respawning (used before OTA install).
/// When the login service owns the node, stop that job too so the old binary
/// is not holding files during replace; the next launch reloads the unit.
#[tauri::command]
fn stop_node_process(state: State<'_, NodeProcessState>) -> Result<(), String> {
    if let Ok(mut guardian) = state.guardian.lock() {
        guardian.suppress_respawn = true;
    }
    let mut child_guard = state.child.lock().map_err(|e| e.to_string())?;
    stop_node_child(&mut child_guard);
    if background_service_unit_installed() {
        info!("Stopping the background service for update install");
        stop_background_service_job();
    }
    info!("Node process stopped for update install");
    Ok(())
}

/// Native folder picker for Pi project selection (macOS / Linux / Windows).
///
/// Returns `Ok(Some(path))` when the user picks a folder, `Ok(None)` when they
/// cancel. Uses each OS's built-in dialog (no extra crates) so Social never
/// needs a typed path in the desktop shell.
#[tauri::command]
fn pick_directory(
    title: Option<String>,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    let title = title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Choose project folder");
    let default_path = default_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    #[cfg(target_os = "macos")]
    {
        fn applescript_escape(s: &str) -> String {
            s.replace('\\', "\\\\").replace('"', "\\\"")
        }
        let mut script = format!(
            "POSIX path of (choose folder with prompt \"{}\"",
            applescript_escape(title)
        );
        if let Some(raw) = default_path {
            let path = std::path::PathBuf::from(raw);
            let start = if path.is_dir() {
                path
            } else {
                path.parent()
                    .filter(|p| p.is_dir())
                    .map(|p| p.to_path_buf())
                    .unwrap_or(path)
            };
            script.push_str(&format!(
                " default location (POSIX file \"{}\")",
                applescript_escape(&start.to_string_lossy())
            ));
        }
        script.push(')');
        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            // User cancel → non-zero status from osascript.
            return Ok(None);
        }
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        // AppleScript often returns a trailing slash.
        let path = path.trim_end_matches('/').to_string();
        return Ok(if path.is_empty() { None } else { Some(path) });
    }

    #[cfg(target_os = "windows")]
    {
        // WinForms FolderBrowserDialog requires an STA thread. Do NOT pass
        // -NonInteractive — that suppresses the dialog and makes ShowDialog
        // fail/return empty, so Social's "Open Pi" looks like a no-op.
        fn ps_escape(s: &str) -> String {
            s.replace('\'', "''")
        }
        // -STA on the powershell.exe process (below) is what matters for WinForms.
        let mut script = String::from(
            "Add-Type -AssemblyName System.Windows.Forms; \
             $d = New-Object System.Windows.Forms.FolderBrowserDialog; \
             $d.Description = '",
        );
        script.push_str(&ps_escape(title));
        script.push_str("'; $d.ShowNewFolderButton = $true; ");
        if let Some(raw) = default_path {
            let path = std::path::PathBuf::from(raw);
            let start = if path.is_dir() {
                path
            } else {
                path.parent()
                    .filter(|p| p.is_dir())
                    .map(|p| p.to_path_buf())
                    .unwrap_or(path)
            };
            script.push_str(&format!(
                "$d.SelectedPath = '{}'; ",
                ps_escape(&start.to_string_lossy())
            ));
        }
        script.push_str(
            "$r = $d.ShowDialog(); \
             if ($r -eq [System.Windows.Forms.DialogResult]::OK) { \
               [Console]::Out.Write($d.SelectedPath) \
             } elseif ($r -eq [System.Windows.Forms.DialogResult]::Cancel) { \
               exit 0 \
             } else { \
               [Console]::Error.WriteLine(\"FolderBrowserDialog failed: $r\"); \
               exit 2 \
             }",
        );
        let output = Command::new("powershell")
            .args(["-NoProfile", "-STA", "-Command", &script])
            .output()
            .map_err(|e| format!("folder picker powershell failed: {e}"))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if err.is_empty() {
                return Err(format!(
                    "folder picker failed (exit {:?})",
                    output.status.code()
                ));
            }
            return Err(err);
        }
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok(if path.is_empty() { None } else { Some(path) });
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // Prefer zenity (GNOME), then kdialog (KDE).
        let mut tried = Vec::new();
        {
            let mut cmd = Command::new("zenity");
            cmd.args(["--file-selection", "--directory", "--title", title]);
            if let Some(raw) = default_path {
                let path = std::path::PathBuf::from(raw);
                let start = if path.is_dir() {
                    path
                } else {
                    path.parent()
                        .filter(|p| p.is_dir())
                        .map(|p| p.to_path_buf())
                        .unwrap_or(path)
                };
                cmd.arg(format!("--filename={}", start.display()));
            }
            match cmd.output() {
                Ok(output) if output.status.success() => {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    return Ok(if path.is_empty() { None } else { Some(path) });
                }
                Ok(output) if output.status.code() == Some(1) => {
                    // zenity cancel
                    return Ok(None);
                }
                Ok(_) | Err(_) => tried.push("zenity"),
            }
        }
        {
            let mut args = vec![
                "--getexistingdirectory".to_string(),
                title.to_string(),
            ];
            if let Some(raw) = default_path {
                let path = std::path::PathBuf::from(raw);
                let start = if path.is_dir() {
                    path
                } else {
                    path.parent()
                        .filter(|p| p.is_dir())
                        .map(|p| p.to_path_buf())
                        .unwrap_or(path)
                };
                args.push(start.to_string_lossy().into_owned());
            }
            match Command::new("kdialog").args(&args).output() {
                Ok(output) if output.status.success() => {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    return Ok(if path.is_empty() { None } else { Some(path) });
                }
                Ok(output) if output.status.code() == Some(1) => return Ok(None),
                Ok(_) | Err(_) => tried.push("kdialog"),
            }
        }
        return Err(format!(
            "No folder dialog available (tried {}). Install zenity or kdialog.",
            tried.join(", ")
        ));
    }

    #[cfg(not(any(
        target_os = "macos",
        target_os = "windows",
        all(unix, not(target_os = "macos"))
    )))]
    {
        let _ = (title, default_path);
        Err("Folder picker is not supported on this platform".into())
    }
}

/// Native multi-file picker for EnvoyAI / Ext Agent attachments.
///
/// Returns `Ok(Some(paths))` when the user picks one or more files,
/// `Ok(None)` when they cancel.
#[tauri::command]
fn pick_files(
    title: Option<String>,
    default_path: Option<String>,
) -> Result<Option<Vec<String>>, String> {
    let title = title
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Choose files");
    let default_path = default_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    #[cfg(target_os = "macos")]
    {
        fn applescript_escape(s: &str) -> String {
            s.replace('\\', "\\\\").replace('"', "\\\"")
        }
        let mut script = format!(
            "set theFiles to choose file with prompt \"{}\" with multiple selections allowed",
            applescript_escape(title)
        );
        if let Some(raw) = default_path {
            let path = std::path::PathBuf::from(raw);
            let start = if path.is_dir() {
                path
            } else {
                path.parent()
                    .filter(|p| p.is_dir())
                    .map(|p| p.to_path_buf())
                    .unwrap_or(path)
            };
            script.push_str(&format!(
                " default location (POSIX file \"{}\")",
                applescript_escape(&start.to_string_lossy())
            ));
        }
        script.push_str(
            "\nset out to \"\"\n\
             repeat with f in theFiles\n\
               set out to out & (POSIX path of f) & linefeed\n\
             end repeat\n\
             return out",
        );
        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Ok(None);
        }
        let paths: Vec<String> = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|l| l.trim().trim_end_matches('/').to_string())
            .filter(|l| !l.is_empty())
            .collect();
        return Ok(if paths.is_empty() { None } else { Some(paths) });
    }

    #[cfg(target_os = "windows")]
    {
        fn ps_escape(s: &str) -> String {
            s.replace('\'', "''")
        }
        let mut script = String::from(
            "Add-Type -AssemblyName System.Windows.Forms; \
             $d = New-Object System.Windows.Forms.OpenFileDialog; \
             $d.Title = '",
        );
        script.push_str(&ps_escape(title));
        script.push_str("'; $d.Multiselect = $true; $d.CheckFileExists = $true; ");
        if let Some(raw) = default_path {
            let path = std::path::PathBuf::from(raw);
            let start = if path.is_dir() {
                path
            } else {
                path.parent()
                    .filter(|p| p.is_dir())
                    .map(|p| p.to_path_buf())
                    .unwrap_or(path)
            };
            script.push_str(&format!(
                "$d.InitialDirectory = '{}'; ",
                ps_escape(&start.to_string_lossy())
            ));
        }
        script.push_str(
            "$r = $d.ShowDialog(); \
             if ($r -eq [System.Windows.Forms.DialogResult]::OK) { \
               $d.FileNames | ForEach-Object { [Console]::Out.WriteLine($_) } \
             } elseif ($r -eq [System.Windows.Forms.DialogResult]::Cancel) { \
               exit 0 \
             } else { \
               [Console]::Error.WriteLine(\"OpenFileDialog failed: $r\"); \
               exit 2 \
             }",
        );
        let output = Command::new("powershell")
            .args(["-NoProfile", "-STA", "-Command", &script])
            .output()
            .map_err(|e| format!("file picker powershell failed: {e}"))?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if err.is_empty() {
                return Err(format!(
                    "file picker failed (exit {:?})",
                    output.status.code()
                ));
            }
            return Err(err);
        }
        let paths: Vec<String> = String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();
        return Ok(if paths.is_empty() { None } else { Some(paths) });
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut tried = Vec::new();
        {
            let mut cmd = Command::new("zenity");
            cmd.args([
                "--file-selection",
                "--multiple",
                "--separator=|",
                "--title",
                title,
            ]);
            if let Some(raw) = default_path {
                let path = std::path::PathBuf::from(raw);
                let start = if path.is_dir() {
                    path
                } else {
                    path.parent()
                        .filter(|p| p.is_dir())
                        .map(|p| p.to_path_buf())
                        .unwrap_or(path)
                };
                cmd.arg(format!("--filename={}", start.display()));
            }
            match cmd.output() {
                Ok(output) if output.status.success() => {
                    let paths: Vec<String> = String::from_utf8_lossy(&output.stdout)
                        .split('|')
                        .map(|l| l.trim().to_string())
                        .filter(|l| !l.is_empty())
                        .collect();
                    return Ok(if paths.is_empty() { None } else { Some(paths) });
                }
                Ok(output) if output.status.code() == Some(1) => return Ok(None),
                Ok(_) | Err(_) => tried.push("zenity"),
            }
        }
        {
            let mut args = vec!["--getopenfilename".to_string()];
            if let Some(raw) = default_path {
                let path = std::path::PathBuf::from(raw);
                let start = if path.is_dir() {
                    path
                } else {
                    path.parent()
                        .filter(|p| p.is_dir())
                        .map(|p| p.to_path_buf())
                        .unwrap_or(path)
                };
                args.push(start.to_string_lossy().into_owned());
            } else {
                args.push(".".to_string());
            }
            args.push(title.to_string());
            match Command::new("kdialog").args(&args).output() {
                Ok(output) if output.status.success() => {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    return Ok(if path.is_empty() {
                        None
                    } else {
                        Some(vec![path])
                    });
                }
                Ok(output) if output.status.code() == Some(1) => return Ok(None),
                Ok(_) | Err(_) => tried.push("kdialog"),
            }
        }
        return Err(format!(
            "No file dialog available (tried {}). Install zenity or kdialog.",
            tried.join(", ")
        ));
    }

    #[cfg(not(any(
        target_os = "macos",
        target_os = "windows",
        all(unix, not(target_os = "macos"))
    )))]
    {
        let _ = (title, default_path);
        Err("File picker is not supported on this platform".into())
    }
}

/// Returns the OpenClaw self-reference heal status captured at launch.
///
/// Used by the Social UI to render a doctor chip and by `envoymesh doctor`
/// (when running inside the desktop shell) to surface what happened during
/// the install-time probe. The report is computed once during `setup()` —
/// it is immutable for the lifetime of the app, so we store it in a plain
/// `Arc<OpenclawHealReport>` rather than a Mutex.
#[tauri::command]
fn get_openclaw_heal_status(
    report: State<'_, std::sync::Arc<OpenclawHealReport>>,
) -> OpenclawHealReport {
    (**report).clone()
}

fn main() {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    set_global_default(subscriber).expect("failed to set tracing subscriber");

    info!("Starting EnvoyMesh Tauri app");

    if is_port_in_use(3030) {
        info!("Port 3030 is already in use. Another node may be running.");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            restart_node_process,
            stop_node_process,
            get_app_log_paths,
            append_social_log,
            reveal_log_dir,
            get_openclaw_heal_status,
            get_home_node_mode,
            pick_directory,
            pick_files
        ])
        .setup(move |app| {
            info!("Tauri app setup starting");

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            info!("App data directory: {:?}", app_data_dir);

            let log_paths = ensure_logs_dir(&app_data_dir);
            info!("Log directory: {:?}", log_paths.logs_dir);
            let node_log_file = open_append_log(&log_paths.node_log).map(|f| Arc::new(Mutex::new(f)));
            app.manage(log_paths);

            // The **shared** home, not this app's private data directory: the node CLI,
            // a second product and this app must agree on one profile, or the same
            // machine holds two identities depending on how EnvoyMesh was launched.
            let (shared_home, adopted_legacy) = resolve_shared_home(&app_data_dir);
            let profile_dir = shared_home.join("profile");
            std::fs::create_dir_all(&profile_dir).expect("Failed to create profile dir");
            info!("Shared EnvoyMesh home: {:?}", shared_home);
            info!("Profile directory: {:?}", profile_dir);
            if let Some(legacy) = adopted_legacy {
                warn!(
                    "Using the legacy profile at {:?} because the shared home has none yet. \
                     Move it to {:?} to share it with the command-line node and other apps.",
                    legacy, profile_dir
                );
            }

            let ipfs_repo_dir = profile_dir.join("ipfs-kubo");
            std::fs::create_dir_all(&ipfs_repo_dir).ok();
            info!("IPFS repo directory: {:?}", ipfs_repo_dir);

            let resource_dir = resolve_resource_dir(app);
            if let Some(ref dir) = resource_dir {
                info!("Resource directory: {:?}", dir);
            }

            // Install-time probe + self-heal for OpenClaw's workspace
            // self-reference. macOS Gatekeeper / Windows SmartScreen have
            // been observed to strip the relative symlinks shipped in the
            // bundled tree (`scripts/stage-tauri-openclaw-bundle.sh` /
            // `scripts/build-desktop.ps1` create them at build time).
            // Without this probe the home node would still refuse to start
            // the gateway inside the user's `.app` even though the bundled
            // DMG/NSIS looked complete. Runs idempotently on every launch.
            let mut openclaw_heal_report = OpenclawHealReport {
                state: "no-bundle",
                openclaw_dir: None,
                self_ref_pkg: None,
                message: "Probe did not run — no resource_dir.".to_string(),
            };
            if let Some(ref dir) = resource_dir {
                let outcome = ensure_openclaw_self_ref(dir);
                let mut report: OpenclawHealReport = outcome.clone().into();
                // Always populate the absolute paths so the UI doctor chip
                // can deep-link to them.
                let oc_dir = dir.join("openclaw");
                if oc_dir.is_dir() {
                    report.openclaw_dir = Some(oc_dir.display().to_string());
                    let self_ref_pkg =
                        oc_dir.join("node_modules").join("openclaw/package.json");
                    report.self_ref_pkg = Some(self_ref_pkg.display().to_string());
                }
                if matches!(report.state, "healed") {
                    info!(
                        "OpenClaw self-reference was repaired at launch — \
                         home node will start the gateway normally"
                    );
                } else if matches!(report.state, "heal-failed") {
                    warn!(
                        "OpenClaw self-reference could not be repaired: {} \
                         — gateway may refuse to start",
                        report.message
                    );
                }
                openclaw_heal_report = report;
            }

            // Expose the heal report to UI / doctor. Stored as plain Arc
            // so the command can read it without managing a Mutex for
            // something that never changes after setup().
            app.manage(std::sync::Arc::new(openclaw_heal_report));

            let bundled_ipfs = resolve_bundled_ipfs_exe(resource_dir.as_deref());
            if let Some(ref exe) = bundled_ipfs {
                info!("Bundled Kubo sidecar: {:?}", exe);
            } else {
                info!("No bundled Kubo sidecar — node will use ipfs on PATH if present");
            }

            let node_exe = resolve_node_exe(resource_dir.as_deref());
            if node_exe.is_file() {
                info!("Using Node.js runtime: {:?}", node_exe);
            } else {
                info!("Using Node.js runtime from PATH: {:?}", node_exe);
            }

            let node_path = match resolve_node_entry(resource_dir.as_deref()) {
                Some(path) => {
                    info!("Using node entry: {:?}", path);
                    path
                }
                None => {
                    error!(
                        "Node entry not found in app resources or dev tree. \
                         Rebuild with npm run social:build && npm run node:build && npm run build -w @envoymesh/tauri."
                    );
                    PathBuf::from("node/src/index.js")
                }
            };

            let node_cwd = node_app_root(&node_path);
            info!("Node working directory: {:?}", node_cwd);

            let spawn_config = NodeSpawnConfig {
                node_exe: node_exe.clone(),
                node_path: node_path.clone(),
                node_cwd,
                profile_dir: profile_dir.clone(),
                ipfs_repo_dir: ipfs_repo_dir.clone(),
                bundled_ipfs: bundled_ipfs.clone(),
                tauri_resource_dir: resource_dir.clone(),
                node_log_file,
            };

            let restarted = refresh_service_launcher(&profile_dir, &spawn_config);
            let unit_installed = background_service_unit_installed();
            let respawn_requested = service_respawn_flag(&profile_dir).is_file();
            let attached_now = if restarted {
                wait_for_attached_home_node(&profile_dir, Duration::from_secs(20))
            } else {
                try_attach_existing_home_node(&profile_dir)
            };

            let (initial_child, attached) = if let Some(existing) = attached_now {
                info!(
                    "Attaching to home node already running ({} pid {} on port {}) — not spawning a second one",
                    existing.app, existing.pid, existing.port
                );
                (None, Some(existing))
            } else if unit_installed && !respawn_requested {
                info!(
                    "Background service is installed; this window will use it instead of starting a second node"
                );
                (None, None)
            } else {
                match spawn_node_process(&spawn_config) {
                    Ok(child) => {
                        info!(
                            "Node process spawned — showing UI immediately; home node continues starting in background"
                        );
                        (Some(child), None)
                    }
                    Err(e) => {
                        error!("{}", e);
                        (None, None)
                    }
                }
            };

            let waiting_for_service =
                initial_child.is_none() && attached.is_none() && unit_installed && !respawn_requested;
            let suppress_respawn = attached.is_some() || waiting_for_service;
            app.manage(NodeProcessState {
                child: Mutex::new(initial_child),
                config: spawn_config,
                guardian: Mutex::new(NodeGuardianState {
                    suppress_respawn,
                    recent_respawn_at: Vec::new(),
                    consecutive_liveness_failures: 0,
                    child_started_at: if attached.is_none() {
                        Some(Instant::now())
                    } else {
                        None
                    },
                    last_liveness_probe_at: None,
                }),
                attached: Mutex::new(attached),
            });

            start_node_guardian(app.handle().clone());

            // Log when the Social WebSocket is up — do not block window creation on this wait.
            std::thread::spawn(|| {
                if wait_for_port(3030, Duration::from_secs(120)) {
                    info!("Home node WebSocket is ready on port 3030");
                } else {
                    warn!(
                        "Home node WebSocket not ready after 120s — Social UI will retry"
                    );
                }
            });

            info!("Tauri app setup complete");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                info!("Window close requested, shutting down node...");
                stop_node_from_app(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                stop_node_from_app(&app_handle);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    /// Quitting the app stops the node it spawned. The login service's process
    /// is a different owner, even when this app can see its pid.
    #[test]
    fn quit_leaves_a_service_owned_node_running() {
        assert!(should_stop_app_child(10, None, Some(10)));
        assert!(should_stop_app_child(10, Some("app"), Some(10)));
        assert!(!should_stop_app_child(10, Some("service"), Some(10)));
        assert!(should_stop_app_child(11, Some("service"), Some(10)));
    }

    #[test]
    fn windows_schtasks_list_running_matches_english_status_line() {
        assert!(windows_schtasks_list_is_running(
            "Folder: \\\nTaskName: \\EnvoyMesh.node\nStatus: Running\nLogon Mode: Interactive only\n"
        ));
        assert!(windows_schtasks_list_is_running("Status: running"));
        assert!(!windows_schtasks_list_is_running("Status: Ready"));
        // Translated / unknown word — treat as not running (same as node).
        assert!(!windows_schtasks_list_is_running("Status: Wird"));
        // Do not match "running" elsewhere in the LIST dump.
        assert!(!windows_schtasks_list_is_running(
            "HostName: running-box\nStatus: Ready\n"
        ));
        assert!(!windows_schtasks_list_is_running(""));
    }

    /// `{"ok":true,…}` is not proof of life when every EnvoyMesh-family product
    /// answers the same way: the supervised node must be the one that answered.
    #[test]
    fn health_identity_must_match_the_recorded_owner() {
        let body = r#"HTTP/1.1 200 OK
{"ok":true,"service":"envoymesh-home-ws","port":3030,"app":"EnvoyMesh","ownerId":"envoy:owner:abc"}"#;

        // No expectation recorded: a 200 with `ok:true` is all we can check.
        assert!(health_body_matches_identity(body, None));
        // The node we supervise.
        assert!(health_body_matches_identity(body, Some("envoy:owner:abc")));
        // A different product's node on the same port — this is the case that used to
        // look healthy and stop the guardian from respawning a wedged node.
        assert!(!health_body_matches_identity(body, Some("envoy:owner:someone-else")));
        // Identity absent entirely (an older build): still "not ours", because we
        // know which owner this profile belongs to.
        assert!(!health_body_matches_identity(
            r#"HTTP/1.1 200 OK
{"ok":true,"service":"envoymesh-home-ws"}"#,
            Some("envoy:owner:abc")
        ));
        // Junk, and a non-200.
        assert!(!health_body_matches_identity("not http at all", Some("envoy:owner:abc")));
        assert!(!health_body_matches_identity(
            r#"HTTP/1.1 503 Service Unavailable
{"ok":false}"#,
            None
        ));
    }

    /// The home a profile belongs to, matching `homeForProfileDir` in node-core: the
    /// supervisor reads `<home>/node.json`, and reading the wrong directory would mean
    /// silently having no descriptor — i.e. never being able to prove ownership.
    #[test]
    fn home_dir_for_profile_matches_the_node_core_rule() {
        assert_eq!(
            home_dir_for_profile(Path::new("/Users/alice/Library/Application Support/EnvoyMesh/profile")),
            PathBuf::from("/Users/alice/Library/Application Support/EnvoyMesh")
        );
        // An explicit `--profile /tmp/scratch` keeps its descriptor beside it.
        assert_eq!(home_dir_for_profile(Path::new("/tmp/scratch")), PathBuf::from("/tmp/scratch"));
        assert_eq!(home_dir_for_profile(Path::new("relative/dir")), PathBuf::from("relative/dir"));
    }

    #[test]
    fn guardian_respawns_only_on_supervisor_exit_code() {
        let now = Instant::now();
        assert!(should_auto_respawn_node(
            Some(2),
            false,
            &[],
            now,
            NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR
        ));
        assert!(!should_auto_respawn_node(
            Some(0),
            false,
            &[],
            now,
            NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR
        ));
        assert!(!should_auto_respawn_node(
            Some(1),
            false,
            &[],
            now,
            NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR
        ));
        // Damaged profile (exit 4) and home-in-use (exit 3) must not thrash.
        assert!(!should_auto_respawn_node(
            Some(NODE_DAMAGED_HOME_EXIT_CODE),
            false,
            &[],
            now,
            NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR
        ));
        assert!(!should_auto_respawn_node(
            Some(NODE_HOME_IN_USE_EXIT_CODE),
            false,
            &[],
            now,
            NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR
        ));
        assert!(!should_auto_respawn_node(
            None,
            false,
            &[],
            now,
            NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR
        ));
    }

    #[test]
    fn guardian_respects_suppress_and_rate_limit() {
        let now = Instant::now();
        assert!(!should_auto_respawn_node(
            Some(2),
            true,
            &[],
            now,
            NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR
        ));
        let recent = vec![
            now - Duration::from_secs(10),
            now - Duration::from_secs(20),
            now - Duration::from_secs(30),
        ];
        assert!(!should_auto_respawn_node(
            Some(2),
            false,
            &recent,
            now,
            NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR
        ));
        let stale = vec![now - Duration::from_secs(3601)];
        assert!(should_auto_respawn_node(
            Some(2),
            false,
            &stale,
            now,
            NODE_GUARDIAN_MAX_RESPAWNS_PER_HOUR
        ));
    }


    /// The desktop app and the command-line node must resolve the **same** home.
    ///
    /// This is the defect the review found: the app used `app_data_dir/profile` while the
    /// CLI used the shared root, so one machine held two identities depending on how
    /// EnvoyMesh was started. These expectations are the same paths
    /// `packages/node-core/test/envoymesh-home.test.ts` asserts, which is what keeps the
    /// two implementations from drifting.
    #[test]
    fn the_shared_home_matches_the_nodes_rule() {
        let env = std::collections::HashMap::new();
        let home = Path::new("/Users/alice");
        assert_eq!(
            default_home_dir("macos", &env, home),
            PathBuf::from("/Users/alice/Library/Application Support/EnvoyMesh")
        );
        assert_eq!(
            default_home_dir("linux", &env, home),
            PathBuf::from("/Users/alice/.local/share/EnvoyMesh")
        );

        // Windows: LOCALAPPDATA, never APPDATA — the root holds the owner private key and
        // roaming syncs it off the machine.
        let mut win = std::collections::HashMap::new();
        win.insert("LOCALAPPDATA".to_string(), "C:\\Users\\alice\\AppData\\Local".to_string());
        win.insert("APPDATA".to_string(), "C:\\Users\\alice\\AppData\\Roaming".to_string());
        assert_eq!(
            default_home_dir("windows", &win, Path::new("C:\\Users\\alice")),
            PathBuf::from("C:\\Users\\alice\\AppData\\Local").join("EnvoyMesh")
        );
    }

    #[test]
    fn envoymesh_home_wins_over_everything() {
        let (home, legacy) = resolve_shared_home_with(
            "macos",
            &std::collections::HashMap::from([(
                "ENVOYMESH_HOME".to_string(),
                "/tmp/custom-home".to_string(),
            )]),
            Path::new("/Users/alice"),
            Path::new("/Users/alice/Library/Application Support/com.envoymesh.desktop"),
        );
        assert_eq!(home, PathBuf::from("/tmp/custom-home"));
        assert!(legacy.is_none());
    }

    #[test]
    fn an_installed_desktop_user_keeps_their_identity() {
        // The app shipped before the shared root existed, so its own `profile/` is the
        // only copy of an existing user's identity. Adopt it rather than start a second
        // one, and say so — moving it is the user's call.
        let base = std::env::temp_dir().join(format!("envoymesh-home-test-{}", std::process::id()));
        let app_data = base.join("appdata");
        std::fs::create_dir_all(app_data.join("profile")).expect("temp dir");
        std::fs::write(app_data.join("profile").join("profile.json"), "{}").expect("temp profile");
        let home_dir = base.join("home");
        std::fs::create_dir_all(&home_dir).expect("temp home");

        let (home, legacy) =
            resolve_shared_home_with("macos", &std::collections::HashMap::new(), &home_dir, &app_data);
        assert_eq!(home, app_data);
        assert_eq!(legacy, Some(app_data.join("profile")));

        // …and with a real home at the shared root, the shared one wins.
        std::fs::create_dir_all(home_dir.join("Library/Application Support/EnvoyMesh/profile"))
            .expect("shared home");
        let (home2, legacy2) =
            resolve_shared_home_with("macos", &std::collections::HashMap::new(), &home_dir, &app_data);
        assert_eq!(
            home2,
            home_dir.join("Library/Application Support/EnvoyMesh")
        );
        assert!(legacy2.is_none());

        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn guardian_backoff_grows_then_caps() {
        assert_eq!(guardian_backoff_delay(0), Duration::from_secs(5));
        assert_eq!(guardian_backoff_delay(1), Duration::from_secs(10));
        assert_eq!(guardian_backoff_delay(2), Duration::from_secs(20));
        assert_eq!(guardian_backoff_delay(10), Duration::from_secs(120));
    }

    /// Walk up from `tests_root` until we find a writable temp dir. Each
    /// test gets its own subdir so they don't collide on parallel runs.
    fn make_fixture(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "envoymesh-selfref-{}-{}",
            tag,
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create fixture dir");
        dir
    }

    /// Lay down a minimal `resource_dir/openclaw/...` tree so the probe
    /// has something to work against. Returns the resource_dir.
    fn seed_tree(resource_dir: &Path) {
        let oc = resource_dir.join("openclaw");
        fs::create_dir_all(&oc).unwrap();
        fs::create_dir_all(oc.join("node_modules")).unwrap();
        // package.json — bare minimum; the heal doesn't read its fields.
        fs::write(
            oc.join("package.json"),
            r#"{"name":"openclaw","version":"0.0.0"}"#,
        )
        .unwrap();
        fs::write(oc.join("openclaw.mjs"), "#!/usr/bin/env node\n").unwrap();
        // dist must exist for the self-ref to be considered usable.
        fs::create_dir_all(oc.join("dist/config")).unwrap();
        fs::write(oc.join("dist/entry.js"), "export {}\n").unwrap();
        fs::write(oc.join("dist/config/config.js"), "export {}\n").unwrap();
        fs::create_dir_all(oc.join("extensions")).unwrap();
        fs::create_dir_all(oc.join("skills")).unwrap();
    }

    #[test]
    fn normalize_prefers_nested_resources_content_root() {
        let r = make_fixture("nested-resources");
        // Mimic macOS DMG layout: Contents/Resources/resources/{node,pi}/
        let nested = r.join("resources");
        fs::create_dir_all(nested.join("pi/bin")).unwrap();
        fs::create_dir_all(nested.join("node")).unwrap();
        let out = normalize_bundle_content_dir(r.clone());
        assert_eq!(out, nested);
        let _ = fs::remove_dir_all(&r);
    }

    #[test]
    fn normalize_keeps_flat_resource_dir() {
        let r = make_fixture("flat-resources");
        fs::create_dir_all(r.join("pi/bin")).unwrap();
        let out = normalize_bundle_content_dir(r.clone());
        assert_eq!(out, r);
        let _ = fs::remove_dir_all(&r);
    }

    #[test]
    fn heal_missing_package_json() {
        let r = make_fixture("missing");
        seed_tree(&r);
        let self_ref = r.join("openclaw/node_modules/openclaw");
        // Nothing at self_ref/pkg — fresh install scenario.
        let outcome = ensure_openclaw_self_ref(&r);
        assert!(
            matches!(outcome, HealOutcome::Healed),
            "expected HealOutcome::Healed, got {outcome:?}"
        );
        assert!(
            self_ref.join("package.json").is_file(),
            "package.json should now exist"
        );
        let _ = fs::remove_dir_all(&r);
    }

    #[test]
    fn heal_dangling_symlink() {
        // This is the macOS-Gatekeeper / Windows-SmartScreen scenario:
        // the installed .dmg/.msi stripped our relative symlink to leave
        // a dangling link. The probe must recognise this as broken and
        // re-create the self-reference.
        let r = make_fixture("dangling");
        seed_tree(&r);
        let self_ref = r.join("openclaw/node_modules/openclaw");
        fs::create_dir_all(&self_ref).unwrap();
        std::os::unix::fs::symlink("../../foo-broken", self_ref.join("package.json")).unwrap();

        let outcome = ensure_openclaw_self_ref(&r);
        assert!(
            matches!(outcome, HealOutcome::Healed),
            "dangling symlink must be classified as broken → Healed, got {outcome:?}"
        );
        assert!(
            self_ref.join("package.json").is_file(),
            "dangling symlink should be replaced with a readable self-reference"
        );
        let _ = fs::remove_dir_all(&r);
    }

    #[test]
    fn no_op_when_already_healthy() {
        // Healthy state: package.json + dist are reachable via the self-reference.
        // The probe must leave them alone and return Healthy.
        let r = make_fixture("healthy");
        seed_tree(&r);
        let self_ref = r.join("openclaw/node_modules/openclaw");
        fs::create_dir_all(&self_ref).unwrap();
        std::os::unix::fs::symlink("../../package.json", self_ref.join("package.json")).unwrap();
        std::os::unix::fs::symlink("../../dist", self_ref.join("dist")).unwrap();

        let target = fs::read_link(self_ref.join("package.json")).unwrap();
        let outcome = ensure_openclaw_self_ref(&r);
        assert!(
            matches!(outcome, HealOutcome::Healthy),
            "healthy self-ref must return Healthy, got {outcome:?}"
        );
        assert_eq!(
            fs::read_link(self_ref.join("package.json")).unwrap(),
            target,
            "symlink target must be unchanged"
        );
        let _ = fs::remove_dir_all(&r);
    }

    #[test]
    fn no_op_when_openclaw_tree_absent() {
        // Sidecar-only builds ship without an openclaw/ tree — probe
        // must be a no-op (return NoBundle) without errors.
        let r = make_fixture("no-oc");
        fs::create_dir_all(&r).unwrap();
        let outcome = ensure_openclaw_self_ref(&r);
        assert!(
            matches!(outcome, HealOutcome::NoBundle),
            "missing openclaw/ must return NoBundle, got {outcome:?}"
        );
        let _ = fs::remove_dir_all(&r);
    }

    #[test]
    fn heal_is_idempotent() {
        let r = make_fixture("idem");
        seed_tree(&r);

        let _ = ensure_openclaw_self_ref(&r);
        // Second call must NOT re-trigger the heal path. We confirm by
        // asserting the inode hasn't changed (the symlink would get a
        // fresh inode if remove+create ran a second time).
        use std::os::unix::fs::MetadataExt;
        let self_ref = r.join("openclaw/node_modules/openclaw");
        let pkg = self_ref.join("package.json");
        let ino_first = fs::symlink_metadata(&pkg).unwrap().ino();
        let outcome2 = ensure_openclaw_self_ref(&r);
        let ino_second = fs::symlink_metadata(&pkg).unwrap().ino();
        assert!(
            matches!(outcome2, HealOutcome::Healthy),
            "second probe call must report Healthy, got {outcome2:?}"
        );
        assert_eq!(
            ino_first, ino_second,
            "second probe call must be a no-op (same inode)"
        );
        let _ = fs::remove_dir_all(&r);
    }

    #[test]
    fn heal_failed_when_root_package_json_missing() {
        // The self_ref/package.json is missing AND the root openclaw
        // package.json is also missing — there is nothing to symlink to.
        // The probe must surface this as HealFailed (not panic, not
        // return Healthy) so the UI can show a clear message.
        let r = make_fixture("heal-fail");
        let oc = r.join("openclaw");
        fs::create_dir_all(oc.join("node_modules")).unwrap();
        // Deliberately do not call seed_tree — missing root package.json.
        let outcome = ensure_openclaw_self_ref(&r);
        match outcome {
            HealOutcome::HealFailed { reason } => {
                assert!(
                    reason.contains("package.json"),
                    "reason should mention package.json (got {reason:?})"
                );
            }
            other => panic!("expected HealFailed, got {other:?}"),
        }
        let _ = fs::remove_dir_all(&r);
    }

    #[test]
    fn heal_report_carries_state_through_serialization() {
        // The `OpenclawHealReport` struct is what crosses the Tauri IPC
        // boundary (→ JS), so its `state` discriminator must round-trip
        // via serde. Lock it down so a future refactor that renames the
        // discriminator cannot silently break the Social UI doctor chip.
        let cases = [
            (HealOutcome::NoBundle, "no-bundle"),
            (HealOutcome::Healthy, "healthy"),
            (HealOutcome::Healed, "healed"),
            (
                HealOutcome::HealFailed {
                    reason: "perm denied".into(),
                },
                "heal-failed",
            ),
        ];
        for (outcome, expected_state) in cases {
            let report: OpenclawHealReport = outcome.into();
            assert_eq!(
                report.state, expected_state,
                "wrong serialized state for {report:?}"
            );
            // Also verify we can serialize to JSON without panicking —
            // this is what Tauri's IPC actually does.
            let json = serde_json::to_string(&report)
                .expect("heal report must serialize to JSON");
            assert!(
                json.contains(&format!("\"state\":\"{expected_state}\"")),
                "JSON missing state discriminator: {json}"
            );
        }
    }

    #[test]
    fn strip_verbatim_prefix_plain_drive_path() {
        // `\\?\C:\foo\bar` → `C:\foo\bar`
        // Build from wide chars so the test compiles cross-platform.
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStringExt;
            let raw: Vec<u16> = [
                b'\\' as u16, b'\\' as u16, b'?' as u16, b'\\' as u16,
                b'C' as u16, b':' as u16, b'\\' as u16,
                b'f' as u16, b'o' as u16, b'o' as u16,
            ]
            .to_vec();
            let path = PathBuf::from(std::ffi::OsString::from_wide(&raw));
            let stripped = strip_verbatim_prefix(path);
            let s = stripped.to_string_lossy();
            assert!(
                !s.starts_with(r"\\?\"),
                "verbatim prefix not stripped: {s}"
            );
            assert!(s.contains("foo"), "path content lost: {s}");
        }
        #[cfg(not(windows))]
        {
            // No-op on non-Windows; just exercise the function.
            let path = PathBuf::from("/tmp/foo");
            let stripped = strip_verbatim_prefix(path);
            assert_eq!(stripped.to_string_lossy(), "/tmp/foo");
        }
    }

    #[test]
    fn strip_verbatim_prefix_unc_path() {
        // `\\?\UNC\server\share` → `\\server\share`
        #[cfg(windows)]
        {
            use std::os::windows::ffi::OsStringExt;
            let raw: Vec<u16> = [
                b'\\' as u16, b'\\' as u16, b'?' as u16, b'\\' as u16,
                b'U' as u16, b'N' as u16, b'C' as u16, b'\\' as u16,
                b's' as u16, b'v' as u16, b'r' as u16,
            ]
            .to_vec();
            let path = PathBuf::from(std::ffi::OsString::from_wide(&raw));
            let stripped = strip_verbatim_prefix(path);
            let s = stripped.to_string_lossy();
            assert!(
                !s.starts_with(r"\\?\"),
                "verbatim prefix not stripped on UNC: {s}"
            );
            assert!(s.contains("svr"), "UNC host lost: {s}");
        }
        #[cfg(not(windows))]
        {
            // No-op on non-Windows.
            let path = PathBuf::from("/tmp/foo");
            let stripped = strip_verbatim_prefix(path);
            assert_eq!(stripped.to_string_lossy(), "/tmp/foo");
        }
    }

    #[test]
    fn strip_verbatim_prefix_already_plain_noop() {
        // Non-verbatim paths must pass through unchanged.
        let plain = PathBuf::from(if cfg!(windows) { r"C:\foo" } else { "/tmp/foo" });
        let stripped = strip_verbatim_prefix(plain.clone());
        assert_eq!(stripped, plain, "plain path was modified");
    }
}
