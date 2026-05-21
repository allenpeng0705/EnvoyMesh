use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, State};
use tracing::{info, error, Level};
use tracing_subscriber::FmtSubscriber;

// Node process handle
struct NodeProcess(Mutex<Option<std::process::Child>>);

fn get_repo_root() -> PathBuf {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().expect("Failed to get current dir"));
    manifest_dir
        .parent().unwrap()
        .parent().unwrap()
        .parent().unwrap()
        .to_path_buf()
}

fn get_node_path(repo_root: &PathBuf) -> PathBuf {
    repo_root.join("apps/node/dist/src/index.js")
}

fn get_social_ui_path(repo_root: &PathBuf) -> PathBuf {
    repo_root.join("apps/social/src/dist/index.html")
}

fn bundled_ipfs_candidates(repo_root: &PathBuf, resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(dir) = resource_dir {
        #[cfg(windows)]
        paths.push(dir.join("kubo").join("ipfs.exe"));
        #[cfg(not(windows))]
        paths.push(dir.join("kubo").join("ipfs"));
    }
    #[cfg(windows)]
    paths.push(repo_root.join("apps/tauri/resources/kubo/ipfs.exe"));
    #[cfg(not(windows))]
    {
        paths.push(repo_root.join("apps/tauri/resources/kubo/ipfs"));
    }
    paths
}

fn resolve_bundled_ipfs_exe(repo_root: &PathBuf, resource_dir: Option<&Path>) -> Option<PathBuf> {
    for path in bundled_ipfs_candidates(repo_root, resource_dir) {
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

fn is_port_in_use(port: u16) -> bool {
    std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_err()
}

fn main() {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)
        .expect("failed to set tracing subscriber");

    info!("Starting EnvoyMesh Tauri app");

    if is_port_in_use(3030) {
        info!("Port 3030 is already in use. Another node may be running.");
    }

    let repo_root = get_repo_root();
    let node_path = get_node_path(&repo_root);
    let ui_path = get_social_ui_path(&repo_root);

    if !node_path.exists() {
        error!("Node binary not found at: {:?}", node_path);
        error!("Please run 'npm run node:build' first");
        std::process::exit(1);
    }

    if !ui_path.exists() {
        error!("Social UI not found at: {:?}", ui_path);
        error!("Please run 'npm run social:build' first");
        std::process::exit(1);
    }

    info!("Using node path: {:?}", node_path);
    info!("Using UI path: {:?}", ui_path);

    tauri::Builder::default()
        .manage(NodeProcess(Mutex::new(None)))
        .setup(move |app| {
            info!("Tauri app setup starting");

            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data dir");
            info!("App data directory: {:?}", app_data_dir);

            let profile_dir = app_data_dir.join("profile");
            std::fs::create_dir_all(&profile_dir).expect("Failed to create profile dir");
            info!("Profile directory: {:?}", profile_dir);

            let ipfs_repo_dir = profile_dir.join("ipfs-kubo");
            std::fs::create_dir_all(&ipfs_repo_dir).ok();
            info!("IPFS repo directory: {:?}", ipfs_repo_dir);

            let resource_dir = app.path().resource_dir().ok();
            let bundled_ipfs = resolve_bundled_ipfs_exe(&repo_root, resource_dir.as_deref());
            if let Some(ref exe) = bundled_ipfs {
                info!("Bundled Kubo sidecar: {:?}", exe);
            } else {
                info!("No bundled Kubo sidecar — node will use ipfs on PATH if present");
            }

            let node_state: State<NodeProcess> = app.state();
            let mut node_child = node_state.0.lock().unwrap();

            let node_exe = std::env::var("ENVOYMESH_NODE_EXE").unwrap_or_else(|_| "node".to_string());
            info!("Spawning node process...");

            let mut command = Command::new(&node_exe);
            command
                .arg(node_path.clone())
                .env("ENVOYMESH_PROFILE", profile_dir.to_str().unwrap_or("./data/default"))
                .env("ENVOYMESH_IPFS_PATH", ipfs_repo_dir)
                .env("RUST_LOG", "info")
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

            if let Some(exe) = bundled_ipfs {
                command.env("ENVOYMESH_IPFS_EXE", exe);
            }

            match command.spawn() {
                Ok(child) => {
                    info!("Node process spawned successfully");
                    *node_child = Some(child);
                }
                Err(e) => {
                    error!("Failed to spawn node process: {}", e);
                    error!("Make sure Node.js is installed and in PATH");
                }
            }

            info!("Tauri app setup complete");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                info!("Window close requested, shutting down...");

                let app = window.app_handle();
                let node_state: State<NodeProcess> = app.state();
                let mut node_child = node_state.0.lock().unwrap();
                if let Some(mut child) = node_child.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                    info!("Node process killed");
                }

                std::process::exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
