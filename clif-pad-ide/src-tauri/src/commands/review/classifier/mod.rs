//! Deterministic PR blast-radius classifier.
//!
//! Produces a tier 1-5 plus a raw score from diff content, filename patterns,
//! structural changes, size, test coverage, and commit-message markers.
//! Reuses the existing security scanner for hard-override signals.

use serde::{Deserialize, Serialize};

use crate::commands::gh::gh_command;
use crate::commands::security::SecurityIssue;

mod parser;
mod patterns;
mod scoring;
mod scoring_dynamic;

pub use scoring::Signal;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Tier {
    T1, // Trivial
    T2, // Small
    T3, // Standard
    T4, // Significant
    T5, // Halt
}

impl Tier {
    pub fn from_score(score: u32) -> Self {
        if score <= 2 {
            Tier::T1
        } else if score <= 9 {
            Tier::T2
        } else if score <= 24 {
            Tier::T3
        } else if score <= 59 {
            Tier::T4
        } else {
            Tier::T5
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrClassification {
    pub pr_number: i64,
    pub tier: Tier,
    pub score: u32,
    pub hard_override: Option<&'static str>,
    pub signals: Vec<Signal>,
    pub security_issues: Vec<SecurityIssue>,
    pub touched_files: Vec<String>,
    pub generated_at: String,
    pub head_sha: Option<String>,
}

pub fn classify_diff(
    diff: &str,
    commit_messages: &[String],
) -> (
    u32,
    Vec<Signal>,
    Option<&'static str>,
    Vec<SecurityIssue>,
    Vec<String>,
) {
    let files = parser::parse_diff(diff);
    let touched_files: Vec<String> = files.iter().map(|f| f.path.clone()).collect();
    let out = scoring::score_diff(&files, commit_messages);
    (
        out.score,
        out.signals,
        out.hard_override,
        out.security_issues,
        touched_files,
    )
}

pub async fn classify_pr(workspace_dir: &str, pr_number: i64) -> Result<PrClassification, String> {
    let diff = fetch_diff(workspace_dir, pr_number).await?;
    let (commit_messages, head_sha) = fetch_commits_and_sha(workspace_dir, pr_number).await;
    let (score, signals, hard_override, security_issues, touched_files) =
        classify_diff(&diff, &commit_messages);
    let tier = if hard_override.is_some() {
        Tier::T5
    } else {
        Tier::from_score(score)
    };
    Ok(PrClassification {
        pr_number,
        tier,
        score,
        hard_override,
        signals,
        security_issues,
        touched_files,
        generated_at: now_epoch(),
        head_sha,
    })
}

async fn fetch_diff(workspace_dir: &str, pr_number: i64) -> Result<String, String> {
    let mut cmd = gh_command()?;
    let out = cmd
        .arg("pr")
        .arg("diff")
        .arg(pr_number.to_string())
        .current_dir(workspace_dir)
        .output()
        .await
        .map_err(|e| format!("gh pr diff failed: {}", e))?;
    if !out.status.success() {
        return Err(format!(
            "gh pr diff failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

async fn fetch_commits_and_sha(workspace_dir: &str, pr_number: i64) -> (Vec<String>, Option<String>) {
    let Ok(mut cmd) = gh_command() else {
        return (Vec::new(), None);
    };
    let out = match cmd
        .arg("pr")
        .arg("view")
        .arg(pr_number.to_string())
        .arg("--json")
        .arg("commits,headRefOid")
        .current_dir(workspace_dir)
        .output()
        .await
    {
        Ok(o) => o,
        Err(_) => return (Vec::new(), None),
    };
    if !out.status.success() {
        return (Vec::new(), None);
    }
    let v: serde_json::Value =
        serde_json::from_slice(&out.stdout).unwrap_or(serde_json::Value::Null);
    let msgs = v
        .get("commits")
        .and_then(|c| c.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|c| {
                    c.get("messageHeadline")
                        .and_then(|m| m.as_str())
                        .map(|s| s.to_string())
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let sha = v
        .get("headRefOid")
        .and_then(|s| s.as_str())
        .map(|s| s.to_string());
    (msgs, sha)
}

fn now_epoch() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}
