// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::{Manager, State};
use tracing::{info, error, Level};
use tracing_subscriber::FmtSubscriber;

// Node process handle
struct NodeProcess(Mutex<Option<std::process::Child>>);

fn get_repo_root() -> PathBuf {
    // CARGO_MANIFEST_DIR is the directory containing this crate (apps/tauri/src-tauri)
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().expect("Failed to get current dir"));
    // manifest_dir = /path/to/EnvoyMesh/apps/tauri/src-tauri
    // go up: src-tauri -> tauri -> apps -> EnvoyMesh (3 levels)
    let monorepo_root = manifest_dir
        .parent().unwrap()  // apps/tauri
        .parent().unwrap()  // apps
        .parent().unwrap(); // EnvoyMesh
    monorepo_root.to_path_buf()
}

fn get_node_path(repo_root: &PathBuf) -> PathBuf {
    repo_root.join("apps/node/dist/src/index.js")
}

fn get_social_ui_path(repo_root: &PathBuf) -> PathBuf {
    repo_root.join("apps/social/src/dist/index.html")
}

fn is_port_in_use(port: u16) -> bool {
    std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_err()
}

fn main() {
    // Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)
        .expect("failed to set tracing subscriber");

    info!("Starting EnvoyMesh Tauri app");

    // Check if port 3030 is already in use (another node running)
    if is_port_in_use(3030) {
        info!("Port 3030 is already in use. Another node may be running.");
        info!("Please stop other instances before starting a new one.");
        // Continue anyway - the user might want to connect to existing node
    }

    let repo_root = get_repo_root();
    let node_path = get_node_path(&repo_root);
    let ui_path = get_social_ui_path(&repo_root);

    // Verify required files exist
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

            // Spawn node process
            let node_state: State<NodeProcess> = app.state();
            let mut node_child = node_state.0.lock().unwrap();

            let node_exe = std::env::var("ENVOYMESH_NODE_EXE").unwrap_or_else(|_| "node".to_string());

            info!("Spawning node process...");

            match Command::new(&node_exe)
                .arg(node_path.clone())
                .env("ENVOYMESH_PROFILE", profile_dir.to_str().unwrap_or("./data/default"))
                .env("RUST_LOG", "info")
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
            {
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

                // Kill node process
                let app = window.app_handle();
                let node_state: State<NodeProcess> = app.state();
                let mut node_child = node_state.0.lock().unwrap();
                if let Some(mut child) = node_child.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                    info!("Node process killed");
                }

                // Exit the app
                std::process::exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}