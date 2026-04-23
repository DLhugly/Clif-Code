//! Persist / load the index snapshot. The snapshot lives OUTSIDE the user's
//! workspace — in the OS cache directory — so it never shows up in the file
//! tree, never gets committed to git, and survives `rm -rf .clif/`.
//!
//! Path layout:
//!   macOS:   ~/Library/Caches/com.clif.pad/index/<workspace-hash>/snapshot.json
//!   Linux:   ~/.cache/clif-pad/index/<workspace-hash>/snapshot.json
//!   Windows: %LOCALAPPDATA%/clif-pad/index/<workspace-hash>/snapshot.json
//!
//! `<workspace-hash>` is a short DefaultHasher digest of the absolute
//! workspace path — collision-resistant enough for a dev-machine cache, no
//! crypto dep needed.

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::path::{Path, PathBuf};

use super::schema::{IndexSnapshot, IndexState, IndexStatusReport};

/// Short stable digest of the workspace path. 16 hex chars (8 bytes); the
/// chance of a collision on a single user's machine is negligible.
fn workspace_key(workspace_dir: &str) -> String {
    let mut h = DefaultHasher::new();
    workspace_dir.hash(&mut h);
    format!("{:016x}", h.finish())
}

/// OS-appropriate cache root. Falls back to the workspace's `.clif/cache`
/// directory if every environment lookup fails (e.g. sandboxed CI).
fn cache_root() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return Path::new(&home).join("Library/Caches/com.clif.pad");
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(xdg) = std::env::var("XDG_CACHE_HOME") {
            return Path::new(&xdg).join("clif-pad");
        }
        if let Ok(home) = std::env::var("HOME") {
            return Path::new(&home).join(".cache/clif-pad");
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            return Path::new(&local).join("clif-pad");
        }
    }
    // Fallback — last resort, keeps things working in odd environments.
    PathBuf::from(".")
        .join(".clif")
        .join("cache")
}

pub fn index_dir(workspace_dir: &str) -> PathBuf {
    cache_root().join("index").join(workspace_key(workspace_dir))
}

pub fn snapshot_path(workspace_dir: &str) -> PathBuf {
    index_dir(workspace_dir).join("snapshot.json")
}

pub fn load(workspace_dir: &str) -> Option<IndexSnapshot> {
    // Cheap one-shot cleanup: earlier builds of Clif wrote the snapshot
    // inside the workspace at `.clif/index/`. That caused the file to land
    // in the file tree and nearly get committed. Now that we live in the OS
    // cache dir, clear the legacy location the first time we see it so it
    // stops haunting users.
    purge_legacy_in_workspace(workspace_dir);

    let path = snapshot_path(workspace_dir);
    let text = fs::read_to_string(&path).ok()?;
    let snap: IndexSnapshot = serde_json::from_str(&text).ok()?;
    if snap.version != IndexSnapshot::CURRENT_VERSION {
        return None; // schema drift → caller will rebuild
    }
    // Paranoia: confirm the snapshot is for this workspace. A hash collision
    // would be astronomically unlikely but the cost of the check is a string
    // compare.
    if snap.workspace_dir != workspace_dir {
        return None;
    }
    Some(snap)
}

/// Delete `<workspace>/.clif/index` if it exists. Best-effort; failures are
/// silent since cleanup is not on any hot path.
fn purge_legacy_in_workspace(workspace_dir: &str) {
    let legacy = Path::new(workspace_dir).join(".clif").join("index");
    if legacy.exists() {
        let _ = fs::remove_dir_all(&legacy);
    }
}

pub fn save(workspace_dir: &str, snap: &IndexSnapshot) -> Result<(), String> {
    let dir = index_dir(workspace_dir);
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir cache dir: {}", e))?;
    let final_path = snapshot_path(workspace_dir);
    let tmp_path = final_path.with_extension("json.tmp");
    let body = serde_json::to_string(snap).map_err(|e| format!("serialize snapshot: {}", e))?;
    {
        let mut f = fs::File::create(&tmp_path).map_err(|e| format!("create tmp: {}", e))?;
        f.write_all(body.as_bytes())
            .map_err(|e| format!("write tmp: {}", e))?;
        f.sync_all().ok();
    }
    fs::rename(&tmp_path, &final_path).map_err(|e| format!("rename: {}", e))?;
    Ok(())
}

pub fn status_from_snapshot(snap: Option<&IndexSnapshot>) -> IndexStatusReport {
    match snap {
        Some(s) => IndexStatusReport {
            state: IndexState::Ready,
            built_at: Some(s.built_at),
            file_count: s.bm25.total_docs,
            symbol_count: s.symbols.len() as u32,
            error: None,
        },
        None => IndexStatusReport {
            state: IndexState::Missing,
            built_at: None,
            file_count: 0,
            symbol_count: 0,
            error: None,
        },
    }
}
