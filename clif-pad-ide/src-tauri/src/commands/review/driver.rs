use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::process::Command;

/// Context returned from fetch_pr. Minimal surface that any review run needs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrContext {
    pub number: i64,
    pub title: String,
    pub author: String,
    pub head_ref_name: String,
    pub head_sha: String,
    pub base_ref_name: String,
    pub base_sha: String,
    pub url: String,
}

/// A posted review action.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PostedAction {
    Comment,
    Approve,
    RequestChanges,
}

/// Trait abstraction over where reviews are executed. Desktop uses `gh` CLI.
/// A future cloud variant will implement this with Octocrab + GitHub App auth.
pub trait ReviewDriver: Send + Sync {
    fn fetch_pr(&self, number: i64) -> Result<PrContext, String>;
    fn fetch_diff(&self, number: i64) -> Result<String, String>;
    fn checkout_worktree(&self, number: i64) -> Result<PathBuf, String>;
    fn cleanup_worktree(&self, number: i64);
    fn post_review(
        &self,
        number: i64,
        action: PostedAction,
        body: &str,
    ) -> Result<(), String>;
    fn push_branch(&self, worktree: &std::path::Path, branch: &str) -> Result<(), String>;
}

/// The desktop-side driver backed by the user's `gh` CLI install.
pub struct GhCliDriver {
    pub workspace_dir: String,
}

impl GhCliDriver {
    pub fn new(workspace_dir: impl Into<String>) -> Self {
        Self {
            workspace_dir: workspace_dir.into(),
        }
    }

    fn worktree_root(&self) -> PathBuf {
        PathBuf::from(&self.workspace_dir)
            .join(".clif")
            .join("worktrees")
    }

    fn worktree_path(&self, number: i64) -> PathBuf {
        self.worktree_root().join(format!("pr-{}", number))
    }
}

