use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
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

struct NodeProcessState {
    child: Mutex<Option<Child>>,
    config: NodeSpawnConfig,
}

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
    Some(strip_verbatim_prefix(dir))
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
        #[cfg(windows)]
        paths.push(repo.join("apps/tauri/resources/kubo/ipfs.exe"));
        #[cfg(not(windows))]
        paths.push(repo.join("apps/tauri/resources/kubo/ipfs"));
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
/// have been observed to strip the relative symlinks during .dmg / .msi
/// install when they span what Gatekeeper considers "untrusted boundaries".
/// Without `node_modules/openclaw/package.json` the home node refuses to
/// start the gateway with `OpenClaw tree is incomplete (missing 1 item(s))`
/// and EnvoyAI falls back to the native LLM path — silent capability loss.
///
/// Probes the staged tree; if the self-ref is missing or symlink-broken,
/// the function re-creates the workspace self-reference using relative
/// symlinks with a deep-copy fallback. Idempotent — safe to call on every
/// launch (an existing healthy self-ref is left alone).
///
/// Returns a `HealOutcome` describing the result. The heal itself never
/// aborts app launch — even `HealFailed` is a reportable state, not an
/// error. The caller logs the outcome and stores the report in Tauri
/// state so the UI can surface it via `get_openclaw_heal_status`.
fn ensure_openclaw_self_ref(resource_dir: &Path) -> HealOutcome {
    let oc_dir = resource_dir.join("openclaw");
    if !oc_dir.is_dir() {
        // No bundled OpenClaw tree at all (e.g. sidecar-only build).
        // Nothing to probe.
        return HealOutcome::NoBundle;
    }
    let self_ref_dir = oc_dir.join("node_modules").join("openclaw");
    let self_ref_pkg = self_ref_dir.join("package.json");

    // Healthy if `package.json` exists AND is readable as a real file
    // (whether symlinked or not). `Path::is_file()` follows symlinks, so
    // a dangling symlink is correctly reported as NOT a file — which is
    // what we want here, because the `import "openclaw/..."` resolver in
    // the plugin SDK behaves the same way. We do NOT use `symlink_metadata`
    // alone here because it would mis-report a dangling link as healthy.
    let healthy = self_ref_pkg.is_file();
    if healthy {
        return HealOutcome::Healthy;
    }

    warn!(
        "OpenClaw node_modules/openclaw self-reference is missing or broken at {:?} — healing",
        self_ref_pkg
    );

    // Ensure the parent directory exists. `create_dir_all` is a no-op if
    // it already does (e.g. we have a broken file at package.json but no
    // surrounding dir contents).
    if let Err(e) = std::fs::create_dir_all(&self_ref_dir) {
        warn!(
            "Cannot create {:?} for self-reference heal: {}",
            self_ref_dir, e
        );
        return HealOutcome::HealFailed {
            reason: format!("mkdir {:?}: {e}", self_ref_dir),
        };
    }

    // If something is at package.json (regular file, broken symlink, etc.)
    // and it's NOT a healthy symlink, remove it so the symlink creation
    // doesn't fail on EEXIST.
    if self_ref_pkg.exists() || self_ref_pkg.symlink_metadata().is_ok() {
        let _ = std::fs::remove_file(&self_ref_pkg);
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

    // Try relative symlink first (POSIX-style on macOS/Linux;
    // `std::os::windows::fs::symlink_file` is used on Windows where
    // unprivileged symlinks require Developer Mode). Fall back to a deep
    // copy of package.json — sufficient because the plugin SDK only
    // resolves `import "openclaw/..."` subpaths against the staged
    // tree's `dist/`, `extensions/`, `skills/` dirs which are siblings,
    // and at this point those siblings still exist even if downstream
    // macOS Gatekeeper stripped *their* symlinks too — we copy those
    // recursively below if they're missing.
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
            "OpenClaw self-ref was a deep copy (symlink creation failed — likely missing \
             developer mode / elevation). Some plugin SDK `openclaw/...` imports may not \
             resolve to the staged tree root."
        );
    }

    // Same heal for the sibling top-level entries that the plugin SDK reads.
    for top in ["dist", "extensions", "skills"] {
        let root_top = oc_dir.join(top);
        let self_ref_top = self_ref_dir.join(top);
        if !root_top.is_dir() {
            continue; // optional — skip if the staged tree doesn't ship it
        }
        if self_ref_top.exists() || self_ref_top.symlink_metadata().is_ok() {
            continue; // already healthy (e.g. real dir)
        }
        #[cfg(unix)]
        {
            let _ = std::os::unix::fs::symlink(format!("../../{top}"), &self_ref_top);
        }
        #[cfg(windows)]
        {
            // symlink_dir takes P: AsRef<Path>, so the String from format!
            // is accepted directly — no need for Path::new (which would
            // require a &str reference, not an owned String).
            let _ = std::os::windows::fs::symlink_dir(
                format!("../../{top}"),
                &self_ref_top,
            );
        }
        // If symlink failed on this platform (unprivileged, no dev mode),
        // fall back to a deep copy — the plugin SDK treats the path the
        // same way regardless of how the inode is realised.
        if !self_ref_top.exists() && self_ref_top.symlink_metadata().is_err() {
            if let Err(e) = deep_copy_dir(&root_top, &self_ref_top) {
                warn!(
                    "Failed to deep-copy {:?} → {:?}: {}",
                    root_top, self_ref_top, e
                );
            }
        }
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

/// Terminate any process still listening on the home-node service ports (orphaned sidecars).
/// Unix-only: uses `lsof` to discover listeners. On Windows the sidecar port
/// cleanup is skipped (the Windows port-binding model is different and we
/// don't have a reliable cross-platform equivalent in the build script).
#[cfg(unix)]
fn kill_stale_listeners_on_node_ports() {
    #[cfg(unix)]
    {
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
                let pid = pid_str.trim();
                if pid.is_empty() {
                    continue;
                }
                warn!(
                    "Killing stale listener on port {} (pid {})",
                    port, pid
                );
                let _ = Command::new("kill").args(["-TERM", pid]).status();
            }
        }
        std::thread::sleep(Duration::from_millis(400));
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
                let pid = pid_str.trim();
                if pid.is_empty() {
                    continue;
                }
                warn!(
                    "Force-killing stale listener on port {} (pid {})",
                    port, pid
                );
                let _ = Command::new("kill").args(["-KILL", pid]).status();
            }
        }
        std::thread::sleep(Duration::from_millis(200));
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
        if let Ok(mut child_guard) = state.child.lock() {
            stop_node_child(&mut *child_guard);
            info!("Node process stopped");
        }
    }
}

