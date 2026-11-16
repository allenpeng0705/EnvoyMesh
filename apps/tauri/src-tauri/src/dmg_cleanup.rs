//! After a DMG install: eject the installer volume and offer to trash the `.dmg`.
//!
//! Dragging EnvoyMesh.app into Applications is a Finder copy — our code does not run at that moment,
//! so the installer window cannot close itself mid-drag. Cleanup runs on launch:
//!
//! 1. If this process is still the copy **on the disk image** and `/Applications/EnvoyMesh.app`
//!    exists, offer to open that installed copy (ejecting from here would kill us).
//! 2. If we are running from Applications (or anywhere else outside the volume), ask to **eject**
//!    the installer and move the downloaded `.dmg` to the Trash — never silent.

#![cfg(target_os = "macos")]

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

/// Tauri names the volume after `productName`. Also accept `EnvoyMesh 1` etc.
const VOLUME_PREFIX: &str = "EnvoyMesh";
const APP_BUNDLE: &str = "EnvoyMesh.app";
const PRODUCT_NAME: &str = "EnvoyMesh";

const DETACH_RETRIES: usize = 8;
const DETACH_RETRY_DELAY: Duration = Duration::from_secs(1);

/// One cleanup dialog per process — multi-window must not ask twice.
static CLEANUP_STARTED: AtomicBool = AtomicBool::new(false);

/// Run after the window is up. Never blocks startup longer than a dialog the user dismisses.
pub fn after_launch() {
    if CLEANUP_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    thread::spawn(|| {
        // Give Finder a beat if the user just finished the drag and immediately opened the app.
        thread::sleep(Duration::from_millis(800));
        let Ok(current_exe) = std::env::current_exe() else {
            return;
        };
        let volumes = mounted_installer_volumes();
        if volumes.is_empty() {
            return;
        }
        let on_installer = volumes.iter().any(|volume| current_exe.starts_with(volume));
        if on_installer {
            // Opening from the DMG window is the usual path after a drag — do not silent-no-op.
            offer_open_installed_copy();
            return;
        }

        let primary = &volumes[0];
        let dmg_path = source_dmg_for_volume(primary).filter(|path| path.is_file());
        if !ask_eject_and_trash(dmg_path.as_deref()) {
            return;
        }
        for volume in &volumes {
            let _ = detach_volume(volume);
        }
        if let Some(dmg) = dmg_path {
            let _ = move_to_trash(&dmg);
        }
    });
}

fn installed_app_path() -> PathBuf {
    PathBuf::from("/Applications").join(APP_BUNDLE)
}

fn mounted_installer_volumes() -> Vec<PathBuf> {
    let entries = match std::fs::read_dir("/Volumes") {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };
    let mut matches: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| {
                    name == VOLUME_PREFIX || name.starts_with(&format!("{VOLUME_PREFIX} "))
                })
        })
        .filter(|path| path.join(APP_BUNDLE).exists())
        .collect();
    matches.sort_by(|a, b| {
        let a_exact = a.file_name().and_then(|n| n.to_str()) == Some(VOLUME_PREFIX);
        let b_exact = b.file_name().and_then(|n| n.to_str()) == Some(VOLUME_PREFIX);
        b_exact.cmp(&a_exact)
    });
    matches
}

/// `hdiutil info` prints `image-path : …` before the `/Volumes/…` mount line for that image.
fn source_dmg_for_volume(volume: &Path) -> Option<PathBuf> {
    let volume_str = volume.to_string_lossy();
    let output = Command::new("hdiutil").args(["info"]).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut image_path: Option<PathBuf> = None;
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("image-path") {
            let path = rest.trim().trim_start_matches(':').trim();
            image_path = if path.is_empty() {
                None
            } else {
                Some(PathBuf::from(path))
            };
            continue;
        }
        // Exact mount path only — `/Volumes/EnvoyMesh` must not match `/Volumes/EnvoyMesh 1`.
        if line_has_exact_mount(trimmed, volume_str.as_ref()) {
            return image_path.filter(|path| {
                path.extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("dmg"))
            });
        }
    }
    None
}

fn line_has_exact_mount(line: &str, volume: &str) -> bool {
    // hdiutil mount lines end with a tab-separated path — do not split on spaces inside
    // `/Volumes/EnvoyMesh 1` or `/Volumes/EnvoyMesh` would false-match.
    line.rsplit('\t').next().is_some_and(|path| path == volume) || line.trim() == volume
}

