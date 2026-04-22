use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::process::Command;

/// Common install locations for `gh` on macOS and Linux. GUI-launched apps on
/// macOS get a minimal PATH that excludes Homebrew locations, so we scan these
/// candidates before giving up.
const GH_CANDIDATES: &[&str] = &[
    "/opt/homebrew/bin/gh",
    "/usr/local/bin/gh",
    "/usr/bin/gh",
    "/home/linuxbrew/.linuxbrew/bin/gh",
];

/// Additional PATH entries to expose to the `gh` process so its internal
/// PATH-based lookups (e.g. git, helpers) work when we launched outside a shell.
const PATH_AUGMENT: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
];

/// Resolve the absolute path to the `gh` binary. Returns `None` if not found
/// in any known install location or on PATH.
pub fn resolve_gh() -> Option<PathBuf> {
    if let Ok(p) = which::which("gh") {
        return Some(p);
    }
    for candidate in GH_CANDIDATES {
        let p = PathBuf::from(candidate);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// Augment PATH so that `gh` can find its helpers (git, etc.) when we're
/// running outside a shell.
pub fn augmented_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    let mut parts: Vec<String> = PATH_AUGMENT.iter().map(|s| s.to_string()).collect();
    if !current.is_empty() {
        parts.push(current);
    }
    parts.join(":")
}

/// Build a tokio `Command` for `gh` with augmented PATH, or return an error if
/// `gh` is not installed.
pub fn gh_command() -> Result<Command, String> {
    let bin = resolve_gh().ok_or_else(|| {
        "`gh` CLI not found. Install from https://cli.github.com/ or ensure it is on PATH."
            .to_string()
    })?;
    let mut cmd = Command::new(bin);
    cmd.env("PATH", augmented_path());
    Ok(cmd)
}

/// Std (sync) version of `gh_command` for callers that use `std::process::Command`.
pub fn gh_std_command() -> Result<std::process::Command, String> {
    let bin = resolve_gh().ok_or_else(|| {
        "`gh` CLI not found. Install from https://cli.github.com/ or ensure it is on PATH."
            .to_string()
    })?;
    let mut cmd = std::process::Command::new(bin);
    cmd.env("PATH", augmented_path());
    Ok(cmd)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GhAvailability {
    pub installed: bool,
    pub authenticated: bool,
    pub version: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrAuthor {
    pub login: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrCheck {
    pub name: Option<String>,
    pub status: Option<String>,
    pub conclusion: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrCommitAuthor {
    pub name: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrCommit {
    pub oid: Option<String>,
    #[serde(rename = "messageHeadline")]
    pub message_headline: Option<String>,
    #[serde(rename = "committedDate")]
    pub committed_date: Option<String>,
    pub authors: Option<Vec<PrCommitAuthor>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrReviewRequest {
    pub login: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PrSummary {
    pub number: i64,
    pub title: String,
    pub url: String,
    #[serde(rename = "isDraft")]
    #[serde(default)]
    pub is_draft: bool,
    pub author: Option<PrAuthor>,
    #[serde(rename = "createdAt")]
    pub created_at: Option<String>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
    #[serde(rename = "headRefName")]
    pub head_ref_name: Option<String>,
    #[serde(rename = "baseRefName")]
    pub base_ref_name: Option<String>,
    pub mergeable: Option<String>,
    pub additions: Option<i64>,
    pub deletions: Option<i64>,
    #[serde(rename = "changedFiles")]
    pub changed_files: Option<i64>,
    pub commits: Option<Vec<PrCommit>>,
    #[serde(rename = "statusCheckRollup")]
    pub status_check_rollup: Option<Vec<PrCheck>>,
    #[serde(rename = "reviewDecision")]
    pub review_decision: Option<String>,
    #[serde(rename = "reviewRequests")]
    pub review_requests: Option<Vec<PrReviewRequest>>,
}

#[tauri::command]
pub async fn gh_check_available() -> Result<GhAvailability, String> {
    let Some(gh_path) = resolve_gh() else {
        return Ok(GhAvailability {
            installed: false,
            authenticated: false,
            version: None,
            message: Some(
                "`gh` CLI not found. Install from https://cli.github.com/ or add it to PATH.".into(),
            ),
        });
    };

    let version_out = Command::new(&gh_path)
        .arg("--version")
        .env("PATH", augmented_path())
        .output()
        .await;
    let Ok(version_result) = version_out else {
        return Ok(GhAvailability {
            installed: false,
            authenticated: false,
            version: None,
            message: Some(format!(
                "Found gh at {} but failed to execute it.",
                gh_path.display()
            )),
        });
    };
    if !version_result.status.success() {
        return Ok(GhAvailability {
            installed: false,
            authenticated: false,
            version: None,
            message: Some("`gh` CLI present but returned an error running --version.".into()),
        });
    }
    let version = String::from_utf8_lossy(&version_result.stdout)
        .lines()
        .next()
        .map(|s| s.trim().to_string());

    let auth_out = Command::new(&gh_path)
        .arg("auth")
        .arg("status")
        .env("PATH", augmented_path())
        .output()
        .await;
    let authenticated = match auth_out {
        Ok(out) => out.status.success(),
        Err(_) => false,
    };
    let message = if !authenticated {
        Some("`gh` is installed but not authenticated. Run `gh auth login` to enable PR listing.".into())
    } else {
        None
    };

    Ok(GhAvailability {
        installed: true,
        authenticated,
        version,
        message,
    })
}

#[tauri::command]
pub async fn gh_list_prs(
    workspace_dir: String,
    state: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<PrSummary>, String> {
    let state_arg = state
        .as_deref()
        .filter(|s| matches!(*s, "open" | "closed" | "merged" | "all"))
        .unwrap_or("open")
        .to_string();
    let limit_val = limit.filter(|n| *n > 0 && *n <= 200).unwrap_or(50);

    let fields = [
        "number",
        "title",
        "url",
        "isDraft",
        "author",
        "createdAt",
        "updatedAt",
        "headRefName",
        "baseRefName",
        "mergeable",
        "additions",
        "deletions",
        "changedFiles",
        "commits",
        "statusCheckRollup",
        "reviewDecision",
        "reviewRequests",
    ]
    .join(",");

    let mut cmd = gh_command()?;
    let output = cmd
        .arg("pr")
        .arg("list")
        .arg("--state")
        .arg(&state_arg)
        .arg("--limit")
        .arg(limit_val.to_string())
        .arg("--json")
        .arg(&fields)
        .current_dir(&workspace_dir)
        .output()
        .await
        .map_err(|e| format!("Failed to spawn `gh pr list`: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let hint = if stderr.contains("not a git repository") {
            "Open a GitHub repo to list PRs."
        } else if stderr.to_lowercase().contains("auth") {
            "`gh` is not authenticated. Run `gh auth login`."
        } else if stderr.contains("no such host") || stderr.contains("dial tcp") {
            "Network error reaching GitHub."
        } else {
            "`gh pr list` failed."
        };
        return Err(format!("{}: {}", hint, stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let prs: Vec<PrSummary> = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse `gh pr list` output: {}", e))?;
    Ok(prs)
}