fn spawn_node_process(config: &NodeSpawnConfig) -> Result<Child, String> {
    #[cfg(unix)]
    kill_stale_listeners_on_node_ports();
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
    }

    let bundled_skills = config.node_cwd.join("skills");
    if bundled_skills.is_dir() {
        command.env("ENVOYMESH_BUNDLED_SKILLS_DIR", &bundled_skills);
    }

    if config.node_exe.is_file() {
        command.env("ENVOYMESH_NODE_EXE", &config.node_exe);
    }

    command.env("ENVOYMESH_NODE_BUNDLE_DIR", &config.node_cwd);

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
fn restart_node_process(state: State<'_, NodeProcessState>) -> Result<(), String> {
    let mut child_guard = state.child.lock().map_err(|e| e.to_string())?;
    stop_node_child(&mut child_guard);
    #[cfg(unix)]
    kill_stale_listeners_on_node_ports();
    let child = spawn_node_process(&state.config)?;
    info!("Node process restarted from Social UI");
    *child_guard = Some(child);
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
        fn ps_escape(s: &str) -> String {
            s.replace('\'', "''")
        }
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
            "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { \
               Write-Output $d.SelectedPath \
             }",
        );
        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Ok(None);
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
        .invoke_handler(tauri::generate_handler![
            restart_node_process,
            get_app_log_paths,
            append_social_log,
            reveal_log_dir,
            get_openclaw_heal_status,
            pick_directory
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

            let profile_dir = app_data_dir.join("profile");
            std::fs::create_dir_all(&profile_dir).expect("Failed to create profile dir");
            info!("Profile directory: {:?}", profile_dir);

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

            let initial_child = match spawn_node_process(&spawn_config) {
                Ok(child) => {
                    info!(
                        "Node process spawned — showing UI immediately; home node continues starting in background"
                    );
                    Some(child)
                }
                Err(e) => {
                    error!("{}", e);
                    None
                }
            };

            app.manage(NodeProcessState {
                child: Mutex::new(initial_child),
                config: spawn_config,
            });

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
        // Healthy state: package.json is reachable via the self-reference
        // symlink. The probe must leave it alone and return Healthy.
        let r = make_fixture("healthy");
        seed_tree(&r);
        let self_ref = r.join("openclaw/node_modules/openclaw");
        fs::create_dir_all(&self_ref).unwrap();
        std::os::unix::fs::symlink("../../package.json", self_ref.join("package.json")).unwrap();

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