/// Reject control characters so AppleScript `-e` strings cannot be broken mid-literal.
fn applescript_string(value: &str) -> Option<String> {
    if value.chars().any(|c| c.is_control()) {
        return None;
    }
    Some(value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn detach_volume(volume: &Path) -> bool {
    for _ in 0..DETACH_RETRIES {
        if !volume.exists() {
            return true;
        }
        let status = Command::new("hdiutil")
            .args(["detach"])
            .arg(volume)
            .arg("-quiet")
            .status();
        if matches!(status, Ok(s) if s.success()) || !volume.exists() {
            return true;
        }
        let _ = Command::new("hdiutil")
            .args(["detach"])
            .arg(volume)
            .args(["-force", "-quiet"])
            .status();
        if !volume.exists() {
            return true;
        }
        thread::sleep(DETACH_RETRY_DELAY);
    }
    !volume.exists()
}

/// Running from the installer — offer to open `/Applications`, never silent-skip.
fn offer_open_installed_copy() {
    let installed = installed_app_path();
    if !installed.is_dir() {
        let _ = alert(
            &format!(
                "{PRODUCT_NAME} is still running from the installer disk. Drag {APP_BUNDLE} into Applications, then open it from there to eject the disk."
            ),
            "OK",
        );
        return;
    }
    if !ask_open_installed() {
        return;
    }
    let _ = Command::new("open").arg(&installed).status();
    // Leave this installer-copy process; the Applications launch will offer eject.
    std::process::exit(0);
}

fn ask_open_installed() -> bool {
    let script = format!(
        r#"display dialog "{PRODUCT_NAME} is still open from the installer. Open the copy in Applications to finish setup and eject the disk?" with title "{PRODUCT_NAME}" with icon note buttons {{"Not Now", "Open Applications copy"}} default button "Open Applications copy""#
    );
    applescript_chose(&script, "Open Applications copy")
}

fn ask_eject_and_trash(dmg: Option<&Path>) -> bool {
    // Escape once when building the AppleScript literal — not the filename alone first.
    let body = match dmg.and_then(|path| path.file_name()).and_then(|n| n.to_str()) {
        Some(name) => format!(
            "{PRODUCT_NAME} is installed. Eject the installer disk and move \"{name}\" to the Trash?"
        ),
        None => format!("{PRODUCT_NAME} is installed. Eject the installer disk?"),
    };
    let confirm = if dmg.is_some() {
        "Eject and Move to Trash"
    } else {
        "Eject"
    };
    let Some(safe_body) = applescript_string(&body) else {
        return false;
    };
    let Some(safe_confirm) = applescript_string(confirm) else {
        return false;
    };
    let script = format!(
        r#"display dialog "{safe_body}" with title "{PRODUCT_NAME}" with icon note buttons {{"Keep", "{safe_confirm}"}} default button "{safe_confirm}""#
    );
    applescript_chose(&script, confirm)
}

fn alert(message: &str, button: &str) -> bool {
    let Some(safe_message) = applescript_string(message) else {
        return false;
    };
    let Some(safe_button) = applescript_string(button) else {
        return false;
    };
    let script = format!(
        r#"display dialog "{safe_message}" with title "{PRODUCT_NAME}" with icon note buttons {{"{safe_button}"}} default button "{safe_button}""#
    );
    let _ = Command::new("osascript").args(["-e", &script]).status();
    true
}

fn applescript_chose(script: &str, confirm_label: &str) -> bool {
    let output = Command::new("osascript").args(["-e", script]).output();
    match output {
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout).contains(confirm_label)
        }
        _ => false,
    }
}

fn move_to_trash(dmg: &Path) -> Result<(), ()> {
    let Some(path) = applescript_string(&dmg.to_string_lossy()) else {
        return Err(());
    };
    let script = format!(
        r#"tell application "Finder" to delete (POSIX file "{path}" as alias)"#
    );
    let status = Command::new("osascript").args(["-e", &script]).status();
    match status {
        Ok(s) if s.success() => Ok(()),
        _ => Err(()),
    }
}

#[cfg(test)]
mod tests {
    use super::{applescript_string, line_has_exact_mount};
    use std::path::Path;

    fn running_from_volume(current_exe: &Path, volume: &Path) -> bool {
        current_exe.starts_with(volume)
    }

    #[test]
    fn skips_when_running_from_installer_volume() {
        assert!(running_from_volume(
            Path::new("/Volumes/EnvoyMesh/EnvoyMesh.app/Contents/MacOS/envoymesh"),
            Path::new("/Volumes/EnvoyMesh"),
        ));
    }

    #[test]
    fn cleans_when_running_from_applications() {
        assert!(!running_from_volume(
            Path::new("/Applications/EnvoyMesh.app/Contents/MacOS/envoymesh"),
            Path::new("/Volumes/EnvoyMesh"),
        ));
    }

    #[test]
    fn mount_match_does_not_confuse_envoydev_with_envoydev_1() {
        assert!(line_has_exact_mount(
            "/dev/disk24s1\tUUID\t/Volumes/EnvoyMesh",
            "/Volumes/EnvoyMesh",
        ));
        assert!(!line_has_exact_mount(
            "/dev/disk25s1\tUUID\t/Volumes/EnvoyMesh 1",
            "/Volumes/EnvoyMesh",
        ));
        assert!(line_has_exact_mount(
            "/dev/disk25s1\tUUID\t/Volumes/EnvoyMesh 1",
            "/Volumes/EnvoyMesh 1",
        ));
    }

    #[test]
    fn applescript_escapes_quotes_and_rejects_control_chars() {
        assert_eq!(
            applescript_string(r#"a"b\c"#).as_deref(),
            Some(r#"a\"b\\c"#)
        );
        assert!(applescript_string("line\nbreak").is_none());
        assert!(applescript_string("nul\0byte").is_none());
    }
}
