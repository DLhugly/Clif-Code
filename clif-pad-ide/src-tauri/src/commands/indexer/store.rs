//! Persist / load the index snapshot. Location: `<workspace>/.clif/index/snapshot.json`.
//! Atomic writes via temp + rename so a crash mid-write leaves the previous
//! snapshot intact.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use super::schema::{IndexSnapshot, IndexState, IndexStatusReport};

pub fn index_dir(workspace_dir: &str) -> PathBuf {
    Path::new(workspace_dir).join(".clif").join("index")
}

pub fn snapshot_path(workspace_dir: &str) -> PathBuf {
    index_dir(workspace_dir).join("snapshot.json")
}

pub fn load(workspace_dir: &str) -> Option<IndexSnapshot> {
    let path = snapshot_path(workspace_dir);
    let text = fs::read_to_string(&path).ok()?;
    let snap: IndexSnapshot = serde_json::from_str(&text).ok()?;
    if snap.version != IndexSnapshot::CURRENT_VERSION {
        return None; // schema drift → caller will rebuild
    }
    Some(snap)
}

pub fn save(workspace_dir: &str, snap: &IndexSnapshot) -> Result<(), String> {
    let dir = index_dir(workspace_dir);
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir .clif/index: {}", e))?;
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
