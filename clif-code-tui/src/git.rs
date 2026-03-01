//! Git integration — auto-commit, undo, status.

use std::path::Path;
use std::process::Command;

/// Check if workspace is a git repository
pub fn is_git_repo(workspace: &str) -> bool {
    Path::new(workspace).join(".git").exists()
}

/// Initialize a git repository
pub fn git_init(workspace: &str) -> Result<(), String> {
    let output = Command::new("git")
        .args(["init"])
        .current_dir(workspace)
        .output()
        .map_err(|e| format!("git init failed: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Auto-commit all changes with a descriptive message. Returns the commit hash.
pub fn git_auto_commit(workspace: &str, message: &str) -> Result<String, String> {
    // Stage all changes
    let _ = Command::new("git")
        .args(["add", "-A"])
        .current_dir(workspace)
        .output();

    // Check if there are staged changes
    let status = Command::new("git")
        .args(["diff", "--cached", "--quiet"])
        .current_dir(workspace)
        .status()
        .map_err(|e| format!("git status failed: {e}"))?;

    if status.success() {
        return Err("No changes to commit".into());
    }

    // Commit with ClifCode as author
    let output = Command::new("git")
        .args([
            "commit",
            "-m",
            message,
            "--author",
            "ClifCode <clifcode@local>",
        ])
        .current_dir(workspace)
        .output()
        .map_err(|e| format!("git commit failed: {e}"))?;

    if output.status.success() {
        let hash_output = Command::new("git")
            .args(["rev-parse", "--short", "HEAD"])
            .current_dir(workspace)
            .output()
            .map_err(|e| format!("git rev-parse failed: {e}"))?;
        let hash = String::from_utf8_lossy(&hash_output.stdout)
            .trim()
            .to_string();
        Ok(hash)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Undo the last ClifCode commit (soft reset — keeps changes in working dir)
pub fn git_undo(workspace: &str) -> Result<String, String> {
    // Verify last commit was by ClifCode
    let log = Command::new("git")
        .args(["log", "-1", "--format=%an|%s"])
        .current_dir(workspace)
        .output()
        .map_err(|e| format!("git log failed: {e}"))?;

    let log_str = String::from_utf8_lossy(&log.stdout).trim().to_string();
    if !log_str.starts_with("ClifCode|") {
        return Err("Last commit was not by ClifCode — refusing to undo".into());
    }

    let message = log_str.splitn(2, '|').nth(1).unwrap_or("").to_string();

    // Soft reset (keeps changes staged)
    let output = Command::new("git")
        .args(["reset", "--soft", "HEAD~1"])
        .current_dir(workspace)
        .output()
        .map_err(|e| format!("git reset failed: {e}"))?;

    if output.status.success() {
        Ok(format!("Undid: {message}"))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Get short git status
pub fn git_status(workspace: &str) -> Result<String, String> {
    let output = Command::new("git")
        .args(["status", "--short"])
        .current_dir(workspace)
        .output()
        .map_err(|e| format!("git status failed: {e}"))?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
