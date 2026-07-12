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

/// Compile-time manifest dir (dev builds) — only valid on the machine that built the binary.
fn resource_dir_from_exe() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
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
    app.path()
        .resource_dir()
        .ok()
        .or_else(resource_dir_from_exe)
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
            reveal_log_dir
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
