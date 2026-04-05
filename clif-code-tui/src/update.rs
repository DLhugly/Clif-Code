//! Auto-update: version check against GitHub releases and self-replace binary.

use crate::ui;
use std::io::Read;
use std::path::PathBuf;

const GITHUB_REPO: &str = "DLhugly/Clif-Code";
const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const CHECK_INTERVAL_SECS: u64 = 86400; // 24 hours

fn cache_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home)
        .join(".clifcode")
        .join("update_check.json")
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn load_cache() -> Option<(String, String, u64)> {
    let text = std::fs::read_to_string(cache_path()).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    let version = json.get("latest_version")?.as_str()?.to_string();
    let url = json.get("download_url")?.as_str()?.to_string();
    let checked_at = json.get("checked_at")?.as_u64()?;
    Some((version, url, checked_at))
}

fn save_cache(version: &str, url: &str) {
    let json = serde_json::json!({
        "latest_version": version,
        "download_url": url,
        "checked_at": now_secs(),
    });
    let _ = std::fs::create_dir_all(cache_path().parent().unwrap());
    let _ = std::fs::write(
        cache_path(),
        serde_json::to_string_pretty(&json).unwrap_or_default(),
    );
}

/// True if semver `a` is strictly newer than `b`.
fn is_newer(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> Vec<u64> {
        s.trim_start_matches('v')
            .split('.')
            .filter_map(|p| p.parse().ok())
            .collect()
    };
    parse(a) > parse(b)
}

/// Map the current OS + arch to the GitHub release artifact name.
fn platform_binary() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Some("clifcode-aarch64-apple-darwin"),
        ("macos", "x86_64") => Some("clifcode-x86_64-apple-darwin"),
        ("linux", "aarch64") => Some("clifcode-aarch64-unknown-linux-gnu"),
        ("linux", "x86_64") => Some("clifcode-x86_64-unknown-linux-gnu"),
        ("windows", "aarch64") => Some("clifcode-aarch64-pc-windows-msvc.exe"),
        ("windows", "x86_64") => Some("clifcode-x86_64-pc-windows-msvc.exe"),
        _ => None,
    }
}

/// Query GitHub releases API for the latest `clifcode-v*` release.
/// Returns `(version, download_url)` only when a newer version exists.
pub fn check_for_update() -> Option<(String, String)> {
    // Honour the 24-hour cache
    if let Some((version, url, checked_at)) = load_cache() {
        if now_secs().saturating_sub(checked_at) < CHECK_INTERVAL_SECS {
            return if is_newer(&version, CURRENT_VERSION) {
                Some((version, url))
            } else {
                None
            };
        }
    }

    let api_url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases?per_page=10");

    let resp = ureq::get(&api_url)
        .set("User-Agent", "clifcode-updater")
        .set("Accept", "application/vnd.github.v3+json")
        .call()
        .ok()?;

    let releases: Vec<serde_json::Value> = resp.into_json().ok()?;
    let binary_name = platform_binary()?;

    for release in &releases {
        let tag = release.get("tag_name").and_then(|v| v.as_str())?;
        if !tag.starts_with("clifcode-v") {
            continue;
        }
        let version = tag.trim_start_matches("clifcode-v").to_string();

        let assets = release.get("assets").and_then(|v| v.as_array())?;
        for asset in assets {
            let name = asset.get("name").and_then(|v| v.as_str()).unwrap_or("");
            if name == binary_name {
                let url = asset
                    .get("browser_download_url")
                    .and_then(|v| v.as_str())?
                    .to_string();
                save_cache(&version, &url);
                return if is_newer(&version, CURRENT_VERSION) {
                    Some((version, url))
                } else {
                    None
                };
            }
        }
    }

    None
}

/// Non-blocking background version check. Returns a receiver that will
/// contain `(version, download_url)` if an update is available.
pub fn check_in_background() -> std::sync::mpsc::Receiver<(String, String)> {
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        if let Some(update) = check_for_update() {
            let _ = tx.send(update);
        }
    });
    rx
}

pub fn print_update_notification(version: &str) {
    let r = ui::RESET;
    println!(
        "  {}{}\u{2191} Update available:{r} {} \u{2192} {}{}{version}{r}",
        ui::BOLD,
        ui::BRIGHT_YELLOW,
        CURRENT_VERSION,
        ui::BOLD,
        ui::BRIGHT_GREEN,
    );
    println!("  {}Run {r}/update{} to install{r}", ui::DIM, ui::DIM,);
    println!();
}

/// Download the release binary and replace the running executable.
pub fn perform_update(url: &str, version: &str) -> Result<(), String> {
    platform_binary().ok_or("Unsupported platform for auto-update")?;

    println!();
    println!(
        "  {}Downloading ClifCode v{version}...{}",
        ui::DIM,
        ui::RESET
    );

    let resp = ureq::get(url)
        .set("User-Agent", "clifcode-updater")
        .call()
        .map_err(|e| format!("Download failed: {e}"))?;

    let mut bytes = Vec::new();
    resp.into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Read failed: {e}"))?;

    if bytes.is_empty() {
        return Err("Downloaded empty file".into());
    }

    let size_kb = bytes.len() / 1024;
    ui::print_dim(&format!("  ({size_kb} KB downloaded)"));

    let current_exe =
        std::env::current_exe().map_err(|e| format!("Cannot locate current binary: {e}"))?;

    let temp_path = current_exe.with_extension("update");
    let backup_path = current_exe.with_extension("old");

    std::fs::write(&temp_path, &bytes).map_err(|e| format!("Cannot write temp file: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&temp_path, std::fs::Permissions::from_mode(0o755));
    }

    let _ = std::fs::remove_file(&backup_path);

    std::fs::rename(&current_exe, &backup_path)
        .map_err(|e| format!("Cannot replace binary (try with sudo): {e}"))?;

    std::fs::rename(&temp_path, &current_exe).map_err(|e| {
        let _ = std::fs::rename(&backup_path, &current_exe);
        format!("Cannot install update: {e}")
    })?;

    let _ = std::fs::remove_file(&backup_path);

    // Clear the cache so next startup doesn't show "update available"
    save_cache(version, url);

    println!(
        "  {}{}\u{2713} Updated to v{version}{}",
        ui::BOLD,
        ui::BRIGHT_GREEN,
        ui::RESET
    );
    println!(
        "  {}Restart ClifCode to use the new version.{}",
        ui::DIM,
        ui::RESET
    );
    println!();

    Ok(())
}

pub fn current_version() -> &'static str {
    CURRENT_VERSION
}