impl ReviewDriver for GhCliDriver {
    fn fetch_pr(&self, number: i64) -> Result<PrContext, String> {
        let output = std::process::Command::new("gh")
            .arg("pr")
            .arg("view")
            .arg(number.to_string())
            .arg("--json")
            .arg("number,title,author,headRefName,headRefOid,baseRefName,baseRefOid,url")
            .current_dir(&self.workspace_dir)
            .output()
            .map_err(|e| format!("gh pr view failed to start: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "gh pr view failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        let raw: serde_json::Value = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Invalid gh pr view output: {}", e))?;
        Ok(PrContext {
            number: raw.get("number").and_then(|v| v.as_i64()).unwrap_or(number),
            title: raw.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            author: raw
                .pointer("/author/login")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            head_ref_name: raw
                .get("headRefName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            head_sha: raw
                .get("headRefOid")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            base_ref_name: raw
                .get("baseRefName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            base_sha: raw
                .get("baseRefOid")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            url: raw.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        })
    }

    fn fetch_diff(&self, number: i64) -> Result<String, String> {
        let output = std::process::Command::new("gh")
            .arg("pr")
            .arg("diff")
            .arg(number.to_string())
            .current_dir(&self.workspace_dir)
            .output()
            .map_err(|e| format!("gh pr diff failed to start: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "gh pr diff failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    fn checkout_worktree(&self, number: i64) -> Result<PathBuf, String> {
        let root = self.worktree_root();
        std::fs::create_dir_all(&root).map_err(|e| format!("mkdir worktrees: {}", e))?;
        let target = self.worktree_path(number);

        // If already present, reuse (cheap idempotency).
        if target.exists() {
            return Ok(target);
        }

        let branch = format!("clif/review/pr-{}", number);
        let ref_spec = format!("refs/pull/{}/head", number);

        // Ensure PR ref is fetched
        let _ = std::process::Command::new("git")
            .args([
                "fetch",
                "origin",
                &format!("pull/{}/head:{}", number, branch),
            ])
            .current_dir(&self.workspace_dir)
            .output();

        let out = std::process::Command::new("git")
            .args([
                "worktree",
                "add",
                target.to_string_lossy().as_ref(),
                &branch,
            ])
            .current_dir(&self.workspace_dir)
            .output()
            .map_err(|e| format!("git worktree add failed to start: {}", e))?;

        if !out.status.success() {
            // Fallback: try via gh pr checkout within a detached clone
            let fallback = std::process::Command::new("gh")
                .args([
                    "pr",
                    "checkout",
                    &number.to_string(),
                    "--repo",
                    ".",
                    "--branch",
                    &branch,
                ])
                .current_dir(&target)
                .output();
            if fallback.is_err() {
                return Err(format!(
                    "git worktree add failed: {}. Tried spec {}",
                    String::from_utf8_lossy(&out.stderr),
                    ref_spec
                ));
            }
        }

        Ok(target)
    }

    fn cleanup_worktree(&self, number: i64) {
        let target = self.worktree_path(number);
        if !target.exists() {
            return;
        }
        let _ = std::process::Command::new("git")
            .args([
                "worktree",
                "remove",
                "--force",
                target.to_string_lossy().as_ref(),
            ])
            .current_dir(&self.workspace_dir)
            .output();
    }

    fn post_review(
        &self,
        number: i64,
        action: PostedAction,
        body: &str,
    ) -> Result<(), String> {
        let flag = match action {
            PostedAction::Comment => "--comment",
            PostedAction::Approve => "--approve",
            PostedAction::RequestChanges => "--request-changes",
        };
        let output = std::process::Command::new("gh")
            .args(["pr", "review", &number.to_string(), flag, "--body", body])
            .current_dir(&self.workspace_dir)
            .output()
            .map_err(|e| format!("gh pr review failed to start: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "gh pr review failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        Ok(())
    }

    fn push_branch(&self, worktree: &std::path::Path, branch: &str) -> Result<(), String> {
        let output = std::process::Command::new("git")
            .args(["push", "origin", branch])
            .current_dir(worktree)
            .output()
            .map_err(|e| format!("git push failed to start: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "git push failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        Ok(())
    }
}

/// Fetch the diff async for UI usage (doesn't need trait object).
pub async fn fetch_pr_diff_async(workspace_dir: &str, number: i64) -> Result<String, String> {
    let output = Command::new("gh")
        .arg("pr")
        .arg("diff")
        .arg(number.to_string())
        .current_dir(workspace_dir)
        .output()
        .await
        .map_err(|e| format!("gh pr diff failed to start: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "gh pr diff failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// =============================================================================
// Cloud driver stub — kept as a reference implementation for the trait surface.
//
// When we ship a GitHub App server, add the `octocrab` dependency and implement
// `ReviewDriver` for a type that holds GitHub App auth credentials. The engine
// and polish pipeline should require zero changes: they already call through the
// `ReviewDriver` trait above.
//
// Example shape:
//
// pub struct OctocrabDriver {
//     pub octo: octocrab::Octocrab,
//     pub owner: String,
//     pub repo: String,
//     pub scratch_dir: std::path::PathBuf, // ephemeral per-PR sandbox
// }
//
// impl ReviewDriver for OctocrabDriver {
//     fn fetch_pr(&self, number: i64) -> Result<PrContext, String> {
//         // octocrab::pulls::get(number) -> build PrContext
//         unimplemented!()
//     }
//     fn fetch_diff(&self, number: i64) -> Result<String, String> {
//         // octocrab::pulls::get_diff(number)
//         unimplemented!()
//     }
//     fn checkout_worktree(&self, number: i64) -> Result<PathBuf, String> {
//         // git clone --depth 1 + git fetch origin pull/{n}/head
//         unimplemented!()
//     }
//     fn cleanup_worktree(&self, number: i64) {
//         // rm -rf scratch_dir/pr-{n}
//     }
//     fn post_review(&self, number: i64, action: PostedAction, body: &str) -> Result<(), String> {
//         // octocrab::pulls::create_review(number, body, action)
//         unimplemented!()
//     }
//     fn push_branch(&self, worktree: &std::path::Path, branch: &str) -> Result<(), String> {
//         // git push via the installation token
//         unimplemented!()
//     }
// }
//
// Deployment boundary: `engine::run_review(driver, ...)` and any polish caller
// that accepts `&dyn ReviewDriver` will work against either GhCliDriver or
// OctocrabDriver with no changes.
// =============================================================================

