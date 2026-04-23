//! Append-only decisions log under `.clif/decisions.jsonl`.
//!
//! Readers tolerate malformed lines (return what they can parse). Writers
//! rewrite the entire file only when updating `synced_at` / `sync_error`
//! bookkeeping, which happens after sync_apply and is rare.

use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

use super::schema::Decision;

const DECISIONS_FILE: &str = ".clif/decisions.jsonl";

fn decisions_path(workspace_dir: &str) -> PathBuf {
    Path::new(workspace_dir).join(DECISIONS_FILE)
}

fn ensure_parent(path: &Path) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

/// Append a decision. Returns the decision as written (with id/timestamp
/// populated by caller already).
pub fn append(workspace_dir: &str, decision: &Decision) -> Result<(), String> {
    let path = decisions_path(workspace_dir);
    ensure_parent(&path).map_err(|e| format!("create .clif dir: {}", e))?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open {}: {}", path.display(), e))?;
    let line = serde_json::to_string(decision).map_err(|e| e.to_string())?;
    writeln!(file, "{}", line).map_err(|e| e.to_string())?;
    Ok(())
}

/// Read all decisions (chronological order). Silently drops unparseable lines.
pub fn read_all(workspace_dir: &str) -> Vec<Decision> {
    let path = decisions_path(workspace_dir);
    let Ok(file) = fs::File::open(&path) else {
        return Vec::new();
    };
    let reader = BufReader::new(file);
    let mut out = Vec::new();
    for line in reader.lines().map_while(Result::ok) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(d) = serde_json::from_str::<Decision>(trimmed) {
            out.push(d);
        }
    }
    out
}

/// Read only the decisions for a specific PR.
pub fn read_for_pr(workspace_dir: &str, pr_number: i64) -> Vec<Decision> {
    read_all(workspace_dir)
        .into_iter()
        .filter(|d| d.pr_number == pr_number)
        .collect()
}

/// Rewrite the log with updated decisions. Callers mutate items in place and
/// pass the full list back. Done atomically via temp file + rename.
pub fn rewrite(workspace_dir: &str, decisions: &[Decision]) -> Result<(), String> {
    let path = decisions_path(workspace_dir);
    ensure_parent(&path).map_err(|e| format!("create .clif dir: {}", e))?;
    let tmp = path.with_extension("jsonl.tmp");
    {
        let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        for d in decisions {
            let line = serde_json::to_string(d).map_err(|e| e.to_string())?;
            writeln!(file, "{}", line).map_err(|e| e.to_string())?;
        }
        file.sync_all().ok();
    }
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Mark the most recent decision per PR-kind pair as synced (best effort).
/// Stamps `synced_at` on every unsynced decision for the given PRs.
pub fn mark_synced_for_prs(
    workspace_dir: &str,
    pr_numbers: &[i64],
    at: u64,
) -> Result<(), String> {
    let mut all = read_all(workspace_dir);
    if all.is_empty() {
        return Ok(());
    }
    let set: std::collections::HashSet<i64> = pr_numbers.iter().copied().collect();
    let mut changed = false;
    for d in all.iter_mut() {
        if set.contains(&d.pr_number) && d.synced_at.is_none() {
            d.synced_at = Some(at);
            d.sync_error = None;
            changed = true;
        }
    }
    if !changed {
        return Ok(());
    }
    rewrite(workspace_dir, &all)
}

/// Stamp the most recent decisions for the given PRs with an error, leaving
/// synced_at untouched so they remain in the "pending" bucket.
pub fn mark_error_for_prs(
    workspace_dir: &str,
    pr_numbers: &[i64],
    error: &str,
) -> Result<(), String> {
    let mut all = read_all(workspace_dir);
    if all.is_empty() {
        return Ok(());
    }
    let set: std::collections::HashSet<i64> = pr_numbers.iter().copied().collect();
    let mut changed = false;
    for d in all.iter_mut() {
        if set.contains(&d.pr_number) && d.synced_at.is_none() {
            d.sync_error = Some(error.to_string());
            changed = true;
        }
    }
    if !changed {
        return Ok(());
    }
    rewrite(workspace_dir, &all)
}

/// Unique list of PRs with at least one unsynced decision.
pub fn prs_with_pending_decisions(workspace_dir: &str) -> Vec<i64> {
    let all = read_all(workspace_dir);
    let mut seen = std::collections::BTreeSet::new();
    for d in all {
        if d.synced_at.is_none() {
            seen.insert(d.pr_number);
        }
    }
    seen.into_iter().collect()
}
